// 一覧の速さを、件数ごとに実測する
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
const ctx=await br.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage(); p.on("dialog",d=>d.accept());
// ★お子さんの端末に近づけるため CPU を4倍遅くする（09-08 の測定と同じ条件）
const cdp=await ctx.newCDPSession(p);
await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
await p.goto(B); await p.waitForTimeout(1200);
// ★単元を絞って件数を変え、何件から遅くなるかを測る
await p.waitForTimeout(400);
const units=await p.evaluate(()=>[...document.querySelectorAll("#unit-choices .choice")].map(e=>e.dataset.unit).filter(u=>u!=="ALL"));
const rows=[];
for(const target of [50,100,200,400,800,1377]){
  // 単元を足していって、目標件数に近づける
  await p.evaluate(()=>{const a=document.querySelector('#list-unit-select'); });
  await p.goto(B); await p.waitForTimeout(700);
  await p.evaluate(n=>{ // 出題単元ではなく一覧の単元セレクトを使う
    localStorage.setItem("__target", String(n));
  }, target);
  const t=Date.now();
  await p.click("#list-btn");
  await p.waitForFunction(()=>document.querySelectorAll(".list-item").length>0,{timeout:180000});
  const ms=Date.now()-t;
  const cnt=await p.evaluate(()=>document.querySelectorAll(".list-item").length);
  rows.push({目標:target, 実際の行数:cnt, 開くのにかかった時間ms:ms});
  if(cnt>=1377) break;
}
console.log("★件数ごと（単元セレクトが使えないので全件のみ有効）:", JSON.stringify(rows));
const t0=Date.now();
await p.goto(B); await p.waitForTimeout(700);
await p.click("#list-btn");
await p.waitForFunction(()=>document.querySelectorAll(".list-item").length>0,{timeout:180000});
const openMs=Date.now()-t0;
const n=await p.evaluate(()=>document.querySelectorAll(".list-item").length);
await p.waitForTimeout(2000);
// 1件編集したときの時間
await p.evaluate(()=>window.scrollTo(0,6000)); await p.waitForTimeout(1200);
const t1=Date.now();
await p.evaluate(()=>{const b=[...document.querySelectorAll(".count-btn")].find(x=>{const r=x.getBoundingClientRect();return r.top>100&&r.top<700;}); b.click();});
await p.waitForTimeout(50);
const editMs=Date.now()-t1-50;
console.log(JSON.stringify({
 "CPU":"4倍遅く（お子さんの端末に近づけた条件）",
 "一覧の行数":n,
 "★一覧を開くのにかかった時間(ms)":openMs,
 "★1件編集したときの描き直し(ms)":editMs
},null,1));
await br.close(); s.close();
