// 公開版で「よく間違える問題」の並びを実際に見る
import { pathToFileURL } from "node:url"; import path from "node:path"; import { execSync } from "node:child_process";
const g=execSync("npm root -g",{encoding:"utf8"}).trim();
const {chromium}=await import(pathToFileURL(path.join(g,"playwright","index.mjs")).href);
const br=await chromium.launch({channel:"chrome"});
const p=await (await br.newContext({viewport:{width:390,height:844}})).newPage();
p.on("dialog",d=>d.accept());
const URL="https://nambanamba.github.io/kosukequiz-battle/index.html";
await p.goto(URL); await p.waitForTimeout(1200);
const unit=await p.evaluate(()=>[...new Set(QA_DATA.filter(q=>q.subj==="社会").map(q=>q.u))].find(u=>u.startsWith("第")));
const ids=await p.evaluate(u=>QA_DATA.filter(q=>q.u===u).slice(0,16).map(q=>q.id), unit);
const day=86400000, base=new Date(2026,8,12).getTime();
await p.evaluate(([ids,base,day])=>{
  localStorage.clear(); const st={};
  ids.forEach((id,i)=>{ st[id]= i<4 ? {correct:1,wrong:2,box:0,lastAnswered:base}
    : {correct:2,wrong:1,box:1,lastCorrectAt:base-(16-i)*day,lastAnswered:base}; });
  localStorage.setItem("kq_battle_stats_v1",JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1",JSON.stringify({"kaki1-4":1,"lastcorrect-backfill":1}));
},[ids,base,day]);
await p.reload(); await p.waitForTimeout(1200);
await p.click('#unit-choices .choice[data-unit="ALL"]'); await p.waitForTimeout(300);
const gh=await p.$('.unit-group-header[data-group="history"]'); if(gh) await gh.click(); await p.waitForTimeout(300);
await p.click(`#unit-choices .choice[data-unit="${unit}"]`); await p.waitForTimeout(300);
await p.evaluate(()=>{
  // ★ 2026-09-26: 出題モードが段の選択になった。「苦手な問題」（2段目）だけ ON にする。
  //   ⚠★既定は3つともONなので、click だけだと逆に消える
  document.querySelectorAll(".mode-filter").forEach(e => {
    if (e.classList.contains("on") !== (e.dataset.tier === "1")) e.click();
  });
  const c=[...document.querySelectorAll(".count-choice")].find(e=>e.dataset.count==="10"); if(c&&!c.classList.contains("on")) c.click(); });
await p.waitForTimeout(400);
await p.click("#solo-start-btn"); await p.waitForTimeout(1000);
const q=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem("kq_battle_solo_session_v1"));
  return s? (s.quizIds||s.quizQueue.map(i=>QA_DATA[i].id)) : null;});
console.log("単元:",unit);
console.log("選ばれた順:",q);
const info=await p.evaluate(list=>{const st=JSON.parse(localStorage.getItem("kq_battle_stats_v1"));
  return list.map(id=>id+(st[id]&&st[id].lastCorrectAt?"("+new Date(st[id].lastCorrectAt).toISOString().slice(0,10)+")":"(正解日なし)"));},q||[]);
console.log("正解日つき:",info);
await br.close();
