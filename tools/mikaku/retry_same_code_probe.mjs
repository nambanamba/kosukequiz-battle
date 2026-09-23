// ★「同じ番号で入り直す」と「新しい番号で作り直す」で、結果が変わるのかを実測する。
//   2026-09-23 ユーザー証言:
//     ・素早く入れば入れる／少し経つと入れない
//     ・「もう一度繋ぐ」を押しても繋がらない
//     ・★ホストが一度抜けて「2人で始める」を押すと繋がる
//
//   ★コードを読むと、「もう一度つなぐ」は **leave() → joinRoom(同じ番号)** を既にやっている。
//     「二人で始める」との違いは **番号が新しくなること**だけ。
//     → ★**効いているのは「入り直し」ではなく「番号が変わること」ではないか**を、ここで確かめる。
//
// 使い方: node tools/mikaku/retry_same_code_probe.mjs [--age=70]
//   --age = 部屋を作ってから、入る側が入るまでの秒数（既定70秒。25秒では出会えることが分かっている）
//
// ⚠️ ★本物の待ち合わせ先を使う。**続けて回さないこと**（2026-09-20 に締め出された）。
//   この試験がつなぐのは「作る側1つ・入る側1つ」だけ。
//
// ■ ★見ていないもの（4-2）: 実機・携帯回線・relay 側の事情
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_diag");
fs.mkdirSync(SHOTS, { recursive: true });
const AGE = Number((process.argv.find(a => a.startsWith("--age=")) || "--age=70").split("=")[1]);
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

// 自分が出した名乗りと、受け取った名乗りの「目印（タグ）」を控える。
// ★これで「相手の名乗りが、そもそも届いているのか」が分かる
const SPY = `
window.__spy = { sentTags: [], recvTags: [], reqTags: [], recvEvents: 0 };
(function(){
  var Orig = window.WebSocket;
  function Spy(url, protocols){
    var ws = (protocols === undefined) ? new Orig(url) : new Orig(url, protocols);
    ws.addEventListener("message", function(ev){
      var s = ev.data; if(typeof s !== "string") return;
      if(s.lastIndexOf('["EVENT"',0)!==0) return;
      window.__spy.recvEvents++;
      try{
        var e = JSON.parse(s)[2] || {};
        (e.tags||[]).forEach(function(t){ if(window.__spy.recvTags.indexOf(t[1])<0) window.__spy.recvTags.push(String(t[1])); });
      }catch(x){}
    });
    var send = ws.send;
    ws.send = function(d){
      try{
        if(typeof d === "string"){
          if(d.lastIndexOf('["EVENT"',0)===0){
            var e = JSON.parse(d)[1] || {};
            (e.tags||[]).forEach(function(t){ if(window.__spy.sentTags.indexOf(t[1])<0) window.__spy.sentTags.push(String(t[1])); });
          } else if(d.lastIndexOf('["REQ"',0)===0){
            var m = JSON.parse(d);
            m.slice(2).forEach(function(f){ Object.keys(f||{}).forEach(function(k){
              if(k.charAt(0)==="#") (f[k]||[]).forEach(function(v){ if(window.__spy.reqTags.indexOf(v)<0) window.__spy.reqTags.push(String(v)); });
            });});
          }
        }
      }catch(x){}
      return send.apply(ws, arguments);
    };
    return ws;
  }
  Spy.prototype = Orig.prototype;
  ["CONNECTING","OPEN","CLOSING","CLOSED"].forEach(function(k){ Spy[k] = Orig[k]; });
  window.WebSocket = Spy;
})();
`;
const browser = await chromium.launch({ channel: "chrome" });
async function newPeer(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(SPY);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(PAGE_URL); await page.waitForTimeout(800);
  return { ctx, page, errs, name };
}
const spy = (p) => p.page.evaluate(() => window.__spy);
async function metWithin(hostPage, ms) {
  try {
    await hostPage.waitForFunction(() => {
      const e = document.getElementById("start-together-btn");
      return e && getComputedStyle(e).display !== "none";
    }, null, { timeout: ms });
    return true;
  } catch (e) { return false; }
}
const codeOf = (p) => p.page.$eval("#room-code-display", e => e.textContent);

console.log("══ ★同じ番号で入り直す vs 新しい番号で作り直す ══  部屋の古さ " + AGE + "秒\n");
const host = await newPeer("作る側");
await host.page.click("#create-btn");
await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
const codeA = await codeOf(host);
console.log("  ① 部屋 " + codeA + " を作った。" + AGE + "秒 放っておく（20秒でいちど「つながりません」が出るはず）");
await host.page.waitForTimeout(AGE * 1000);
const warned = await host.page.$eval("#create-error", e => e.classList.contains("show")).catch(() => false);
console.log("     20秒の知らせ: " + (warned ? "出ている" : "出ていない"));

