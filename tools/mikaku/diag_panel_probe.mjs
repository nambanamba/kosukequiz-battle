// つながらなかったときに出る「くわしい状態」（2026-09-20）を、
// **本物の Chrome で実際に出させて、中身を読んで、写真に撮る。**
//
// 使い方: node tools/mikaku/diag_panel_probe.mjs
//
// ★3つの止まり方を作り分けて、パネルが**それぞれ別の答えを出す**ことを見る。
//   ここが同じ文面になるなら、パネルを足した意味がない。
//   ① 相手が来ない          … 「相手が見つかっていません」
//   ② ライブラリが読めない    … 「通信ライブラリを読めていません」
//   ③ ★WebRTC が無い（Silk 想定）… 「このブラウザは対戦のしくみを持っていません」
//
// ★この検査が見ないもの: **本物の Silk**。ここに実機は無い。
//   ③は「WebRTC を消した Chrome」であって Silk そのものではない（D-16）。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_diag");
fs.mkdirSync(SHOTS, { recursive: true });

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();

const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".jpg":"image/jpeg", ".png":"image/png"};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {"content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream"});
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/index.html";

// ★待ち合わせの相手になる、つながるだけの WebSocket。
//   これが無いと「待ち合わせに失敗した」状態しか作れず、
//   **本当に見たい「待ち合わせはできたのに相手がいない」を試せない。**
const crypto = await import("node:crypto");
server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"] || "";
  const accept = crypto.createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n" +
    "Connection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  socket.on("error", () => {});   // つなぎっぱなしにするだけ。何も送らない
});
const WS_URL = "ws://127.0.0.1:" + server.address().port + "/ws";

// 部屋には入れるが、相手はいつまでも来ないスタブ。
// 待ち合わせの通信は**本当につないで**、本物の trystero と同じ見え方にする
const STUB = `
export function joinRoom(cfg, code, cb){
  window.__kqCb = !!(cb && cb.onJoinError && cb.onPeerHandshake);
  window.__kqRtc = cfg && cfg.rtcConfig ? cfg.rtcConfig : null;
  window.__kqPolyfill = typeof cfg.rtcPolyfill;
  try{ window.__kqWs = new WebSocket(${JSON.stringify(WS_URL)}); }catch(e){}
  return { onPeerJoin(){}, onPeerLeave(){},
    makeAction(){ return { send(){}, onMessage: null }; }, leave(){} };
}`;

let ng = 0;
const browser = await chromium.launch({ channel: "chrome" });

// 設定を入れて、ホストで部屋を作るところまで
async function openHost(ctx, { breakLib = false, noWebRTC = false } = {}) {
  const page = await ctx.newPage();
  if (noWebRTC) {
    // ★Silk のように「WebRTC が無い」端末のまね。ページが動き出す前に消す
    await page.addInitScript(() => {
      try { delete window.RTCPeerConnection; } catch (e) { window.RTCPeerConnection = undefined; }
      try { delete window.webkitRTCPeerConnection; } catch (e) {}
    });
  }
  await page.goto(BASE); await page.waitForTimeout(700);
  await page.evaluate(() => {
    const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc").u;
    localStorage.clear();
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: 3 }));
  });
  await page.reload(); await page.waitForTimeout(700);
  await page.$eval("#create-btn", e => e.click());
  return page;
}
const panel = page => page.evaluate(() => ({
  shown: document.getElementById("create-diag").classList.contains("show"),
  text: document.getElementById("create-diag-text").textContent
}));
function check(label, ok, extra) {
  console.log(`  ${ok ? "✔" : "✘"} ${label}${extra ? " … " + extra : ""}`);
  if (!ok) ng++;
}

