// 対戦の「待ち合わせ場所」（nostr の relay）を、**本物の Chrome で実際につないで**調べる。
//
// 使い方: node tools/mikaku/relay_probe.mjs
//
// ★この検査が見るもの / 見ないもの（C-4d・D-16・D-17）
//   見る  … ①設定の書き方（`relayConfig.urls`）が**本当に効くか**。効いたかは
//            ライブラリ自身が持っている接続一覧（getRelaySockets）で確かめる
//           ②APP_ID から選ばれる待ち合わせ先が、**端末ごとに同じか**（別ページで2回引いて比べる）
//           ③どの relay が**このPCの回線から**つながるか
//   見ない… **Fire タブレットの回線からつながるか**。ここに実機は無い。
//            回線が違えば結果も違う。ここで生きていても、あちらで生きている証拠にはならない。
//           **2台が実際に出会えるか**も見ない（それは実機2台でしか分からない・B-12）
//
// ★APP_ID と設定は index.html から**その場で抜き出す**。写して持たない（写すと古くなる）。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const mApp = html.match(/const APP_ID = '([^']+)'/);
if (!mApp) { console.error("✘ index.html の APP_ID が見つかりません（書き方が変わった？）"); process.exit(2); }
const APP_ID = mApp[1];
const mRelay = html.match(/relayConfig:\s*RELAY_CONFIG/);
console.log(`index.html: APP_ID = ${APP_ID} / relayConfig の指定 = ${mRelay ? "あり" : "なし（ライブラリの既定まかせ）"}`);

// ページは「安全なもと」から出す必要がある（WebSocket と動的 import のため）
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<!doctype html><meta charset=utf-8><title>relay probe</title>");
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/";

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ channel: "chrome" });
let ng = 0;
const check = (label, ok, extra) => {
  console.log(`  ${ok ? "✔" : "✘"} ${label}${extra ? " … " + extra : ""}`);
  if (!ok) ng++;
};

// 新しいページで trystero を読み、部屋に入って、つながった待ち合わせ先を返す
async function relaysFor(config, ms = 9000) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "load" });
  const out = await page.evaluate(async ({ config, ms }) => {
    const m = await import("https://esm.run/trystero");
    const room = m.joinRoom(config, "relay-probe-" + Math.random().toString(36).slice(2, 8));
    await new Promise(r => setTimeout(r, ms));
    const socks = m.getRelaySockets ? m.getRelaySockets() : {};
    const st = {};
    Object.keys(socks).forEach(u => { try { st[u] = socks[u].readyState; } catch (e) { st[u] = -1; } });
    try { room.leave(); } catch (e) {}
    return { urls: Object.keys(st), state: st, defaults: (m.defaultRelayUrls || []).length };
  }, { config, ms });
  await ctx.close();
  return out;
}
const nameOf = u => u.replace(/^wss?:\/\//, "").replace(/\/$/, "");
const show = o => o.urls.map(u => (o.state[u] === 1 ? "○" : o.state[u] === 0 ? "…" : "✕") + nameOf(u)).join(" / ");

// ---- ① いまの設定（＝index.html と同じ appId）で、どこへ行くか ----
console.log("\n── ① いまの設定で選ばれる待ち合わせ先 ──");
const a = await relaysFor({ appId: APP_ID });
console.log("  1台目: " + show(a));
console.log(`  （ライブラリが持っている既定の一覧は ${a.defaults} 本。そこから選ばれている）`);

// ---- ② ★端末ごとに同じ場所が選ばれるか（別ページ＝別の端末のかわり）----
console.log("\n── ② ★2台が同じ待ち合わせ先を選ぶか ──");
const b = await relaysFor({ appId: APP_ID });
console.log("  2台目: " + show(b));
const sameSet = JSON.stringify(a.urls.slice().sort()) === JSON.stringify(b.urls.slice().sort());
check("★同じ appId なら、同じ待ち合わせ先が選ばれる", sameSet,
      sameSet ? "選び方は appId で決まっている" : "★ばらつく＝出会えないことがある");
const bothOpen = a.urls.filter(u => a.state[u] === 1 && b.state[u] === 1);
check("2台とも開いている先がある", bothOpen.length > 0, `${bothOpen.length}本: ${bothOpen.map(nameOf).join(" / ") || "なし"}`);

// ---- ③ ★設定の書き方が本当に効くか（C-12: 書いただけでは証拠にならない）----
console.log("\n── ③ ★どう書けば待ち合わせ先を決められるか ──");
const PIN = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];
const byConfig = await relaysFor({ appId: APP_ID, relayConfig: { urls: PIN } });
check("`relayConfig: { urls: [...] }` は効く",
      JSON.stringify(byConfig.urls.slice().sort()) === JSON.stringify(PIN.slice().sort()),
      show(byConfig));
const byUrls = await relaysFor({ appId: APP_ID, relayUrls: PIN }, 6000);
const urlsWorked = JSON.stringify(byUrls.urls.slice().sort()) === JSON.stringify(PIN.slice().sort());
check("★`relayUrls: [...]` は**効かない**（黙って無視される）", !urlsWorked,
      urlsWorked ? "★効いてしまった。上の結論は誤り" : "指定は無視され、既定のまま: " + show(byUrls));

