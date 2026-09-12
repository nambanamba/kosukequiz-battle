// 年表の画像が、スマホ幅でどう出るか／押して拡大できるかを実機で見る。
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { pathToFileURL } from "node:url"; import { execSync } from "node:child_process";
const ROOT = path.resolve(process.cwd());
const g = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(g, "playwright", "index.mjs")).href);
const M = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".jpg":"image/jpeg",".png":"image/png"};
const s = http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/,"")||"index.html");
 fs.readFile(f,(e,b)=>e?r.writeHead(404).end():(r.writeHead(200,{"content-type":M[path.extname(f).toLowerCase()]||"application/octet-stream"}),r.end(b)));});
await new Promise(r=>s.listen(0,"127.0.0.1",r));
const B = "http://127.0.0.1:" + s.address().port + "/index.html";
const br = await chromium.launch({ channel: "chrome" });
const p = await (await br.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 })).newPage();
await p.goto(B); await p.waitForTimeout(900);
await p.evaluate(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(900);
await p.click('#unit-choices .choice[data-unit="ALL"]'); await p.waitForTimeout(200);
const gh = await p.$('.unit-group-header[data-group="history"]'); if (gh) await gh.click();
await p.waitForTimeout(200);
await p.click('#unit-choices .choice[data-unit="第2回.古墳時代・飛鳥時代"]'); await p.waitForTimeout(250);
await p.evaluate(()=>{ const o=document.querySelector("#order-toggle"); if(o&&o.checked)o.click();
  const c=[...document.querySelectorAll(".count-choice")].find(e=>e.dataset.count==="all"); if(c&&!c.classList.contains("on"))c.click(); });
await p.waitForTimeout(200);
await p.click("#solo-start-btn"); await p.waitForTimeout(800);
let found = false;
for (let i=0;i<130;i++){
  const id = ((await p.textContent("#solo-q-id").catch(()=>"")||"").match(/[A-Za-z][A-Za-z0-9_]*$/)||[""])[0];
  if (id === "g2r67") { found = true; break; }
  const b = await p.$("#solo-reveal-btn"); if(!b||!(await b.isVisible())) break;
  await p.click("#solo-reveal-btn"); await p.waitForTimeout(60);
  const ok = await p.$("#solo-judge-ok"); if(!ok||!(await ok.isVisible())) break;
  await p.click("#solo-judge-ok"); await p.waitForTimeout(90);
}
const normal = await p.evaluate(()=>{ const img=document.querySelector("#solo-img");
  const cs=getComputedStyle(img);
  return { 出ている:!!img.offsetParent, 枠のサイズ:img.clientWidth+"x"+img.clientHeight,
           実寸:img.naturalWidth+"x"+img.naturalHeight,
           objectFit:cs.objectFit, maxHeight:cs.maxHeight, maxWidth:cs.maxWidth,
           実寸の縦横比:(img.naturalWidth/img.naturalHeight).toFixed(3),
           枠の縦横比:(img.clientWidth/img.clientHeight).toFixed(3) }; });
await p.click("#solo-img"); await p.waitForTimeout(700);
const marksNormal = await p.evaluate(()=>{
  const l=document.querySelector("#solo-marks");
  return { 通常の丸の数: l.children.length,
           位置: [...l.children].map(d=>d.style.left+","+d.style.top+" "+d.style.width+"x"+d.style.height) };
});
const zoom = await p.evaluate(()=>{ const lb=document.querySelector("#lightbox-img");
  let shown=false, el=lb; while(el){ if(el.classList&&el.classList.contains("show")){shown=true;break;} el=el.parentElement; }
  return { 拡大が開いた:shown, 拡大画像:lb?lb.getAttribute("src"):null,
           拡大時のサイズ:lb?lb.clientWidth+"x"+lb.clientHeight:null }; });
// 拡大側で2倍にしてから、丸が追従しているか見る
await p.evaluate(()=>{ const b=document.querySelector("#lightbox-zoom-in"); if(b){b.click();b.click();} });
await p.waitForTimeout(500);
const zoomMarks = await p.evaluate(()=>{
  const l=document.querySelector("#lightbox-marks"), img=document.querySelector("#lightbox-img");
  return { 拡大側の丸の数: l.children.length,
           層の変形: l.style.transform, 画像の変形: img.style.transform,
           一致: l.style.transform === img.style.transform };
});
console.log(JSON.stringify({ 年表の問に到達:found, 通常表示:normal, 通常の丸:marksNormal, 拡大:zoom, 拡大の丸:zoomMarks }, null, 1));
await p.screenshot({ path: "tools/mikaku/shots/zoom_marks.png" });
await p.screenshot({ path: "tools/mikaku/shots/zoom_g2r66.png", fullPage: false });
await br.close(); s.close();
