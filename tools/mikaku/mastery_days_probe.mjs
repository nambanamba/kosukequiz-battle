// 「定着した」＝ちがう日に3回正解（2026-10-08 ユーザー「同じ日に何回正解しても1回」「いまは1〜2回の正解で定着になり、その問題が出なくなっていた」）
// 本物の Chrome・390x844。日付は page.clock で進める（タイマーはそのまま）。使い方: node tools/mikaku/mastery_days_probe.mjs
// 見ること（状態は「正解・不正解の記録」CSV の「状態」列＝出題の3段そのもの で見る）:
//   M1 同じ日に3回〇 → 定着にならない（苦手な問題）・正解した日は1日・正解した回数は3
//   M2 2日目の〇 → まだ苦手・3日目の〇 → 定着した
//   M3 定着のあと✕ → 苦手（連続正解は0）・まちがえた回数+1・正解した日は消えない
//   M4 今までの記録（正解した日の一覧なし・今は「定着」）: 開いただけでは記録が1字も変わらない・状態は苦手・
//      ちがう日に〇を2回足すと（最終正答日＋2日＝3日）定着。正解・まちがいの回数は減らない
//   M5 記録CSV: 見出しは直す前と同じ・今までの記録の行は「状態」列のほかは直す前とバイトまで同じ（定着にならない行は状態も同じ）
//   M6 ホームの数は4つ（まだ／おぼえかけ／苦手／定着。2026-10-08 ユーザー回答 B）。足すと全問題数。M1〜M3 でも数が動く
//      ★記録CSVの「状態」は3つの語のまま（おぼえかけは「苦手な問題」と書く）
//   M10 前の保存（tiers に 3 が無い・tiers4 なし）で苦手を選んでいたら、おぼえかけも選ばれる。tiers4 ありなら保存どおり
//   M7 一覧の「定着した」ボタン → 定着（印）。✕で印が外れて苦手
//   M8 正解した日の記録の書き出し → 正解した日を消して取り込み → 戻る・2回取り込んでも重ならない・記録の無いカードは作らない
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "4efffa5";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(SERVED, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const ORIGIN = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
const UNIT = "第6回.鎌倉時代";
const DAY = n => new Date(2026, 9, n, 10, 0, 0);   // 2026-10-n 10:00（その端末の時刻）
const YMD = n => "2026-10-" + String(n).padStart(2, "0");
const SEED = (arg) => {
  const [mig, unit, st] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [unit] }, units: [unit], count: 5, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (st) localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
};
// キーの並びによらず比べる
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, key) => (o[key] = x[key], o), {}) : x);
function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\r") {} else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else f += c; }
  if (f || row.length) { row.push(f); rows.push(row); } return rows;
}
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
  const onSolo = () => page.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const stats = () => page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"));
  const rawStats = () => page.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
  const setDay = async n => { await page.clock.setSystemTime(DAY(n)); };
  // ?ids= のリンクで開いて、出た問題を全部 ok か ng で答える
  const solo = async (ids, ok) => {
    await page.goto(ORIGIN + "?ids=" + ids.join(",")); await page.waitForTimeout(700);
    await page.$eval("#today-start-btn", e => e.click()); await page.waitForTimeout(400);
    for (let k = 0; k < ids.length + 2 && (await onSolo()); k++) {
      await page.$eval("#solo-reveal-btn", e => e.click()).catch(() => {}); await page.waitForTimeout(80);
      await page.$eval(ok ? "#solo-judge-ok" : "#solo-judge-ng", e => e.click()).catch(() => {}); await page.waitForTimeout(150);
    }
    await page.goto(ORIGIN); await page.waitForTimeout(500);
  };
  const exportCsv = async () => {
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.$eval("#export-link", e => e.click())]);
    const text = fs.readFileSync(await dl.path(), "utf8"); return { text, rows: parseCsv(text.replace(/^﻿/, "")) };
  };
  const statusOf = (csv, id) => { const h = csv.rows[0], r = csv.rows.find(x => x[0] === id); return r ? r[h.indexOf("状態")] : "(なし)"; };
  try {
    await setDay(1);
    await page.goto(ORIGIN);
    const ids = await page.evaluate(u => QA_DATA.filter(d => d.u === u && d.kind !== "daimon" && d.kind !== "calc").slice(0, 6).map(d => d.id), UNIT);
    const [A, B, C, D, E, F] = ids;
    const T0 = DAY(1).getTime() - 5 * 86400000;   // 今までの記録の最終正答日（9/26）
    const legacy = {
      [D]: { correct: 5, wrong: 0, box: 3, nextDue: T0 + 8 * 86400000, lastAnswered: T0, lastCorrectAt: T0 },      // 今は「定着」（まちがえずに正解）
      [E]: { correct: 4, wrong: 2, box: 2, nextDue: T0 + 4 * 86400000, lastAnswered: T0, lastCorrectAt: T0 },      // 今は「定着」（2回続けて正解）
      [F]: { correct: 1, wrong: 3, box: 0, nextDue: T0 + 86400000, lastAnswered: T0, lastCorrectAt: T0 - 86400000 }  // 今も苦手
    };
    await page.evaluate(SEED, [MIG, UNIT, legacy]);
    await page.goto(ORIGIN); await page.waitForTimeout(900);
    const raw0 = JSON.stringify(legacy), raw1 = await rawStats();
    const csv0 = await exportCsv();
    out.push({ csv0: csv0.text });
    // [まだ, おぼえかけ, 苦手, 定着, 全問題数]
    const home = () => page.evaluate(() => ["stat-stage1", "stat-stage4", "stat-stage2", "stat-stage3", "stat-total"].map(id => { const e = document.getElementById(id); return e ? +e.textContent : -1; }));
    const sumOk = h => h[0] + h[1] + h[2] + h[3] === h[4];
    const home0 = await home();
    // M4（開いただけ）
    check("M4 今までの記録は開いただけでは1字も変わらない", raw1 === raw0, raw1 && raw1.slice(0, 160));
    check("M4 正解した日の一覧が無い今までの「定着」（" + D + "・" + E + "）は苦手な問題・" + F + " は苦手のまま",
      statusOf(csv0, D) === "苦手な問題" && statusOf(csv0, E) === "苦手な問題" && statusOf(csv0, F) === "苦手な問題",
      [statusOf(csv0, D), statusOf(csv0, E), statusOf(csv0, F)].join(" / "));
    // M6 ホームの数（社会・鎌倉時代を選んでいる。D・E・F が苦手、のこりはまだ）
    const nUnit = await page.evaluate(u => QA_DATA.filter(d => d.u === u).length, UNIT);
    check("M6 ホームの数: まだ／おぼえかけ／苦手／定着 = " + home0.slice(0, 4).join("／") + "（今までの定着2問はおぼえかけ・F は苦手）・足すと全問題数 " + home0[4],
      home0[1] === 2 && home0[2] === 1 && home0[3] === 0 && sumOk(home0), home0.join(","));
    // M1 同じ日に3回
    for (let k = 0; k < 3; k++) await solo([A], true);
    let st = await stats(), csv = await exportCsv();
    const home1 = await home();
    check("M6 同じ日に3回〇のあと: おぼえかけ 3（A・D・E）・定着 0（" + home1.slice(0, 4).join("／") + "）", home1[1] === 3 && home1[3] === 0 && sumOk(home1), home1.join(","));
    check("M1 同じ日に3回〇 → 定着にならない（" + statusOf(csv, A) + "）・正解した日は1日・正解した回数3",
      statusOf(csv, A) === "苦手な問題" && st[A] && st[A].correct === 3 && JSON.stringify(st[A].correctDays) === JSON.stringify([YMD(1)]), JSON.stringify(st[A]));
    // M2
    await setDay(2); await solo([A, D], true);
    csv = await exportCsv(); const s2 = statusOf(csv, A), d2 = statusOf(csv, D);
    await setDay(3); await solo([A, D], true);
    st = await stats(); csv = await exportCsv();
    const home2 = await home();
    check("M6 3日目のあと: おぼえかけ 1（E）・苦手 1（F）・定着 2（A・D）（" + home2.slice(0, 4).join("／") + "）", home2[1] === 1 && home2[2] === 1 && home2[3] === 2 && sumOk(home2), home2.join(","));
    check("M2 2日目はまだ苦手（" + s2 + "）・3日目の〇で定着（" + statusOf(csv, A) + "）", s2 === "苦手な問題" && statusOf(csv, A) === "定着した" && st[A].correctDays.length === 3, JSON.stringify(st[A].correctDays));
    check("M4 今までの記録に〇を2日足すと（9/26＋10/2＋10/3）定着・2日目はまだ苦手（" + d2 + "）・正解5→7・まちがい0のまま",
      d2 === "苦手な問題" && statusOf(csv, D) === "定着した" && st[D].correct === 7 && st[D].wrong === 0 && JSON.stringify(st[D].correctDays) === JSON.stringify(["2026-09-26", YMD(2), YMD(3)]), JSON.stringify(st[D]));
    // M3
    await solo([A], false);
    st = await stats(); csv = await exportCsv();
    const home3 = await home();
    check("M6 ✕のあと: 苦手 2（F・A）・定着 1（D）（" + home3.slice(0, 4).join("／") + "）", home3[2] === 2 && home3[3] === 1 && sumOk(home3), home3.join(","));
    check("M3 定着のあと✕ → 苦手・連続0・まちがい+1・正解した日は3日のまま",
      statusOf(csv, A) === "苦手な問題" && st[A].box === 0 && st[A].wrong === 1 && st[A].correct === 5 && st[A].correctDays.length === 3, JSON.stringify(st[A]));
    // M5 CSV の形（今までの記録の行: 状態のほかは直す前と同じ。F は状態も同じ）
    const h0 = csv0.rows[0], si = h0.indexOf("状態");
    // M7 一覧の「定着した」ボタン（B）→ ✕
    await page.evaluate(() => document.getElementById("list-btn").click()); await page.waitForTimeout(600);
    const m7 = await page.evaluate(async id => {
      const sel = document.querySelector(".list-filter-toggle[data-tier='0']"); if (sel && !sel.classList.contains("on")) sel.click();
      let item = null;
      for (let k = 0; k < 50 && !item; k++) { await new Promise(r => setTimeout(r, 200)); item = document.querySelector('.list-item[data-qid="' + id + '"]'); }
      if (!item) return "行が見つからない";
      const b = item.querySelector(".status-btn.ok"); if (!b) return "ボタンが無い"; b.click(); return "押した";
    }, B);
    await page.goto(ORIGIN); await page.waitForTimeout(500);
    csv = await exportCsv(); const b1 = statusOf(csv, B);
    await solo([B], false); csv = await exportCsv(); st = await stats();
    check("M7 一覧の「定着した」→ 定着（" + m7 + "・" + b1 + "）・✕で印が外れて苦手（" + statusOf(csv, B) + "）",
      b1 === "定着した" && statusOf(csv, B) === "苦手な問題" && !st[B].manualMastered, JSON.stringify(st[B]));
    // M8 正解した日の記録の書き出し・取り込み
    const hasDays = await page.evaluate(() => !!document.getElementById("export-days-link"));
    if (!hasDays) check("M8 正解した日の記録の書き出し・取り込みがある", false, "リンクが無い");
    else {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.$eval("#export-days-link", e => e.click())]);
      const dpath = await dl.path(), dtext = fs.readFileSync(dpath, "utf8"), drows = parseCsv(dtext.replace(/^﻿/, ""));
      const rowA = drows.find(r => r[0] === A), rowD = drows.find(r => r[0] === D);
      const before = await stats();
      // A・D の正解した日を消し、C（記録なし）の行を足したファイルを読む
      await page.evaluate(([a, d]) => { const s = JSON.parse(localStorage.getItem("kq_battle_stats_v1")); delete s[a].correctDays; delete s[d].correctDays; localStorage.setItem("kq_battle_stats_v1", JSON.stringify(s)); }, [A, D]);
      await page.goto(ORIGIN); await page.waitForTimeout(500);
      const tmp = path.join(path.dirname(dpath), "days_in.csv"); fs.writeFileSync(tmp, "﻿" + dtext.replace(/^﻿/, "") + "\r\n" + C + "," + YMD(1) + " " + YMD(2) + ",");
      await page.setInputFiles("#import-days-file", tmp); await page.waitForTimeout(500);
      const after1 = await stats();
      await page.setInputFiles("#import-days-file", tmp); await page.waitForTimeout(500);
      const after2 = await stats();
      check("M8 書き出しに A（" + (rowA && rowA[1]) + "）・D（" + (rowD && rowD[1]) + "）",
        rowA && rowA[1] === [YMD(1), YMD(2), YMD(3)].join(" ") && rowD && rowD[1] === ["2026-09-26", YMD(2), YMD(3)].join(" "), drows.length + "行");
      check("M8 消してから取り込むと元どおり・2回取り込んでも重ならない・記録の無い " + C + " は作らない",
        canon(after1) === canon(before) && canon(after2) === canon(before) && !after2[C],
        canon(before) + " ≠ " + canon(after1));
    }
    // M10 前の保存の出題モード
    const m10 = [];
    for (const v4 of [false, true]) {
      await page.evaluate(([mig, unit, v4]) => {
        localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
        const o = { subject: "社会", unitsBySubject: { "社会": [unit] }, units: [unit], count: 5, shuffle: false, tiers: [1] };
        if (v4) o.tiers4 = true;
        localStorage.setItem("kq_battle_settings_v1", JSON.stringify(o));
      }, [MIG, UNIT, v4]);
      await page.goto(ORIGIN); await page.waitForTimeout(600);
      m10.push(await page.evaluate(() => { const e = document.getElementById("mode-stage4"); return e ? e.classList.contains("on") : null; }));
    }
    check("M10 前の保存で「苦手」だけ → おぼえかけも ON（" + m10[0] + "）・tiers4 ありの保存はそのまま OFF（" + m10[1] + "）", m10[0] === true && m10[1] === false, JSON.stringify(m10));
    check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { if (c.csv0 !== undefined) continue; console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const outB = await run("base", BASELINE);
const ngB = report("対照 " + BASE_COMMIT, outB);
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const outN = await run("now", CURRENT);
// M5: 今までの記録の CSV（開いた直後）を直す前と比べる
const cB = (outB.find(o => o.csv0 !== undefined) || {}).csv0, cN = (outN.find(o => o.csv0 !== undefined) || {}).csv0;
if (cB && cN) {
  const rb = parseCsv(cB.replace(/^﻿/, "")), rn = parseCsv(cN.replace(/^﻿/, "")), si = rb[0].indexOf("状態");
  const strip = r => r.filter((_, k) => k !== si).join("\u0001");
  const diffOther = rn.filter((r, k) => !rb[k] || strip(r) !== strip(rb[k])).length;
  const diffStatus = rn.filter((r, k) => rb[k] && r[si] !== rb[k][si]).map(r => r[0] + ":" + r[si]);
  outN.push({ n: "M5 記録CSV: 見出し・行数が直す前と同じ（" + rn.length + "行）・状態のほかは全行バイトまで同じ・状態が変わるのは今までの「定着」2行だけ",
    ok: rb[0].join(",") === rn[0].join(",") && rb.length === rn.length && diffOther === 0 && diffStatus.length === 2, x: "状態が変わった行: " + diffStatus.join(" ") });
} else outN.push({ n: "M5 記録CSV を比べられた", ok: false, x: "" });
const ng = report("いまの index.html", outN);
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