// ---- ④ どの relay が、このPCの回線からつながるか ----
console.log("\n── ④ このPCの回線から、つながる待ち合わせ先 ──");
const CANDIDATES = [
  "wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net",
  "wss://relay.nostr.band", "wss://nostr.mom", "wss://relay.snort.social",
  "wss://purplerelay.com", "wss://relay.mostr.pub", "wss://nostr.data.haus",
  ...a.urls,
  "wss://kosukequiz.invalid.example"   // ★でたらめ。ここが ✕ にならなければ、この検査は鳴っていない（D-17）
];
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "load" });
  const res = await page.evaluate(async (urls) => {
    // つながるだけでなく、**nostr として返事をするか**まで見る。
    // つながっても返事をしない先は、待ち合わせには使えない
    const one = url => new Promise(done => {
      let ws, t;
      const fin = r => { clearTimeout(t); try { ws && ws.close(); } catch (e) {} done({ url, r }); };
      try { ws = new WebSocket(url); } catch (e) { return fin("✕つなげない"); }
      t = setTimeout(() => fin(ws.readyState === 1 ? "△返事なし" : "✕つながらない"), 9000);
      ws.onopen = () => ws.send(JSON.stringify(["REQ", "probe", { kinds: [1], limit: 1 }]));
      ws.onmessage = () => fin("○");
      ws.onerror = () => fin("✕つながらない");
    });
    return await Promise.all([...new Set(urls)].map(one));
  }, CANDIDATES);
  await ctx.close();
  res.forEach(r => console.log(`  ${r.r} ${r.url.replace(/^wss?:\/\//, "")}`));
  const bogus = res.find(r => /invalid\.example/.test(r.url));
  check("★この検査が鳴る（でたらめな先は ✕ になる）", bogus && bogus.r.startsWith("✕"), bogus && bogus.r);
  const alive = res.filter(r => r.r === "○" && !/invalid\.example/.test(r.url));
  console.log(`  → つながって返事もした: ${alive.length}本`);
  const nowUsed = res.filter(r => a.urls.includes(r.url));
  console.log(`  → そのうち、いま選ばれている ${a.urls.length}本 の中で生きているのは ` +
              `${nowUsed.filter(r => r.r === "○").length}本`);
}

