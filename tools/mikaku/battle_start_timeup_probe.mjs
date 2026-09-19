// 対戦の「二人の開始ボタン」と「時間切れ／スキップの切り分け」を、実機（本物のChrome）で
// 二人ぶんの画面を動かして目で見る道具（確認ポイント B-12）。
//
// 見るのはこの4つ:
//   [1] 開始ボタンが二人とも出る／片方が押しただけでは始まらない／二人押したら始まる
//   [2] ★時間切れ: 答えが出ない・記録が何も変わらない
//   [3] ★時間切れの問題が、あとで回ってきて正解したら「正解」として記録される
//   [4] スキップを押したとき: 答えが出て、あとで正解しても「誤答」のまま
//
// 通信は node が中継するスタブに差し替える（test_battle_resume.mjs と同じ作り）。
// スクリーンショットは tools/mikaku/shots_battle/ に残す。
import fs from "node:fs"; import http from "node:http"; import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url"; import { execSync } from "node:child_process";

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_battle");
fs.mkdirSync(SHOTS, { recursive: true });
const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(gRoot, "playwright", "index.mjs")).href);

const MIME = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".jpg":"image/jpeg",".png":"image/png"};
const server = http.createServer((req,res)=>{
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/,"") || "index.html";
  const file = path.join(ROOT, rel);
  if(!file.startsWith(ROOT + path.sep)){ res.writeHead(403).end(); return; }
  fs.readFile(file,(e,b)=> e ? res.writeHead(404).end()
    : (res.writeHead(200,{"content-type":MIME[path.extname(file).toLowerCase()]||"application/octet-stream"}), res.end(b)));
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const BASE = "http://127.0.0.1:"+server.address().port+"/index.html";

const STUB = [
  "export function joinRoom(cfg, code){",
  "  const actions = {};",
  "  const room = { onPeerJoin(){}, onPeerLeave(){},",
  "    makeAction(name){ const a={ send: d=>window.__kqSend({code,name,data:d}), onMessage:null }; actions[name]=a; return a; },",
  "    leave(){ window.__kqSend({code, leave:true}); } };",
  "  window.__kqDeliver=(name,data)=>{const a=actions[name]; if(a&&a.onMessage) a.onMessage(data);};",
  "  window.__kqPeerJoin=()=>room.onPeerJoin();",
  "  setTimeout(()=>window.__kqSend({code, join:true}),0);",
  "  return room;",
  "}"
].join("\n");

const browser = await chromium.launch({ channel: "chrome" });
const rooms = new Map();
const errs = [];
async function mk(label){
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  await ctx.route(/(esm\.run\/trystero|cdn\.jsdelivr\.net\/npm\/trystero)/, r =>
    r.fulfill({status:200, contentType:"application/javascript", body:STUB}));
  const page = await ctx.newPage();
  page.on("pageerror", e=>errs.push(label+" JSエラー: "+e.message));
  await ctx.exposeBinding("__kqSend",(src,msg)=>{
    const p = src.page;
    for(const [c,s] of rooms) if(c!==msg.code) s.delete(p);
    const s = rooms.get(msg.code) || new Set(); rooms.set(msg.code,s);
    if(msg.leave){ s.delete(p); return; }
    if(msg.join){
      // 本物の trystero と同じで、先にいた人と入ってきた人の双方に1回ずつ配る
      const others=[...s]; s.add(p);
      for(const q of others){
        q.evaluate(()=>window.__kqPeerJoin&&window.__kqPeerJoin()).catch(()=>{});
        p.evaluate(()=>window.__kqPeerJoin&&window.__kqPeerJoin()).catch(()=>{});
      }
      return;
    }
    for(const q of s) if(q!==p) q.evaluate(([n,d])=>window.__kqDeliver&&window.__kqDeliver(n,d),[msg.name,msg.data]).catch(()=>{});
  });
  return { ctx, page, label };
}

const checks = [];
const ok = (label, cond, detail)=>{ checks.push({label, ok:!!cond, detail}); };
const tap = (pg,sel)=>pg.$eval(sel,e=>e.click());
const txt = (pg,sel)=>pg.$eval(sel,e=>e.textContent.trim());
const shot = (pg,name)=>pg.screenshot({path: path.join(SHOTS, name+".png")});
const visible = (pg,sel,timeout=8000)=>pg.waitForFunction(s=>{
  const e=document.querySelector(s); return e && getComputedStyle(e).display!=="none" && e.offsetParent!==null;
}, sel, {timeout});
const qid = async pg => (await txt(pg,"#battle-q-id")).replace(/^No\./,"");
const answerShown = pg => pg.$eval("#battle-a-block", e=>e.classList.contains("show"));
const stats = pg => pg.evaluate(()=>JSON.parse(localStorage.getItem("kq_battle_stats_v1")||"{}"));
const battleActive = pg => pg.$eval("#screen-battle", e=>e.classList.contains("active"));

const host = await mk("host"), guest = await mk("guest");
await host.page.goto(BASE);
const unit = await host.page.evaluate(()=>QA_DATA.find(q=>q.subj==="社会"&&q.kind!=="calc").u);
// ★headStartSec を 3 にして、時間切れを実際に起こす。ほかの時間は長くして手で進める
const settings = { subject:"社会", unitsBySubject:{"社会":[unit]}, units:[unit], count:3, shuffle:false,
  filterUnmastered:false, filterWeak:false, type:"all", priority:"all", level:"all", reviewMixCount:0,
  fairMode:false, headStartSec:3, answerTimeSec:120, judgeTimeSec:120, nextTimeSec:120, skipNextTimeSec:120 };
for(const p of [host.page, guest.page]){
  if(p!==host.page) await p.goto(BASE);
  await p.evaluate(s=>{ localStorage.clear(); localStorage.setItem("kq_battle_settings_v1", JSON.stringify(s)); }, settings);
  await p.reload(); await p.waitForTimeout(600);
}

// ---- [1] 開始ボタン ----
await tap(host.page,"#create-btn");
await host.page.waitForFunction(()=>/^[0-9]{4}$/.test(document.getElementById("room-code-display").textContent));
const code = await txt(host.page,"#room-code-display");
await tap(guest.page,"#go-join");
await guest.page.fill("#join-code-input", code);
await tap(guest.page,"#join-btn");
await visible(host.page,"#start-together-btn");
await visible(guest.page,"#join-start-together-btn");
await shot(host.page,"1a_host_start_button"); await shot(guest.page,"1a_guest_start_button");
ok("[1] 開始ボタンが二人とも出る", true);
await tap(host.page,"#start-together-btn");
await host.page.waitForTimeout(500);
ok("[1] ★ホストが押しただけでは始まらない", !(await battleActive(host.page)));
ok("[1] 押した側は「相手を待っています…」", (await txt(host.page,"#start-together-btn")).includes("相手を待っています"),
   "実際の文言: "+await txt(host.page,"#start-together-btn"));
ok("[1] 相手側は「相手は準備OK！」", (await txt(guest.page,"#join-start-together-btn")).includes("相手は準備OK"),
   "実際の文言: "+await txt(guest.page,"#join-start-together-btn"));
await shot(host.page,"1b_host_waiting"); await shot(guest.page,"1b_guest_peer_ready");
await tap(guest.page,"#join-start-together-btn");
await visible(host.page,"#skip-btn");
ok("[1] ★二人とも押したら始まる", await battleActive(host.page));

// ---- [2] 時間切れ（1問目をわざと放置する）----
const timedOutId = await qid(host.page);
await visible(host.page,"#skip-continue-btn", 12000);   // headStartSec 3秒で時間切れになる
await host.page.waitForTimeout(300);
ok("[2] ★時間切れでは答えが出ない", !(await answerShown(host.page)));
ok("[2] 時間切れだと分かる文言が出る", (await txt(host.page,"#skip-encourage")).includes("時間切れ"),
   "実際の文言: "+await txt(host.page,"#skip-encourage"));
ok("[2] ゲスト側も「時間切れ」と出る", (await txt(guest.page,"#guest-wait-status")).includes("時間切れ"),
   "実際の文言: "+await txt(guest.page,"#guest-wait-status"));
const stAfterTimeUp = await stats(host.page);
ok("[2] ★時間切れでは記録が何も増えない", Object.keys(stAfterTimeUp).length === 0,
   "記録: "+JSON.stringify(stAfterTimeUp));
await shot(host.page,"2_host_timeup"); await shot(guest.page,"2_guest_timeup");

// ---- [4] スキップを押す（次の問題）----
await tap(host.page,"#skip-continue-btn");
await visible(host.page,"#skip-btn");
const skippedId = await qid(host.page);
await tap(host.page,"#skip-btn");
await visible(host.page,"#skip-continue-btn");
ok("[4] スキップを押したときは答えが出る", await answerShown(host.page));
ok("[4] 文言は「あとでもう一度出てくるよ」", (await txt(host.page,"#skip-encourage")).includes("あとでもう一度"),
   "実際の文言: "+await txt(host.page,"#skip-encourage"));
await shot(host.page,"4_host_skip");

// ---- 1問ぶん解く（ホストの記録はゲストの判定で入る）----
async function answerOnce(hostCorrect){
  await visible(host.page,"#advance-btn");
  await tap(host.page,"#advance-btn");
  await visible(host.page,"#answer-reveal-btn"); await visible(guest.page,"#answer-reveal-btn");
  await tap(host.page,"#answer-reveal-btn"); await tap(guest.page,"#answer-reveal-btn");
  await visible(host.page,"#judge-row"); await visible(guest.page,"#judge-row");
  await tap(guest.page, hostCorrect ? "#judge-ok" : "#judge-ng");   // ホストの結果
  await tap(host.page,"#judge-ok");                                  // ゲストの結果
  await visible(host.page,"#next-btn");
  await tap(host.page,"#next-btn");
}
await tap(host.page,"#skip-continue-btn");   // スキップの次へ
await visible(host.page,"#skip-btn");
await answerOnce(true);                      // まだ触っていない問題を1問、正解しておく

// ---- [3] 時間切れの問題が回ってきたら、正解は正解として記録される ----
await visible(host.page,"#skip-btn", 12000);
ok("[3] ★時間切れの問題が、あとで回ってくる", (await qid(host.page)) === timedOutId,
   "いま出ているのは "+await qid(host.page)+"（時間切れにしたのは "+timedOutId+"）");
await answerOnce(true);
const st1 = await stats(host.page);
ok("[3] ★時間切れの問題は、正解したら「正解」で記録される",
   st1[timedOutId] && st1[timedOutId].correct >= 1 && !st1[timedOutId].wrong,
   timedOutId+" の記録: "+JSON.stringify(st1[timedOutId]));

// ---- [4] スキップした問題は、正解しても誤答のまま ----
await visible(host.page,"#skip-btn", 12000);
ok("[4] スキップした問題が、あとで回ってくる", (await qid(host.page)) === skippedId,
   "いま出ているのは "+await qid(host.page)+"（スキップしたのは "+skippedId+"）");
await answerOnce(true);
const st2 = await stats(host.page);
ok("[4] ★スキップした問題は、正解しても誤答のまま",
   st2[skippedId] && st2[skippedId].wrong >= 1 && !st2[skippedId].correct,
   skippedId+" の記録: "+JSON.stringify(st2[skippedId]));

console.log("");
let ng = 0;
for(const c of checks){ if(!c.ok) ng++; console.log((c.ok?"  ok   ":"  NG   ")+c.label+(c.ok?"":"  → "+(c.detail||""))); }
console.log("\nJSエラー: "+errs.length+"件"+(errs.length?"\n  "+errs.join("\n  "):""));
console.log(checks.length+"件の確認、問題 "+(ng+errs.length)+"件");
console.log("画面の写真: "+SHOTS);
await browser.close(); server.close();
process.exit(ng+errs.length ? 1 : 0);
