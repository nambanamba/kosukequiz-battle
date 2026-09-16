// 〇✕を切り替えたときに画面がずれるかを、★真ん中までスクロールしてから測る
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
await p.evaluate(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(900);
await p.click("#list-btn"); await p.waitForTimeout(1500);

async function trial(label, field, delta, scrollTo){
  await p.evaluate(y=>window.scrollTo(0,y), scrollTo); await p.waitForTimeout(500);
  const before=await p.evaluate(()=>window.scrollY);
  const pickInfo=await p.evaluate(([f,d])=>{
    const bs=[...document.querySelectorAll(".count-btn")].filter(b=>b.dataset.field===f && b.dataset.delta===d);
    const vis=bs.find(b=>{const r=b.getBoundingClientRect(); return r.top>150 && r.bottom<650;});
    if(!vis) return null;
    const row=vis.closest(".list-item"); const rr=row.getBoundingClientRect();
    return {x:Math.round(vis.getBoundingClientRect().x+5), y:Math.round(vis.getBoundingClientRect().y+5),
            qid:row.dataset.qid, rowTop:Math.round(rr.top), rowH:Math.round(rr.height),
            docH: Math.round(document.documentElement.scrollHeight)};
  },[field,delta]);
  if(!pickInfo){ console.log(label+": 押せるボタンが見つからない"); return; }
  // ★押す前に、上のほうの行の高さを記録しておく
  const hBefore=await p.evaluate(()=>{const rs=[...document.querySelectorAll(".list-item")];
    return {count:rs.length, first20:rs.slice(0,20).map(r=>Math.round(r.getBoundingClientRect().height))};});
  await p.mouse.click(pickInfo.x, pickInfo.y); await p.waitForTimeout(700);
  const hAfter=await p.evaluate(()=>{const rs=[...document.querySelectorAll(".list-item")];
    return {count:rs.length, first20:rs.slice(0,20).map(r=>Math.round(r.getBoundingClientRect().height))};});
  const changed=hBefore.first20.map((v,i)=>v!==hAfter.first20[i]?(i+"行目 "+v+"→"+hAfter.first20[i]):null).filter(Boolean);
  console.log("   行数: "+hBefore.count+" → "+hAfter.count);
  console.log("   上20行で高さが変わったもの: "+(changed.length?changed.join(" / "):"なし"));
  const after=await p.evaluate(()=>window.scrollY);
  const ra=await p.evaluate(q=>{const el=document.querySelector('.list-item[data-qid="'+q+'"]');
    if(!el) return null; const r=el.getBoundingClientRect();
    return {top:Math.round(r.top), h:Math.round(r.height), docH:Math.round(document.documentElement.scrollHeight)};}, pickInfo.qid);
  console.log(label);
  console.log("   scrollY: "+before+" → "+after+"   ★ずれ "+(after-before)+"px");
  console.log("   その行の画面上の位置: "+pickInfo.rowTop+" → "+(ra?ra.top:"消えた")+"   ★ずれ "+(ra?(ra.top-pickInfo.rowTop):"-")+"px");
  console.log("   その行の高さ: "+pickInfo.rowH+" → "+(ra?ra.h:"-"));
  console.log("   ページ全体の高さ: "+pickInfo.docH+" → "+(ra?ra.docH:"-"));
}
await trial("【絞りこみなし・正解+1・真ん中】","correct","1",6000);
await trial("【絞りこみなし・不正解+1・真ん中】","wrong","1",6000);
await trial("【絞りこみなし・正解+1・もっと下】","correct","1",20000);
await br.close(); s.close();