// ---- ⑤ ★★「書き込みを受け付けるか」（2026-09-20 に足した）----
//   これまでは「つながるか」しか見ていなかった。**つながっても、告知を断られたら役に立たない。**
//   Trystero は断られ方を見て、**その待ち合わせ先を永久に切り捨てる**（`retireRelay`）:
//       isTerminalRejection = CLOSED || (OK=false && !rate-limited: && !duplicate:)
//   ここでは**その同じ区切り**で分類する。
//
// ★なぜ必要になったか
//   2026-09-20、`relay.damus.io` が
//     ["OK", …, false, "banned: too many rate-limit violations, try again later"]
//   を返していて、毎回4〜5秒で切り捨てられていた。**「つながるか」の検査は ○ を出していた。**
//
// ⚠️ **この結果は「このPCの回線（IP）から、いま」の話**です。
//   ★**出入り禁止は回線ごと・時間つき**（"try again later"）。実機で同じとは限らないし、明日も同じとは限りません。
// ⚠️ ★**告知を1本ずつ、実際に出します。**叩きすぎると、これ自体が出入り禁止の原因になります。
//   **1本につき1回だけ**にしてあります。**繰り返し走らせないこと。**
{
  console.log("\n── ⑤ ★書き込み（告知）を受け付けるか ──");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "load" });
  const pinned = (html.match(/"wss:\/\/[^"]+"/g) || []).map(s => s.slice(1, -1));
  // ★入れ替え候補も、同じ物差しで測る（④で「つながる」と出た先のうち、まだ使っていないもの）
  const SPARES = ["wss://nostr.mom", "wss://relay.snort.social", "wss://purplerelay.com",
                  "wss://nostr.data.haus", "wss://relay-rpi.edufeed.org"];
  const urls = [...pinned, ...SPARES.filter(u => !pinned.includes(u))];
  console.log(`  いま使っている ${pinned.length}本 ＋ 入れ替え候補 ${urls.length - pinned.length}本 に、告知を1本ずつ出します`);
  const { out: res, selfTest } = await page.evaluate(async (urls) => {
    // ★@noble/secp256k1 v3 は、ハッシュ関数を自分で差さないと "hashes.sha256 not set" で落ちる。
    //   （trystero も同じ組み合わせを使っている）
    const nob = await import("https://esm.run/@noble/secp256k1");
    const { sha256 } = await import("https://esm.run/@noble/hashes/sha2");
    if (nob.hashes && !nob.hashes.sha256) nob.hashes.sha256 = sha256;
    const { schnorr } = nob;
    const hex = b => [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    let selfTest = null;
    const { secretKey, publicKey } = schnorr.keygen();
    const pubkey = hex(publicKey);
    async function sign(kind, content) {
      const created_at = Math.floor(Date.now() / 1000), tags = [["x", "relaywriteprobe"]];
      const ser = JSON.stringify([0, pubkey, created_at, kind, tags, content]);
      const idBuf = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ser)));
      const id = hex(idBuf);
      return { id, pubkey, created_at, kind, tags, content, sig: hex(await schnorr.sign(idBuf, secretKey)) };
    }
    // ★出す前に、自分で作った告知が正しいかを確かめる。
    //   （relay が無言なのが「相手のせい」か「こちらのせい」かを分けるため・4-1）
    {
      const ev = await sign(22222, "selftest");
      const ser = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
      const idAgain = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ser))));
      const unhex = s => new Uint8Array(s.match(/../g).map(x => parseInt(x, 16)));
      const sigOk = await schnorr.verify(unhex(ev.sig), unhex(ev.id), unhex(ev.pubkey));
      selfTest = { idOk: idAgain === ev.id, sigOk, pubkeyLen: ev.pubkey.length, sigLen: ev.sig.length };
    }
    async function one(url) {
      return await new Promise(async (done) => {
        let ws, t, ev;
        const fin = (verdict, detail) => { clearTimeout(t); try { ws && ws.close(); } catch {} done({ url, verdict, detail: detail || "" }); };
        const seen = [];
        t = setTimeout(() => fin("△返事なし", "15秒まっても OK が返らない｜受けたもの: " + (seen.join(" ") || "何も来ない")), 15000);
        try { ws = new WebSocket(url); } catch (e) { return fin("✕つなげない", String(e)); }
        ws.onerror = () => fin("✕つなげない", "");
        ws.onclose = (e) => fin("✕つなげない", "開く前に閉じた code=" + e.code);
        ws.onopen = async () => {
          ev = await sign(22222, "relay-write-probe");
          ws.send(JSON.stringify(["EVENT", ev]));
        };
        ws.onmessage = (m) => {
          seen.push(String(m.data).slice(0, 120));
          let a; try { a = JSON.parse(m.data); } catch { return; }
          const [type, , ok, reason] = a;
          if (type === "CLOSED") return fin("✘切り捨て(CLOSED)", String(a[2] || ""));
          if (type === "NOTICE") return;                       // 知らせだけ。判定には使わない
          if (type !== "OK") return;
          if (ok === true) return fin("○受け付けた", "");
          const r = String(reason || "");
          // ★Trystero と同じ区切り。rate-limited: と duplicate: だけが「切り捨てない」
          if (r.startsWith("rate-limited:")) return fin("△速すぎ(rate-limited)", r);
          if (r.startsWith("duplicate:")) return fin("○重複あつかい(duplicate)", r);
          return fin("✘★切り捨てられる", r);
        };
      });
    }
    // ★1本ずつ順に。まとめて叩かない（叩きすぎが出入り禁止のもと）
    const out = [];
    for (const u of urls) out.push(await one(u));
    return { out, selfTest };
  }, urls);
  await ctx.close();
  console.log(`  ★自己確認（こちらの告知が正しいか）: ${JSON.stringify(selfTest)}`);
  for (const r of res) console.log(`  ${(pinned.includes(r.url) ? "[いま使用] " : "[候補]     ") + r.verdict.padEnd(22)} ${r.url.replace(/^wss?:\/\//, "")}${r.detail ? "  ← " + r.detail : ""}`);
  const retired = res.filter(r => r.verdict.startsWith("✘") && pinned.includes(r.url));
  const okWrite = res.filter(r => r.verdict.startsWith("○") && pinned.includes(r.url));
  const spareOk = res.filter(r => r.verdict.startsWith("○") && !pinned.includes(r.url));
  console.log(`\n  ★書き込みを受け付けた: ${okWrite.length}本 / ${res.length}本`);
  console.log(`  ★★切り捨てられる（Trystero が二度と使わない）: ${retired.length}本` +
              (retired.length ? " … " + retired.map(r => r.url.replace(/^wss?:\/\//, "")).join(" / ") : ""));
  check("★待ち合わせ先のうち、書き込みを受け付ける先が2本以上ある",
        okWrite.length >= 2, `${okWrite.length}本`);
  if (retired.length) {
    console.log("  ⚠️ 切り捨てられる先は、**つながっていても数に入りません**。入れ替えを考えてください");
    console.log(`  ★入れ替え候補で、書き込みも通った先: ${spareOk.length}本` +
                (spareOk.length ? " … " + spareOk.map(r => r.url.replace(/^wss?:\/\//, "")).join(" / ") : "（なし）"));
  }
  console.log("  ⚠️ これは**このPCの回線から、いま**の話です。実機・明日は違いえます（\"try again later\"）");
}

await browser.close();
server.close();
console.log(ng === 0 ? "\n✔ すべて確認できた" : `\n✘ ${ng}件 だめだった`);
process.exit(ng === 0 ? 0 : 1);