const guest = await newPeer("入る側");
await guest.page.click("#go-join");
await guest.page.fill("#join-code-input", codeA);
await guest.page.click("#join-btn");
console.log("  ② 入る側が " + codeA + " に入った…（30秒待つ）");
const met1 = await metWithin(host.page, 30000);
console.log("     → " + (met1 ? "○ 出会えた" : "✘ 出会えない") + "（ユーザーの症状はここが ✘）");
{
  const hs = await spy(host), gs = await spy(guest);
  const shared = gs.sentTags.filter(t => hs.reqTags.indexOf(t) >= 0);
  console.log("     作る側: 購読した目印 " + hs.reqTags.length + " ／ 受け取ったイベント " + hs.recvEvents +
    " ／ ★入る側の名乗りの目印を購読していたか: " + (shared.length ? "はい" : "★いいえ"));
  console.log("     ★作る側が、入る側の名乗りを受け取ったか: " +
    (gs.sentTags.some(t => hs.recvTags.indexOf(t) >= 0) ? "はい" : "★いいえ"));
}

console.log("\n  ③ ★作る側で「もう一度つなぐ」を押す（＝同じ番号 " + codeA + " で leave→入り直し）");
await host.page.$eval("#create-retry-btn", e => e.click());
await host.page.waitForTimeout(1500);
const codeAfterRetry = await codeOf(host);
console.log("     押したあとの番号: " + codeAfterRetry + (codeAfterRetry === codeA ? "（同じ）" : "（★変わった）"));
const met2 = await metWithin(host.page, 30000);
console.log("     → " + (met2 ? "○ 出会えた" : "✘ 出会えない"));

console.log("\n  ④ ★入る側も「もう一度つなぐ」を押す（両方が入り直した状態）");
const hasJoinRetry = await guest.page.$eval("#join-retry-btn", e => getComputedStyle(e).display !== "none").catch(() => false);
if (hasJoinRetry) {
  await guest.page.$eval("#join-retry-btn", e => e.click());
} else {
  console.log("     （入る側に「もう一度つなぐ」が出ていないので、入り直しをやり直す）");
  await guest.page.$eval("#join-btn", e => e.click()).catch(() => {});
}
const met3 = await metWithin(host.page, 30000);
console.log("     → " + (met3 ? "○ 出会えた" : "✘ 出会えない"));

console.log("\n  ⑤ ★作る側が一度やめて、「二人で始める」を押し直す（＝新しい番号になる）");
await host.page.$eval("#create-cancel", e => e.click()).catch(async () => {
  await host.page.goto(PAGE_URL); await host.page.waitForTimeout(800);
});
await host.page.waitForTimeout(1200);
await host.page.$eval("#create-btn", e => e.click()).catch(async () => {
  await host.page.goto(PAGE_URL); await host.page.waitForTimeout(800);
  await host.page.$eval("#create-btn", e => e.click());
});
await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
const codeB = await codeOf(host);
console.log("     新しい番号: " + codeB + (codeB === codeA ? "（★同じだった）" : ""));
await guest.page.goto(PAGE_URL); await guest.page.waitForTimeout(800);
await guest.page.click("#go-join");
await guest.page.fill("#join-code-input", codeB);
await guest.page.click("#join-btn");
const met4 = await metWithin(host.page, 30000);
console.log("     → " + (met4 ? "○ 出会えた" : "✘ 出会えない"));

console.log("\n── まとめ ──");
console.log("  ② 古い部屋（" + AGE + "秒）に、あとから入る          … " + (met1 ? "○" : "✘"));
console.log("  ③ 「もう一度つなぐ」（同じ番号で入り直し）        … " + (met2 ? "○" : "✘"));
console.log("  ④ 両方が入り直し                                  … " + (met3 ? "○" : "✘"));
console.log("  ⑤ ★新しい番号で作り直し（ユーザーが効くと言う手） … " + (met4 ? "○" : "✘"));
if (!met1 && !met2 && met4) console.log("\n★**番号が変わると直る**＝古い部屋の番号そのものが使えなくなっています");
else if (!met1 && met2) console.log("\n★入り直しで直る＝「もう一度つなぐ」は効いている（ユーザーの端末では別の理由）");
else if (met1) console.log("\n★この試験では症状が出ませんでした。**再現できていません**（4-1）");
await host.page.screenshot({ path: path.join(SHOTS, "retry_host_last.png"), fullPage: true });
await guest.page.screenshot({ path: path.join(SHOTS, "retry_guest_last.png"), fullPage: true });
console.log("\n★本物の待ち合わせ先を使いました。**続けて回さないでください**");
await browser.close(); server.close();
