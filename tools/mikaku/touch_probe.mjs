// 画像の上から指を動かしたとき、画面がスクロールするかを★本物のタッチ操作で確かめる。
// 合成イベントでは native のスクロールが起きないので、CDP の Input.dispatchTouchEvent を使う。
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { pathToFileURL } from "node:url"; import { execSync } from "node:child_process";
const ROOT = path.resolve(process.cwd());
const g = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(g, "playwright", "index.mjs")).href);
const M = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".jpg":"image/jpeg",".png":"image/png"};
const s = http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/,"")||"index.html");
 fs.readFile(f,(e,b)=>e?r.writeHead(404).end():(r.writeHead(200,{"content-type":M[path.extname(f).toLowerCase()]||"application/octet-stream"}),r.end(b)));});
await new Promise(r=>s.listen(0,"127.0.0.1",r));
const B="http://127.0.0.1:"+s.address().port+"/index.html";
const br=await chromium.launch({channel:"chrome"});
const ctx=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
const p=await ctx.newPage();
await p.goto(B); await p.waitForTimeout(900);
await p.evaluate(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(900);
// 年表の問（画像が大きい）を出す
await p.click('#unit-choices .choice[data-unit="ALL"]'); await p.waitForTimeout(200);
const gh=await p.$('.unit-group-header[data-group="history"]'); if(gh) await gh.click();
await p.waitForTimeout(200);
await p.click('#unit-choices .choice[data-unit="第2回.古墳時代・飛鳥時代"]'); await p.waitForTimeout(250);
await p.evaluate(()=>{const o=document.querySelector("#order-toggle"); if(o&&o.checked)o.click();
  const c=[...document.querySelectorAll(".count-choice")].find(e=>e.dataset.count==="all"); if(c&&!c.classList.contains("on"))c.click();});
await p.waitForTimeout(200);
await p.click("#solo-start-btn"); await p.waitForTimeout(800);
for(let i=0;i<130;i++){
  const id=((await p.textContent("#solo-q-id").catch(()=>"")||"").match(/[A-Za-z][A-Za-z0-9_]*$/)||[""])[0];
  if(id==="g2r66") break;
  const b=await p.$("#solo-reveal-btn"); if(!b||!(await b.isVisible())) break;
  await p.click("#solo-reveal-btn"); await p.waitForTimeout(60);
  const ok=await p.$("#solo-judge-ok"); if(!ok||!(await ok.isVisible())) break;
  await p.click("#solo-judge-ok"); await p.waitForTimeout(90);
}
const css = await p.evaluate(()=>getComputedStyle(document.querySelector("#solo-img")).touchAction);
const box = await p.evaluate(()=>{const r=document.querySelector("#solo-img").getBoundingClientRect();
  return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};});
// ★画像の中心に指を置いて、上へスワイプする（本物のタッチ）
const cdp = await ctx.newCDPSession(p);
const before = await p.evaluate(()=>window.scrollY);
const t=(x,y)=>[{x,y,radiusX:8,radiusY:8,force:1,id:1}];
await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:t(box.x,box.y)});
for(let dy=10; dy<=160; dy+=25){
  await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:t(box.x,box.y-dy)});
  await p.waitForTimeout(30);
}
await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
await p.waitForTimeout(700);
const after = await p.evaluate(()=>window.scrollY);
// タップで拡大が開くか
await p.touchscreen.tap(box.x, box.y); await p.waitForTimeout(700);
const opened = await p.evaluate(()=>{const lb=document.querySelector("#lightbox-img");
  let e=lb, shown=false; while(e){ if(e.classList&&e.classList.contains("show")){shown=true;break;} e=e.parentElement;} return shown;});
console.log(JSON.stringify({
  "計算後のtouch-action": css,
  "スワイプ前のscrollY": before, "スワイプ後のscrollY": after,
  "★画像の上からスクロールできた": after > before,
  "★タップで拡大が開いた": opened
}, null, 1));
await br.close(); s.close();
