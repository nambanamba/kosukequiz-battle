// ★待ち合わせ場所（relay）との通信を、**本物のWebSocketの中身ごと**記録する。
//
// 使い方:
//   node tools/mikaku/relay_traffic_probe.mjs            （既定 120秒ぶん見る）
//   node tools/mikaku/relay_traffic_probe.mjs --sec 180
//   node tools/mikaku/relay_traffic_probe.mjs --relay default   （決めうちを外して既定まかせ）
//
// ■ なぜ要るか（2026-09-20）
//   ユーザーの実機では「同時に開くと繋がる／2秒ずれると繋がらない」。
//   ところが `meet_probe --delay 0,2,5,10,30` では**30秒遅れても2.5秒で出会えた**＝
//   このPCでは症状が再現しない。**では実機と何が違うのか**を、推測ではなく
//   **通信の実物**で押さえるための道具。
//
// ■ 何を出すか
//   1. どの待ち合わせ先に、いつ繋がり、**いつ切れたか**
//   2. 部屋の告知（nostr の EVENT）を、**何秒おきに何回**出しているか
//   3. 購読（REQ）が生きたままか、閉じられていないか
//
// ■ ★この道具が見ていないもの（確認ポイント 4-2）
//   - **回線の違い**。ここは自宅PCの Chrome 1台。実機（Fire/Silk・LTE）とは条件が違う
//   - **相手が来たときに出会えるか**。それは `meet_probe` の担当
//   - 通信の中身が「正しいか」。**出ている／出ていない**を数えるだけ
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_meet");
fs.mkdirSync(SHOTS, { recursive: true });

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();

const ARGV = process.argv.slice(2);
const argOf = (n) => {
  const eq = ARGV.find(a => a.startsWith(n + "="));
  if (eq) return eq.slice(n.length + 1);
  const i = ARGV.indexOf(n);
  return i >= 0 ? ARGV[i + 1] : null;
};
const SEC = Number(argOf("--sec") || 120);
const RELAY = argOf("--relay");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const [p0, q] = req.url.split("?");
  const rel = decodeURIComponent(p0).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    let body = buf;
    if (rel === "index.html" && /relay=default/.test(q || "")) {
      body = Buffer.from(buf.toString("utf8").replace(", relayConfig: RELAY_CONFIG", ""), "utf8");
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(body);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
// ★ライブラリは、切り捨てるときに console.warn で理由を出す（nostr の src で確認）
const consoleMsgs = [];
page.on("console", m => { if (/relay|trystero/i.test(m.text())) consoleMsgs.push(m.type() + ": " + m.text()); });

// ── 記録するもの ──────────────────────────────
const T0 = Date.now();
const at = () => ((Date.now() - T0) / 1000).toFixed(1);
const socks = new Map();          // url -> { openedAt, closedAt, sent:[], got:[] }
const host = (u) => { try { return new URL(u).host; } catch { return u; } };

page.on("websocket", (ws) => {
  const u = ws.url();
  const rec = { openedAt: at(), closedAt: null, sent: [], got: [] };
  socks.set(u + "#" + socks.size, rec);
  ws.on("framesent", (f) => {
    let kind = null, verb = "?";
    try {
      const m = JSON.parse(f.payload);
      verb = m[0];
      if (verb === "EVENT") kind = m[1] && m[1].kind;
      if (verb === "REQ") kind = m[2] && m[2].kinds && m[2].kinds.join("/");
    } catch {}
    rec.sent.push({ t: at(), verb, kind, len: (f.payload || "").length });
  });
  ws.on("framereceived", (f) => {
    let verb = "?", full = null;
    try {
      const m = JSON.parse(f.payload);
      verb = m[0];
      // ★EVENT 以外は中身ごと控える。trystero は OK=false や CLOSED を受けると
      //   その待ち合わせ先を**永久に切り捨てる**（retireRelay）。理由が要る。
      if (verb !== "EVENT") full = String(f.payload).slice(0, 200);
    } catch {}
    rec.got.push({ t: at(), verb, full });
  });
  ws.on("close", () => { rec.closedAt = at(); });
});

// ★ページの中でも、作った口と**閉じられ方（code / reason）**を控える。
//   Playwright の websocket イベントは閉じた理由を教えてくれないので、こちらで拾う。
//   2026-09-20: 「本物の relay は張り直さないのに、まねごとの relay は張り直す」という
//   食いちがいが出た。**どんな閉じられ方をしたか**が分からないと、これ以上進めない。
await page.addInitScript(() => {
  const O = WebSocket;
  window.__wsLog = [];
  const t0 = Date.now();
  const at = () => ((Date.now() - t0) / 1000).toFixed(1);
  function R(u, p) {
    const s = (p === undefined) ? new O(u) : new O(u, p);
    const rec = { url: String(u), made: at(), open: null, close: null, code: null, reason: null, err: false };
    window.__wsLog.push(rec);
    s.addEventListener("open", () => { rec.open = at(); });
    s.addEventListener("error", () => { rec.err = true; });
    s.addEventListener("close", (e) => { rec.close = at(); rec.code = e.code; rec.reason = String(e.reason || ""); });
    return s;
  }
  R.prototype = O.prototype;
  ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(k => R[k] = O[k]);
  window.WebSocket = R;
});

await page.goto(`http://127.0.0.1:${PORT}/index.html${RELAY ? "?relay=" + RELAY : ""}`);
await page.waitForTimeout(500);
await page.evaluate(() => {
  const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
  localStorage.clear();
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
    subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: 3 }));
});
await page.reload(); await page.waitForTimeout(800);
await page.$eval("#create-btn", e => e.click());
await page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
const code = await page.$eval("#room-code-display", e => e.textContent);
console.log(`部屋のコード ${code} ／ ${SEC}秒ぶん、通信をそのまま記録します（相手は呼びません）`);

