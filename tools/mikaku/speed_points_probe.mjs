// ⚡スピードポイント（2026-10-10・ユーザー「早く先に進めるモチベーションがわくように」）と、
// 二人対戦の「わかった！」をなくした流れ（同じ日・ユーザー「もう親と早押し対決の意味はほとんどない」）
// 本物の Chrome（390x844）＋まねごとの待ち合わせ先。使い方: node tools/mikaku/speed_points_probe.mjs
//   スクショは tools/mikaku/shots_speed_points/（コミットしない）
// 見ること:
//  一人（基本10秒＝ふつうの時間10秒の、短い一問一答だけの単元）
//   P1 速いと3点（すぐ「こたえを見る」→〇 で ⚡⚡⚡ +3 と 〇 +1）・右上に今回のポイント・小さく「⚡⚡⚡ +3」
//   P2 素早い✕も3点（✕でも減らない）・素早いスキップも3点
//   P3 ⚡⚡⚡が5問続くと +5（「⚡5連続！」）
//   P4 ぐるぐるの出し直し（✕・スキップのあと）は0点
//   P5 終わりの画面に「今回・今日の⚡（きのうより+◯）・今週の合計・自己ベスト」・ホームに今日の合計
//   P6 〇✕の記録（kq_battle_stats_v1）は1回目の答えのとおり・ポイントの欄は入らない／学習ログの回に sp・spq
//  一人（基本1秒）: その問題のふつうの時間（右上の札の data-base）より 0.7秒おそく決める
//   P7 遅いと0点（〇なら +1 だけ）。素早い✕（3点）＞遅い〇（1点）
//  スイッチ「スピードポイント（⚡）を出さない」
//   P8 右上・小さい表示・終わりの画面・ホームに出ない（数えるのは続ける）
//  二人（基本10秒）
//   A1 子ども（ホスト）に「わかった！」が出ない・スキップは出る／問題は両方に同時に出る（ゲストには最初から答えと〇✕）
//   A2 親（ゲスト）の〇✕で子どもの答えが開く・子どもに〇✕（親の判定）は出ない・点の欄は子どもの〇の数だけ
//   B1 親がすぐ〇 → 3点＋1
//   B2 親が（ふつうの時間の3割＋1.2秒）後に〇 → 2秒を引くと3割以内 → 3点＋1（引かなければ2点）
//   B3 子どもがすぐスキップ → 3点（2秒は引かない）・出し直しで〇でも0点
//   B4 ポイントはホスト（子ども）の画面だけ。終わりの画面にも子どもの側だけ
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_speed_points"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "ce0ce6f";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "speedpoints" });
let SERVED = CURRENT;
function withFakeRelay(src) {
  const i0 = src.indexOf("const RELAY_URLS = ["), i1 = src.indexOf("];", i0);
  if (i0 < 0 || i1 < 0) throw new Error("RELAY_URLS が見つかりません");
  return src.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + src.slice(i1);
}
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

// 短い一問一答だけが先頭に count 問ならぶ社会の単元をえらび、そこだけを出す（ふつうの時間＝基本×1 になる）
const SEED = (o) => {
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1, "tiers-from-modes": 1 }));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_merge_all_v1", "1");   // 答えが2つのカードを分けない
  const simple = d => d.subj === "社会" && d.kind !== "calc" && d.kind !== "daimon" && !d.img && String(d.q).length <= 60 && !/[「（(]/.test(d.q)
    && !/[①-⑳…・、,]/.test(String(d.a)) && d.priority !== "低";
  const byU = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.kind !== "calc") (byU[d.u] = byU[d.u] || []).push(d); });
  const u = Object.keys(byU).find(k => byU[k].length >= o.count && byU[k].slice(0, o.count).every(simple));
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: o.count, shuffle: false, fairMode: false,
    headStartSec: o.base, answerTimeSec: 3, judgeTimeSec: 3, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (o.pre) localStorage.setItem("kq_battle_speed_points_v1", JSON.stringify({ days: o.pre }));
  if (o.off) localStorage.setItem("kq_battle_speed_points_off_v1", "1");
  return { u, ids: byU[u].slice(0, o.count).map(d => d.id) };
};
const dayKey = (t) => { const d = new Date(t), p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
const TODAY = dayKey(Date.now()), YDAY = dayKey(Date.now() - 864e5);

async function mk() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e).split("\n")[0])); page.on("dialog", d => d.accept().catch(() => {}));
  await page.goto(PAGE_URL); await page.waitForTimeout(400);
  return { ctx, page, errs };
}
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 20000 });
const txt = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
const today = pg => pg.evaluate(k => { try { return ((JSON.parse(localStorage.getItem("kq_battle_speed_points_v1") || "{}").days) || {})[k] || 0; } catch (e) { return -1; } }, TODAY);
const toastShown = pg => pg.evaluate(() => { const e = document.getElementById("sp-toast"); return e && e.classList.contains("show") ? e.textContent : ""; });
const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: true }).catch(() => {});

