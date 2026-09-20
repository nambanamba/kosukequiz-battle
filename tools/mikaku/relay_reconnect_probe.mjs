// ★待ち合わせ先が**切れたあと、張り直されて本数が戻るか**を見る。
//
// 使い方: node tools/mikaku/relay_reconnect_probe.mjs [--wait 40]
//
// ■ なぜ要るか（2026-09-20 の実測）
//   本物の通信を記録したところ、`relay.damus.io` が切れたあと
//   **125秒たっても延べ本数が増えなかった**＝**一度も張り直していない**。
//   「いま開いている本数」は減る一方で、アプリを開き直したときだけ戻る。
//   2台の生きている待ち合わせ先の重なりが0になると、そこから先は永久に出会えない
//   （重なりが1本でもあれば出会えることは `meet_probe --overlap` で実測ずみ）。
//
// ■ ★この検査が言えること / 言えないこと（確認ポイント 4-2・0-1）
//   言える … **わざと1本切ったあと、本数が戻るか**
//   ★言えない … **実機（Fire/Silk）の「つながらない」が治ったか。**
//                それはユーザーの端末でしか分からない。**「直った」と書かないこと。**
//   言えない … 電波が途切れたときの挙動。Chrome のオフライン模擬は
//              **すでに開いている WebSocket を落とさない**（2026-09-20 に空振りを確認ずみ）
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
  const i = ARGV.indexOf(n);
  return i >= 0 ? ARGV[i + 1] : null;
};
const WAIT = Number(argOf("--wait") || 40);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

let ng = 0;
const check = (label, ok, extra) => {
  console.log(`  ${ok ? "✔" : "✘"} ${label}${extra ? " … " + extra : ""}`);
  if (!ok) ng++;
};

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

// ★アプリより**先に** WebSocket を包んで、本物の口を全部ひかえておく。
//   アプリ側の包み（Counted / 張り直し）は、この上にかぶさる。
//   だから `__probeWS` が増えれば、**張り直しが実際に走った証拠**になる。
await page.addInitScript(() => {
  const O = WebSocket;
  window.__probeWS = [];
  function R(u, p) {
    const s = (p === undefined) ? new O(u) : new O(u, p);
    window.__probeWS.push(s);
    return s;
  }
  R.prototype = O.prototype;
  ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(k => R[k] = O[k]);
  window.WebSocket = R;
});

await page.goto(`http://127.0.0.1:${PORT}/index.html`);
await page.waitForTimeout(400);
await page.evaluate(() => {
  const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
  localStorage.clear();
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
    subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: 3 }));
});
await page.reload(); await page.waitForTimeout(800);
await page.$eval("#create-btn", e => e.click());
await page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });

const snap = () => page.evaluate(() => ({
  made: window.__probeWS.length,
  open: window.__probeWS.filter(s => s.readyState === 1).length,
}));

// 全部つながるまで待つ（本数が2回続けて同じなら落ちついたとみなす）
let prev = -1, now = await snap();
for (let i = 0; i < 25 && !(now.open === prev && now.open > 0); i++) {
  prev = now.open; await page.waitForTimeout(1000); now = await snap();
}
const base = now;
console.log(`\n── 基準 ──\n  作った延べ ${base.made} 本 / いま開いている ${base.open} 本`);
check("★まず、待ち合わせ先に何本かつながっている（これが無いと以降は測れない）", base.open >= 2,
      base.open < 2 ? "★つながっていない。環境か回線の側を疑ってください" : "");

if (base.open >= 2) {
  // ★わざと1本だけ切る（relay 側から切られたのと同じ形にする）
  const closedUrl = await page.evaluate(() => {
    const s = window.__probeWS.find(x => x.readyState === 1);
    const u = s.url; s.close(); return u;
  });
  console.log(`\n── わざと1本切った ──\n  ${closedUrl}`);
  await page.waitForTimeout(1500);
  const after = await snap();
  console.log(`  切った直後: 作った延べ ${after.made} 本 / いま開いている ${after.open} 本`);
  check("★狙ったとおり1本減った（＝切り損ねていない）", after.open === base.open - 1,
        after.open !== base.open - 1 ? `★${base.open} → ${after.open}。切れていないか、別の本数も動いた` : "");

  // ★ここからが本題。一定時間のうちに戻るか
  console.log(`\n── ${WAIT}秒のあいだ、戻るかを見る ──`);
  let back = null;
  for (let s = 5; s <= WAIT; s += 5) {
    await page.waitForTimeout(5000);
    const n = await snap();
    console.log(`  ${String(s).padStart(3)}秒: 作った延べ ${n.made} 本 / いま開いている ${n.open} 本`);
    if (n.open >= base.open && back === null) back = s;
  }
  const fin = await snap();
  check(`★★切れた待ち合わせ先が張り直され、${WAIT}秒以内に本数が戻る`, fin.open >= base.open,
        fin.open >= base.open ? `${back}秒で ${base.open} 本に戻った` : `★${fin.open} 本のまま（張り直していない）`);
  check("張り直しが暴走していない（作った延べが増えすぎない）", fin.made <= base.made + 8,
        `作った延べ ${base.made} → ${fin.made} 本`);
}

await page.screenshot({ path: path.join(SHOTS, "reconnect_host.png"), fullPage: true });
await browser.close(); server.close();
console.log(`\n写真: ${SHOTS}`);
console.log(ng === 0 ? "✔ すべて確認できた" : `✘ ${ng}件 だめだった`);
console.log("★この検査が言えるのは「本数が戻るか」までです。**実機の症状が治ったかは、ここでは分かりません。**");
process.exit(ng === 0 ? 0 : 1);