// ★`--blip N` … N秒たったところで**10秒だけ回線を切る**。
//   実機は Fire タブレット＋LTE。トンネル・電波の谷・Wi-Fi との切りかえで、
//   通信が一瞬切れることは普通に起きる。**そのあと自分で直すのか**を見るための仕掛け。
const BLIP = Number(argOf("--blip") || 0);
let cdp = null;
if (BLIP) cdp = await ctx.newCDPSession(page);

for (let s = 10; s <= SEC; s += 10) {
  await page.waitForTimeout(10000);
  const live = [...socks.values()].filter(r => !r.closedAt).length;
  process.stdout.write(`  ${String(s).padStart(3)}秒: 開いている ${live} 本 / 作った延べ ${socks.size} 本\n`);
  if (BLIP && s === BLIP) {
    console.log("  ★ここで10秒だけ回線を切ります（トンネルに入った、くらいのつもり）");
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await page.waitForTimeout(10000);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const after = [...socks.values()].filter(r => !r.closedAt).length;
    console.log(`  ★回線を戻しました。この時点で開いている ${after} 本 / 作った延べ ${socks.size} 本`);
  }
}

// ── まとめ ──────────────────────────────
console.log("\n── ① 待ち合わせ先ごとの出入り ──");
for (const [k, r] of socks) {
  const u = k.split("#")[0];
  const ev = r.sent.filter(s => s.verb === "EVENT");
  console.log(`  ${host(u).padEnd(26)} ${r.openedAt}秒に接続 → ${r.closedAt ? r.closedAt + "秒に★切れた" : "開いたまま"}` +
              `   送った EVENT ${ev.length}件 / 受けた ${r.got.length}件`);
}

console.log("\n── ② 部屋の告知（EVENT）を何秒おきに出しているか ──");
const allEv = [];
for (const [k, r] of socks) for (const s of r.sent) if (s.verb === "EVENT") allEv.push({ ...s, u: host(k.split("#")[0]) });
allEv.sort((a, b) => Number(a.t) - Number(b.t));
if (!allEv.length) console.log("  ★1件も出していません");
else {
  const kinds = [...new Set(allEv.map(e => e.kind))];
  console.log(`  EVENT 合計 ${allEv.length}件 ／ kind = ${kinds.join(", ")}`);
  // 待ち合わせ先ごとに、出した時刻の間隔を見る
  const byU = new Map();
  for (const e of allEv) { if (!byU.has(e.u)) byU.set(e.u, []); byU.get(e.u).push(Number(e.t)); }
  for (const [u, ts] of byU) {
    const gaps = ts.slice(1).map((t, i) => +(t - ts[i]).toFixed(1));
    console.log(`  ${u.padEnd(26)} ${ts.length}回  最後は ${ts[ts.length - 1]}秒` +
                (gaps.length ? `  間隔 ${gaps.join("/")}秒` : "  ★1回だけ"));
  }
  const last = Math.max(...allEv.map(e => Number(e.t)));
  console.log(`  ★最後に告知を出したのは ${last}秒（記録は ${SEC}秒まで）` +
              (SEC - last > 20 ? "  ← ★★告知が途中で止まっています" : ""));
}

console.log("\n── ②c ★★待ち合わせ先からの返事のうち、EVENT 以外（切り捨ての理由になる）──");
for (const [k, r] of socks) {
  for (const g of r.got) {
    if (g.full && !/^\["(EOSE|OK",[^,]*,true)/.test(g.full)) {
      console.log(`  ${host(k.split("#")[0]).padEnd(26)} ${g.t}秒  ${g.full}`);
    }
  }
}
if (consoleMsgs.length) {
  console.log("\n── ②d ★ブラウザのコンソールに出た警告 ──");
  for (const m of consoleMsgs) console.log("  " + m);
} else {
  console.log("\n  （コンソールに警告は出ていません）");
}

console.log("\n── ②b ★ページの中から見た、作った口と閉じられ方 ──");
{
  const log = await page.evaluate(() => window.__wsLog);
  for (const r of log) {
    console.log(`  ${host(r.url).padEnd(26)} 作った ${r.made}秒 / 開いた ${r.open || "★開かず"}` +
      (r.close ? ` / 閉じた ${r.close}秒 code=${r.code} reason="${r.reason}"` : " / 開いたまま") +
      (r.err ? "  ★エラーあり" : ""));
  }
  const byUrl = new Map();
  for (const r of log) byUrl.set(r.url, (byUrl.get(r.url) || 0) + 1);
  const again = [...byUrl].filter(([, n]) => n > 1);
  console.log(again.length
    ? "  ★同じ先に2回以上つなぎに行った: " + again.map(([u, n]) => `${host(u)} ${n}回`).join(" / ")
    : "  ★どの先にも1回しかつなぎに行っていない（＝切れても張り直していない）");
}

console.log("\n── ③ 購読（REQ）──");
for (const [k, r] of socks) {
  const req = r.sent.filter(s => s.verb === "REQ");
  const close = r.sent.filter(s => s.verb === "CLOSE");
  if (req.length || close.length)
    console.log(`  ${host(k.split("#")[0]).padEnd(26)} REQ ${req.length}件（kind ${req.map(x => x.kind).join(",")}） / CLOSE ${close.length}件`);
}

await page.screenshot({ path: path.join(SHOTS, "traffic_host.png"), fullPage: true });
const diag = await page.evaluate(() => {
  const t = document.getElementById("create-diag-text");
  return (t && t.textContent || "").trim();
});
console.log("\n── ④ 画面に出ている記録（ユーザーに届く形）──\n  " + diag.split("\n").join("\n  "));

await browser.close(); server.close();
console.log(`\n写真: ${SHOTS}`);
