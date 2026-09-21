// ★「★最優先」（親が一覧で付ける・2026-09-22）が、決めたとおりに動くかを実機で見る。
//
// 使い方: node tools/mikaku/priority_probe.mjs
//
// ■ 決めごと（ユーザー 2026-09-22・司令塔の読み）
//   ふだん（未クリア／よく間違える が OFF）… ★を先頭に（選んだ単元の中で）→ そのあと問題数で切る
//   未クリアのみ … ★を特別扱いしない（★でも正解したら外れる）
//   苦手のみ     … ★を特別扱いしない（並びも他と同じ）
//   ★は自動では外れない／付けるのは問題一覧だけ／★が0件なら、いまとまったく同じ
//
// ■ ★「いまと同じ」を、直す前の版と並べて確かめる
//   直す前の index.html（git の HEAD）と、いまの index.html を別々に配り、
//   同じ記録・同じ設定で「出る問題の並び」と「問題数の表示」を比べる（出題順どおり＝並びが決まる形で）。
//
// ■ ★見ていないもの（4-2）
//   - 二人対戦の実機（出題の決め方は一人と同じ buildFinalPool だが、2台では試していない）
//   - お子さんの端末の実際の記録
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_REF = process.argv[2] || "HEAD";
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();
const OLD_HTML = execSync(`git show ${BASE_REF}:index.html`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
function serve(oldVersion) {
  const s = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    if (rel === "index.html" && oldVersion) { res.writeHead(200, { "content-type": MIME[".html"] }); res.end(OLD_HTML); return; }
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
      : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
  });
  return new Promise(r => s.listen(0, "127.0.0.1", () => r({ s, url: `http://127.0.0.1:${s.address().port}/index.html` })));
}
const NEW = await serve(false), OLD = await serve(true);
const browser = await chromium.launch({ channel: "chrome" });
let ng = 0;
const check = (label, ok, extra) => { console.log(`  ${ok ? "✔" : "✘"} ${label}${extra ? " … " + extra : ""}`); if (!ok) ng++; };

const UNIT = "第3回.奈良時代";   // 113問。ここで試す
// 記録: 前半は正解ずみ、10問に1問はまちがえ、後半は未実施
function seedStats(ids) {
  const st = {}, now = Date.now(), day = 86400000;
  ids.forEach((id, i) => {
    if (i % 10 === 3) st[id] = { correct: 0, wrong: 1, box: 0, lastAnswered: now - day };
    else if (i < 60) st[id] = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - (60 - i) * day, lastAnswered: now - day };
  });
  return st;
}
// 1回ぶん: 記録・設定・★を仕込んで開き、表示と「最初の n 問」を読む
async function run(ver, { stars = [], count = 20, shuffle = false, unmastered = false, weak = false, n = 5 }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  page.on("dialog", d => d.accept());
  await page.goto(ver.url); await page.waitForTimeout(400);
  await page.evaluate(({ UNIT, stars, count, shuffle, unmastered, weak, seed }) => {
    const ids = QA_DATA.filter(q => q.u === UNIT).map(q => q.id);
    const st = (new Function("ids", "return (" + seed + ")(ids)"))(ids);
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [UNIT] }, units: [UNIT],
      count, shuffle, filterUnmastered: unmastered, filterWeak: weak, reviewMixCount: 0 }));
    if (stars.length) localStorage.setItem("kq_battle_priority_v1", JSON.stringify(stars));
  }, { UNIT, stars, count, shuffle, unmastered, weak, seed: seedStats.toString() });
  await page.reload(); await page.waitForTimeout(800);
  const label = await page.$eval("#pool-count-label", e => e.textContent);
  const statsBefore = await page.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
  await page.click("#solo-start-btn"); await page.waitForTimeout(500);
  const seq = [];
  for (let k = 0; k < n; k++) {
    const id = (((await page.textContent("#solo-q-id").catch(() => "")) || "").match(/[a-z]\w*$/) || [""])[0];
    seq.push(id);
    const b = await page.$("#solo-reveal-btn"); if (!b || !(await b.isVisible())) break;
    await b.click(); await page.waitForTimeout(30);
    const ok = await page.$("#solo-judge-ok"); if (!ok || !(await ok.isVisible())) break;
    await ok.click(); await page.waitForTimeout(40);
  }
  await ctx.close();
  return { label, seq, errs, statsBefore };
}
const ids = await (async () => {
  const ctx = await browser.newContext(); const p = await ctx.newPage(); await p.goto(NEW.url);
  const r = await p.evaluate(u => QA_DATA.filter(q => q.u === u).map(q => q.id), UNIT); await ctx.close(); return r;
})();
// ★は後ろのほうの未実施の3問（ふだんなら先頭に来るはず）＋ 正解ずみの1問（未クリアでは出ないはず）
const STARS = [ids[100], ids[105], ids[110], ids[5]];
console.log(`単元「${UNIT}」${ids.length}問 ／ ★に付ける: ${STARS.join(" ")}（${STARS[3]} は正解ずみ）`);

