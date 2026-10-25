// ★2026-10-25 一人の一問一答で、問題が出てから 理科15秒・社会8秒 たったら「スキップ」をやさしく光らせる（ユーザー承認）
//   ・時間切れにはしない（10-05「一人は時間制限なし」）・音なし・責める文なし・対戦は変えない・大問の小問は対象外
// 本物の Chrome・まねごとの待ち合わせ先（対戦の確認用）。本物の時計で待つので、1回 1分半ほどかかる。
// 使い方: node tools/mikaku/skip_glow_probe.mjs   スクショは tools/mikaku/shots_skipglow/（コミットしない）
// 見ること:
//   S1 社会: 7秒ではまだ光らない → 8秒すぎで光る（.skip-glow・点滅のアニメーション）→ 20秒まで待っても時間切れにならない
//      （「こたえを見る」が出たまま・時間切れの文なし・答えは開かない・記録は変わらない・新しい文が出ない）→「こたえを見る」で消える
//   S2 次の問題に進むと、光っていない状態から始まる
//   S3 理科: 14秒ではまだ光らない → 15秒すぎで光る・時間切れにならない
//   S4 大問の小問（一人）では光らない
//   S5 二人のホストのスキップ（#skip-btn）は光らない（画面のどこにも .skip-glow が無い）
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_skipglow"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "7fa18e0";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "skipglow" });
let SERVED = CURRENT;
function withFakeRelay(s) { const i0 = s.indexOf("const RELAY_URLS = ["), i1 = s.indexOf("];", i0); return s.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + s.slice(i1); }
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(withFakeRelay(SERVED), "utf8")); return; }
  if (rel === "sw.js") { res.writeHead(404).end(); return; }   // 対照と今の版を入れかえて出すので、保存（Service Worker）は使わせない
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
// ids だけ答える（ほかの同じ科目の一問一答と大問の小問は全部おぼえ済み）
const SEED = (arg) => {
  const [mig, ids, o] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }, st = {};
  QA_DATA.forEach(d => { if (d.subj === o.subj && d.kind !== "daimon" && !ids.includes(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { if (!ids.includes(it.id)) st[it.id] = Object.assign({}, known); }));
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: o.subj, unitsBySubject: { [o.subj]: [o.unit] }, units: [o.unit], count: o.count || ids.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
};
const SHAKAI = { subj: "社会", unit: "第6回.鎌倉時代", ids: ["g6r48", "g6r49"] };
const RIKA = { subj: "理科", unit: "第1回.生物のつながり", ids: ["r1m01"] };
const DAIMON_IDS = ["g6d110", "g6d111", "g6d112", "g6d113", "g6d114"];   // 社会 第6回 練習2
const STATE = (btnSel) => {
  const vis = e => !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null);
  const sk = document.querySelector(btnSel);
  return {
    qid: (document.getElementById("solo-q-id").textContent || "").replace(/^No\./, "") || null,
    skipVis: vis(sk), glow: !!(sk && sk.classList.contains("skip-glow")),
    anim: sk ? getComputedStyle(sk).animationName : "",
    anyGlow: document.querySelectorAll(".skip-glow").length,
    revealVis: vis(document.getElementById("solo-reveal-btn")),
    timeupVis: vis(document.getElementById("solo-timeup-note")) || vis(document.getElementById("solo-timeup-next-btn")),
    aOpen: document.getElementById("solo-a-block").classList.contains("show"),
    judgeVis: vis(document.getElementById("solo-judge-row")),
    stats: localStorage.getItem("kq_battle_stats_v1"),
    text: document.getElementById("screen-solo").innerText.replace(/[0-9０-９.]+/g, "#"),   // ⚡の数（時間で減る）は数字だけ伏せて比べる
  };
};
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const errs = [];
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page }; };
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const startSolo = async (pg, o, ids, count) => {
    await pg.evaluate(SEED, [MIG, ids, { subj: o.subj, unit: o.unit, count }]); await pg.reload(); await pg.waitForTimeout(800);
    await tap(pg, "#solo-start-btn");
    await waitVis(pg, "#solo-reveal-btn");
    return Date.now();
  };
  const at = async (pg, t0, sec) => { const w = t0 + sec * 1000 - Date.now(); if (w > 0) await pg.waitForTimeout(w); return pg.evaluate(STATE, "#solo-skip-btn"); };
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    const pg = solo.page;
    // ===== S1 社会 8秒 =====
    let t0 = await startSolo(pg, SHAKAI, SHAKAI.ids, 2);
    const s0 = await pg.evaluate(STATE, "#solo-skip-btn");
    check("S1 社会: 1問目が名指しの問題（" + s0.qid + "）・スキップが出ている・はじめは光っていない", SHAKAI.ids.includes(s0.qid) && s0.skipVis && !s0.glow, JSON.stringify({ qid: s0.qid, skipVis: s0.skipVis, glow: s0.glow }));
    const s7 = await at(pg, t0, 7);
    check("S1 社会: 7秒ではまだ光らない", s7.skipVis && !s7.glow);
    const s9 = await at(pg, t0, 8.8);
    await shot(pg, "S1_shakai_9s");
    check("S1 社会: 8秒すぎで光る（.skip-glow・アニメーション " + s9.anim + "）", s9.glow && s9.anim === "skipGlowPulse");
    const s20 = await at(pg, t0, 20);
    check("S1 社会: 20秒たっても時間切れにならない（こたえを見るが出たまま・時間切れの文なし・答えは閉じたまま・記録は変わらない・文は増えない）",
      s20.revealVis && s20.skipVis && !s20.timeupVis && !s20.aOpen && !s20.judgeVis && s20.stats === s0.stats && s20.text === s0.text,
      JSON.stringify({ reveal: s20.revealVis, timeup: s20.timeupVis, aOpen: s20.aOpen, statsSame: s20.stats === s0.stats, textSame: s20.text === s0.text }));
    check("S1 社会: 20秒でも光ったまま", s20.glow);
    await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(200);
    const sr = await pg.evaluate(STATE, "#solo-skip-btn");
    check("S1 社会: 「こたえを見る」で光は消える（画面に .skip-glow 0）", sr.anyGlow === 0 && !sr.glow);
    // ===== S2 次の問題は光らない状態から =====
    await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(300);
    const t1 = Date.now();
    const n0 = await pg.evaluate(STATE, "#solo-skip-btn");
    check("S2 次の問題（" + n0.qid + "）は光っていない状態から", n0.qid !== s0.qid && n0.skipVis && !n0.glow, JSON.stringify({ qid: n0.qid, glow: n0.glow }));
    const n9 = await at(pg, t1, 9);
    check("S2 次の問題も 8秒すぎで光る", n9.glow);
    // ===== S3 理科 15秒 =====
    t0 = await startSolo(pg, RIKA, RIKA.ids, 1);
    const r0 = await pg.evaluate(STATE, "#solo-skip-btn");
    check("S3 理科: 1問目が名指しの問題（" + r0.qid + "）・はじめは光っていない", r0.qid === "r1m01" && r0.skipVis && !r0.glow, JSON.stringify({ qid: r0.qid }));
    const r9 = await at(pg, t0, 9);
    check("S3 理科: 9秒（社会の秒）では光らない", !r9.glow);
    const r14 = await at(pg, t0, 14);
    check("S3 理科: 14秒ではまだ光らない", !r14.glow);
    const r16 = await at(pg, t0, 15.8);
    await shot(pg, "S3_rika_16s");
    check("S3 理科: 15秒すぎで光る", r16.glow && r16.anim === "skipGlowPulse");
    check("S3 理科: 時間切れにならない", r16.revealVis && !r16.timeupVis && !r16.aOpen && r16.stats === r0.stats && r16.text === r0.text);
    // ===== S4 大問の小問 =====
    t0 = await startSolo(pg, SHAKAI, DAIMON_IDS, DAIMON_IDS.length);
    const d10 = await at(pg, t0, 10);
    check("S4 一人の大問の小問（" + d10.qid + "）: 10秒たっても光らない", DAIMON_IDS.includes(d10.qid) && d10.skipVis && !d10.glow && d10.anyGlow === 0, JSON.stringify({ qid: d10.qid, skipVis: d10.skipVis, glow: d10.glow }));
    // ===== S5 二人のホスト =====
    for (const p of [host.page, guest.page]) { await p.evaluate(SEED, [MIG, ["g6r48"], { subj: "社会", unit: SHAKAI.unit }]); await p.reload(); await p.waitForTimeout(800); }
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    await waitVis(host.page, "#skip-btn", 30000);
    await host.page.waitForTimeout(10000);
    const b = await host.page.evaluate(() => { const e = document.getElementById("skip-btn"); return { vis: getComputedStyle(e).display !== "none", glow: e.classList.contains("skip-glow"), any: document.querySelectorAll(".skip-glow").length }; });
    const g = await guest.page.evaluate(() => document.querySelectorAll(".skip-glow").length);
    await shot(host.page, "S5_battle_host_10s");
    check("S5 二人のホスト: 10秒たってもスキップは光らない（ホスト・ゲストとも .skip-glow 0）", b.vis && !b.glow && b.any === 0 && g === 0, JSON.stringify(b) + " guest=" + g);
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
  check("画面のエラー 0", errs.length === 0, errs.join(" | "));
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
