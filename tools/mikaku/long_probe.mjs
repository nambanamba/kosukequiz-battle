// 社会のロング編（2026-10-07 ユーザー「社会のロング編準備をお願いします」）
// 依頼書: 司令塔\回答\社会_ロング編_組分け第6回_依頼_2026-10-05.md（「アプリ側」の節）
// 本物の Chrome・390x844・まねごとの待ち合わせ先。使い方: node tools/mikaku/long_probe.mjs
// 見ること:
//   L0 取り込み: 社会の大問3つが、ふつうの回とは別の単元「ロング編.組分け第6回」に入る（小問50）
//   L1 一人: 問いを先に見せる・本文は「本文を見る」で開く（初めは閉じている）・答えも where も、答える前には見えない
//   L2 「本文を見る」で本文が開く
//   L3 答えのあと「ここを読めばよかった：…」
//   L4 次の問題では本文はまた閉じている・答えのあと「本文は読まなくてよかった」
//   L5 学習ログ（1問ごと）の「本文を開いた」: 開いた問題だけ「はい」
//   B1 二人: ゲストも本文は閉じている・答えのあとに where
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_long"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "27f516f";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "long" });
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
const U = "ロング編.組分け第6回";
const ASK = ["kumi6_01", "kumi6_02", "kumi6_03"];   // 答える小問（ほかは全部おぼえ済み）
const SEED = (arg) => {
  const [mig, ask, unit] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }, st = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.kind !== "daimon") st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { if (!ask.includes(it.id)) st[it.id] = Object.assign({}, known); }));
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [unit] }, units: [unit], count: "all", shuffle: false, tiers: [0, 1],
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
  const qid = (pg, p) => pg.$eval("#" + p + "-q-id", e => e.textContent.replace(/^No\./, "")).catch(() => "");
  const seen = (pg, p) => pg.evaluate(p => document.getElementById("screen-" + p).innerText, p);   // 見えている文字だけ
  const txt = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : ""; }, sel);
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    const pg = solo.page;
    await pg.evaluate(SEED, [MIG, ASK, U]); await pg.reload(); await pg.waitForTimeout(900);
    const L0 = await pg.evaluate(u => { const e = QA_DATA.filter(d => d.kind === "daimon" && d.u === u); return { n: e.length, items: e.reduce((a, d) => a + d.itemIds.length, 0), subj: e.every(d => d.subj === "社会") }; }, U);
    check("L0 社会の大問3つ・小問50が「" + U + "」に入る", L0.n === 3 && L0.items === 50 && L0.subj, JSON.stringify(L0));
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(400);
    const D = await pg.evaluate(() => { const g = DAIMON_DATA.find(x => x.key === "long_組分け6_1"); return g ? { lead: g.lead, a1: g.items[0].a, w1: g.items[0].where, q1: g.items[0].q } : null; });
    const v1 = await seen(pg, "solo");
    const l1 = { id: await qid(pg, "solo"), title: await txt(pg, "#solo-daimon .battle-daimon-title"), btn: await vis(pg, ".long-lead-btn"), body: await vis(pg, ".long-lead-body"),
      leadSeen: D ? v1.includes(D.lead.slice(0, 20)) : null, aSeen: D ? v1.includes(D.a1) : null, where: await pg.$(".long-where") };
    await pg.screenshot({ path: path.join(SHOTS, label + "_L1.png"), fullPage: true }).catch(() => {});
    check("L1 問いを先に（" + l1.id + "・" + l1.title + "）・本文は閉じている・答えも where も見えない",
      l1.id === "kumi6_01" && /ロング編：組分け第6回 大問1/.test(l1.title) && l1.btn && !l1.body && l1.leadSeen === false && l1.aSeen === false && !l1.where && D && v1.includes(D.q1.slice(0, 10)),
      JSON.stringify(Object.assign({}, l1, { where: !!l1.where })));
    // L2
    await tap(pg, ".long-lead-btn"); await pg.waitForTimeout(150);
    const v2 = await seen(pg, "solo");
    check("L2 「本文を見る」で本文が開く（答えはまだ見えない）", (await vis(pg, ".long-lead-body")) && v2.includes(D.lead.slice(0, 20)) && !v2.includes(D.a1) && !(await pg.$(".long-where")));
    await pg.screenshot({ path: path.join(SHOTS, label + "_L2.png"), fullPage: true }).catch(() => {});
    // L3
    await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(200);
    const w3 = await txt(pg, ".long-where");
    check("L3 答えのあと「ここを読めばよかった：…」", w3 === "ここを読めばよかった：" + D.w1 && (await seen(pg, "solo")).includes(D.a1), w3);
    await pg.screenshot({ path: path.join(SHOTS, label + "_L3.png"), fullPage: true }).catch(() => {});
    await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(300);
    // L4
    const l4 = { id: await qid(pg, "solo"), body: await vis(pg, ".long-lead-body"), where: !!(await pg.$(".long-where")) };
    await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(200);
    l4.w = await txt(pg, ".long-where");
    check("L4 次の問題（" + l4.id + "）では本文はまた閉じている・答えのあと「本文は読まなくてよかった」", l4.id === "kumi6_02" && !l4.body && !l4.where && /^本文は読まなくてよかった/.test(l4.w), JSON.stringify(l4));
    await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(300);
    for (let k = 0; k < 3 && (await pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"))); k++) { await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(80); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250); }
    // L5
    let det = null;
    try { const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 5000 }), tap(pg, "#export-studylog-detail-link")]); det = parseCSV(fs.readFileSync(await dl.path(), "utf8")); } catch (e) {}
    const ci = det ? det[0].indexOf("本文を開いた") : -1, ii = det ? det[0].indexOf("ID") : -1;
    const by = det && ci >= 0 ? Object.fromEntries(det.slice(1).map(r => [r[ii], r[ci]])) : {};
    check("L5 学習ログの「本文を開いた」: 開いた kumi6_01 だけ「はい」", ci >= 0 && by.kumi6_01 === "はい" && by.kumi6_02 === "" && by.kumi6_03 === "", JSON.stringify(by));
    // B1
    for (const p of [host.page, guest.page]) { await p.evaluate(SEED, [MIG, ["kumi6_01"], U]); await p.reload(); await p.waitForTimeout(800); }
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    await waitVis(host.page, "#advance-btn", 30000);
    const hb = { body: await vis(host.page, ".long-lead-body"), btn: await vis(host.page, ".long-lead-btn") };
    await tap(host.page, "#advance-btn");
    await guest.page.waitForFunction(() => document.getElementById("battle-q-id").textContent === "No.kumi6_01" && getComputedStyle(document.getElementById("battle-view")).display !== "none", null, { timeout: 20000 });
    const gb = { body: await vis(guest.page, ".long-lead-body"), btn: await vis(guest.page, ".long-lead-btn"), where: !!(await guest.page.$(".long-where")), aSeen: (await seen(guest.page, "battle")).includes(D.a1) };
    await tap(guest.page, "#answer-reveal-btn");   // ★2026-10-08 ホストの「こたえを見る」は無い（ゲストの〇✕で開く）
    await waitVis(guest.page, "#judge-row", 15000);
    gb.w = await txt(guest.page, ".long-where");
    check("B1 二人: ホスト・ゲストとも本文は閉じている・答える前は答えも where も無い → 答えのあとに where", hb.btn && !hb.body && gb.btn && !gb.body && !gb.where && !gb.aSeen && /^ここを読めばよかった/.test(gb.w), JSON.stringify({ hb, gb }));
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