// ── ① ★0件なら、直す前とまったく同じ ──
console.log("\n── ① ★が0件なら、直す前の版とまったく同じか（出題順どおり）──");
for (const cfg of [{ count: 20 }, { count: "all" }, { count: 20, unmastered: true }, { count: 20, weak: true }, { count: 10, unmastered: true, weak: true }]) {
  const a = await run(OLD, { ...cfg, n: 8 }), b = await run(NEW, { ...cfg, n: 8 });
  const name = JSON.stringify(cfg);
  check(`${name} 表示も並びも同じ`, a.label === b.label && a.seq.join() === b.seq.join(), `${b.label} ／ ${b.seq.slice(0, 5).join(" ")}`);
}

// ── ② ふだん（出題順どおり）: ★が先頭 ──
console.log("\n── ② ふだん・出題順どおり・20問 ──");
{
  const r = await run(NEW, { stars: STARS, count: 20, n: 5 });
  console.log(`  表示: ${r.label} ／ 最初の5問: ${r.seq.join(" ")}`);
  check("★4問が先頭（data の順のまま）", r.seq.slice(0, 4).join() === [ids[5], ids[100], ids[105], ids[110]].join());
  check("★問題数の表示に「★最優先 4問が先に出ます」", /★最優先 4問が先に出ます/.test(r.label), r.label);
  check("5問目からは★以外（いまどおり）", r.seq[4] === ids[0], r.seq[4]);
}
// ── ③ ふだん（シャッフル）: ★が先頭 ──
console.log("\n── ③ ふだん・シャッフル・10問 ──");
{
  const r = await run(NEW, { stars: STARS, count: 10, shuffle: true, n: 5 });
  console.log(`  最初の5問: ${r.seq.join(" ")}`);
  check("★4問が先頭（順はまぜてよい）", r.seq.slice(0, 4).sort().join() === STARS.slice().sort().join());
}
// ── ④ 未クリアのみ: ★を特別扱いしない ──
console.log("\n── ④ 未クリアのみ（★を特別扱いしない）──");
{
  const a = await run(NEW, { stars: [], count: 20, unmastered: true, n: 8 });
  const b = await run(NEW, { stars: STARS, count: 20, unmastered: true, n: 8 });
  console.log(`  ★なし: ${a.label} ${a.seq.join(" ")}\n  ★あり: ${b.label} ${b.seq.join(" ")}`);
  check("★を付けても、並びも数も同じ", a.seq.join() === b.seq.join() && a.label === b.label);
  check("正解ずみの★（" + STARS[3] + "）は出ない", !b.seq.includes(STARS[3]));
}
// ── ⑤ 苦手のみ: ★を特別扱いしない ──
console.log("\n── ⑤ よく間違える のみ（★を特別扱いしない）──");
{
  const a = await run(NEW, { stars: [], count: 20, weak: true, n: 8 });
  const b = await run(NEW, { stars: STARS, count: 20, weak: true, n: 8 });
  check("★を付けても、並びも数も同じ", a.seq.join() === b.seq.join() && a.label === b.label, `${b.label} ${b.seq.slice(0, 5).join(" ")}`);
}

