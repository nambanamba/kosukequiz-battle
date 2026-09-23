// ★「ソケットは開いているのに、購読（REQ）のほうが死んでいるのではないか」を実測する。
//   2026-09-23 ユーザー証言:「素早く入ればはいれる／どっちの端末も10秒以内にリロード・接続しないと入れない」
//   司令塔の見立て: 記録の「○（いま開いている）」はソケットの数しか見ていない。
//                   ソケットが生きていても REQ が終わっていれば、新しい告知は届かない。
//
// 使い方: node tools/mikaku/relay_subscription_probe.mjs [--minutes=5]
//
// ■ ★本物の待ち合わせ先を使う。だから**1回の試験で長く観察する**（叩きすぎない）
//   開くページ: 部屋を作る側 1つ ＋ 途中で入る側 2つ（60秒後・180秒後）だけ。
//   ⚠️ 2026-09-20 に試験の回しすぎで damus から締め出された。繰り返し実行しないこと。
//
// ■ 何を測るか（★「開いているか」ではなく「届いているか」）
//   - 待ち合わせ先ごとに: 送った告知／受け取ったイベント／EOSE／OK／CLOSED を**時刻つき**で数える
//   - **最後にイベントを受け取ってから何秒たったか**（＝購読が生きているかの手がかり）
//   - ソケットの状態（開いている/閉じた）も同時に見て、★**食いちがいが出るかを見る**
//   - 途中で入る側が、60秒後・180秒後に**出会えるか**（20秒の知らせが出たあとも含む本物の流れ）
//
// ■ ★見ていないもの（4-2）
//   - 実機（Silk/Fire）・携帯回線。ここは1台のPCの中の Chrome
//   - relay 側の事情（向こうが何を考えて切ったかは分からない。こちらに届いた事実だけ）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_diag");
fs.mkdirSync(SHOTS, { recursive: true });
const MINUTES = Number((process.argv.find(a => a.startsWith("--minutes=")) || "--minutes=5").split("=")[1]);
const root = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";

// ★アプリの数え方とは別に、こちらで独立に数える（アプリの数字を検算するため）
const SPY = `
window.__wsLog = { relays: {}, t0: Date.now() };
(function(){
  var Orig = window.WebSocket;
  function rec(url){
    var h = String(url).replace(/^wss?:\\/\\//, "").replace(/\\/$/, "");
    var r = window.__wsLog.relays[h];
    if(!r) r = window.__wsLog.relays[h] = { open:0, close:0, err:0, sentEvent:0, sentReq:0,
      recvEvent:0, eose:0, ok:0, okFalse:0, closed:0, notice:0, lastRecvAt:0, firstOpenAt:0, state:-1, socks:[] };
    return r;
  }
  function Spy(url, protocols){
    var ws = (protocols === undefined) ? new Orig(url) : new Orig(url, protocols);
    var r = rec(url); r.socks.push(ws);
    ws.addEventListener("open", function(){ r.open++; if(!r.firstOpenAt) r.firstOpenAt = Date.now(); });
    ws.addEventListener("close", function(){ r.close++; });
    ws.addEventListener("error", function(){ r.err++; });
    ws.addEventListener("message", function(ev){
      var s = ev.data; if(typeof s !== "string") return;
      r.lastRecvAt = Date.now();
      if(s.lastIndexOf('["EVENT"',0)===0) r.recvEvent++;
      else if(s.lastIndexOf('["EOSE"',0)===0) r.eose++;
      else if(s.lastIndexOf('["CLOSED"',0)===0) r.closed++;
      else if(s.lastIndexOf('["NOTICE"',0)===0) r.notice++;
      else if(s.lastIndexOf('["OK"',0)===0){ r.ok++; try{ if(JSON.parse(s)[2]===false) r.okFalse++; }catch(e){} }
    });
    var send = ws.send;
    ws.send = function(d){
      try{
        if(typeof d === "string"){
          if(d.lastIndexOf('["EVENT"',0)===0) r.sentEvent++;
          else if(d.lastIndexOf('["REQ"',0)===0) r.sentReq++;
        }
      }catch(e){}
      return send.apply(ws, arguments);
    };
    return ws;
  }
  Spy.prototype = Orig.prototype;
  ["CONNECTING","OPEN","CLOSING","CLOSED"].forEach(function(k){ Spy[k] = Orig[k]; });
  window.WebSocket = Spy;
  window.__wsSnap = function(){
    var out = {};
    Object.keys(window.__wsLog.relays).forEach(function(h){
      var r = window.__wsLog.relays[h], openNow = 0;
      r.socks.forEach(function(w){ try{ if(w.readyState === 1) openNow++; }catch(e){} });
      out[h] = { openNow: openNow, open: r.open, close: r.close, sentEvent: r.sentEvent, sentReq: r.sentReq,
        recvEvent: r.recvEvent, eose: r.eose, ok: r.ok, okFalse: r.okFalse, closed: r.closed, notice: r.notice,
        sinceRecv: r.lastRecvAt ? Math.round((Date.now() - r.lastRecvAt)/1000) : -1 };
    });
    return out;
  };
})();
`;

