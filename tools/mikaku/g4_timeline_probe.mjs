// 第4回の演習年表（g4r70〜89）が、スマホ幅で**本当に解けるか**を実機で見る。
//
// 使い方: node tools/mikaku/g4_timeline_probe.mjs [qid ...]   （既定は g4r70）
//
// ★なぜ要るか（司令塔の指摘・2026-09-20）
//   書き換え後の問は「年表の②にあてはまる語を答えなさい」で、**絵に完全に依存している**。
//   書き換え前は文章だけで解けた。**絵が出ない／番号が読めないなら、20問が解答不能になる。**
//   `kaki4_79` と同じ型（B-12: データが正しいことと、その画面で解けることは別）。
//
// ★この検査が見るもの / 見ないもの
//   見る  … ①絵が出ているか ②押すと拡大できるか ③拡大したとき絵がどれだけ大きくなるか
//           ④写真に残す（**番号が読めるかは、人が写真を見て決める**）
//   見ない… **番号が読めるかどうかの判定そのもの。**これは機械では決められない（C-4d）。
//           小さい写真で「乗っている」と判断しないこと。
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url"; import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_g4");
fs.mkdirSync(SHOTS, { recursive: true });
const TARGETS = process.argv.slice(2).length ? process.argv.slice(2) : ["g4r70"];
const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(gRoot, "playwright", "index.mjs")).href);

const MIME = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".jpg":"image/jpeg",".png":"image/png"};
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!f.startsWith(ROOT + path.sep)) { r.writeHead(403).end(); return; }
  fs.readFile(f, (e, b) => e ? r.writeHead(404).end()
    : (r.writeHead(200, {"content-type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream"}), r.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/index.html";

let ng = 0;
const check = (label, ok, extra) => { console.log(`  ${ok ? "✔" : "✘"} ${label}${extra ? " … " + extra : ""}`); if (!ok) ng++; };
const browser = await chromium.launch({ channel: "chrome" });
// ★実機に近づける: スマホ幅390px・画素は2倍（いまどきのAndroidはこの形）
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
await page.goto(BASE); await page.waitForTimeout(800);
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
    subject: "社会", unitsBySubject: { "社会": ["第4回.平安時代"] }, units: ["第4回.平安時代"], count: "all" }));
});
await page.reload(); await page.waitForTimeout(900);
await page.click("#solo-start-btn"); await page.waitForTimeout(700);

for (const qid of TARGETS) {
  console.log(`\n── ${qid} ──`);
  // その問まで送る
  let found = false;
  for (let i = 0; i < 140; i++) {
    const now = ((await page.textContent("#solo-q-id").catch(() => "") || "").match(/[A-Za-z][A-Za-z0-9_]*$/) || [""])[0];
    if (now === qid) { found = true; break; }
    const b = await page.$("#solo-reveal-btn"); if (!b || !(await b.isVisible())) break;
    await b.click(); await page.waitForTimeout(50);
    const ok = await page.$("#solo-judge-ok"); if (!ok || !(await ok.isVisible())) break;
    await ok.click(); await page.waitForTimeout(80);
  }
  check("その問を出せた", found);
  if (!found) continue;

  const shown = await page.evaluate(() => {
    const img = document.querySelector("#solo-img");
    return { 出ている: !!(img && img.offsetParent), src: img && img.getAttribute("src"),
             枠: img ? img.clientWidth + "x" + img.clientHeight : null,
             実寸: img ? img.naturalWidth + "x" + img.naturalHeight : null };
  });
  check("★年表の絵が出ている", shown.出ている && /kai4_01\.jpg/.test(shown.src || ""), `${shown.src} 枠${shown.枠} 実寸${shown.実寸}`);
  await page.screenshot({ path: path.join(SHOTS, qid + "_1_normal.png") });

  // 押して拡大
  await page.click("#solo-img"); await page.waitForTimeout(700);
  const lb = await page.evaluate(() => {
    const img = document.querySelector("#lightbox-img");
    let el = img, shown = false;
    while (el) { if (el.classList && el.classList.contains("show")) { shown = true; break; } el = el.parentElement; }
    return { 開いた: shown, src: img && img.getAttribute("src"), 大きさ: img ? img.clientWidth + "x" + img.clientHeight : null };
  });
  check("★押すと拡大して見られる", lb.開いた && /kai4_01\.jpg/.test(lb.src || ""), `${lb.大きさ}`);
  await page.screenshot({ path: path.join(SHOTS, qid + "_2_lightbox.png") });

  // さらに2回拡大して、絵が実際に大きくなるか
  await page.evaluate(() => { const b = document.querySelector("#lightbox-zoom-in"); if (b) { b.click(); b.click(); } });
  await page.waitForTimeout(500);
  const z = await page.evaluate(() => {
    const img = document.querySelector("#lightbox-img");
    const m = (img.style.transform || "").match(/scale\(([\d.]+)\)/);
    return { 倍率: m ? +m[1] : 1, 画面に出ている幅: Math.round(img.getBoundingClientRect().width) };
  });
  check("★拡大ボタンで、絵が実際に大きくなる", z.倍率 > 1, `${z.倍率}倍 / 画面上 ${z.画面に出ている幅}px`);
  await page.screenshot({ path: path.join(SHOTS, qid + "_3_zoomed.png") });
  await page.evaluate(() => { const c = document.querySelector("#lightbox-close"); if (c) c.click(); });
  await page.waitForTimeout(400);
}

await browser.close(); server.close();
console.log(`\n写真: ${SHOTS}`);
console.log("⚠️ ★番号（①〜⑳）が読めるかは、上の写真を**人が見て**決めること。ここでは判定しません");
console.log(ng === 0 ? "✔ 機械で見られるところは、すべて確認できた" : `✘ ${ng}件 だめだった`);
process.exit(ng === 0 ? 0 : 1);