// ---- ① 相手が来ない（いちばんよくある形）----
console.log("\n── ① 相手が来ないまま20秒 ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/trystero/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  const page = await openHost(ctx);
  await page.waitForTimeout(2000);
  const mid = await panel(page);
  check("20秒たつ前は出ていない", !mid.shown);
  const wired = await page.evaluate(() => ({ cb: window.__kqCb, poly: window.__kqPolyfill, turns: (window.__kqRtc?.iceServers || []).filter(s => /^turns?:/i.test(s.urls)).length }));
  check("ライブラリに知らせの受け口を渡している（onJoinError/onPeerHandshake）", wired.cb === true);
  check("道を見るための rtcPolyfill を渡している", wired.poly === "function", wired.poly);
  check("★死んだ中継を外した（TURN 0本）", wired.turns === 0, `TURN ${wired.turns}本`);
  await page.waitForTimeout(19000);
  const p = await panel(page);
  check("20秒すぎにパネルが出る", p.shown);
  check("★待ち合わせはできたと分かる（ここが Silk の切り分けの要）", /待ち合わせ: つながった [1-9]/.test(p.text));
  check("止まった場所を「相手が見つかっていません」と言う", /相手が見つかっていません/.test(p.text));
  check("版が入っている", /版 \d{4}-\d{2}-\d{2}/.test(p.text));
  console.log("  ── 実際の中身 ──\n" + p.text.split("\n").map(l => "    " + l).join("\n"));
  await page.screenshot({ path: path.join(SHOTS, "1_no_peer_390.png"), fullPage: true });

  // コピーのボタン（Silk で新しい書き方が使えない場合も考えて、両方の道がある）
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(()=>{});
  await page.$eval("#create-diag-copy", e => e.click());
  await page.waitForTimeout(600);
  const btn = await page.$eval("#create-diag-copy", e => e.textContent);
  check("コピーを押すと結果が字で出る", /コピーしました|コピーできません/.test(btn), btn);
  await ctx.close();
}

// ---- ② ライブラリが読めない ----
console.log("\n── ② 通信ライブラリを読めない ──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/trystero/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: "syntax error !!! (" }));
  const page = await openHost(ctx, { breakLib: true });
  await page.waitForTimeout(3000);
  const p = await panel(page);
  check("すぐにパネルが出る（20秒待たない）", p.shown);
  check("止まった場所を「ライブラリを読めていません」と言う", /通信ライブラリを読めていません/.test(p.text));
  await page.screenshot({ path: path.join(SHOTS, "2_lib_broken_390.png"), fullPage: true });
  await ctx.close();
}

// ---- ③ ★WebRTC が無い端末（Silk 想定）----
console.log("\n── ③ WebRTC が無い端末のまね（Silk 想定。実機ではない）──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/trystero/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  const page = await openHost(ctx, { noWebRTC: true });
  await page.waitForTimeout(21500);
  const p = await panel(page);
  check("パネルが出る", p.shown);
  check("★「対戦のしくみ（WebRTC）を持っていません」と名指しする", /WebRTC）を持っていません/.test(p.text));
  check("WebRTC: ★ない と書いてある", /WebRTC: ★ない/.test(p.text));
  console.log("  ── 実際の中身（Silk 想定）──\n" + p.text.split("\n").map(l => "    " + l).join("\n"));
  await page.screenshot({ path: path.join(SHOTS, "3_no_webrtc_390.png"), fullPage: true });
  await ctx.close();
}

// ---- ④ ★この検査が鳴るか（D-17）----
//   パネルの文を書きかえて、①の判定がちゃんと ✘ になることを見る。
console.log("\n── ④ この検査が鳴るか（わざと答えを書きかえる）──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/trystero/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  const page = await openHost(ctx);
  await page.waitForTimeout(21000);
  await page.evaluate(() => { document.getElementById("create-diag-text").textContent = "でたらめ"; });
  const p = await panel(page);
  const wouldPass = /相手が見つかっていません/.test(p.text);
  check("書きかえたら、①の判定は通らなくなる", !wouldPass, wouldPass ? "★通ってしまった" : "");
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n写真: ${SHOTS}`);
console.log(ng === 0 ? "✔ すべて確認できた" : `✘ ${ng}件 だめだった`);
process.exit(ng === 0 ? 0 : 1);
