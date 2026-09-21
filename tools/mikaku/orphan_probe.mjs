// ★問題を data.js から消したあと、**端末に残った記録（stats[消えた id]）で画面が壊れないか**を見る。
//
// 使い方: node tools/mikaku/orphan_probe.mjs [消えた id]   （既定 r4m90）
//
// ■ なぜ要るか（2026-09-22）
//   理科 第4回で r4m90（消化の表⑪）を消した。お子さんの端末には `stats.r4m90` が残る。
//   id は履歴の鍵なので**記録は消さない**（C-5）。そのうえで、残った記録が
//   ホームの数字・問題一覧・CSV 書き出し・途中再開・「前回まちがえた問題」を壊さないかを確かめる。
//
// ■ 仕込むもの（テスト用）
//   stats[消えた id] ＋ 同じ単元の生きている問の記録 ／ 一人の途中再開に消えた id を混ぜる ／
//   「前回まちがえた問題」に消えた id を混ぜる
//
// ■ ★見ていないもの（4-2）
//   - 二人対戦の途中再開（ホスト側）… 一人と同じ取りのぞきがあるかはコードで確認（下の注）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GONE = process.argv[2] || "r4m90";
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;
let ng = 0;
const check = (label, ok, extra) => { console.log(`  ${ok ? "✔" : "✘"} ${label}${extra ? " … " + extra : ""}`); if (!ok) ng++; };

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e)));
page.on("dialog", d => d.accept());
await page.goto(BASE); await page.waitForTimeout(500);

const setup = await page.evaluate((GONE) => {
  const exists = QA_DATA.some(q => q.id === GONE);
  const alive = QA_DATA.filter(q => q.id.startsWith(GONE.slice(0, 3))).slice(0, 5).map(q => q.id);
  const u = QA_DATA.find(q => q.id === alive[0]).u, subj = QA_DATA.find(q => q.id === alive[0]).subj;
  const now = Date.now(), day = 86400000;
  const st = {};
  st[GONE] = { correct: 2, wrong: 3, box: 0, lastCorrectAt: now - day, lastAnswered: now - day, nextDue: now };
  alive.forEach(id => st[id] = { correct: 1, wrong: 1, box: 0, lastCorrectAt: now - 2 * day, lastAnswered: now - day });
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: subj, unitsBySubject: { [subj]: [u] }, units: [u], count: "all" }));
  localStorage.setItem("kq_battle_last_miss_v1", JSON.stringify([alive[0], GONE, alive[1]]));
  return { exists, alive, u, subj };
}, GONE);
console.log(`消えた id: ${GONE}（data.js に ${setup.exists ? "★まだある" : "無い"}）／ 単元「${setup.u}」`);
check("前提: 消えた id が data.js に無い", !setup.exists);
await page.reload(); await page.waitForTimeout(1200);

// ① ホームの数字
const home = await page.evaluate(() => ({
  total: document.getElementById("stat-total").textContent,
  mastered: document.getElementById("stat-mastered").textContent,
  weak: document.getElementById("stat-weak").textContent,
  miss: (document.getElementById("retry-last-miss-btn") || {}).textContent,
}));
console.log(`  ホーム: 全問題数 ${home.total} ／ 正解済み ${home.mastered} ／ 苦手 ${home.weak}`);
console.log(`  「${home.miss}」`);
check("★ホームの数字が数として出ている（NaN などになっていない）", [home.total, home.mastered, home.weak].every(v => /^\d+$/.test(v)));
check("★苦手の数に、消えた問が入っていない（生きている5問だけ）", home.weak === "5", home.weak);
check("★「前回まちがえた問題」から消えた問が取りのぞかれる（3→2問）", /（2問）/.test(home.miss || ""), home.miss);
const missSaved = await page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_last_miss_v1") || "[]"));
check("保存されている「前回まちがえた問題」からも消えている", !missSaved.includes(GONE), missSaved.join(","));

// ② 問題一覧
await page.click("#list-btn"); await page.waitForTimeout(600);
await page.selectOption("#list-unit-select", setup.u); await page.waitForTimeout(400);
for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 4000); await page.waitForTimeout(80); }
const rows = await page.$$eval("#list-items .list-item[data-qid]", els => els.map(e => e.dataset.qid));
console.log(`  問題一覧: ${await page.textContent("#list-count")} ／ 最後: ${rows.slice(-2).join(" ")}`);
check("★問題一覧が開けて、消えた問は並ばない", rows.length > 0 && !rows.includes(GONE));
await page.click("#list-back"); await page.waitForTimeout(400);

// ③ CSV 書き出し
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }).catch(() => null),
                                page.click("#export-link")]);
let csvHasGone = null;
if (dl) { const p = await dl.path(); const txt = fs.readFileSync(p, "utf8"); csvHasGone = txt.includes(GONE); }
check("★CSV の書き出しが動く", !!dl);
console.log(`  CSV に消えた問の行: ${csvHasGone ? "ある" : "★無い（書き出しは data.js の問だけ）"}`);

// ④ 一人の途中再開に、消えた id が混ざっていたら
await page.evaluate(({ GONE, alive }) => {
  // ★本物の保存と同じ形（index.html の saveSoloSession: v=2・quizIds・quizPos・quizResults）。
  //   2問すんだところ（alive[0] と 消えた問）で止まっていた、という想定
  localStorage.setItem("kq_battle_solo_session_v1", JSON.stringify({
    v: 2, quizIds: [alive[0], GONE, alive[1], alive[2]], quizPos: 2,
    quizResults: [{ id: alive[0], correct: true, recorded: true }, { id: GONE, correct: false, recorded: true }],
    reviewMode: false, inSoloRetryRound: false }));
}, setup);
await page.reload(); await page.waitForTimeout(1000);
const resumeVisible = await page.$eval("#resume-solo-btn", e => getComputedStyle(e).display !== "none").catch(() => false);
console.log(`  途中再開ボタン: ${resumeVisible ? "出ている" : "出ていない（保存の形が合わず読まれなかった可能性）"}`);
if (resumeVisible) {
  await page.click("#resume-solo-btn"); await page.waitForTimeout(700);
  const cur = ((await page.textContent("#solo-q-id").catch(() => "")) || "");
  // 消えた問を取りのぞくと [alive0, alive1, alive2] で、すんだのは alive0 の1問 → 次は alive1
  check("★途中再開が開けて、消えた問を飛ばして次の問（" + setup.alive[1] + "）から続く", cur.trim().endsWith(setup.alive[1]), cur.trim());
  const prog = await page.evaluate(() => (document.querySelector("#solo-progress, .counter") || {}).textContent || "");
  console.log(`  途中再開の表示: ${prog.trim()}`);
}
check("★途中再開ボタンが出る（仕込んだ形が読まれている）", resumeVisible);

const post = await page.evaluate((GONE) => JSON.parse(localStorage.getItem("kq_battle_stats_v1"))[GONE], GONE);
check("★端末の記録 stats[消えた id] は消されずに残っている（C-5: 履歴は消さない）", !!post, JSON.stringify(post));
check("★ページのエラー 0件", errs.length === 0, errs.slice(0, 3).join(" | "));

await browser.close(); server.close();
console.log(ng === 0 ? "\n✔ すべて確認できた" : `\n✘ ${ng}件 だめだった`);
process.exit(ng === 0 ? 0 : 1);