// ── ⑥ 問題一覧で付け外し・保存・記録に触らない ──
console.log("\n── ⑥ 問題一覧（付け外し・★のみ・まとめて・保存）──");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  page.on("dialog", d => d.accept());
  await page.goto(NEW.url); await page.waitForTimeout(400);
  await page.evaluate(({ UNIT, seed }) => {
    const ids = QA_DATA.filter(q => q.u === UNIT).map(q => q.id);
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify((new Function("ids", "return (" + seed + ")(ids)"))(ids)));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
  }, { UNIT, seed: seedStats.toString() });
  await page.reload(); await page.waitForTimeout(700);
  const statsBefore = await page.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
  await page.click("#list-btn"); await page.waitForTimeout(500);
  await page.selectOption("#list-unit-select", UNIT); await page.waitForTimeout(400);
  const btn = `#list-items .list-item[data-qid="${ids[2]}"] .q-star-btn`;
  await page.waitForSelector(btn);
  await page.click(btn); await page.waitForTimeout(200);
  const on1 = await page.$eval(btn, e => e.classList.contains("on") && e.textContent);
  const saved1 = await page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_priority_v1") || "[]"));
  check("☆を押すと★になり、保存される", !!on1 && saved1.includes(ids[2]), `${on1} ／ 保存 ${JSON.stringify(saved1)}`);
  check("★の件数が一覧の上に出る", /★最優先 1問/.test(await page.textContent("#star-bulk-count")));
  await page.click(btn); await page.waitForTimeout(200);
  const saved2 = await page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_priority_v1") || "[]"));
  check("もう一度押すと外れる", !saved2.includes(ids[2]));
  // まとめて: 「未実施のみ」で絞って全部★ → ★のみで数える
  await page.$eval('.list-filter-toggle[data-filter="unseen"]', e => e.click()); await page.waitForTimeout(300);
  const shown = parseInt(await page.textContent("#list-count"), 10);
  await page.click("#star-bulk-on"); await page.waitForTimeout(400);
  await page.$eval('.list-filter-toggle[data-filter="unseen"]', e => e.click()); await page.waitForTimeout(200);
  await page.$eval('.list-filter-toggle[data-filter="star"]', e => e.click()); await page.waitForTimeout(400);
  const starred = parseInt(await page.textContent("#list-count"), 10);
  check("★「表示中を全部★」→「★最優先のみ」で同じ数だけ出る", shown > 0 && starred === shown, `未実施 ${shown}問 → ★ ${starred}問`);
  // 開き直しても残る
  await page.reload(); await page.waitForTimeout(700);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_priority_v1") || "[]").length);
  check("★開き直しても★が残る（自動では外れない）", kept === shown, `${kept}件`);
  const statsAfter = await page.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
  check("★正誤の記録（stats）は1文字も変わっていない", statsBefore === statsAfter);
  // 全部外す
  await page.click("#list-btn"); await page.waitForTimeout(400);
  await page.$eval('.list-filter-toggle[data-filter="star"]', e => e.click()); await page.waitForTimeout(300);
  await page.click("#star-bulk-off"); await page.waitForTimeout(400);
  const left = await page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_priority_v1") || "[]").length);
  check("「表示中の★を外す」で全部外れる", left === 0, `${left}件`);
  check("ページのエラー 0件", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── ⑦ ★の箱が壊れていても動く（古い・変な保存）──
console.log("\n── ⑦ ★の保存が壊れていても、★なしとして動く ──");
{
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(NEW.url); await page.evaluate(() => { localStorage.setItem("kq_battle_priority_v1", "{こわれた"); });
  await page.reload(); await page.waitForTimeout(700);
  check("壊れた保存でもページが開く（エラー0）", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

await browser.close(); NEW.s.close(); OLD.s.close();
console.log(ng === 0 ? "\n✔ すべて確認できた" : `\n✘ ${ng}件 だめだった`);
process.exit(ng === 0 ? 0 : 1);
