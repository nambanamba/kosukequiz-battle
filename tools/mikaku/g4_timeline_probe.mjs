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

// ★座標表は index.html からその場で抜き出す（写して持たない。写すと古くなる）
//   ※ 改行を含む正規表現は書かない（書き換えの道具ごしだと壊れやすい）。位置を探して切り出す
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const _i0 = HTML.indexOf("const TIMELINE_MARKS = {");
const _i1 = HTML.indexOf("};", _i0);   // 表の中に } は出てこないので、これで足りる
const MARKS = eval("(" + HTML.slice(_i0 + "const TIMELINE_MARKS = ".length, _i1 + 1) + ")");

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
// ★単元は、見る問題の id から引く（2026-09-21 第5回で使うため。もとは第4回を決め打ちしていた）
await page.evaluate((qid) => {
  const u = (QA_DATA.find(q => q.id === qid) || {}).u || "第4回.平安時代";
  localStorage.clear();
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
    subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: "all" }));
}, TARGETS[0]);
await page.reload(); await page.waitForTimeout(900);
// ★出題順を「問題の順どおり」に固定する。
//   既定はシャッフルなので、**先の id が自分より前に出てしまい、進んでも二度と届かない**
//   （実測: 3問見たところで「その問を出せた」が落ち続けた。道具の側の問題だった）
await page.evaluate(() => {
  const t = document.getElementById("order-toggle");
  if (t && !t.classList.contains("on")) t.click();
});
await page.waitForTimeout(250);
const ordered = await page.evaluate(() => document.getElementById("order-toggle").classList.contains("on"));
if (!ordered) { console.log("  ⚠️ 出題順を固定できませんでした（この検査は当てになりません）"); }
await page.click("#solo-start-btn"); await page.waitForTimeout(700);

// ★拡大まわりの確認は**先頭の1問だけ**にする。
//   絵も仕組みも20問で同じで、毎問ひらくと**開いたまま次へ進めなくなることがある**（実測で起きた）。
//   数と表示は全問、拡大は1問。**どちらを全問見るかを、理由つきで決めている。**
let first = true;
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
  // ★赤丸が「この問のぶんだけ」描かれているか。**数は機械で確かめられる**（乗る位置は人が見る）
  const drawn = await page.evaluate(() => {
    const l = document.getElementById("solo-marks");
    return l ? l.children.length : -1;
  });
  const want = (MARKS[qid] || []).length;
  // ★2026-09-21: もとは「赤丸が1つ以上」と「kai4_01.jpg」を決め打ちしていた（第4回専用）。
  //   第5回は**赤丸なしで先に出す**回なので、「表の数と画面の数が一致」だけを見る（0と0も合格）。
  //   絵は**その問の img**と照らす
  const wantImg = await page.evaluate(q => (QA_DATA.find(d => d.id === q) || {}).img || "", qid);
  check("★赤丸の数が、座標表と合っている", drawn === want,
        `画面 ${drawn}個 / 表 ${want}個${want === 0 ? "（赤丸なしの回）" : ""}`);
  check("★年表の絵が出ている", shown.出ている && !!wantImg && (shown.src || "").endsWith(wantImg), `${shown.src} 枠${shown.枠} 実寸${shown.実寸}`);
  await page.screenshot({ path: path.join(SHOTS, qid + "_1_normal.png") });

  if (!first) { continue; }   // ★拡大の確認は先頭の1問だけ（上の理由）
  first = false;
  // 押して拡大
  await page.click("#solo-img"); await page.waitForTimeout(700);
  const lb = await page.evaluate(() => {
    const img = document.querySelector("#lightbox-img");
    let el = img, shown = false;
    while (el) { if (el.classList && el.classList.contains("show")) { shown = true; break; } el = el.parentElement; }
    return { 開いた: shown, src: img && img.getAttribute("src"), 大きさ: img ? img.clientWidth + "x" + img.clientHeight : null };
  });
  check("★押すと拡大して見られる", lb.開いた && !!wantImg && (lb.src || "").endsWith(wantImg), `${lb.大きさ}`);
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
  // ★閉じられるかも見る。拡大したまま閉じられないと、次の問へ進めない
  await page.evaluate(() => { const c = document.querySelector("#lightbox-close"); if (c) c.click(); });
  await page.waitForTimeout(500);
  let closed = await page.evaluate(() => !document.querySelector("#lightbox-overlay").classList.contains("show"));
  if (!closed) { await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    closed = await page.evaluate(() => !document.querySelector("#lightbox-overlay").classList.contains("show")); }
  check("★拡大したあと、閉じて問題にもどれる", closed);
}

await browser.close(); server.close();
console.log(`\n写真: ${SHOTS}`);
console.log("⚠️ ★番号（①〜⑳）が読めるかは、上の写真を**人が見て**決めること。ここでは判定しません");
console.log(ng === 0 ? "✔ 機械で見られるところは、すべて確認できた" : `✘ ${ng}件 だめだった`);
process.exit(ng === 0 ? 0 : 1);
