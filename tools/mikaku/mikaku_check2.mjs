// 書き換えた問を、実機（本物のChrome・スマホ幅390px）で実際に出題して目で見る。
// B-12: 「テストが通った」で報告しないための道具。問題文と答えを画面から読み取り、
// スクリーンショットも残す。
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url"; import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(gRoot, "playwright", "index.mjs")).href);

const MIME = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".jpg":"image/jpeg",".png":"image/png"};
const server = http.createServer((req,res)=>{
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/,"") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e,b)=> e ? res.writeHead(404).end()
    : (res.writeHead(200,{"content-type":MIME[path.extname(file).toLowerCase()]||"application/octet-stream"}), res.end(b)));
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const BASE = "http://127.0.0.1:"+server.address().port+"/index.html";

const TARGETS = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e=>errs.push("JSエラー: "+e.message));
page.on("console", m=>{ if(m.type()==="error") errs.push("consoleエラー: "+m.text()); });
page.on("requestfailed", r=>errs.push("取得できず: "+r.url()));
page.on("response", r=>{ if(r.status()>=400) errs.push("HTTP"+r.status()+": "+r.url()); });
await page.goto(BASE); await page.waitForTimeout(900);

// 対象の id を含む単元を、データから引く
const plan = await page.evaluate(ids => {
  const rows = QA_DATA.filter(q=>ids.includes(q.id));
  const out = {};
  for (const r of rows) (out[r.subj] = out[r.subj] || new Set()).add(r.u);
  return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,[...v]]));
}, TARGETS);
console.log("対象:", JSON.stringify(plan));
const units = Object.entries(plan).flatMap(([subj,us])=>us.map(u=>({subj,u})));

const seen = new Map();
for (const { subj, u } of units) {
  await page.evaluate(()=>localStorage.clear());
  await page.reload(); await page.waitForTimeout(900);
  // ★科目を切りかえる（理科の単元は社会のままでは出てこない）
  await page.click(subj === "理科" ? "#subject-science" : "#subject-social");
  await page.waitForTimeout(400);
  // 単元のグループは閉じていることがあるので、全部開く
  for (let k = 0; k < 8; k++) {
    const shut = await page.$$(".unit-group-header:not(.open)");
    if (!shut.length) break;
    for (const el of shut) { try { await el.click(); } catch {} }
    await page.waitForTimeout(200);
  }
  await page.click('#unit-choices .choice[data-unit="ALL"]'); await page.waitForTimeout(200);
  await page.click(`#unit-choices .choice[data-unit="${u}"]`); await page.waitForTimeout(250);
  // 出題順を「順番どおり」にし、全問出す
  await page.evaluate(() => {
    const o = document.querySelector("#order-toggle");
    if (o && o.checked) o.click();
    const c = document.querySelector('.count-choice[data-count="all"]');
    if (c && !c.classList.contains("on")) c.click();
  });
  await page.waitForTimeout(200);
  await page.click("#solo-start-btn"); await page.waitForTimeout(900);
  console.log("  [" + subj + "/" + u + "] 画面=" + await page.evaluate(()=>{
    const e=[...document.querySelectorAll(".screen")].find(x=>getComputedStyle(x).display!=="none");return e?e.id:"?";})
    + " 進行=" + (await page.textContent("#solo-counter").catch(()=>"?"))
    + " 先頭id=" + (await page.textContent("#solo-q-id").catch(()=>"?")));

  for (let i = 0; i < 400; i++) {
    const id = ((await page.textContent("#solo-q-id").catch(()=>null) || "").trim().match(/[A-Za-z][A-Za-z0-9_]*$/)||[""])[0];
    if (TARGETS.includes(id) && !seen.has(id)) {
      await page.click("#solo-reveal-btn"); await page.waitForTimeout(250);
      const rec = await page.evaluate(() => ({
        q: document.querySelector("#solo-q").innerText,
        a: document.querySelector("#solo-a").innerText,
        sol: (document.querySelector("#solo-sol-block")?.offsetParent
              ? document.querySelector("#solo-sol").innerText : ""),
        img: document.querySelector("#solo-img-wrap")?.offsetParent
              ? document.querySelector("#solo-img").getAttribute("src") : "",
        // 「ア」「イ」などの選択肢見出しが本文に残っていないか
      }));
      await page.screenshot({ path: path.join(SHOTS, id + ".png"), fullPage: true });
      seen.set(id, rec);
      await page.click("#solo-judge-ok"); await page.waitForTimeout(320);
      continue;
    }
    if (seen.size === TARGETS.length) break;
    const btn = await page.$("#solo-reveal-btn");
    if (!btn || !(await btn.isVisible())) { console.log("  …" + i + "問目で打ち切り(reveal無し)"); break; }
    await page.click("#solo-reveal-btn"); await page.waitForTimeout(90);
    const ok = await page.$("#solo-judge-ok");
    if (!ok || !(await ok.isVisible())) { console.log("  …" + i + "問目で打ち切り(judge無し)"); break; }
    await page.click("#solo-judge-ok"); await page.waitForTimeout(120);
  }
  if (seen.size === TARGETS.length) break;
}

for (const id of TARGETS) {
  const r = seen.get(id);
  console.log("\n================ " + id + " ================");
  if (!r) { console.log("★出題されなかった"); continue; }
  console.log("[問]  " + r.q);
  console.log("[答]  " + r.a);
  if (r.sol) console.log("[解説] " + r.sol);
  console.log("[画像] " + (r.img || "なし") + "   [字数] " + r.q.length);
}
console.log("\n出題できた: " + seen.size + "/" + TARGETS.length);
console.log("JSエラー: " + (errs.length ? errs.join(" | ") : "0件"));
console.log("画面の写真: " + SHOTS);
await browser.close(); server.close();