const browser = await chromium.launch({ channel: "chrome" });
async function newPeer() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(SPY);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(PAGE_URL); await page.waitForTimeout(800);
  return { ctx, page, errs };
}
const snap = (page) => page.evaluate(() => window.__wsSnap());
const fmt = (s) => Object.keys(s).map(h => "    " + h.padEnd(26) +
  " 開" + s[h].openNow + "/" + s[h].open + " 切" + s[h].close +
  " ｜送: 告知" + String(s[h].sentEvent).padStart(3) + " 購読" + s[h].sentReq +
  " ｜受: ｲﾍﾞﾝﾄ" + String(s[h].recvEvent).padStart(3) + " EOSE" + s[h].eose + " OK" + s[h].ok +
  (s[h].okFalse ? "(断り" + s[h].okFalse + ")" : "") + " CLOSED" + s[h].closed + " NOTICE" + s[h].notice +
  " ｜最後の受信 " + (s[h].sinceRecv < 0 ? "なし" : s[h].sinceRecv + "秒前")).join("\n");

console.log("══ ★購読が生きているか（本物の待ち合わせ先・1回だけの長い観察 " + MINUTES + "分） ══");
const host = await newPeer();
await host.page.click("#create-btn");
await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
const code = await host.page.$eval("#room-code-display", e => e.textContent);
const t0 = Date.now();
console.log("  部屋 " + code + " を作った（作った側は、このまま開いたまま放置する）\n");

// 途中で「入る側」を開いて、出会えるかを見る（★20秒の知らせが出たあとも含む本物の流れ）
async function tryJoinAt(sec) {
  const guest = await newPeer();
  await guest.page.click("#go-join");
  await guest.page.fill("#join-code-input", code);
  await guest.page.click("#join-btn");
  const tj = Date.now();
  let met = true;
  try {
    await host.page.waitForFunction(() => {
      const e = document.getElementById("start-together-btn");
      return e && getComputedStyle(e).display !== "none";
    }, null, { timeout: 30000 });
  } catch (e) { met = false; }
  const secs = ((Date.now() - tj) / 1000).toFixed(1);
  console.log("  ★" + sec + "秒後に入った側 … " + (met ? "○ 出会えた（" + secs + "秒）" : "✘ 30秒たっても出会えない"));
  if (!met) await guest.page.screenshot({ path: path.join(SHOTS, "sub_join" + sec + "_guest.png"), fullPage: true });
  const gs = await snap(guest.page);
  await guest.ctx.close();
  return { met, gs };
}

const joinAt = [60, 180, 300].filter(s => s <= MINUTES * 60);
const results = [];
let nextJoin = 0;
for (let t = 10; t <= MINUTES * 60; t += 10) {
  while (Date.now() - t0 < t * 1000) await host.page.waitForTimeout(200);
  if (t % 30 === 0 || t === 10) {
    const s = await snap(host.page);
    console.log("  [" + String(t).padStart(3) + "秒] 作った側");
    console.log(fmt(s));
  }
  if (nextJoin < joinAt.length && t >= joinAt[nextJoin]) {
    const r = await tryJoinAt(joinAt[nextJoin]);
    results.push({ sec: joinAt[nextJoin], met: r.met });
    nextJoin++;
    if (r.met) {
      // 出会えたら、次の観察のために部屋を作り直す（相手が去ると画面が戻るため）
      console.log("     （出会えたので、この回の観察はここまで。以降の数字は参考）");
    }
  }
}
const last = await snap(host.page);
console.log("\n── まとめ（作った側・最後の状態）──");
console.log(fmt(last));
console.log("\n── ★遅れて入ったとき ──");
results.forEach(r => console.log("  " + String(r.sec).padStart(3) + "秒後 … " + (r.met ? "○ 出会えた" : "✘ 出会えない")));
const anyClosed = Object.keys(last).filter(h => last[h].closed > 0);
console.log("\n── ★購読を打ち切られた（CLOSED）──  " + (anyClosed.length ? anyClosed.join(" , ") : "なし"));
const openButSilent = Object.keys(last).filter(h => last[h].openNow > 0 && last[h].sinceRecv > 120);
console.log("── ★ソケットは開いているのに、2分以上なにも届いていない先 ──  " + (openButSilent.length ? openButSilent.join(" , ") : "なし"));
console.log("   ★ここに名前が出たら、司令塔の見立て（記録の○が嘘をつく）どおりです");
await host.page.screenshot({ path: path.join(SHOTS, "sub_host_last.png"), fullPage: true });
console.log("\n★この試験は本物の待ち合わせ先を使っています。**続けて回さないでください**（締め出されます）");
await browser.close(); server.close();
