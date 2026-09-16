// 〇✕を切り替えたときに画面がどれだけ動くかを実測する。
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { pathToFileURL } from "node:url"; import { execSync } from "node:child_process";
const ROOT=path.resolve(process.cwd());
const g=execSync("npm root -g",{encoding:"utf8"}).trim();
const {chromium}=await import(pathToFileURL(path.join(g,"playwright","index.mjs")).href);
const M={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".jpg":"image/jpeg",".png":"image/png"};
const s=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/,"")||"index.html");
 fs.readFile(f,(e,b)=>e?r.writeHead(404).end():(r.writeHead(200,{"content-type":M[path.extname(f).toLowerCase()]||"application/octet-stream"}),r.end(b)));});
await new Promise(r=>s.listen(0,"127.0.0.1",r));
const B=process.env.KQ_URL||("http://127.0.0.1:"+s.address().port+"/index.html");
const br=await chromium.launch({channel:"chrome"});
const ENVD=process.env.KQ_DELTA;
const p=await (await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true})).newPage();
p.on("dialog",d=>d.accept());
await p.goto(B); await p.waitForTimeout(900);
await p.evaluate(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(900);
// 問題一覧をひらく
await p.click("#list-btn"); await p.waitForTimeout(1200);
// ★絞りこみ「未クリアの問題」をONにする。正解を足すと、その行はフィルターから外れる
if(process.env.KQ_FILTER === "1"){
  await p.evaluate(()=>{const b=[...document.querySelectorAll(".list-filter-toggle")].find(e=>e.dataset.filter==="unmastered");
    if(b && !b.classList.contains("on")) b.click();});
  await p.waitForTimeout(1500);
}
const out={ "画面": await p.evaluate(()=>{const e=[...document.querySelectorAll(".screen")].find(x=>getComputedStyle(x).display!=="none");return e?e.id:"?";}) };
out["並んだ行数"]=await p.evaluate(()=>document.querySelectorAll(".list-item").length);
// 下の方までスクロールして、20行目あたりのボタンを押す
await p.evaluate(()=>window.scrollTo(0,1500)); await p.waitForTimeout(400);
const before=await p.evaluate(()=>window.scrollY);
out["押す前のscrollY"]=before;
// 画面内にある「正解 +1」のボタンを押す
const btn=await p.evaluate((want)=>{
  const bs=[...document.querySelectorAll(".count-btn")];
  const vis=bs.find(b=>{const r=b.getBoundingClientRect();
    return r.top>100 && r.bottom<700 && (!want || (b.dataset.field==="correct" && b.dataset.delta===want));}, want);
  if(!vis) return null;
  const r=vis.getBoundingClientRect();
  return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2),
          qid: vis.closest(".list-item")?.dataset.qid, field: vis.dataset.field, delta: vis.dataset.delta};
}, ENVD || null);
out["押したボタン"]=btn;
if(btn){
  const rb=await p.evaluate(q=>{const el=document.querySelector('.list-item[data-qid="'+q+'"]');
    const r=el.getBoundingClientRect(); return {top:Math.round(r.top), h:Math.round(r.height)};}, btn.qid);
  out["押す前: その行の画面上の位置"]=rb.top; out["押す前: その行の高さ"]=rb.h;
  const t0=Date.now();
  await p.mouse.click(btn.x, btn.y); await p.waitForTimeout(600);
  out["描き直しにかかった時間(ms)"]=Date.now()-t0-600;
  const after=await p.evaluate(()=>window.scrollY);
  out["押した後のscrollY"]=after;
  out["★scrollY の動き"]=after-before;
  const ra=await p.evaluate(q=>{const el=document.querySelector('.list-item[data-qid="'+q+'"]');
    if(!el) return null; const r=el.getBoundingClientRect(); return {top:Math.round(r.top), h:Math.round(r.height)};}, btn.qid);
  out["押した後: その行の画面上の位置"]=ra?ra.top:"★行が消えた";
  out["押した後: その行の高さ"]=ra?ra.h:"-";
  out["★その行が画面上でずれた量(px)"]=ra?(ra.top-rb.top):"★行が消えた（フィルターから外れた）";
}
console.log(JSON.stringify(out,null,1));
await br.close(); s.close();
