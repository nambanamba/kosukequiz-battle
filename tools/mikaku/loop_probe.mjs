// 正解するまでぐるぐる（2026-10-06 ユーザー「暗記カードなんですが、間違えた問題をもう一回をやめて、正解するまでぐるぐる回してください」）
// 本物の Chrome・390x844・まねごとの待ち合わせ先。使い方: node tools/mikaku/loop_probe.mjs
// 見ること:
//   L1 一人: ✕の問題は〇になるまで何度でもうしろへ回る・全部〇で終わり・ほかが残っていれば同じ問題が続かない
//      ・記録は1回目の答えだけ・「のこり◯問（まちがえた問題は正解するまで出ます）」・結果に「まちがえた問題をもう一度」が出ない・「3周」
//   L2 一人: スキップも正解するまで回る（記録は✕1回）
//   L3 一人: 「ひとつ前の判定をやり直す」で、うしろへ回した分も取り消す
//   L4 一人: とちゅうでやめて再開しても、回した問題が残っている・記録は1回目のまま
//   L5 学習ログ: 1問ごとに「何回目」・1回ごとに「何周」
//   L6 ★2026-10-07 分母は最初の問題数のまま・出し直しは「もう一度」・のこりは〇になっていない数（ユーザー「21/23ってでて、なんで？」）
//   B1 二人: ホストが✕（ゲストの判定）の問題は、〇になるまでうしろへ回る・ゲストにも同じ並び・記録はどちらも1回目だけ・もう一勝負は出ない
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "cdf5a32";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "loop" });
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
const SEED = (arg) => {
  const [mig, ids, unit] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }, st = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.kind !== "daimon" && !ids.includes(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { st[it.id] = Object.assign({}, known); }));
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [unit] }, units: [unit], count: ids.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 60, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
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
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = (pg, p) => pg.$eval("#" + p + "-q-id", e => e.textContent.replace(/^No\./, ""));
  const txt = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : ""; }, sel);
  const statOf = (pg, id) => pg.evaluate(i => (JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"))[i] || null, id);
  const onSolo = pg => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const grab = async (pg, sel) => { const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 5000 }), tap(pg, sel)]); return fs.readFileSync(await dl.path(), "utf8"); };
  const judge = async (pg, ok) => { await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(80); await tap(pg, ok ? "#solo-judge-ok" : "#solo-judge-ng"); await pg.waitForTimeout(220); };
  const fresh = async (pg, ids) => { await pg.evaluate(SEED, [MIG, ids, U]); await pg.reload(); await pg.waitForTimeout(800); await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(300); };
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    const pg = solo.page;
    const A = "g6r1", B = "g6r2", C = "g6r3";
    // ===== L1 =====
    await fresh(pg, [A, B, C]);
    const left0 = await txt(pg, "#solo-left");
    const plan = { [A]: [false, false, true], [B]: [true], [C]: [false, true] };
    const seq = [];
    const cnts = [], lefts = [];
    for (let k = 0; k < 12 && (await onSolo(pg)); k++) { const id = await qid(pg, "solo"); seq.push(id); cnts.push(await txt(pg, "#solo-counter")); lefts.push(await txt(pg, "#solo-left")); const ans = plan[id] && plan[id].length ? plan[id].shift() : true; await judge(pg, ans); }
    const finished = !(await onSolo(pg));
    const res = { score: await txt(pg, "#solo-result-score"), info: await txt(pg, "#solo-result-skipinfo"), retry: await vis(pg, "#solo-retry-miss-btn") };
    const sA = await statOf(pg, A), sB = await statOf(pg, B), sC = await statOf(pg, C);
    const noBackToBack = seq.every((id, i) => i === 0 || id !== seq[i - 1] || seq.slice(i).every(x => x === id));
    check("L1 ✕は〇になるまでうしろへ回る・全部〇で終わり（" + seq.join(" ") + "）", finished && seq.join(",") === [A, B, C, A, C, A].join(","), JSON.stringify(seq));
    check("L6 分母は最初の問題数のまま（" + cnts.join(" ") + "）・出し直しは「もう一度」・のこりは〇になっていない数（" + lefts[3] + "）",
      cnts.join(",") === "1 / 3,2 / 3,3 / 3,3 / 3,3 / 3,3 / 3" && /^🔁 もう一度　のこり2問/.test(lefts[3]) && /^のこり2問/.test(lefts[2]) && /^🔁 もう一度　のこり1問/.test(lefts[5]), JSON.stringify(lefts));
    check("L1 ほかの問題が残っていれば同じ問題が続かない", noBackToBack, seq.join(" "));
    check("L1 記録は1回目の答えだけ（" + A + " ✕1・" + C + " ✕1・" + B + " 〇1）", sA && sA.wrong === 1 && !(sA.correct > 0) && sC && sC.wrong === 1 && !(sC.correct > 0) && sB && sB.correct === 1, JSON.stringify({ sA, sB, sC }));
    check("L1 「のこり3問（まちがえた問題は正解するまで出ます）」・結果に「もう一度」が出ない・1 / 3・3周", /^のこり3問（まちがえた問題は正解するまで出ます）$/.test(left0) && !res.retry && res.score === "1 / 3" && /3周/.test(res.info), JSON.stringify({ left0, res }));
    // ===== L5 学習ログ =====
    let det = null, ses = null;
    try { det = parseCSV(await grab(pg, "#export-studylog-detail-link")); ses = parseCSV(await grab(pg, "#export-studylog-link")); } catch (e) {}
    const ci = det ? det[0].indexOf("何回目") : -1, idI = det ? det[0].indexOf("ID") : -1, li = ses ? ses[0].indexOf("何周") : -1;
    check("L5 学習ログ: 1問ごとに「何回目」（" + A + " は 1・2・3）・1回ごとに「何周」＝3",
      ci >= 0 && li >= 0 && det.slice(1).filter(r => r[idI] === A).map(r => r[ci]).join(",") === "1,2,3" && ses[ses.length - 1][li] === "3", det ? det[0].join(",") : "");
    await tap(pg, "#solo-result-home-btn").catch(() => {});
    // ===== L2 スキップ =====
    await fresh(pg, [A, B]);
    await tap(pg, "#solo-skip-btn"); await pg.waitForTimeout(200); await tap(pg, "#solo-skip-next-btn"); await pg.waitForTimeout(200);   // A スキップ
    const seq2 = [A];
    for (let k = 0; k < 8 && (await onSolo(pg)); k++) { const id = await qid(pg, "solo"); seq2.push(id); await judge(pg, !(id === A && seq2.filter(x => x === A).length === 2)); }
    const s2 = await statOf(pg, A);
    check("L2 スキップも正解するまで回る（" + seq2.join(" ") + "）・記録は✕1回", seq2.join(",") === [A, B, A, A].join(",") && s2 && s2.wrong === 1 && !(s2.correct > 0), JSON.stringify(s2));
    await tap(pg, "#solo-result-home-btn").catch(() => {});
    // ===== L3 ひとつ前をやり直す =====
    await fresh(pg, [A, B, C]);
    await judge(pg, false);
    const c3a = await txt(pg, "#solo-counter");
    await tap(pg, "#solo-undo-link"); await pg.waitForTimeout(250);
    const c3b = await txt(pg, "#solo-counter"), s3 = await statOf(pg, A), id3 = await qid(pg, "solo");
    check("L3 やり直すと、うしろへ回した分も取り消す（" + c3a + " → " + c3b + "）・記録も戻る", c3a === "2 / 3" && c3b === "1 / 3" && id3 === A && s3 === null, JSON.stringify(s3));
    // ===== L4 中断・再開 =====
    await judge(pg, false); await judge(pg, true);   // A ✕・B 〇
    await pg.evaluate(() => document.getElementById("solo-back").click()); await pg.waitForTimeout(300);
    await pg.reload(); await pg.waitForTimeout(900);
    await tap(pg, "#resume-solo-btn"); await pg.waitForTimeout(300);
    const seq4 = [];
    for (let k = 0; k < 6 && (await onSolo(pg)); k++) { seq4.push(await qid(pg, "solo")); await judge(pg, true); }
    const s4 = await statOf(pg, A);
    check("L4 再開しても回した問題が残る（" + seq4.join(" ") + "）・記録は1回目のまま", seq4.join(",") === [C, A].join(",") && s4 && s4.wrong === 1 && !(s4.correct > 0), JSON.stringify(s4));
    // ===== B1 二人 =====
    for (const p of [host.page, guest.page]) { await p.evaluate(SEED, [MIG, [A, B], U]); await p.reload(); await p.waitForTimeout(800); }
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    const bseq = [], gseq = [], gcnt = [];
    let firstA = true;
    for (let k = 0; k < 5; k++) {
      await waitVis(host.page, "#advance-btn", 30000).catch(() => {});
      if (!(await vis(host.page, "#advance-btn"))) break;
      const id = await qid(host.page, "battle"); bseq.push(id);
      await tap(host.page, "#advance-btn");
      await guest.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 });
      gseq.push(await qid(guest.page, "battle")); gcnt.push(await txt(guest.page, "#battle-counter"));
      await tap(host.page, "#answer-reveal-btn"); await tap(guest.page, "#answer-reveal-btn");
      await waitVis(host.page, "#judge-row", 15000); await waitVis(guest.page, "#judge-row", 15000);
      const hostOk = !(id === A && firstA); if (id === A) firstA = false;
      await tap(guest.page, hostOk ? "#judge-ok" : "#judge-ng"); await tap(host.page, "#judge-ok");
      await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
      await tap(host.page, "#next-btn"); await host.page.waitForTimeout(500);
    }
    await host.page.waitForTimeout(800);
    const onRes = await host.page.evaluate(() => document.getElementById("screen-result").classList.contains("active"));
    const retryBtn = await vis(host.page, "#result-retry-battle-btn");
    const hA = await statOf(host.page, A), gA = await statOf(guest.page, A);
    check("B1 二人: ホストが✕の問題は〇になるまで回る（" + bseq.join(" ") + "）・ゲストも同じ並び（" + gcnt.join(" ") + "）",
      bseq.join(",") === [A, B, A].join(",") && gseq.join(",") === bseq.join(",") && gcnt.join(",") === "1 / 2,2 / 2,2 / 2", JSON.stringify({ bseq, gseq, gcnt }));
    check("B1 記録はどちらも1回目だけ（ホスト " + A + " ✕1・ゲスト " + A + " 〇1）・もう一勝負は出ない・結果画面へ",
      hA && hA.wrong === 1 && !(hA.correct > 0) && gA && gA.correct === 1 && !(gA.wrong > 0) && onRes && !retryBtn, JSON.stringify({ hA, gA, onRes, retryBtn }));
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
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
