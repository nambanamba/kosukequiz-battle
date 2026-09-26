// 「よく間違える問題」の対象が尽きたとき、実際にどうなるかを見る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { pathToFileURL } from "node:url"; import { execSync } from "node:child_process";
const ROOT=path.resolve(process.cwd());
const g=execSync("npm root -g",{encoding:"utf8"}).trim();
const {chromium}=await import(pathToFileURL(path.join(g,"playwright","index.mjs")).href);
const M={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".jpg":"image/jpeg",".png":"image/png"};
const s=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/,"")||"index.html");
 fs.readFile(f,(e,b)=>e?r.writeHead(404).end():(r.writeHead(200,{"content-type":M[path.extname(f).toLowerCase()]||"application/octet-stream"}),r.end(b)));});
await new Promise(r=>s.listen(0,"127.0.0.1",r));
const B="http://127.0.0.1:"+s.address().port+"/index.html";
const br=await chromium.launch({channel:"chrome"});
const p=await (await br.newContext({viewport:{width:390,height:844}})).newPage();
p.on("dialog",d=>d.accept());
await p.goto(B); await p.waitForTimeout(1000);
const unit=await p.evaluate(()=>[...new Set(QA_DATA.filter(q=>q.subj==="社会").map(q=>q.u))].find(u=>u.startsWith("第")));
const ids=await p.evaluate(u=>QA_DATA.filter(q=>q.u===u).map(q=>q.id), unit);
const day=86400000, base=new Date(2026,8,12).getTime();
// ★全問を「2回連続正解ずみ」か「間違えたことがない」にする＝1段目が空
await p.evaluate(([ids,base,day])=>{
  localStorage.clear(); const st={};
  ids.forEach((id,i)=>{
    st[id] = i%2===0
      ? {correct:3, wrong:1, box:2, lastCorrectAt: base-(ids.length-i)*day, lastAnswered: base}   // 2回連続正解ずみ
      : {correct:2, wrong:0, box:2, lastCorrectAt: base-(ids.length-i)*day, lastAnswered: base};  // 間違えたことがない
  });
  localStorage.setItem("kq_battle_stats_v1",JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1",JSON.stringify({"kaki1-4":1,"lastcorrect-backfill":1}));
},[ids,base,day]);
await p.reload(); await p.waitForTimeout(1000);
await p.click('#unit-choices .choice[data-unit="ALL"]'); await p.waitForTimeout(250);
const gh=await p.$('.unit-group-header[data-group="history"]'); if(gh) await gh.click(); await p.waitForTimeout(250);
await p.click(`#unit-choices .choice[data-unit="${unit}"]`); await p.waitForTimeout(250);
await p.evaluate(()=>{const w=document.getElementById("mode-weak"); if(!w.classList.contains("on")) w.click();
  const u=document.getElementById("mode-unmastered"); if(u.classList.contains("on")) u.click();});
await p.waitForTimeout(400);
const label=await p.evaluate(()=>{const e=document.getElementById("pool-count-label"); return e?e.textContent:"(なし)";});
const screenBefore=await p.evaluate(()=>{const e=[...document.querySelectorAll(".screen")].find(x=>getComputedStyle(x).display!=="none");return e?e.id:"?";});
// ★★ 2026-09-26: ユーザー判断で、メインも0問・復習も0問の日は
//   「問題がありません」で**押せなくてよい**ことになりました。
//   （2026-09-13 の「押せるように」を、この道に限って上書き）
// ⚠★押せないボタンを click すると 30秒待って落ちるので、先に見てから押す。
//   ★この道具は「どうなるかを見る」報告専用で、合否は出しません。
//   ★合否を見るのは tools/mikaku/total_fill_probe.mjs です
const canStart = await p.$eval("#solo-start-btn", e => !e.disabled);
if (canStart) { await p.click("#solo-start-btn"); await p.waitForTimeout(900); }
const screenAfter=await p.evaluate(()=>{const e=[...document.querySelectorAll(".screen")].find(x=>getComputedStyle(x).display!=="none");return e?e.id:"?";});
console.log(JSON.stringify({
 "単元":unit, "問数":ids.length,
 "★画面に出ている問題数の表示":label,
 "押す前の画面":screenBefore, "★ボタンが押せるか":canStart, "★押した後の画面":screenAfter,
 "★始まったか":screenAfter==="screen-solo"
},null,1));
await br.close(); s.close();
