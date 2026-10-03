// 理科の紙の大問を「選んで」印刷する（2026-10-03・ユーザー「これとこれみたいな感じで選択させたいです」）
// 本物の Chrome・390x844。スクショは tools/mikaku/shots_paper_select/（コミットしない）
// 使い方: node tools/mikaku/paper_select_probe.mjs
// 見ること:
//   Q1 はじめは何も選ばれていない。0題のときは「印刷用に表示」が押せない（押しても紙が開かない）
//   Q2 2題を選ぶ → 紙に2題だけ出る（問題の紙2枚 → 答えの紙2枚）。最後の紙のあとに改ページなし
//   Q3 開き直しても選んだ2題が残っている（端末に残す）
//   Q4 全部えらぶ → 全題の問題の紙・答えの紙が出て、1題ずつの中身が直す前の版（1題ずつ開く）と1文字も違わない
//   Q5 全部はずす → 0題に戻る
//   Q6 記録（kq_battle_stats_v1）が1文字も変わらない
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_paper_select"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "fc375a8";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(Buffer.from(SERVED, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": rel.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL0 = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const SEED_STATS = { r3k101: { correct: 2, wrong: 1, box: 2, lastCorrectAt: 1790000000000, lastAnswered: 1790000000000 } };

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
  await page.goto(URL0); await page.waitForTimeout(700);
  await page.evaluate(st => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
    localStorage.setItem("kq_battle_daimon_merged_v1", "1"); localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st)); }, SEED_STATS);
  await page.reload(); await page.waitForTimeout(800);
  return { ctx, page, errs };
}
const openList = async page => { await page.$eval("#subject-science", e => e.click()); await page.waitForTimeout(250); await page.$eval("#paper-open-btn", e => e.click()); await page.waitForTimeout(300); };
const sheets = page => page.evaluate(() => [...document.querySelectorAll("#paper-print-body .paper-sheet")].map(s => ({
  title: (s.querySelector(".paper-sheet-title") || {}).textContent || "", text: s.textContent, brk: s.classList.contains("paper-page-break"),
  hasA: s.querySelectorAll(".paper-item-a").length > 0 })));

// 直す前の版で、1題ずつ開いたときの紙（比べる相手）
async function baselineSheets() {
  SERVED = BASELINE;
  const { ctx, page } = await newPage();
  await openList(page);
  const keys = await page.evaluate(() => [...document.querySelectorAll("#paper-list-body .paper-row")].map(e => e.dataset.key));
  const per = {};
  for (const k of keys) {
    await page.$eval('.paper-row[data-key="' + k + '"]', e => e.click()); await page.waitForTimeout(250);
    per[k] = await sheets(page);
    await page.$eval("#paper-print-back", e => e.click()); await page.waitForTimeout(200);
  }
  await ctx.close();
  return { keys, per };
}

