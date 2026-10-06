// 答えが2つ以上の一問一答を「はじめは分けて・覚えたらまとめて」（2026-10-06）
// 依頼書: 司令塔\回答\対戦_答えが複数のカードを分けて→まとめて_依頼_2026-10-06.md
// 本物の Chrome・390x844・まねごとの待ち合わせ先。使い方: node tools/mikaku/multi_part_probe.mjs
//   スクショは tools/mikaku/shots_multipart/（コミットしない）
// 見ること:
//   P0 分け方: r6m51 は（ア）〜（エ）の4つに分かれる・r6m52（記号をすべて選ぶ問題）は分けない
//   P1 一人・はじめは分けて: r6m36 が ①→②→③ の3手で出る・「分けて 1/3」・答えは部分だけ・前の部分は答えつき（たたんだ行）・図とヒントも出る
//      ・カードの記録（kq_battle_stats_v1）は付かない・部分の記録（kq_battle_parts_v1）に付く
//   P2 全部の部分が2回続けて○ → 次は1枚で「まとめて」・○✕はカードの記録に付く
//   P3 まとめてで✕ → 次は分けてに戻る（3つ全部）
//   P4 分けてのスキップ: 答えを見せて部分に✕・あとでもう一度出る（出し直しは記録しない）・カードの記録は付かない
//   P5 分けての「ひとつ前の判定をやり直す」: 部分の記録が前に戻る
//   P6 学習ログ（1問ごとのCSV）に「分けて」「まとめて」の列
//   P7 記録のCSV（正解・不正解）の見出しと行の数が直す前と同じ（部分の行を足さない）
//   P8 「正誤の記録をぜんぶクリア」で部分の記録は消さない（クリア→直した記録CSVの取り込み、で記録を直す使い方のため）
//   P9 部分の記録の書き出し・取り込み（引越し用）: 移る・同じ id は新しいほう・二重にならない
//   P10 数え方（ユーザー回答 B）: 分けて出すカードは部分1つ＝1問。15問を選ぶと答える回数が15
//   B1 二人: ホストが分けてで出すとゲストにも同じ部分が出る・「分けて」・両方の部分の記録に付く・カードの記録は付かない
//   B2 二人: 分けての時間切れ: 記録しない・あとでもう一度
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_multipart"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "db96466";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "multipart" });
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
const U = "第6回.ヒトと動物の呼吸・循環";
// 答えるのは ids だけ（理科のほかの一問一答と大問の小問は全部おぼえ済み）
const SEED = (arg) => {
  const [mig, ids, o] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }, st = {};
  QA_DATA.forEach(d => { if (d.subj === "理科" && d.kind !== "daimon" && !ids.includes(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { st[it.id] = Object.assign({}, known); }));
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify(Object.assign({ subject: "理科", unitsBySubject: { "理科": [o.unit] }, units: [o.unit], count: "all", shuffle: false, tiers: [0, 1],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }, o.extra || {})));
};
const READ_IDB = () => new Promise(res => {
  const rq = indexedDB.open("kq_battle_study_log");
  rq.onerror = () => res(null);
  rq.onsuccess = () => {
    const db = rq.result;
    if (!db.objectStoreNames.contains("sessions")) { db.close(); res(null); return; }
    const tx = db.transaction(["sessions"], "readonly"), out = {};
    tx.objectStore("sessions").getAll().onsuccess = e => { out.sessions = e.target.result; };
    tx.oncomplete = () => { db.close(); res(out); };
    tx.onerror = () => { db.close(); res(null); };
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
const recCsv = {};
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = (pg, p) => pg.$eval("#" + p + "-q-id", e => e.textContent.replace(/^No\./, ""));
  const txt = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : ""; }, sel);
  const statOf = (pg, id) => pg.evaluate(i => (JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"))[i] || null, id);
  const partOf = (pg, id) => pg.evaluate(i => (JSON.parse(localStorage.getItem("kq_battle_parts_v1") || "{}"))[i] || null, id);
  const onSolo = pg => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const grab = async (pg, sel) => { const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 5000 }), tap(pg, sel)]); return fs.readFileSync(await dl.path(), "utf8"); };
  const ok = async pg => { await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250); };
  const start = async pg => { await pg.evaluate(() => { if (document.getElementById("screen-home").classList.contains("active")) return; document.getElementById("solo-result-home-btn").click(); }).catch(() => {}); await pg.waitForTimeout(300); await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(300); };
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    const pg = solo.page;
    // ===== P0 分け方 =====
    await pg.evaluate(SEED, [MIG, ["r6m51", "r6m52"], { unit: U }]); await pg.reload(); await pg.waitForTimeout(800);
    await start(pg);
    const p0 = { id: await qid(pg, "solo"), cnt: await txt(pg, "#solo-counter"), lab: await txt(pg, "#solo-daimon .battle-daimon-cur") };
    const seq0 = [p0.id];
    for (let k = 0; k < 6 && (await onSolo(pg)); k++) { await ok(pg); if (await onSolo(pg)) seq0.push(await qid(pg, "solo")); }
    check("P0 r6m51 は（ア）〜（エ）の4つ・r6m52 は分けない（" + seq0.join(" ") + "）", p0.id === "r6m51~1" && /1 \/ 5/.test(p0.cnt) && /（ア）/.test(p0.lab) && seq0[4] === "r6m52", JSON.stringify(p0));
    // ===== P1 一人・はじめは分けて =====
    await pg.evaluate(SEED, [MIG, ["r6m36"], { unit: U }]); await pg.reload(); await pg.waitForTimeout(800);
    recCsv[label] = await grab(pg, "#export-link").catch(() => null);
    await start(pg);
    const p1a = { id: await qid(pg, "solo"), title: await txt(pg, "#solo-daimon .battle-daimon-title"), q: await txt(pg, "#solo-q"),
      img: await vis(pg, "#solo-img-wrap"), hint: await vis(pg, "#solo-hint-btn"), cnt: await txt(pg, "#solo-counter") };
    await shot(pg, "P1_part1");
    await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100);
    p1a.a = await txt(pg, "#solo-a");
    await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250);
    const p1b = { id: await qid(pg, "solo"), title: await txt(pg, "#solo-daimon .battle-daimon-title"), fold: await txt(pg, "#solo-daimon .daimon-fold") };
    await shot(pg, "P1_part2");
    await ok(pg); await ok(pg);
    const p1c = { done: !(await onSolo(pg)), card: await statOf(pg, "r6m36"), p1: await partOf(pg, "r6m36~1"), p3: await partOf(pg, "r6m36~3") };
    check("P1 はじめは分けて: ①が「分けて 1/3」で出る・問題の文はカードのまま・図とヒントあり・答えは部分だけ（上がる）",
      p1a.id === "r6m36~1" && /分けて 1\/3/.test(p1a.title) && /ろっ骨は（①）/.test(p1a.q) && p1a.img && p1a.hint && /1 \/ 3/.test(p1a.cnt) && p1a.a === "上がる", JSON.stringify(p1a));
    check("P1 ②では前の①が答えつきでたたんで出る", p1b.id === "r6m36~2" && /分けて 2\/3/.test(p1b.title) && /①\s*上がる/.test(p1b.fold), JSON.stringify(p1b));
    check("P1 カードの記録は付かない・部分の記録に付く", p1c.done && p1c.card === null && p1c.p1 && p1c.p1.correct === 1 && p1c.p3 && p1c.p3.correct === 1, JSON.stringify(p1c));
    // ===== P5 ひとつ前をやり直す ／ P4 スキップ =====
    await start(pg);
    await ok(pg);
    const before5 = await partOf(pg, "r6m36~1");
    await tap(pg, "#solo-undo-link"); await pg.waitForTimeout(250);
    const after5 = await partOf(pg, "r6m36~1"), id5 = await qid(pg, "solo");
    check("P5 ひとつ前の判定をやり直す: 部分の記録が前に戻る（○2 → ○1）", before5 && before5.correct === 2 && after5 && after5.correct === 1 && id5 === "r6m36~1", JSON.stringify({ before5, after5 }));
    await ok(pg); await ok(pg);   // ①②
    const id4 = await qid(pg, "solo");
    await tap(pg, "#solo-skip-btn"); await pg.waitForTimeout(250);
    const p4 = { id: id4, open: await pg.evaluate(() => document.getElementById("solo-a-block").classList.contains("show")), part: await partOf(pg, "r6m36~3") };
    await tap(pg, "#solo-skip-next-btn"); await pg.waitForTimeout(250);
    p4.again = await onSolo(pg) ? await qid(pg, "solo") : "";
    if (await onSolo(pg)) await ok(pg);
    p4.part2 = await partOf(pg, "r6m36~3"); p4.card = await statOf(pg, "r6m36");
    check("P4 分けてのスキップ: 答えを見せて部分に✕・あとでもう一度出る・出し直しは記録しない・カードの記録なし",
      id4 === "r6m36~3" && p4.open && p4.part && p4.part.wrong === 1 && p4.again === "r6m36~3" && p4.part2 && p4.part2.correct === 1 && p4.part2.wrong === 1 && p4.card === null, JSON.stringify(p4));
    // いま ①② は2回続けて○、③ は ○✕ → 次は③だけ
    await start(pg);
    const p2a = { id: await qid(pg, "solo"), cnt: await txt(pg, "#solo-counter"), title: await txt(pg, "#solo-daimon .battle-daimon-title") };
    await ok(pg);
    await start(pg); await ok(pg);   // ③ 2回目の○
    await start(pg);
    const p2 = { id: await qid(pg, "solo"), tag: await txt(pg, "#solo-daimon"), cnt: await txt(pg, "#solo-counter") };
    await shot(pg, "P2_together");
    await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100);
    p2.a = await txt(pg, "#solo-a");
    await tap(pg, "#solo-judge-ng"); await pg.waitForTimeout(250);
    p2.card = await statOf(pg, "r6m36");
    check("P2 2回続けて○でない部分だけを答える（" + p2a.id + "・" + p2a.cnt + "・" + p2a.title + "）", p2a.id === "r6m36~3" && /1 \/ 1/.test(p2a.cnt) && /分けて 3\/3/.test(p2a.title));
    check("P2 全部の部分が2回続けて○ → 1枚で「まとめて」・答えは全部・○✕はカードの記録に付く",
      p2.id === "r6m36" && /まとめて/.test(p2.tag) && /①上がる/.test(p2.a) && /③大きくなる/.test(p2.a) && p2.card && p2.card.wrong === 1, JSON.stringify(p2));
    await start(pg);
    const p3 = { id: await qid(pg, "solo"), cnt: await txt(pg, "#solo-counter") };
    check("P3 まとめてで✕ → 次は分けてに戻る（3つ全部）", p3.id === "r6m36~1" && /1 \/ 3/.test(p3.cnt), JSON.stringify(p3));
    await pg.evaluate(() => document.getElementById("solo-back").click()); await pg.waitForTimeout(300);
    // ===== P6 学習ログ =====
    let det = null; try { det = parseCSV(await grab(pg, "#export-studylog-detail-link")); } catch (e) { det = null; }
    const col = det ? det[0].indexOf("分けて・まとめて") : -1;
    const tags = det && col >= 0 ? det.slice(1).map(r => r[col]) : [];
    check("P6 学習ログ（1問ごと）に「分けて」「まとめて」が残る", col >= 0 && tags.includes("分けて") && tags.includes("まとめて"), det ? det[0].join(",") : "CSVなし");
    // ===== P8 「ぜんぶクリア」では部分の記録を消さない（ユーザーはクリア→直した記録CSVの取り込みで記録を直すため）=====
    const partsBefore = await pg.evaluate(() => localStorage.getItem("kq_battle_parts_v1"));
    await tap(pg, "#stat-clear-link").catch(() => {}); await pg.waitForTimeout(300);
    const p8 = { same: partsBefore !== null && partsBefore === await pg.evaluate(() => localStorage.getItem("kq_battle_parts_v1")),
      stats: await pg.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}")).length) };
    check("P8 「正誤の記録をぜんぶクリア」で正誤は消える・部分の記録は1文字も変わらない", p8.same && p8.stats === 0, JSON.stringify(p8));
    // ===== P9 部分の記録の書き出し → 別の端末で取り込み（同じ id は新しいほう・二重にしない）=====
    let pcsv = null; try { pcsv = await grab(pg, "#export-parts-link"); } catch (e) { pcsv = null; }
    const pA = JSON.parse(partsBefore || "{}");
    const B = await mk();
    try {
      const newer = { correct: 9, wrong: 0, box: 9, lastCorrectAt: Date.now() + 1e7, lastAnswered: Date.now() + 1e7, h: [[Date.now() + 1e7, 1]] };
      await B.page.evaluate(arg => { localStorage.setItem("kq_battle_parts_v1", JSON.stringify({ "r6m36~1": arg })); }, newer);
      await B.page.reload(); await B.page.waitForTimeout(800);
      const imp = async () => { await B.page.setInputFiles("#import-parts-file", { name: "parts.csv", mimeType: "text/csv", buffer: Buffer.from(pcsv || "", "utf8") }); await B.page.waitForTimeout(600); return B.page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_parts_v1") || "{}")); };
      const got1 = pcsv ? await imp() : {};
      const got2 = pcsv ? await imp() : {};
      // 中身で比べる（欄の並びの順は問わない）
      const norm = v => (v && typeof v === "object" && !Array.isArray(v)) ? Object.keys(v).sort().reduce((o, k) => (o[k] = norm(v[k]), o), {}) : (Array.isArray(v) ? v.map(norm) : v);
      const eq = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
      check("P9 書き出し→取り込み: 部分の記録が移る（~2・~3 は同じ・h も同じ）", !!pcsv && eq(got1["r6m36~2"], pA["r6m36~2"]) && eq(got1["r6m36~3"], pA["r6m36~3"]) && eq(got1["r6m51~1"], pA["r6m51~1"]), JSON.stringify(got1["r6m36~3"]));
      check("P9 同じ id は新しいほうを残す（取り込む側の ~1 が新しい → そのまま）・もう一度取り込んでも二重にならない", !!pcsv && eq(got1["r6m36~1"], newer) && eq(got1, got2), JSON.stringify(got1["r6m36~1"]));
      solo.errs.push(...B.errs);
    } finally { await B.ctx.close(); }
    // ===== P10 数え方（ユーザー回答 B）: 分けて出すカードは部分1つ＝1問。15問を選んだら答える回数が15 =====
    const r6ids = await pg.evaluate(() => QA_DATA.filter(d => /^r6m/.test(d.id) && d.kind !== "calc").map(d => d.id));
    await pg.evaluate(SEED, [MIG, r6ids, { unit: U, extra: { count: 15 } }]); await pg.reload(); await pg.waitForTimeout(800);
    await start(pg);
    const p10 = { cnt: await txt(pg, "#solo-counter"), seen: [] };
    for (let k = 0; k < 30 && (await onSolo(pg)); k++) { p10.seen.push(await qid(pg, "solo")); await ok(pg); }
    check("P10 15問を選ぶと答える回数が15（分けた部分も1問と数える。" + p10.cnt + "・部分 " + p10.seen.filter(x => /~/.test(x)).length + "）",
      /1 \/ 15$/.test(p10.cnt.trim()) && p10.seen.length === 15 && p10.seen.some(x => /~/.test(x)), p10.seen.join(" "));
    // ===== B 二人 =====
    for (const p of [host.page, guest.page]) { await p.evaluate(SEED, [MIG, ["r6m36"], { unit: U, extra: { headStartSec: 3, judgeTimeSec: 600 } }]); await p.reload(); await p.waitForTimeout(800); }
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    await waitVis(host.page, "#advance-btn", 30000);
    const b2 = { id: await qid(host.page, "battle"), title: await txt(host.page, "#battle-daimon .battle-daimon-title") };
    await shot(host.page, "B_host_part1");
    await waitVis(host.page, "#skip-continue-btn", 20000);   // 考える時間 3秒×2 で時間切れ
    b2.enc = await txt(host.page, "#skip-encourage"); b2.part = await partOf(host.page, "r6m36~1");
    await tap(host.page, "#skip-continue-btn");
    await waitVis(host.page, "#advance-btn", 30000);
    b2.next = await qid(host.page, "battle");
    check("B2 分けての時間切れ: 記録しない・あとでもう一度（次は②）", b2.id === "r6m36~1" && /分けて 1\/3/.test(b2.title) && /時間切れ/.test(b2.enc) && b2.part === null && b2.next === "r6m36~2", JSON.stringify(b2));
    await tap(host.page, "#advance-btn");
    await guest.page.waitForFunction(() => document.getElementById("battle-q-id").textContent === "No.r6m36~2" && getComputedStyle(document.getElementById("battle-view")).display !== "none", null, { timeout: 20000 });
    const b1 = { gtitle: await txt(guest.page, "#battle-daimon .battle-daimon-title"), gq: await txt(guest.page, "#battle-q") };
    await shot(guest.page, "B_guest_part2");
    await tap(host.page, "#answer-reveal-btn"); await tap(guest.page, "#answer-reveal-btn");
    await waitVis(host.page, "#judge-row", 15000); await waitVis(guest.page, "#judge-row", 15000);
    b1.ga = await txt(guest.page, "#battle-a");
    await tap(host.page, "#judge-ok"); await tap(guest.page, "#judge-ok");
    await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
    await host.page.waitForTimeout(400);
    b1.h = await partOf(host.page, "r6m36~2"); b1.g = await partOf(guest.page, "r6m36~2");
    b1.hc = await statOf(host.page, "r6m36"); b1.gc = await statOf(guest.page, "r6m36");
    check("B1 二人: ゲストにも同じ部分・「分けて 2/3」・答えは部分だけ・両方の部分の記録に付く・カードの記録は付かない",
      /分けて 2\/3/.test(b1.gtitle) && /ろっ骨/.test(b1.gq) && b1.ga === "下がる" && b1.h && b1.h.correct === 1 && b1.g && b1.g.correct === 1 && b1.hc === null && b1.gc === null, JSON.stringify(b1));
    check("E 画面のエラー 0", solo.errs.length + host.errs.length + guest.errs.length === 0, [].concat(solo.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const outNow = await run("now", CURRENT);
// P7 記録のCSVは、直す前と見出し・行の数・行の中身（ID）が同じ（同じ記録で書き出したもの）
const rb = recCsv.base ? parseCSV(recCsv.base) : null, rn = recCsv.now ? parseCSV(recCsv.now) : null;
outNow.push({ n: "P7 記録のCSV（正解・不正解）が直す前と同じ（見出し・行の数・ID の並び）", ok: !!(rb && rn && rb[0].join() === rn[0].join() && rb.length === rn.length && rb.map(r => r[0]).join() === rn.map(r => r[0]).join() && recCsv.base === recCsv.now),
  x: rb && rn ? ("直す前 " + rb.length + " 行・いま " + rn.length + " 行・バイトまで同じ: " + (recCsv.base === recCsv.now)) : "書き出せず" });
const ng = report("いまの index.html", outNow);
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
