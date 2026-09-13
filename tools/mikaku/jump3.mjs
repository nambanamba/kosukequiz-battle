// ★データを1文字も変えずに「描き直すだけ」で画面がずれるかを見る
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
await p.goto(B); await p.waitForTimeout(900);
await p.click("#list-btn"); await p.waitForTimeout(500);
// 2026-09-13 から一覧は単元を選ぶまで何も出さない。いちばん問題の多い単元を選ぶ
const bigUnit=await p.evaluate(()=>{const c={};QA_DATA.filter(q=>q.subj==="社会").forEach(q=>{c[q.u]=(c[q.u]||0)+1;});
  return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];});
await p.selectOption("#list-unit-select", bigUnit); await p.waitForTimeout(2500);   // ★画像が落ち着くまで待つ
await p.evaluate(()=>window.scrollTo(0,6000)); await p.waitForTimeout(1500);
const mark0=null; const mark=await p.evaluate(()=>{const all=[...document.querySelectorAll(".list-item")];
  const r=all.find(e=>{const b=e.getBoundingClientRect();return b.top>100&&b.top<700;}) || all.find(e=>e.getBoundingClientRect().top>0);
  if(!r) return null;
  return {qid:r.dataset.qid, top:Math.round(r.getBoundingClientRect().top), docH:Math.round(document.documentElement.scrollHeight)};});
const ALLH=await p.evaluate(()=>[...document.querySelectorAll(".list-item")].map(r=>({qid:r.dataset.qid,h:Math.round(r.getBoundingClientRect().height)})));
// ★「日付だけ」を書き換えて描き直させる（記録の中身は同じ値を入れ直す＝実質変化なし）
await p.evaluate(q=>{
  const el=document.querySelector('.list-item[data-qid="'+q+'"] .count-btn[data-field="correct"][data-delta="1"]');
  el.click();  // +1
}, mark.qid);
await p.waitForTimeout(2500);   // ★画像が落ち着くまで待つ
// ★全行の高さを比べて、どの行が伸びたのかを特定する
const diff=await p.evaluate(prev=>{
  const rs=[...document.querySelectorAll(".list-item")];
  const now=rs.map(r=>({qid:r.dataset.qid, h:Math.round(r.getBoundingClientRect().height)}));
  const out=[];
  for(let i=0;i<Math.min(prev.length,now.length);i++){
    if(prev[i].h!==now[i].h) out.push({i, qid:now[i].qid, before:prev[i].h, after:now[i].h});
  }
  return {changed: out.slice(0,12), total: out.length,
          sum: out.reduce((a,b)=>a+(b.after-b.before),0)};
}, ALLH);
console.log("★高さが変わった行: "+diff.total+"件  合計の増減: "+diff.sum+"px");
diff.changed.forEach(c=>console.log("   "+c.i+"行目 "+c.qid+": "+c.before+" → "+c.after));
const after=await p.evaluate(q=>{const el=document.querySelector('.list-item[data-qid="'+q+'"]');
  return {top:Math.round(el.getBoundingClientRect().top), docH:Math.round(document.documentElement.scrollHeight), y:Math.round(window.scrollY)};}, mark.qid);
console.log(JSON.stringify({
 "押す前の行の位置":mark.top, "★2.5秒待った後の行の位置":after.top,
 "★ずれ(px)":after.top-mark.top,
 "ページ高さ":mark.docH+" → "+after.docH, "scrollY":after.y
},null,1));
await br.close(); s.close();
