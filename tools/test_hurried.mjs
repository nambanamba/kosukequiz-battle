// 急いだ回（一人の一問一答で、こたえを見るまでの秒の中央値が2秒未満）の〇を数えない（2026-10-24 ユーザー）
//   node tools/test_hurried.mjs
// 見ること:
//   ① 急いだ回の〇は数えない（まだ一度も正解していなかった問題は「まだ」に戻る・定着に近づいた日も戻る）。起動したとき前の回にも効く
//   ② ✕は数える ③ 対戦・やり直しの回は対象外 ④ 中央値2秒以上の回は今までどおり
//   ⑤ 印・二度は外さない ⑥ 学習ログ（1問ごとの記録）は消さない・書き出しの「急いだ回」欄
//   ⑦ 本物の画面で、すばやく〇を押して終えた回が外れる／ゆっくりの回は外れない／子どもの結果の画面は変わらない
// ★アプリの中身は <script type="module"> なので、外からは関数を呼べない。
//   記録（localStorage の stats）と学習ログ（IndexedDB）を置いて起動し直し、記録を読む。
//   段（まだ・苦手・おぼえかけ・定着）は index.html の tierOfStat と同じ決まりでここで出す（0=まだ 1=苦手 3=おぼえかけ 2=定着）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function loadPlaywright(){
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const pw = await loadPlaywright();
const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".jpg":"image/jpeg", ".png":"image/png"};
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => { if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {"content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream"}); res.end(buf); });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/";
let pass = 0, fail = 0;
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "  ✅ " : "  ❌ ") + name + "  got=" + JSON.stringify(got) + (ok ? "" : " want=" + JSON.stringify(want)));
  ok ? pass++ : fail++;
}
let browser;
try { browser = await pw.chromium.launch(); } catch { browser = await pw.chromium.launch({ channel: "chrome" }); }
const errors = [];
const tierOf = s => (!s || (!s.lastCorrectAt && !((s.correct||0) > 0))) ? 0
  : (((s.wrong||0) > 0 && (s.box||0) <= 1) ? 1
  : ((!s.manualMastered && (Array.isArray(s.correctDays) ? s.correctDays.length : 1) < 3) ? 3 : 2));
