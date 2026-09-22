// ★ホームの「未クリア」（あと何問）と「15問」（2026-09-22 ユーザー依頼）を実機（Chrome・390px）で見る。
//
// 使い方: node tools/mikaku/unmastered_count_probe.mjs
//
// ■ 決めごと
//   「未クリア あと」＝「未クリアの問題」トグルだけオン＋「全部」で出てくる問題と**同じ数**（box 0。まちがえた問も入る）
//   単元を変えたら数も変わる／全部正解ずみなら 0 と出る
//   「15問」が選べて、開き直しても残る
// ■ 見ていないもの: お子さんの端末の実際の記録
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ channel: "chrome" });
let ng = 0;
const check = (label, ok, extra) => { console.log(`  ${ok ? "✔" : "✘"} ${label}${extra ? " … " + extra : ""}`); if (!ok) ng++; };

const U1 = "第3回.奈良時代", U2 = "第4回.平安時代";
// 前半60問は正解ずみ（box 2）、10問に1問はまちがえて box 0（＝未クリアに戻った）、残りは未実施
function seed(ids, allMastered) {
  const st = {}, now = Date.now(), day = 86400000;
  ids.forEach((id, i) => {
    if (allMastered) st[id] = { correct: 1, wrong: 0, box: 1, lastCorrectAt: now - day, lastAnswered: now - day };
    else if (i % 10 === 3) st[id] = { correct: 3, wrong: 1, box: 0, lastCorrectAt: now - 2 * day, lastAnswered: now - day };
    else if (i < 60) st[id] = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - day, lastAnswered: now - day };
  });
  return st;
}
async function open({ units, allMastered = false, count = "all" }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(URL); await page.waitForTimeout(400);
  const expect = await page.evaluate(({ units, allMastered, count, seedSrc, U1 }) => {
    const ids = QA_DATA.filter(q => q.u === U1).map(q => q.id);
    const st = (new Function("ids", "m", "return (" + seedSrc + ")(ids, m)"))(ids, allMastered);
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": units }, units,
      count, shuffle: false, filterUnmastered: false, filterWeak: false, reviewMixCount: 0 }));
    // ★記録から独立に数える（box が 0 か、記録なし）
    return QA_DATA.filter(q => q.subj === "社会" && units.includes(q.u) && q.kind !== "calc")
      .filter(q => !(st[q.id] && st[q.id].box > 0)).length;
  }, { units, allMastered, count, seedSrc: seed.toString(), U1 });
  await page.reload(); await page.waitForTimeout(900);
  return { ctx, page, errs, expect };
}
const num = s => parseInt(String(s).replace(/[^0-9]/g, ""), 10);
const shown = page => page.$eval("#stat-unmastered", e => e.textContent);
const label = page => page.$eval("#pool-count-label", e => e.textContent);

console.log("■ 1. 単元1つ（" + U1 + "）");
{
  const { ctx, page, errs, expect } = await open({ units: [U1] });
  const n = num(await shown(page));
  check("未クリア あと = 記録から独立に数えた数", n === expect, `表示 ${n} / 記録 ${expect}`);
  await page.click("#mode-unmastered"); await page.waitForTimeout(300);
  const t = num(await label(page));
  check("★トグルをオン＋全部で出る数と一致", n === t, `表示 ${n} / トグル ${t}（${await label(page)}）`);
  // 実際に始めて、出る問題数を数える
  await page.click("#solo-start-btn"); await page.waitForTimeout(800);
  const c = await page.$eval("#solo-counter", e => e.textContent);
  check("★実際に始めた問題数とも一致", num(c.split("/")[1]) === n, c);
  await page.screenshot({ path: path.join(ROOT, "tools/mikaku/shots/unmastered_quiz.png") });
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 2. 単元を変えると数も変わる");
{
  const { ctx, page, errs, expect } = await open({ units: [U1] });
  const before = num(await shown(page));
  await page.evaluate(u => document.querySelector(`#unit-choices [data-unit="${u}"]`).click(), U2); await page.waitForTimeout(300);
  const after = num(await shown(page));
  const exp2 = await page.evaluate(u => QA_DATA.filter(q => q.u === u && q.kind !== "calc").length, U2);
  check("単元を足すと、足した単元の未実施ぶん増える", after === before + exp2, `${before} → ${after}（+${exp2}）`);
  await page.click("#mode-unmastered"); await page.waitForTimeout(300);
  check("★2単元でもトグルの数と一致", num(await label(page)) === after, await label(page));
  await page.screenshot({ path: path.join(ROOT, "tools/mikaku/shots/unmastered_home.png"), fullPage: false });
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 3. 全部正解ずみなら 0");
{
  const { ctx, page, errs } = await open({ units: [U1], allMastered: true });
  check("0 と出る", (await shown(page)).trim() === "0", await shown(page));
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 4. 15問");
{
  const { ctx, page, errs } = await open({ units: [U1] });
  await page.click('.count-choice[data-count="15"]'); await page.waitForTimeout(300);
  check("15問を押すと 15問 になる", (await label(page)).startsWith("15問"), await label(page));
  check("15問 のボタンがオン", await page.$eval('.count-choice[data-count="15"]', e => e.classList.contains("on")));
  await page.reload(); await page.waitForTimeout(900);
  check("★開き直しても 15問 のまま（保存される）", (await label(page)).startsWith("15問") &&
    await page.$eval('.count-choice[data-count="15"]', e => e.classList.contains("on")) &&
    !(await page.$eval(".count-choice-custom", e => e.classList.contains("on"))), await label(page));
  await page.click("#solo-start-btn"); await page.waitForTimeout(800);
  const c = await page.$eval("#solo-counter", e => e.textContent);
  check("始めると 15問", num(c.split("/")[1]) === 15, c);
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 5. 解いてホームにもどると数が変わる（〇で減る）");
{
  const { ctx, page, errs } = await open({ units: [U1] });
  page.on("dialog", d => d.accept());
  const before = num(await shown(page));
  await page.click("#mode-unmastered"); await page.waitForTimeout(300);
  await page.click("#solo-start-btn"); await page.waitForTimeout(800);
  for (let k = 0; k < 2; k++) {
    await page.click("#solo-reveal-btn"); await page.waitForTimeout(200);
    await page.click("#solo-judge-ok"); await page.waitForTimeout(500);
  }
  await page.click("#solo-back"); await page.waitForTimeout(800);
  const after = num(await shown(page));
  check("未クリアを2問〇にすると 2 減る", after === before - 2, `${before} → ${after}`);
  check("トグルの数とも一致", num(await label(page)) === after, await label(page));
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
await browser.close(); server.close();
console.log(ng ? `\n✘ ${ng} 件 ちがう` : "\n===== 合計: 問題なし =====");
process.exit(ng ? 1 : 0);
