// 学習ログ（1回に何分かかったか）と、大問の記録の書き出し（2026-10-05・ユーザー「一回に何分かかったかも、分析指標に入れられるように直してください」）
// 本物の Chrome・390x844・まねごとの待ち合わせ先。使い方: node tools/mikaku/study_log_probe.mjs
// 見ること:
//   E1 ★今の「正解・不正解の記録」CSV は、直す前とバイトまで同じ（列・形を変えていない。機種変更の読み込みが頼っている）
//   L1 一人: 〇・スキップ・✕・出し直しの〇 → 学習ログCSVに1行。出した3・答えた2・正解1・まちがい1・スキップ1・出し直し1・平均秒/最長秒が入る
//   L2 一人: 1問ごとのCSVに4行（〇／スキップ／✕／〇＋出し直し）・考えた秒が入る
//   L3 一人: とちゅうでやめる → 「途中でやめた=はい」で残る → 続きから再開 → 同じ1回に戻る（再開1回・途中でやめた=いいえ）・やめていた間は考えた秒に入らない
//   B1 二人: ホストとゲストそれぞれの端末に「対戦」の1行（自分の役・答えた2・正解2・平均秒）
//   K1 ★学習ログは IndexedDB に入る（localStorage には書かない）。★400日前・130日前の回も消えない・1問ごとの秒も残る（ユーザー「一年後に消えてしまうのは困ります」）。書き出しで全部出る
//   K2 閉じられた回は、最後に答えた時刻でしめる
//   K3 ★学習ログ以外の localStorage は1文字も変わらない
//   M1 前の版（公開前）が localStorage に置いた kq_battle_study_log_v1 は IndexedDB に写る（元は消さない）
//   C1 ★「正誤の記録をぜんぶクリア」→ 記録のCSVを取り込み、をしても学習ログは何も変わらない（消えない・二重にならない）
//   I1 学習ログのCSVの取り込み（端末の引越し）: 1問ごと→学習ログの順で取り込むと元どおり／もう一度取り込んでも二重にならない／その端末に前からある回は消えない
//   W1 書き込みに失敗しても消さない・ホームに「記録の書き出しをしてください」・書き出しにはその回が入る
//   D1 大問ごとの記録CSV: 大問の数だけ行があり、小問の記録をまとめた数が合う
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import os from "node:os";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "studylog-"));
const BASE_COMMIT = "5763b75";   // 直す前（学習ログの前）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "studylog" });
let SERVED = CURRENT;
function withFakeRelay(s) { const i0 = s.indexOf("const RELAY_URLS = ["), i1 = s.indexOf("];", i0); return s.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + s.slice(i1); }
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(withFakeRelay(SERVED), "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
const U = "第6回.鎌倉時代";
const OLD_KEY = "kq_battle_study_log_v1";
// 答えるのは ids だけ（社会 第6回のほかの一問一答と大問は全部おぼえ済み）。大問の小問の1つだけ ✕ の記録を入れる（D1 用）
const SEED = (arg) => {
  const [mig, ids, o] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }, st = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.kind !== "daimon" && !ids.includes(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { st[it.id] = Object.assign({}, known); }));
  const firstDaimon = QA_DATA.find(d => d.kind === "daimon");
  if (firstDaimon) st[firstDaimon.itemIds[0]] = { correct: 3, wrong: 4, box: 0, lastCorrectAt: now - 9e8, lastAnswered: now - 5e8 };
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify(Object.assign({ subject: "社会", unitsBySubject: { "社会": [o.unit] }, units: [o.unit], count: ids.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }, o.extra || {})));
};
// IndexedDB の中身を読む（無い・形がちがうときは null）
const READ_IDB = () => new Promise(res => {
  const rq = indexedDB.open("kq_battle_study_log");
  rq.onerror = () => res(null);
  rq.onsuccess = () => {
    const db = rq.result;
    if (!db.objectStoreNames.contains("sessions")) { db.close(); res(null); return; }
    const tx = db.transaction(["sessions", "meta"], "readonly"), out = {};
    tx.objectStore("sessions").getAll().onsuccess = e => { out.sessions = e.target.result; };
    tx.objectStore("meta").get("cur").onsuccess = e => { out.cur = e.target.result || {}; };
    tx.oncomplete = () => { db.close(); res(out); };
    tx.onerror = () => { db.close(); res(null); };
  };
});
// IndexedDB に回を入れる（アプリが作った入れ物に）
const PUT_IDB = (arg) => new Promise(res => {
  const [list, cur] = arg;
  const rq = indexedDB.open("kq_battle_study_log");
  rq.onerror = () => res(false);
  rq.onsuccess = () => {
    const db = rq.result;
    if (!db.objectStoreNames.contains("sessions")) { db.close(); res(false); return; }
    const tx = db.transaction(["sessions", "meta"], "readwrite");
    list.forEach(s => tx.objectStore("sessions").put(s));
    if (cur) tx.objectStore("meta").put(cur, "cur");
    tx.oncomplete = () => { db.close(); res(true); };
    tx.onerror = () => { db.close(); res(false); };
  };
});
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\r") {} else if (c === "\n") { row.push(f); f = ""; rows.push(row); row = []; } else f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const asObjs = rows => rows.slice(1).map(r => Object.fromEntries(rows[0].map((h, i) => [h, r[i]])));
async function run(label, src) {
  SERVED = src; const out = [], keep = {}, ctxs = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); ctxs.push(ctx); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = (pg, p) => pg.$eval("#" + p + "-q-id", e => e.textContent.replace(/^No\./, ""));
  const grab = async (pg, sel) => { const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 5000 }), tap(pg, sel)]); return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), "utf8") }; };
  const grabRows = async (pg, sel) => { try { return asObjs(parseCSV((await grab(pg, sel)).text)); } catch (e) { return null; } };
  const onSolo = pg => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const idb = pg => pg.evaluate(READ_IDB);
  const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const answerAll = async (pg, n) => { for (let k = 0; k < n && (await onSolo(pg)); k++) { await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250); } };
  const fresh = async (ids) => { const d = await mk(); await d.page.evaluate(SEED, [MIG, ids, { unit: U }]); await d.page.reload(); await d.page.waitForTimeout(800); return d; };
  const all = [];
  try {
    // ===== E1・L1・L2（端末A） =====
    const A = await fresh(["g6r1", "g6r2", "g6r3"]); all.push(A); const pg = A.page;
    keep.oldCsv = (await grab(pg, "#export-link")).text;
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(300);
    const seq = [];
    seq.push(await qid(pg, "solo")); await pg.waitForTimeout(1200); await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250);
    seq.push(await qid(pg, "solo")); await pg.waitForTimeout(300); await tap(pg, "#solo-skip-btn"); await pg.waitForTimeout(200); await tap(pg, "#solo-skip-next-btn"); await pg.waitForTimeout(250);
    seq.push(await qid(pg, "solo")); await pg.waitForTimeout(2200); await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ng"); await pg.waitForTimeout(250);
    seq.push(await qid(pg, "solo")); await pg.waitForTimeout(300); await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(300);
    // ★2026-10-06 正解するまでぐるぐる: ✕の g6r3 がもう一度出る（〇で終わる）
    for (let k = 0; k < 3 && (await onSolo(pg)); k++) { seq.push(await qid(pg, "solo")); await pg.waitForTimeout(300); await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(300); }
    const finished = !(await onSolo(pg));
    let log = null;
    try { log = await grab(pg, "#export-studylog-link"); } catch (e) { log = null; }
    const sess = log ? asObjs(parseCSV(log.text)) : [];
    const s1 = sess[0] || {};
    check("L1 一人の1回が学習ログCSVに1行（" + seq.join(" ") + "）", finished && log && /^社会一問一答_学習ログ_\d{8}\.csv$/.test(log.name) && log.text.charCodeAt(0) === 0xFEFF && sess.length === 1
      && /^s\d+/.test(s1["回のID"] || "") && s1["一人・対戦"] === "一人" && s1["形式"] === "一問一答" && s1["教科"] === "社会" && s1["単元"] === U && s1["やり直し"] === "いいえ"
      && s1["予定の問題数"] === "3" && s1["出した問題数"] === "3" && s1["答えた数"] === "2" && s1["正解数"] === "1" && s1["まちがい数"] === "1"
      && s1["スキップ数"] === "1" && s1["時間切れ数"] === "0" && s1["出し直しで答えた数"] === "2" && s1["何周"] === "2" && s1["途中でやめた"] === "いいえ" && s1["再開した回数"] === "0",
      JSON.stringify(s1));
    const avg = +s1["1問の平均秒"], mx = +s1["1問の最長秒"], allMin = +s1["全体の分"], act = +s1["解いていた分"];
    check("L1 平均秒・最長秒・分が入る（〇1.2秒くらい・✕2.2秒くらい → 平均1.5〜2.6・最長2.1〜3.5）", avg >= 1.5 && avg <= 2.6 && mx >= 2.1 && mx <= 3.5 && allMin > 0 && act > 0 && act <= allMin + 0.05
      && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s1["開始日時"] || "") && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s1["終了日時"] || ""), JSON.stringify({ avg, mx, allMin, act }));
    let det = null;
    try { det = await grab(pg, "#export-studylog-detail-link"); } catch (e) { det = null; }
    const drows = det ? asObjs(parseCSV(det.text)) : [];
    check("L2 1問ごとのCSV: 〇／スキップ／✕／〇（出し直し）／〇（✕の出し直し・正解するまで）・考えた秒・何回目", det && /^社会一問一答_学習ログ_1問ごと_\d{8}\.csv$/.test(det.name) && drows.length === 5
      && drows.every(r => r["回のID"] === s1["回のID"])
      && drows.map(r => r["結果"]).join(",") === "〇,スキップ,✕,〇,〇" && drows.map(r => r["出し直し"]).join(",") === ",,,はい,はい" && drows.map(r => r["何回目"]).join(",") === "1,1,1,2,2"
      && drows.map(r => r["ID"]).join(" ") === seq.join(" ") && +drows[0]["考えた秒"] >= 1.1 && +drows[2]["考えた秒"] >= 2.1 && drows[0]["問題"].length > 0,
      JSON.stringify(drows.map(r => [r["ID"], r["結果"], r["考えた秒"], r["出し直し"]])));
    const logFile = path.join(TMP, label + "_log.csv"), detFile = path.join(TMP, label + "_det.csv"), recFile = path.join(TMP, label + "_rec.csv");
    if (log) fs.writeFileSync(logFile, log.text); if (det) fs.writeFileSync(detFile, det.text); fs.writeFileSync(recFile, keep.oldCsv);
    // ===== K1（入れ物の場所） =====
    const a1 = await idb(pg);
    const lsHas = await pg.evaluate(k => localStorage.getItem(k) !== null, OLD_KEY);
    check("K1 学習ログは IndexedDB に入る（localStorage には書かない）", a1 && a1.sessions.length === 1 && a1.sessions[0].q.length === 5 && !lsHas, JSON.stringify({ n: a1 && a1.sessions.length, lsHas }));
    // ===== C1 正誤の記録をぜんぶクリア → 記録のCSVを取り込み =====
    const c0 = JSON.stringify(a1 && a1.sessions);
    await tap(pg, "#stat-clear-link"); await pg.waitForTimeout(400);
    await pg.setInputFiles("#import-file", recFile); await pg.waitForTimeout(1200);
    await pg.reload(); await pg.waitForTimeout(1000);
    const c1 = await idb(pg), c1rows = await grabRows(pg, "#export-studylog-link");
    const statsBack = await pg.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}")).length);
    check("C1 ★正誤の記録をぜんぶクリア→記録のCSVを取り込み、をしても学習ログは何も変わらない（消えない・二重にならない）", c1 && JSON.stringify(c1.sessions) === c0 && c1rows && c1rows.length === 1 && statsBack > 0,
      JSON.stringify({ n: c1 && c1.sessions.length, rows: c1rows && c1rows.length, statsBack }));
    // ===== W1 書き込みに失敗 =====
    const warn0 = await vis(pg, "#studylog-save-warn");
    await pg.evaluate(SEED, [MIG, ["g6r1", "g6r2"], { unit: U }]); await pg.reload(); await pg.waitForTimeout(800);
    await pg.evaluate(() => { IDBObjectStore.prototype.put = function () { throw new DOMException("いっぱい", "QuotaExceededError"); }; });
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(300); await answerAll(pg, 4);
    await tap(pg, "#solo-result-home-btn").catch(() => {}); await pg.waitForTimeout(300);   // ホームで見る
    const warn1 = await vis(pg, "#studylog-save-warn");
    const w1rows = await grabRows(pg, "#export-studylog-link");
    check("W1 書き込みに失敗しても消さない・ホームに「記録の書き出しをしてください」・書き出しにはその回も入る", !warn0 && warn1 && w1rows && w1rows.length === 2 && w1rows[1]["答えた数"] === "2",
      JSON.stringify({ warn0, warn1, rows: w1rows && w1rows.length }));
    // ===== L3・D1（端末B） =====
    const B = await fresh(["g6r1", "g6r2", "g6r3"]); all.push(B); const pb = B.page;
    await tap(pb, "#solo-start-btn"); await pb.waitForTimeout(300);
    await tap(pb, "#solo-reveal-btn"); await pb.waitForTimeout(100); await tap(pb, "#solo-judge-ok"); await pb.waitForTimeout(250);
    await tap(pb, "#solo-back"); await pb.waitForTimeout(500);   // confirm は自動で OK
    const mid = await idb(pb);
    const m0 = mid && mid.sessions && mid.sessions[0];
    const midOk = !!(m0 && m0.quit === true && !m0.done && m0.en > 0 && m0.q.length === 1);
    await pb.waitForTimeout(1500);   // やめていた間（考えた秒に入れてはいけない）
    await pb.reload(); await pb.waitForTimeout(800);
    await tap(pb, "#resume-solo-btn").catch(() => {}); await pb.waitForTimeout(400);
    await answerAll(pb, 6);
    const l3 = await grabRows(pb, "#export-studylog-link");
    check("L3 とちゅうでやめる→「途中でやめた」で残る→再開→同じ1回に戻る（再開1回・答えた3・途中でやめた=いいえ・やめていた間は考えた秒に入らない）", midOk && l3 && l3.length === 1 && l3[0]["再開した回数"] === "1" && l3[0]["答えた数"] === "3" && l3[0]["途中でやめた"] === "いいえ" && +l3[0]["1問の最長秒"] < 1.5,
      JSON.stringify({ midOk, l3 }));
    let dm = null; try { dm = await grab(pb, "#export-daimon-link"); } catch (e) { dm = null; }
    const expect = await pb.evaluate(() => { const g = QA_DATA.filter(d => d.kind === "daimon"); const f = g[0]; return { n: g.length, id: f && f.id, items: f && f.itemIds.length }; });
    const drs = dm ? asObjs(parseCSV(dm.text)) : [];
    const f = drs.find(r => r["大問ID"] === expect.id) || {};
    check("D1 大問ごとの記録CSV: 大問の数（" + expect.n + "）だけ行・1つ目の大問の小問の数と、✕4回の小問が入っている", dm && /^社会一問一答_大問の記録_\d{8}\.csv$/.test(dm.name) && drs.length === expect.n && expect.n > 0
      && f["小問の数"] === String(expect.items) && f["まちがえた回数"] === "4" && f["苦手な小問"] === "1" && f["大問の状態"] === "苦手な問題", JSON.stringify(f));
    // ===== K1〜K3・M1（端末C） =====
    const C = await mk(); all.push(C); const pc = C.page;
    await pc.evaluate(SEED, [MIG, ["g6r1"], { unit: U }]);
    await pc.evaluate(k => { const now = Date.now(); localStorage.setItem(k, JSON.stringify({ v: 1, monthly: {}, cur: {}, sessions: [
      { id: "legacy", k: "solo", m: "一問一答", subj: "社会", u: ["x"], plan: 1, st: now - 2 * 864e5, la: now - 2 * 864e5, en: now - 2 * 864e5 + 6e4, act: 6e4, seg: 0, res: 0, quit: false, done: true, q: [["g6r1", 4, "o"]], shownIds: [] }] })); }, OLD_KEY);
    await pc.reload(); await pc.waitForTimeout(1000);
    await pc.reload(); await pc.waitForTimeout(1000);   // 起動時の移しかえなどを先に済ませる
    const snap = () => pc.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); o[key] = localStorage.getItem(key); } return o; });
    const before = await snap();
    const m1 = await idb(pc);
    check("M1 前の版の localStorage の学習ログは IndexedDB に写る（元は消さない）", m1 && m1.sessions.some(s => s.id === "legacy" && s.q.length === 1) && before[OLD_KEY], JSON.stringify(m1 && m1.sessions.map(s => s.id)));
    const D = 864e5, now = Date.now();
    const qq = (n, r) => Array.from({ length: n }, (_, i) => ["g6r" + (i + 1), 3, r]);
    await pc.evaluate(PUT_IDB, [[
      { id: "old", k: "solo", m: "一問一答", subj: "社会", u: ["x"], plan: 2, st: now - 400 * D, la: now - 400 * D + 6e5, en: now - 400 * D + 6e5, act: 6e5, seg: 0, res: 0, quit: false, done: true, q: qq(2, "o"), shownIds: [] },
      { id: "mid", k: "battle", role: "host", m: "一問一答", subj: "社会", u: ["x"], plan: 3, st: now - 130 * D, la: now - 130 * D, en: now - 130 * D + 3e5, act: 3e5, seg: 0, res: 0, quit: false, done: true, q: qq(3, "x"), shownIds: [] },
      { id: "open", k: "solo", m: "一問一答", subj: "社会", u: ["x"], plan: 5, st: now - 36e5, la: now - 30e5, en: 0, act: 0, seg: now - 36e5, res: 0, quit: false, done: false, q: qq(1, "o"), shownIds: [] }
    ], { solo: "open" }]);
    await pc.reload(); await pc.waitForTimeout(1200);
    const after = await snap();
    const k1 = await idb(pc);
    const get = id => k1 && k1.sessions.find(s => s.id === id);
    const rowsC = await grabRows(pc, "#export-studylog-link"), detC = await grabRows(pc, "#export-studylog-detail-link");
    check("K1 ★400日前・130日前の回も消えない・1問ごとの秒も残る・書き出しで全部出る（学習ログ4回・1問ごと7行）",
      get("old") && get("old").q.length === 2 && get("mid") && get("mid").q.length === 3 && rowsC && rowsC.length === 4 && detC && detC.length === 7
      && rowsC.some(r => r["回のID"] === "old" && r["答えた数"] === "2") && rowsC.some(r => r["回のID"] === "mid" && r["まちがい数"] === "3"),
      JSON.stringify({ ids: k1 && k1.sessions.map(s => s.id), rows: rowsC && rowsC.length, det: detC && detC.length }));
    const op = get("open");
    check("K2 閉じられた回は、最後に答えた時刻でしめる（10分・途中でやめた）", op && op.quit === true && !op.done && op.seg === 0 && Math.abs(op.act - 6e5) < 2000 && op.en === op.la, JSON.stringify(op && { quit: op.quit, act: op.act }));
    const changed = Object.keys(Object.assign({}, before, after)).filter(k => before[k] !== after[k]);
    check("K3 ★学習ログ以外の localStorage は1文字も変わらない（" + Object.keys(before).length + "個）", changed.length === 0 && Object.keys(before).length >= 4, changed.join(","));
    // ===== I1 学習ログの取り込み（端末D: 自分の回が1つある端末に、端末Aの分を引越し） =====
    const Dv = await fresh(["g6r1"]); all.push(Dv); const pd = Dv.page;
    await tap(pd, "#solo-start-btn"); await pd.waitForTimeout(300); await answerAll(pd, 2);
    const own = await idb(pd), ownId = own && own.sessions[0] && own.sessions[0].id;
    await pd.setInputFiles("#import-studylog-file", detFile); await pd.waitForTimeout(800);
    const i0 = await idb(pd);
    await pd.setInputFiles("#import-studylog-file", logFile); await pd.waitForTimeout(800);
    await pd.setInputFiles("#import-studylog-file", detFile); await pd.waitForTimeout(600);   // もう一度（二重にならない）
    await pd.setInputFiles("#import-studylog-file", logFile); await pd.waitForTimeout(600);
    await pd.reload(); await pd.waitForTimeout(1000);
    const i1 = await idb(pd);
    const imp = i1 && i1.sessions.find(s => s.id === s1["回のID"]);
    const irows = await grabRows(pd, "#export-studylog-link"), idet = await grabRows(pd, "#export-studylog-detail-link");
    const ir = irows && irows.find(r => r["回のID"] === s1["回のID"]);
    const same = ir && ["開始日時", "終了日時", "解いていた分", "一人・対戦", "形式", "単元", "出した問題数", "答えた数", "正解数", "まちがい数", "スキップ数", "出し直しで答えた数", "途中でやめた", "1問の平均秒", "1問の最長秒"].every(h => ir[h] === s1[h]);
    check("I1 学習ログの取り込み: 1問ごと→学習ログの順で元どおり（同じ数・同じ秒）／もう一度取り込んでも二重にならない／前からある回は消えない",
      ownId && i0 && i0.sessions.length === 2 && i1 && i1.sessions.length === 2 && i1.sessions.some(s => s.id === ownId) && imp && imp.q.length === 5 && same
      && idet && idet.filter(r => r["回のID"] === s1["回のID"]).length === 5,
      JSON.stringify({ n0: i0 && i0.sessions.length, n1: i1 && i1.sessions.length, same, ir }));
    // ===== B1 二人 =====
    const host = await fresh(["g6r1", "g6r2"]), guest = await fresh(["g6r1", "g6r2"]); all.push(host, guest);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    for (let k = 0; k < 2; k++) {
      await waitVis(host.page, "#advance-btn", 30000);
      const id = await qid(host.page, "battle");
      await tap(host.page, "#advance-btn");
      await guest.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 });
      await host.page.waitForTimeout(1000);
      // ★2026-10-08 二人のときのホストの答えはゲストの〇✕で開く（ホストの「こたえを見る」は無い）
      await tap(guest.page, "#answer-reveal-btn");
      await waitVis(guest.page, "#judge-row", 15000); await tap(guest.page, "#judge-ok");
      await waitVis(host.page, "#judge-row", 15000); await tap(host.page, "#judge-ok");
      await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
      await tap(host.page, "#next-btn");
    }
    await host.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 20000 });
    await guest.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 20000 });
    const hb = await grabRows(host.page, "#export-studylog-link"), gb = await grabRows(guest.page, "#export-studylog-link");
    const ok1 = r => r && r.length === 1 && r[0]["一人・対戦"] === "対戦" && r[0]["答えた数"] === "2" && r[0]["正解数"] === "2" && r[0]["出した問題数"] === "2" && r[0]["途中でやめた"] === "いいえ" && +r[0]["1問の平均秒"] >= 0.8;
    check("B1 二人: ホストとゲストの端末それぞれに対戦の1行（ホスト／ゲスト・答えた2・正解2・平均秒）", ok1(hb) && ok1(gb) && hb[0]["自分の役"] === "ホスト" && gb[0]["自分の役"] === "ゲスト", JSON.stringify({ hb, gb }));
    const errs = all.flatMap(d => d.errs);
    check("画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { for (const c of ctxs) await c.close().catch(() => {}); }
  return { out, keep };
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const B = await run("base", BASELINE);
const ngB = report("対照 " + BASE_COMMIT, B.out);
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const N = await run("now", CURRENT);
// ★2026-10-07 ロング編（単元「ロング編.…」の大問）を取り込んだので、記録CSVにはその小問の行が増える。
//   直す前の index.html はロング編を読めない（単元が無い）ので、比べるときはロング編の行を両方から除く（列・形・ほかの行は今までどおり比べる）
const noLong = t => t == null ? t : t.split("\r\n").filter(l => !/^[^,]*,"?ロング編\./.test(l)).join("\r\n");
const HEADER = "ID,単元,問題,こたえ,正解した回数,まちがえた回数,状態,最終正答日,最終回答日,連続正解数";
N.out.unshift({ n: "E1 ★今の記録CSVは直す前とバイトまで同じ（見出し " + HEADER + "）", ok: !!(B.keep.oldCsv && N.keep.oldCsv && noLong(B.keep.oldCsv) === noLong(N.keep.oldCsv) && N.keep.oldCsv.replace(/^\uFEFF/, "").split("\r\n")[0] === HEADER),
  x: (N.keep.oldCsv || "").split("\r\n").length + "行" });
const ng = report("いまの index.html", N.out);
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