async function newPage(ctx){
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
  return page;
}
// 起動して学習ログの入れ物ができるまで待つ
async function boot(page){
  await page.goto(BASE + "index.html", { waitUntil: "load" });
  await page.waitForFunction(() => new Promise(res => {
    const r = indexedDB.open("kq_battle_study_log");
    r.onsuccess = () => { const ok = r.result.objectStoreNames.contains("sessions"); r.result.close(); res(ok); };
    r.onerror = () => res(false);
  }));
  await page.waitForTimeout(500);
}
const readAll = page => page.evaluate(() => new Promise(res => {
  const r = indexedDB.open("kq_battle_study_log");
  r.onsuccess = () => {
    const q = r.result.transaction(["sessions"], "readonly").objectStore("sessions").getAll();
    q.onsuccess = () => { r.result.close(); res({ sessions: q.result, stats: JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"), audit: JSON.parse(localStorage.getItem("kq_battle_hurried_v1") || "null") }); };
  };
}));
const putSessions = (page, list) => page.evaluate(list => new Promise((res, rej) => {
  const r = indexedDB.open("kq_battle_study_log");
  r.onsuccess = () => { const tx = r.result.transaction(["sessions"], "readwrite"); list.forEach(s => tx.objectStore("sessions").put(s)); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
}), list);
// ふつうのカード（図なし・答えが1つ・大問でない社会）
const plainIds = page => page.evaluate(() => QA_DATA.filter(d => d.subj === "社会" && !d.img && !d.itemIds && !/[、・，,①-⑳]/.test(d.a || "") && !/[①-⑳]/.test(d.q || "")).map(d => d.id));

// ---- ①〜⑥ 前の回を置いて起動し直す（10/19 の回と同じ形）＝前の回にも効くか ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, acceptDownloads: true });
  const page = await newPage(ctx);
  await boot(page);
  const ids = (await plainIds(page)).slice(0, 8);
  const [A, B, C, D, E, F, G, H] = ids;
  const T = Date.parse("2026-10-19T22:00:13+09:00"), DAY = 86400000;
  const ymd = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const day = ymd(T);
  const st = {
    [A]: { correct: 1, wrong: 0, box: 1, lastCorrectAt: T + 30000, lastAnswered: T + 30000, correctDays: [day] },   // はじめての〇（急いだ回）
    [B]: { correct: 0, wrong: 1, box: 0, lastAnswered: T + 31000 },                                                    // 急いだ回で✕
    [C]: { correct: 3, wrong: 0, box: 3, lastCorrectAt: T + 32000, lastAnswered: T + 32000, correctDays: ["2026-10-10", "2026-10-15", day] },   // 3日目が急いだ回
    [D]: { correct: 1, wrong: 0, box: 1, lastCorrectAt: T + 2 * DAY, lastAnswered: T + 2 * DAY, correctDays: [ymd(T + 2 * DAY)] },   // 対戦で〇
    [E]: { correct: 1, wrong: 0, box: 1, lastCorrectAt: T + 3 * DAY, lastAnswered: T + 3 * DAY, correctDays: [ymd(T + 3 * DAY)] },   // ゆっくりの回で〇
    [F]: { correct: 2, wrong: 0, box: 2, lastCorrectAt: T + 3 * DAY + 5000, lastAnswered: T + 3 * DAY + 5000, correctDays: [day, ymd(T + 3 * DAY)] },   // 急いだ回〇→ゆっくり〇
    [G]: { correct: 0, wrong: 2, box: 0, lastAnswered: T + 4 * DAY },                                                  // やり直しの回
    [H]: { correct: 1, wrong: 1, box: 1, lastCorrectAt: T + 34000, lastAnswered: T + 34000, correctDays: [day] }       // 急いだ回で✕→〇
  };
  const ses = (id, k, t, q, extra) => Object.assign({ id: id, k: k, role: "", m: "一問一答", subj: "社会", u: [], retry: false, plan: q.length, st: t, la: t + 74000, en: t + 74000, act: 74000, seg: 0, res: 0, quit: false, done: true, q: q, shownIds: [], cur: null }, extra || {});
  const list = [
    ses("sH", "solo", T, [[A, 0.6, "o"], [B, 0.8, "x"], [C, 0.5, "o"], [F, 1.4, "o"], [H, 0.6, "x"], [H, 0.7, "o"], [B, 3.0, "o", 1]]),
    ses("sB", "battle", T + 2 * DAY, [[D, 0.5, "o"], [D, 0.6, "o"], [D, 0.4, "o"]], { role: "host" }),
    ses("sS", "solo", T + 3 * DAY, [[E, 2.5, "o"], [F, 3.0, "o"], [E, 1.0, "o", 1]]),
    ses("sR", "solo", T + 4 * DAY, [[G, 0.5, "o"], [G, 0.4, "o"]], { retry: true })
  ];
  await page.evaluate(st => localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st)), st);
  await putSessions(page, list);
  const before = {}; ids.forEach(id => before[id] = tierOf(st[id]));
  await boot(page);
  await page.waitForFunction(() => localStorage.getItem("kq_battle_hurried_v1") !== null, null, { timeout: 10000 }).catch(() => {});
  const r = await readAll(page);
  const s = r.stats, hz = Object.fromEntries(r.sessions.map(x => [x.id, x.hz === undefined ? null : x.hz]));
  console.log("① 急いだ回の〇は数えない（起動したとき、前の回にも効く）");
  check("A: はじめての〇 → まだ", tierOf(s[A]), 0);
  check("A: 正解数0・正解日なし・最後に正解した日なし・連続0", [s[A].correct, s[A].correctDays, s[A].lastCorrectAt === undefined, s[A].box], [0, [], true, 0]);
  check("C: 定着だった", before[C], 2);
  check("C: おぼえかけに戻る・正解日は2日・連続2", [tierOf(s[C]), s[C].correctDays, s[C].box], [3, ["2026-10-10", "2026-10-15"], 2]);
  check("C: 最後に正解した日は、残った正解日（10/15）に戻る", new Date(s[C].lastCorrectAt).getDate(), 15);
  check("F: あとのふつうの回の〇は数える（正解1・日1つ・連続1・おぼえかけ）", [s[F].correct, s[F].correctDays.length, s[F].box, tierOf(s[F])], [1, 1, 1, 3]);
  console.log("② ✕は数える");
  check("B: ✕はそのまま（まちがい1・正解0）", [s[B].wrong, s[B].correct, tierOf(s[B])], [1, 0, 0]);
  check("H: ✕のあとの〇を外す → まちがい1・正解0・連続0・まだ", [s[H].wrong, s[H].correct, s[H].box, tierOf(s[H])], [1, 0, 0, 0]);
  console.log("③ 対戦・やり直しは対象外 ④ 中央値2秒以上は今までどおり");
  check("D（対戦）: 変わらない", s[D], st[D]);
  check("E（ゆっくり）: 変わらない", s[E], st[E]);
  check("G（やり直し）: 変わらない", s[G], st[G]);
  console.log("⑤ 印 ⑥ 記録は消さない");
  check("急いだ回だけに印（中央値）", [hz.sH > 0 && hz.sH < 2, hz.sB, hz.sS, hz.sR], [true, null, null, null]);
  check("学習ログの1問ごとの記録はそのまま", r.sessions.find(x => x.id === "sH").q, list[0].q);
  check("外す前と後を残す（kq_battle_hurried_v1）", r.audit && r.audit.sH ? Object.keys(r.audit.sH.cards).sort() : null, [A, C, F, H].sort());
  const dl = page.waitForEvent("download");
  await page.evaluate(() => document.getElementById("export-studylog-link").click());
  const csv = fs.readFileSync(await (await dl).path(), "utf8").replace(/^﻿/, "").split(/\r\n/).map(l => l.split(","));
  const ci = csv[0].indexOf("急いだ回");
  check("書き出しの「急いだ回」欄（急いだ回だけ はい）", csv.slice(1).map(l => [l[0], l[ci]]), [["sH", "はい"], ["sB", ""], ["sS", ""], ["sR", ""]]);
  await page.evaluate(() => localStorage.removeItem("kq_battle_hurried_v1"));
  await boot(page);
  const r2 = await readAll(page);
  check("起動し直しても、もう一度は外さない", [r2.stats[C].box, r2.stats[C].correctDays.length, r2.audit], [2, 2, null]);
  await ctx.close();
}

// ---- ⑦ 本物の画面で（今日やることの行から一人で）。はやい回とゆっくりの回は別の端末（別の入れ物）で ----
async function playFresh(pick, waitMs){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await newPage(ctx);
  await boot(page);
  const ids = pick(await plainIds(page));
  const SET = { no: 11, label: "検査用", items: [{ subj: "社会", title: "検査", ids: ids, count: ids.length }] };
  await page.evaluate(set => { localStorage.setItem("kq_battle_plan_index_v2", JSON.stringify([11])); localStorage.setItem("kq_battle_plan_sets_v2", JSON.stringify({ 11: set })); }, SET);
  await boot(page);
  await page.waitForSelector(".plan-kid-row", { timeout: 60000 });
  await page.locator(".plan-kid-row .plan-kid-btn[data-kind=solo]").first().click();
  await page.waitForTimeout(300);
  for(let n = 0; n < 20; n++){
    if(!(await page.isVisible("#solo-reveal-btn"))) break;
    if(waitMs) await page.waitForTimeout(waitMs);
    await page.click("#solo-reveal-btn");
    await page.click("#solo-judge-ok");
    await page.waitForTimeout(80);
  }
  await page.waitForSelector("#screen-solo-result.active", { timeout: 5000 });
  await page.waitForTimeout(300);
  const score = (await page.textContent("#solo-result-score")).trim();
  const r = await readAll(page);
  await ctx.close();
  const last = r.sessions.sort((x, y) => x.st - y.st)[r.sessions.length - 1];
  return { ids, score, r, last };
}
{
  console.log("⑦ 本物の画面で一人の一問一答");
  const f = await playFresh(a => a.slice(10, 13), 0);
  console.log("   はやい回: " + JSON.stringify({ secs: f.last.q.map(e => e[1]), hz: f.last.hz }));
  check("すばやく〇を押して結果の画面へ（子どもの画面は 3 / 3 のまま）", f.score, "3 / 3");
  check("急いだ回の〇は数えない（3問とも まだ・正解0）", f.ids.map(id => [tierOf(f.r.stats[id]), f.r.stats[id] && f.r.stats[id].correct]), [[0, 0], [0, 0], [0, 0]]);
  check("学習ログには3問とも〇で残る・印", [f.last.q.map(e => e[2]), typeof f.last.hz], [["o", "o", "o"], "number"]);
  const sl = await playFresh(a => a.slice(13, 16), 2300);
  console.log("   ゆっくりの回: " + JSON.stringify({ secs: sl.last.q.map(e => e[1]), hz: sl.last.hz }));
  check("ゆっくり（2.3秒ずつ）〇を押して結果の画面へ", sl.score, "3 / 3");
  check("ゆっくりの回の〇は今までどおり数える（おぼえかけ・正解1・印なし）", [sl.ids.map(id => [tierOf(sl.r.stats[id]), sl.r.stats[id] && sl.r.stats[id].correct]), sl.last.hz], [[[3, 1], [3, 1], [3, 1]], undefined]);
}

check("ページのエラーなし", errors, []);
await browser.close();
server.close();
console.log(`\n${pass} 件OK / ${fail} 件NG`);
process.exit(fail ? 1 : 0);