// ===== 一人 =====
async function soloStart(pg, seed) {
  const info = await pg.evaluate(SEED, seed);
  await pg.reload(); await pg.waitForTimeout(800);
  await tap(pg, "#solo-start-btn");
  await waitVis(pg, "#solo-reveal-btn");
  return info;
}
const PLAYED = [];
const baseOf = (pg, k) => pg.evaluate(k => +(document.getElementById(k + "-sp-now") || { dataset: {} }).dataset.base || 0, k);   // その問題の「ふつうの時間」（秒）
async function soloAnswer(pg, how, waitMs) {
  await waitVis(pg, how === "skip" ? "#solo-skip-btn" : "#solo-reveal-btn");
  await pg.evaluate(() => { const e = document.getElementById("sp-toast"); if (e) e.classList.remove("show"); });   // 前の問題の小さい表示を消してから
  PLAYED.push(String(await txt(pg, "#solo-q-id")).replace(/^No\./, ""));
  if (waitMs === "slow") waitMs = (await baseOf(pg, "solo")) * 1000 + 700;   // ふつうの時間より 0.7秒おそく
  if (waitMs) await pg.waitForTimeout(waitMs);
  if (how === "skip") { await tap(pg, "#solo-skip-btn"); await pg.waitForTimeout(150); const t = await toastShown(pg); await waitVis(pg, "#solo-skip-next-btn"); await tap(pg, "#solo-skip-next-btn"); return t; }
  await tap(pg, "#solo-reveal-btn");
  await waitVis(pg, "#solo-judge-ok");
  await tap(pg, how === "ok" ? "#solo-judge-ok" : "#solo-judge-ng");
  await pg.waitForTimeout(150);
  return toastShown(pg);
}
async function runSolo(label, src) {
  SERVED = src; const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const s = await mk();
  try {
    // ---- 基本10秒・6問 ----
    await soloStart(s.page, { count: 6, base: 10, pre: { [YDAY]: 5, "2026-01-01": 100 } });
    PLAYED.length = 0;
    const t1 = await soloAnswer(s.page, "ok");
    const p1 = { today: await today(s.page), now: await txt(s.page, "#solo-sp-now"), nowVis: await vis(s.page, "#solo-sp-now"), toast: t1 };
    check("P1 速く〇 → ⚡⚡⚡ +3 と 〇 +1（今日 4）・右上 ⚡4・小さく「⚡⚡⚡ +3」", p1.today === 4 && p1.now === "⚡4" && p1.nowVis && /⚡⚡⚡ \+3/.test(p1.toast) && /〇 \+1/.test(p1.toast), JSON.stringify(p1));
    await shot(s.page, label + "_P1_solo");
    const t2 = await soloAnswer(s.page, "ng");
    const p2a = await today(s.page);
    const t3 = await soloAnswer(s.page, "skip");
    const p2b = await today(s.page);
    check("P2 速く✕ → +3（減らない）・速くスキップ → +3", p2a === 7 && p2b === 10 && /⚡⚡⚡ \+3/.test(t2) && /⚡⚡⚡ \+3/.test(t3), JSON.stringify({ p2a, p2b, t2, t3 }));
    await soloAnswer(s.page, "ok");
    const t5 = await soloAnswer(s.page, "ok");
    const p3 = await today(s.page);
    check("P3 ⚡⚡⚡が5問続くと +5（「⚡5連続！」）（4+3+3+4+4+5 = 23）", p3 === 23 && /⚡5連続！ \+5/.test(t5), JSON.stringify({ p3, t5 }));
    await shot(s.page, label + "_P3_streak");
    await soloAnswer(s.page, "ok");   // 6問目 27
    const p4a = await today(s.page);
    const t7 = await soloAnswer(s.page, "ok");   // 2問目の出し直し
    const t8 = await soloAnswer(s.page, "ok");   // 3問目（スキップ）の出し直し
    await s.page.waitForFunction(() => document.getElementById("screen-solo-result").classList.contains("active"), null, { timeout: 10000 });
    const p4b = await today(s.page);
    check("P4 出し直し（✕のあと・スキップのあと）は0点（27 のまま・小さい表示も出ない）", p4a === 27 && p4b === 27 && !t7 && !t8, JSON.stringify({ p4a, p4b, t7, t8 }));
    const sum = await txt(s.page, "#solo-sp-summary");
    const sumVis = await vis(s.page, "#solo-sp-summary");
    check("P5 終わりの画面「今回 ⚡27・今日の⚡27（きのうより+22）・今週の合計・自己ベスト（1日）⚡100」", sumVis && /今回 ⚡27/.test(sum) && /今日の⚡27（きのうより\+22）/.test(sum) && /今週の合計 ⚡\d+/.test(sum) && /自己ベスト（1日）⚡100/.test(sum), sum);
    await shot(s.page, label + "_P5_result");
    // P6 記録と学習ログ
    const played6 = PLAYED.slice(0, 6);
    const rec = await s.page.evaluate(ids => { const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"); return ids.map(id => st[id] ? [st[id].correct || 0, st[id].wrong || 0] : null); }, played6);
    const rawStats = await s.page.evaluate(() => localStorage.getItem("kq_battle_stats_v1") || "");
    const exp = [[1, 0], [0, 1], [0, 1], [1, 0], [1, 0], [1, 0]];
    check("P6 〇✕の記録は1回目の答えのとおり（出し直しの〇は入らない）・記録にポイントの欄は無い", JSON.stringify(rec) === JSON.stringify(exp) && !/"sp/.test(rawStats), JSON.stringify(rec) + " " + PLAYED.join(","));
    const log = await s.page.evaluate(() => new Promise(res => { const r = indexedDB.open("kq_battle_study_log"); r.onsuccess = () => { try { const tx = r.result.transaction("sessions"); const q = tx.objectStore("sessions").getAll(); q.onsuccess = () => { const a = q.result.filter(x => x.k === "solo").sort((a, b) => b.st - a.st)[0]; res(a ? { sp: a.sp, spq: a.spq ? Object.keys(a.spq).length : -1 } : null); }; } catch (e) { res(String(e)); } }; r.onerror = () => res("open error"); }));
    check("P6 学習ログの回に sp（27）と spq（6問）", log && log.sp === 27 && log.spq === 6, JSON.stringify(log));
    await tap(s.page, "#solo-result-home-btn"); await s.page.waitForTimeout(300);
    const home = await txt(s.page, "#sp-home");
    check("P5 ホームに今日の合計「今日の⚡27」", (await vis(s.page, "#sp-home")) && home === "今日の⚡27", home);
    await shot(s.page, label + "_P5_home");
    // ---- 基本1秒（ふつうの時間 1秒）・2問: 遅い ----
    await soloStart(s.page, { count: 2, base: 1 });
    const t9 = await soloAnswer(s.page, "ok", "slow");
    const p7a = await today(s.page);
    await soloAnswer(s.page, "ng", "slow");
    const p7b = await today(s.page);
    check("P7 遅いと0点（〇なら +1 だけ・✕は0）。素早い✕（3点）＞遅い〇（1点）", p7a === 1 && p7b === 1 && /〇 \+1/.test(t9) && !/⚡/.test(t9), JSON.stringify({ p7a, p7b, t9 }));
    // ---- スイッチ ----
    await soloStart(s.page, { count: 2, base: 10, off: true });
    const t10 = await soloAnswer(s.page, "ok");
    const p8 = { nowVis: await vis(s.page, "#solo-sp-now"), toast: t10, today: await today(s.page) };
    await soloAnswer(s.page, "ok");
    await s.page.waitForFunction(() => document.getElementById("screen-solo-result").classList.contains("active"), null, { timeout: 10000 });
    p8.sumVis = await vis(s.page, "#solo-sp-summary");
    await tap(s.page, "#solo-result-home-btn"); await s.page.waitForTimeout(300);
    p8.homeVis = await vis(s.page, "#sp-home");
    p8.toggleOn = await s.page.evaluate(() => { const e = document.getElementById("sp-off-toggle"); return !!(e && e.classList.contains("on")); });
    p8.todayEnd = await today(s.page);
    check("P8 「出さない」で右上・小さい表示・終わりの画面・ホームに出ない（数えるのは続ける: 今日 8）", !p8.nowVis && !p8.toast && !p8.sumVis && !p8.homeVis && p8.toggleOn && p8.todayEnd === 8, JSON.stringify(p8));
    await s.page.$eval("#sp-off-toggle", e => e.click()); await s.page.waitForTimeout(200);
    const back = await txt(s.page, "#sp-home");
    check("P8 スイッチを戻すとホームに今日の合計が出る", (await vis(s.page, "#sp-home")) && back === "今日の⚡8", back);
    check("画面のエラー 0", s.errs.length === 0, s.errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); await shot(s.page, label + "_ERR_solo"); }
  finally { await s.ctx.close(); }
  return out;
}

// ===== 二人 =====
async function runBattle(label, src) {
  SERVED = src; const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const host = await mk(), guest = await mk();
  const qid = pg => txt(pg, "#battle-q-id");
  const aOpen = pg => pg.evaluate(() => document.getElementById("battle-a-block").classList.contains("show"));
  try {
    await host.page.evaluate(SEED, { count: 3, base: 10 });
    await guest.page.evaluate(SEED, { count: 3, base: 10 });
    await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(800); await guest.page.waitForTimeout(800);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await txt(host.page, "#room-code-display");
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    // ---- 1問目 ----
    await host.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active") && document.getElementById("battle-q-id").textContent, null, { timeout: 20000 });
    const h1 = await qid(host.page);
    await guest.page.waitForFunction(q => document.getElementById("battle-q-id").textContent === q, h1, { timeout: 1500 }).catch(() => {});
    const a1 = { host: h1, guest: await qid(guest.page), hostAdv: await vis(host.page, "#advance-btn"), hostSkip: await vis(host.page, "#skip-btn"), hostReveal: await vis(host.page, "#answer-reveal-btn"),
      hostOpen: await aOpen(host.page), guestOpen: await aOpen(guest.page), guestJudge: await vis(guest.page, "#judge-row"), guestReveal: await vis(guest.page, "#answer-reveal-btn") };
    check("A1 子どもに「わかった！」「こたえを見る」が出ない・スキップは出る", !a1.hostAdv && !a1.hostReveal && a1.hostSkip, JSON.stringify(a1));
    check("A1 問題は両方に同時に出る（1.5秒以内に同じ問題）・親には最初から答えと〇✕・子どもの答えは閉じたまま", a1.host && a1.host === a1.guest && a1.guestOpen && a1.guestJudge && !a1.guestReveal && !a1.hostOpen, JSON.stringify(a1));
    await shot(host.page, label + "_A1_host"); await shot(guest.page, label + "_A1_guest");
    await tap(guest.page, "#judge-ok");
    await host.page.waitForFunction(() => document.getElementById("battle-a-block").classList.contains("show"), null, { timeout: 10000 }).catch(() => {});
    await host.page.waitForTimeout(500);
    const boxes = pg => pg.evaluate(() => Array.from(document.querySelectorAll("#screen-battle .score-row .score-box")).filter(e => getComputedStyle(e).display !== "none").map(e => e.textContent.replace(/\s+/g, "")));
    const a2 = { hostOpen: await aOpen(host.page), hostJudge: await vis(host.page, "#judge-row"), hostSkip: await vis(host.page, "#skip-btn"), hostBoxes: await boxes(host.page), guestBoxes: await boxes(guest.page),
      hostNext: await host.page.evaluate(() => document.getElementById("next-btn").classList.contains("show")) };
    check("A2 親の〇で子どもの答えが開く・子どもに〇✕は出ない・つぎへ", a2.hostOpen && !a2.hostJudge && !a2.hostSkip && a2.hostNext, JSON.stringify(a2));
    check("A2 点の欄は子どもの〇の数だけ（ホスト「〇の数1」・ゲスト「子どもの〇の数1」）", JSON.stringify(a2.hostBoxes) === '["〇の数1"]' && JSON.stringify(a2.guestBoxes) === '["子どもの〇の数1"]', JSON.stringify(a2));
    const b1 = { today: await today(host.page), now: await txt(host.page, "#battle-sp-now"), nowVis: await vis(host.page, "#battle-sp-now"), guestNowVis: await vis(guest.page, "#battle-sp-now"), guestToday: await today(guest.page) };
    check("B1 親がすぐ〇 → 3点＋1（ホスト 今日 4・右上 ⚡4）", b1.today === 4 && b1.now === "⚡4" && b1.nowVis, JSON.stringify(b1));
    check("B4 ゲスト（親）の画面にはポイントが出ない・ためない", !b1.guestNowVis && b1.guestToday === 0, JSON.stringify(b1));
    await shot(host.page, label + "_B1_host");
    // ---- 2問目: 4秒後に〇 ----
    await tap(host.page, "#next-btn");
    await host.page.waitForFunction(q => document.getElementById("battle-q-id").textContent !== q, h1, { timeout: 10000 });
    const h2 = await qid(host.page);
    await guest.page.waitForFunction(q => document.getElementById("battle-q-id").textContent === q, h2, { timeout: 5000 });
    const base2 = await baseOf(host.page, "battle");
    const w2 = Math.round((0.3 * base2 + 1.2) * 1000);   // 2秒を引くと3割以内・引かなければ3割をこえる
    await host.page.waitForTimeout(w2);
    await tap(guest.page, "#judge-ok");
    await host.page.waitForFunction(() => document.getElementById("battle-a-block").classList.contains("show"), null, { timeout: 10000 }).catch(() => {});
    await host.page.waitForTimeout(200);
    const b2 = { base: base2, waitMs: w2, today: await today(host.page), toast: await toastShown(host.page) };
    check("B2 親が（ふつうの時間の3割＋1.2秒）後に〇 → 2秒を引いて3割以内 → 3点＋1（今日 8。引かなければ2点）", base2 >= 8 && b2.today === 8 && /⚡⚡⚡ \+3/.test(b2.toast), JSON.stringify(b2));
    // ---- 3問目: すぐスキップ → 出し直しで〇 ----
    await tap(host.page, "#next-btn");
    await host.page.waitForFunction(q => document.getElementById("battle-q-id").textContent !== q, h2, { timeout: 10000 });
    const h3 = await qid(host.page);
    await guest.page.waitForFunction(q => document.getElementById("battle-q-id").textContent === q, h3, { timeout: 5000 });
    await waitVis(host.page, "#skip-btn");
    await tap(host.page, "#skip-btn"); await host.page.waitForTimeout(150);
    const b3 = { today: await today(host.page), toast: await toastShown(host.page), guestJudge: await vis(guest.page, "#judge-row") };
    await waitVis(host.page, "#skip-continue-btn");
    await tap(host.page, "#skip-continue-btn");
    await guest.page.waitForFunction(q => document.getElementById("battle-q-id").textContent === q && getComputedStyle(document.getElementById("battle-view")).display !== "none", h3, { timeout: 8000 });
    await waitVis(guest.page, "#judge-ok");
    await tap(guest.page, "#judge-ok");
    await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 10000 });
    b3.after = await today(host.page);
    check("B3 子どもがすぐスキップ → 3点（今日 11）・出し直しの〇は0点（11 のまま）", b3.today === 11 && /⚡⚡⚡ \+3/.test(b3.toast) && b3.after === 11 && !b3.guestJudge, JSON.stringify(b3));
    await tap(host.page, "#next-btn");
    await host.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 10000 });
    await guest.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 10000 });
    const b4 = { hostSum: await txt(host.page, "#battle-sp-summary"), hostSumVis: await vis(host.page, "#battle-sp-summary"), guestSumVis: await vis(guest.page, "#battle-sp-summary"),
      hostScore: await txt(host.page, "#result-score"), guestScore: await txt(guest.page, "#result-score"), hostSub: await txt(host.page, "#result-sub") };
    check("B4 終わりの画面: 子どもの側に「今回 ⚡11」・親の側には出ない", b4.hostSumVis && /今回 ⚡11/.test(b4.hostSum) && !b4.guestSumVis, JSON.stringify(b4));
    check("A2 終わりの画面: 子どもの〇の数だけ（あなた：3問正解／子ども：3問正解・相手の点なし）", b4.hostScore === "あなた：3問正解" && b4.guestScore === "子ども：3問正解" && !b4.hostSub, JSON.stringify(b4));
    await shot(host.page, label + "_B4_result_host");
    check("画面のエラー 0", host.errs.length + guest.errs.length === 0, host.errs.concat(guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); await shot(host.page, label + "_ERR_host"); await shot(guest.page, label + "_ERR_guest"); }
  finally { await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
if (!process.env.NOBASE) {   // NOBASE=1 … 自己テストを飛ばす（直している最中だけ）
  console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
  const ngB = report("対照 " + BASE_COMMIT + "（一人）", await runSolo("base", BASELINE)) + report("対照 " + BASE_COMMIT + "（二人）", await runBattle("base", BASELINE));
  console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
  if (ngB === 0) await done(3);
}
let ng = report("いまの index.html（一人）", await runSolo("now", CURRENT));
ng += report("いまの index.html（二人）", await runBattle("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
