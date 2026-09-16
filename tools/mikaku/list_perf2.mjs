// 一覧の描き直しにかかる時間を、件数ごとに測る（単元セレクトで件数を変える）
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
const cdp=await ctx.newCDPSession(p);
await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});   // お子さんの端末に近い条件
await p.goto(B); await p.waitForTimeout(1200);
await p.click("#list-btn");
await p.waitForFunction(()=>document.querySelectorAll(".list-item").length>0,{timeout:180000});
await p.waitForTimeout(2500);
// 単元ごとの件数を調べる
const opts=await p.evaluate(()=>[...document.querySelectorAll("#list-unit-select option")].map(o=>({v:o.value,t:o.textContent})));
const out=[];
for(const o of opts){
  const t=Date.now();
  await p.selectOption("#list-unit-select", o.v);
  await p.waitForTimeout(30);
  const ms=Date.now()-t-30;
  const cnt=await p.evaluate(()=>document.querySelectorAll(".list-item").length);
  out.push({単元:o.t.slice(0,22), 行数:cnt, 描き直しms:ms});
}
out.sort((a,b)=>a.行数-b.行数);
console.log("CPU 4倍遅く・1問あたりの描き直し時間");
for(const r of out) console.log("  "+String(r.行数).padStart(5)+"行  "+String(r.描き直しms).padStart(5)+"ms   "+r.単元);
await br.close(); s.close();