async function run(label, src, BASE) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const { ctx, page, errs } = await newPage();
  const shot = n => page.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  try {
    const st0 = await page.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
    await openList(page);
    const keys = await page.evaluate(() => [...document.querySelectorAll("#paper-list-body .paper-row")].map(e => e.dataset.key));
    check("一覧の紙の大問が直す前と同じ並び（" + keys.length + "題）", keys.join() === BASE.keys.join() && keys.length >= 3, keys.length);
    // Q1
    const q1 = await page.evaluate(() => { const b = document.getElementById("paper-pick-go"); return { exists: !!b, disabled: b ? b.disabled : null, on: document.querySelectorAll("#paper-list-body .paper-row.on").length }; });
    check("Q1 はじめは何も選ばれていない・「印刷用に表示」は押せない", q1.exists && q1.disabled === true && q1.on === 0, JSON.stringify(q1));
    if (q1.exists) await page.$eval("#paper-pick-go", e => e.click()).catch(() => {});
    await page.waitForTimeout(200);
    const scr0 = await page.evaluate(() => (document.querySelector(".screen.active") || {}).id);
    check("Q1 0題で押しても紙は開かない", scr0 === "screen-paper-list", scr0);
    await shot("Q1_list_none");
    // Q2: 1つ目と最後を選ぶ
    const pick = [keys[0], keys[keys.length - 1]];
    for (const k of pick) await page.$eval('.paper-row[data-key="' + k + '"]', e => e.click());
    await page.waitForTimeout(200);
    const q2a = await page.evaluate(() => ({ on: [...document.querySelectorAll("#paper-list-body .paper-row.on")].map(e => e.dataset.key), label: (document.getElementById("paper-pick-go") || {}).textContent || "", scr: (document.querySelector(".screen.active") || {}).id }));
    check("Q2 押すと選ばれる（紙はまだ開かない）・ボタンに「2 題」", q2a.on.join() === pick.join() && /2 題/.test(q2a.label) && q2a.scr === "screen-paper-list", JSON.stringify(q2a));
    await shot("Q2_list_two");
    await page.$eval("#paper-pick-go", e => e.click()).catch(() => {}); await page.waitForTimeout(300);
    const s2 = await sheets(page);
    const want = [BASE.per[pick[0]][0], BASE.per[pick[1]][0], BASE.per[pick[0]][1], BASE.per[pick[1]][1]];
    check("Q2 紙は4枚（問題2・答え2）で、選んだ2題だけ", s2.length === 4 && s2.every((s, i) => want[i] && s.text === want[i].text), s2.map(s => s.title).join(" / "));
    check("Q2 問題の紙に答えの欄が無い", s2.length === 4 && !s2[0].hasA && !s2[1].hasA && s2[2].hasA && s2[3].hasA);
    check("Q2 改ページは最後の紙以外ぜんぶ", s2.length === 4 && s2.slice(0, 3).every(s => s.brk) && !s2[3].brk, s2.map(s => s.brk).join(","));
    await shot("Q2_print_two");
    // Q3
    await page.reload(); await page.waitForTimeout(800);
    await openList(page);
    const on3 = await page.evaluate(() => [...document.querySelectorAll("#paper-list-body .paper-row.on")].map(e => e.dataset.key));
    check("Q3 開き直しても選んだ2題が残っている", on3.join() === pick.join(), on3.join());
    // Q4
    await page.$eval("#paper-pick-all", e => e.click()).catch(() => {}); await page.waitForTimeout(200);
    await page.$eval("#paper-pick-go", e => e.click()).catch(() => {}); await page.waitForTimeout(400);
    const s4 = await sheets(page);
    const want4 = keys.map(k => BASE.per[k][0]).concat(keys.map(k => BASE.per[k][1]));
    const diff = s4.map((s, i) => (want4[i] && s.text === want4[i].text) ? null : i).filter(x => x !== null);
    check("Q4 全部えらぶ → " + keys.length + "題ぶん " + (keys.length * 2) + "枚・1題ずつの中身が直す前と1文字も違わない", s4.length === want4.length && diff.length === 0, s4.length + "枚・違う紙 " + diff.join(","));
    await page.$eval("#paper-print-back", e => e.click()); await page.waitForTimeout(200);
    // Q5
    await page.$eval("#paper-pick-none", e => e.click()).catch(() => {}); await page.waitForTimeout(200);
    const q5 = await page.evaluate(() => ({ on: document.querySelectorAll("#paper-list-body .paper-row.on").length, disabled: (document.getElementById("paper-pick-go") || {}).disabled }));
    check("Q5 全部はずす → 0題・押せない", q5.on === 0 && q5.disabled === true, JSON.stringify(q5));
    // Q6
    const st1 = await page.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
    check("Q6 記録が変わらない", st0 === st1);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check("横のはみ出し 0", ov <= 0, ov);
    check("画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
  finally { await ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); process.exit(c); };
const BASE = await baselineSheets();
console.log("比べる相手: 直す前 " + BASE_COMMIT + " で1題ずつ開いた紙（" + BASE.keys.length + "題）");
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE, BASE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT, BASE));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
