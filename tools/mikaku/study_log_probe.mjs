// 学習ログ（1回に何分かかったか）と、大問の記録の書き出し（2026-10-05・ユーザー「一回に何分かかったかも、分析指標に入れられるように直してください」）
// 本物の Chrome・390x844・まねごとの待ち合わせ先。使い方: node tools/mikaku/study_log_probe.mjs
// 見ること:
//   E1 ★今の「正解・不正解の記録」CSV は、直す前とバイトまで同じ（列・形を変えていない。機種変更の読み込みが頼っている）
//   L1 一人: 〇・スキップ・✕・出し直しの〇 → 学習ログCSVに1行。出した3・答えた2・正解1・まちがい1・スキップ1・出し直し1・平均秒/最長秒が入る
//   L2 一人: 1問ごとのCSVに4行（〇／スキップ／✕／〇＋出し直し）・考えた秒が入る
//   L3 一人: とちゅうでやめる → 「途中でやめた=はい」で残る → 続きから再開 → 同じ1回に戻る（再開1回・途中でやめた=いいえ）・やめていた間は考えた秒に入らない
//   B1 二人: ホストとゲストそれぞれの端末に「対戦」の1行（自分の役・答えた2・正解2・平均秒）
//   P1 約1年より古い回は月のまとめへ・120日より古い回は1問ごとの秒を捨てる（数は残る）・閉じられた回は最後に答えた時刻でしめる
//   P2 ★片づけても、学習ログ以外の入れ物は1文字も変わらない
//   D1 大問ごとの記録CSV: 大問の数だけ行があり、小問の記録をまとめた数が合う
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
const LOG_KEY = "kq_battle_study_log_v1";
// 答えるのは ids だけ（社会 第6回のほかの一問一答と大問は全部おぼえ済み）。大問の小問の1つだけ ✕ の記録を入れる（D1 用）
const SEED = (arg) => {
  const [mig, ids, o] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }, st = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.kind !== "daimon" && !ids.includes(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { st[it.id] = Object.assign({}, known); }));
  const firstDaimon = QA_DATA.find(d => d.kind === "daimon");
  if (firstDaimon) st[firstDaimon.itemIds[0]] ={ correct: 3, wrong: 4, box: 0, lastCorrectAt: now - 9e8, lastAnswered: now - 5e8 };
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify(Object.assign({ subject: "社会", unitsBySubject: { "社会": [o.unit] }, units: [o.unit], count: ids.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }, o.extra || {})));
};
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
  SERVED = src; const out = [], keep = {};
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = (pg, p) => pg.$eval("#" + p + "-q-id", e => e.textContent.replace(/^No\./, ""));
  const grab = async (pg, sel) => { const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 5000 }), tap(pg, sel)]); return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), "utf8") }; };
  const onSolo = pg => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    const pg = solo.page;
    // ===== E1 今のCSV（あとで直す前と比べる） =====
    await pg.evaluate(SEED, [MIG, ["g6r1", "g6r2", "g6r3"], { unit: U }]); await pg.reload(); await pg.waitForTimeout(800);
    keep.oldCsv = (await grab(pg, "#export-link")).text;
    // ===== L1・L2 一人 =====
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(300);
    const seq = [];
    seq.push(await qid(pg, "solo")); await pg.waitForTimeout(1200); await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250);
    seq.push(await qid(pg, "solo")); await pg.waitForTimeout(300); await tap(pg, "#solo-skip-btn"); await pg.waitForTimeout(200); await tap(pg, "#solo-skip-next-btn"); await pg.waitForTimeout(250);
    seq.push(await qid(pg, "solo")); await pg.waitForTimeout(2200); await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ng"); await pg.waitForTimeout(250);
    seq.push(await qid(pg, "solo")); await pg.waitForTimeout(300); await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(300);
    const finished = !(await onSolo(pg));
    let log = null;
    try { log = await grab(pg, "#export-studylog-link"); } catch (e) { log = null; }
    const rows = log ? parseCSV(log.text) : [];
    const sess = log ? asObjs(rows).filter(r => r["種類"] === "1回") : [];
    const s1 = sess[0] || {};
    check("L1 一人の1回が学習ログCSVに1行（" + seq.join(" ") + "）", finished && log && /^社会一問一答_学習ログ_\d{8}\.csv$/.test(log.name) && log.text.charCodeAt(0) === 0xFEFF && sess.length === 1
      && s1["一人・対戦"] === "一人" && s1["形式"] === "一問一答" && s1["教科"] === "社会" && s1["単元"] === U && s1["やり直し"] === "いいえ"
      && s1["予定の問題数"] === "3" && s1["出した問題数"] === "3" && s1["答えた数"] === "2" && s1["正解数"] === "1" && s1["まちがい数"] === "1"
      && s1["スキップ数"] === "1" && s1["時間切れ数"] === "0" && s1["出し直しで答えた数"] === "1" && s1["途中でやめた"] === "いいえ" && s1["再開した回数"] === "0",
      JSON.stringify(s1));
    const avg = +s1["1問の平均秒"], mx = +s1["1問の最長秒"], all = +s1["全体の分"], act = +s1["解いていた分"];
    check("L1 平均秒・最長秒・分が入る（〇1.2秒くらい・✕2.2秒くらい → 平均1.5〜2.6・最長2.1〜3.5）", avg >= 1.5 && avg <= 2.6 && mx >= 2.1 && mx <= 3.5 && all > 0 && act > 0 && act <= all + 0.05
      && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s1["開始日時"] || "") && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s1["終了日時"] || ""), JSON.stringify({ avg, mx, all, act }));
    let det = null;
    try { det = await grab(pg, "#export-studylog-detail-link"); } catch (e) { det = null; }
    const drows = det ? asObjs(parseCSV(det.text)) : [];
    check("L2 1問ごとのCSV: 〇／スキップ／✕／〇（出し直し）・考えた秒", det && /^社会一問一答_学習ログ_1問ごと_\d{8}\.csv$/.test(det.name) && drows.length === 4
      && drows.map(r => r["結果"]).join(",") === "〇,スキップ,✕,〇" && drows.map(r => r["出し直し"]).join(",") === ",,,はい"
      && drows.map(r => r["ID"]).join(" ") === seq.join(" ") && +drows[0]["考えた秒"] >= 1.1 && +drows[2]["考えた秒"] >= 2.1 && drows[0]["問題"].length > 0,
      JSON.stringify(drows.map(r => [r["ID"], r["結果"], r["考えた秒"], r["出し直し"]])));
    // ===== L3 とちゅうでやめる → 再開 =====
    await pg.evaluate(SEED, [MIG, ["g6r1", "g6r2", "g6r3"], { unit: U }]); await pg.reload(); await pg.waitForTimeout(800);
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(300);
    await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250);
    await tap(pg, "#solo-back"); await pg.waitForTimeout(400);   // confirm は自動で OK
    const mid = await pg.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), LOG_KEY);
    const m0 = mid && mid.sessions && mid.sessions[0];
    const midOk = !!(m0 && m0.quit === true && !m0.done && m0.en > 0 && m0.q.length === 1);
    await pg.waitForTimeout(1500);   // やめていた間（考えた秒に入れてはいけない）
    await pg.reload(); await pg.waitForTimeout(800);
    await tap(pg, "#resume-solo-btn").catch(() => {}); await pg.waitForTimeout(400);
    for (let k = 0; k < 6 && (await onSolo(pg)); k++) { await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250); }
    let l3 = null; try { l3 = asObjs(parseCSV((await grab(pg, "#export-studylog-link")).text)).filter(r => r["種類"] === "1回"); } catch (e) { l3 = null; }
    check("L3 とちゅうでやめる→「途中でやめた」で残る→再開→同じ1回に戻る（再開1回・答えた3・途中でやめた=いいえ・やめていた間は考えた秒に入らない）", midOk && l3 && l3.length === 1 && l3[0]["再開した回数"] === "1" && l3[0]["答えた数"] === "3" && l3[0]["途中でやめた"] === "いいえ" && +l3[0]["1問の最長秒"] < 1.5,
      JSON.stringify({ midOk, l3 }));
    // ===== D1 大問ごとの記録 =====
    let dm = null; try { dm = await grab(pg, "#export-daimon-link"); } catch (e) { dm = null; }
    const expect = await pg.evaluate(() => { const g = QA_DATA.filter(d => d.kind === "daimon"); const f = g[0]; return { n: g.length, id: f && f.id, items: f && f.itemIds.length }; });
    const drs = dm ? asObjs(parseCSV(dm.text)) : [];
    const f = drs.find(r => r["大問ID"] === expect.id) || {};
    check("D1 大問ごとの記録CSV: 大問の数（" + expect.n + "）だけ行・1つ目の大問の小問の数と、✕4回の小問が入っている", dm && /^社会一問一答_大問の記録_\d{8}\.csv$/.test(dm.name) && drs.length === expect.n && expect.n > 0
      && f["小問の数"] === String(expect.items) && f["まちがえた回数"] === "4" && f["苦手な小問"] === "1" && f["大問の状態"] === "苦手な問題", JSON.stringify(f));
    // ===== P1・P2 古い回の片づけ =====
    await pg.evaluate(SEED, [MIG, ["g6r1"], { unit: U }]); await pg.reload(); await pg.waitForTimeout(800);
    await pg.reload(); await pg.waitForTimeout(800);   // 起動時の移しかえなどを先に済ませる
    const snap = () => pg.evaluate(k => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key !== k) o[key] = localStorage.getItem(key); } return o; }, LOG_KEY);
    const before = await snap();
    await pg.evaluate(k => {
      const now = Date.now(), D = 864e5;
      const q = (n, r) => Array.from({ length: n }, (_, i) => ["g6r" + (i + 1), 3, r]);
      localStorage.setItem(k, JSON.stringify({ v: 1, monthly: {}, cur: { solo: "open" }, sessions: [
        { id: "old", k: "solo", m: "一問一答", subj: "社会", u: ["x"], plan: 2, st: now - 400 * D, la: now - 400 * D + 6e5, en: now - 400 * D + 6e5, act: 6e5, seg: 0, res: 0, quit: false, done: true, q: q(2, "o"), shownIds: [] },
        { id: "mid", k: "battle", role: "host", m: "一問一答", subj: "社会", u: ["x"], plan: 3, st: now - 130 * D, la: now - 130 * D, en: now - 130 * D + 3e5, act: 3e5, seg: 0, res: 0, quit: false, done: true, q: q(3, "x"), shownIds: [] },
        { id: "open", k: "solo", m: "一問一答", subj: "社会", u: ["x"], plan: 5, st: now - 36e5, la: now - 30e5, en: 0, act: 0, seg: now - 36e5, res: 0, quit: false, done: false, q: q(1, "o"), shownIds: [] }
      ] }));
    }, LOG_KEY);
    await pg.reload(); await pg.waitForTimeout(800);
    const after = await snap();
    const lg = await pg.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), LOG_KEY);
    const ids = lg ? lg.sessions.map(s => s.id) : [];
    const mon = lg ? Object.values(lg.monthly) : [];
    const midS = lg && lg.sessions.find(s => s.id === "mid"), openS = lg && lg.sessions.find(s => s.id === "open");
    check("P1 1年より古い回→月のまとめ（1回・答えた2）／120日より古い回→1問ごとを捨ててまとめ（答えた3）／閉じられた回→最後に答えた時刻でしめる（10分）",
      lg && !ids.includes("old") && mon.length === 1 && mon[0].n === 1 && mon[0].ans === 2 && mon[0].act === 600
      && midS && !midS.q && midS.sum && midS.sum.ans === 3 && midS.sum.ng === 3
      && openS && openS.quit === true && !openS.done && openS.seg === 0 && Math.abs(openS.act - 6e5) < 2000 && openS.en === openS.la,
      JSON.stringify({ ids, mon, midSum: midS && midS.sum, open: openS && { quit: openS.quit, act: openS.act } }));
    const changed = Object.keys(Object.assign({}, before, after)).filter(k => before[k] !== after[k]);
    check("P2 ★片づけても、学習ログ以外の入れ物は1文字も変わらない（" + Object.keys(before).length + "個）", changed.length === 0 && Object.keys(before).length >= 4, changed.join(","));
    let mrow = null; try { mrow = asObjs(parseCSV((await grab(pg, "#export-studylog-link")).text)).find(r => r["種類"] === "月のまとめ"); } catch (e) { mrow = null; }
    check("P1 月のまとめも学習ログCSVに出る（解いていた分＝10）", mrow && mrow["解いていた分"] === "10" && mrow["答えた数"] === "2" && mrow["一人・対戦"] === "一人", JSON.stringify(mrow));
    // ===== B1 二人 =====
    for (const p of [host.page, guest.page]) { await p.evaluate(SEED, [MIG, ["g6r1", "g6r2"], { unit: U }]); await p.reload(); await p.waitForTimeout(800); }
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
      await tap(host.page, "#answer-reveal-btn"); await tap(guest.page, "#answer-reveal-btn");
      await waitVis(host.page, "#judge-row", 15000); await waitVis(guest.page, "#judge-row", 15000);
      await tap(host.page, "#judge-ok"); await tap(guest.page, "#judge-ok");
      await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
      await tap(host.page, "#next-btn");
    }
    await host.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 20000 });
    await guest.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 20000 });
    const bOf = async p => { try { return asObjs(parseCSV((await grab(p, "#export-studylog-link")).text)).filter(r => r["種類"] === "1回"); } catch (e) { return null; } };
    const hb = await bOf(host.page), gb = await bOf(guest.page);
    const ok1 = r => r && r.length === 1 && r[0]["一人・対戦"] === "対戦" && r[0]["答えた数"] === "2" && r[0]["正解数"] === "2" && r[0]["出した問題数"] === "2" && r[0]["途中でやめた"] === "いいえ" && +r[0]["1問の平均秒"] >= 0.8;
    check("B1 二人: ホストとゲストの端末それぞれに対戦の1行（ホスト／ゲスト・答えた2・正解2・平均秒）", ok1(hb) && ok1(gb) && hb[0]["自分の役"] === "ホスト" && gb[0]["自分の役"] === "ゲスト", JSON.stringify({ hb, gb }));
    check("画面のエラー 0", solo.errs.length + host.errs.length + guest.errs.length === 0, [].concat(solo.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
  return { out, keep };
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const B = await run("base", BASELINE);
const ngB = report("対照 " + BASE_COMMIT, B.out);
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const N = await run("now", CURRENT);
const HEADER = "ID,単元,問題,こたえ,正解した回数,まちがえた回数,状態,最終正答日,最終回答日,連続正解数";
N.out.unshift({ n: "E1 ★今の記録CSVは直す前とバイトまで同じ（見出し " + HEADER + "）", ok: !!(B.keep.oldCsv && N.keep.oldCsv && B.keep.oldCsv === N.keep.oldCsv && N.keep.oldCsv.replace(/^\uFEFF/, "").split("\r\n")[0] === HEADER),
  x: (N.keep.oldCsv || "").split("\r\n").length + "行" });
const ng = report("いまの index.html", N.out);
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
