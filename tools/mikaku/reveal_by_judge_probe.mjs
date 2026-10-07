// 二人対戦: ホスト（子ども）の答えは、ゲスト（親）が〇✕を押したときに開く（2026-10-08・ユーザー）
//   ユーザー原文「ホストの答えを出すタイミングを、時間や本人が答えを見るを押したときじゃなくて、親がまるばつを付けたタイミングで見れるようにしてほしい」
// 本物の Chrome 2枚（390x844）＋まねごとの待ち合わせ先。一問一答（社会）と大問の小問（理科）の両方
// 使い方: node tools/mikaku/reveal_by_judge_probe.mjs   スクショは tools/mikaku/shots_reveal_by_judge/（コミットしない）
// 見ること（一問一答・小問それぞれ）:
//   R1 ホストの画面に「こたえを見る」が出ない（ゲストには出る）
//   R2 ホストの答える時間（チーズ）が切れても、ホストの答えは開かない
//   R3 ゲストが〇（✕）を押すと、ホストの答えが開く（ゲストのふだ「あなたの判定で…」）・ホストの判定ボタンも出る
//   R4 子どもが「スキップ」→ 今までどおり答えを見せる（あとでもう一度）
//   R5 考える時間の時間切れ → 答えは開かない（あとでもう一度）
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_reveal_by_judge"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "b3f7f51";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "revealjudge" });
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
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
// 考える時間 3秒（小問は2倍）・答える時間 3秒（小問は2倍）・判定の時間は長く（ゲストが自動〇にならないように）
const SEED = (arg) => {
  const [mig, kind] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  const times = { headStartSec: 3, answerTimeSec: 3, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 };
  if (kind === "qa") {
    const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify(Object.assign({ subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: 4, shuffle: false, filterUnmastered: false, filterWeak: false, fairMode: false }, times)));
    return;
  }
  const now = Date.now();
  const g = DAIMON_DATA.find(g => !g.paper && !g.long && g.items.length >= 3 && g.items.length <= 6);
  const units = [...new Set(QA_DATA.filter(d => d.subj === "理科").map(d => d.u))];
  const known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 };
  const st = {};
  QA_DATA.forEach(d => { if (d.subj === "理科" && d.kind !== "daimon") st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => { if (h !== g) h.items.forEach(it => { st[it.id] = Object.assign({}, known); }); });
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify(Object.assign({ subject: "理科", unitsBySubject: { "理科": units }, units: units, count: g.items.length, shuffle: false, tiers: [0], filterUnmastered: false, filterWeak: false, fairMode: false, reviewAllUnits: true }, times)));
};

async function run(label, src, kind) {
  SERVED = src; const out = [];
  const tag = kind === "qa" ? "一問一答" : "小問";
  const F = kind === "qa" ? 1 : 2;   // 小問は時間が2倍
  const check = (n, ok, x) => out.push({ n: tag + " " + n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
    await page.goto(PAGE_URL); await page.waitForTimeout(500);
    return { ctx, page, errs };
  };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const aOpen = pg => pg.evaluate(() => document.getElementById("battle-a-block").classList.contains("show"));
  const badge = pg => pg.evaluate(() => { const e = document.getElementById("host-seen-badge"); return e && getComputedStyle(e).display !== "none" ? e.textContent : ""; });
  const enc = pg => pg.evaluate(() => { const e = document.getElementById("skip-encourage"); return e && getComputedStyle(e).display !== "none" ? e.textContent : ""; });
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + kind + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const host = await mk(), guest = await mk();
  try {
    await host.page.evaluate(SEED, [MIG, kind]);
    await guest.page.evaluate(SEED, [MIG, kind]);
    await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(800); await guest.page.waitForTimeout(800);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    // ===== 1問目: わかった → 答える時間 =====
    await waitVis(host.page, "#advance-btn", 30000);
    await tap(host.page, "#advance-btn");
    await waitVis(guest.page, "#answer-reveal-btn", 20000);
    await host.page.waitForTimeout(300);
    const r1 = { hostBtn: await vis(host.page, "#answer-reveal-btn"), guestBtn: await vis(guest.page, "#answer-reveal-btn"), hostCountdown: await vis(host.page, "#answer-countdown") };
    check("R1 ホストに「こたえを見る」が出ない（ゲストには出る）", !r1.hostBtn && r1.guestBtn, JSON.stringify(r1));
    await shot(host.page, "R1_host");
    // 答える時間（3秒・小問6秒）より長く待つ
    await host.page.waitForTimeout(3000 * F + 1500);
    const r2 = { hostOpen: await aOpen(host.page), hostJudge: await vis(host.page, "#judge-row"), banner: await host.page.$eval("#status-banner", e => e.textContent) };
    check("R2 答える時間が切れても、ホストの答えは開かない（" + r2.banner + "）", !r2.hostOpen && !r2.hostJudge, JSON.stringify(r2));
    await shot(host.page, "R2_host_timeup");
    // ゲストが答えを見て（いつでも見られる）〇を押す
    if (await vis(guest.page, "#answer-reveal-btn")) await tap(guest.page, "#answer-reveal-btn");
    await waitVis(guest.page, "#judge-row", 15000);
    await tap(guest.page, "#judge-ok");
    await host.page.waitForTimeout(900);
    const r3 = { hostOpen: await aOpen(host.page), hostJudge: await vis(host.page, "#judge-row"), badge: await badge(guest.page) };
    check("R3 ゲストの〇でホストの答えが開く・ホストの判定ボタンも出る（ゲストのふだ「" + r3.badge + "」）", r3.hostOpen && r3.hostJudge && /あなたの判定で/.test(r3.badge), JSON.stringify(r3));
    await shot(host.page, "R3_host_opened");
    await tap(host.page, "#judge-ok");
    await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
    // ===== 2問目: スキップ =====
    await tap(host.page, "#next-btn");
    await waitVis(host.page, "#skip-btn", 30000);
    await tap(host.page, "#skip-btn");
    await host.page.waitForTimeout(500);
    const r4 = { hostOpen: await aOpen(host.page), enc: await enc(host.page) };
    check("R4 スキップは今までどおり答えを見せる（" + r4.enc + "）", r4.hostOpen && /もう一度/.test(r4.enc), JSON.stringify(r4));
    await shot(host.page, "R4_skip");
    await tap(host.page, "#skip-continue-btn");
    // ===== 3問目: 考える時間の時間切れ =====
    await waitVis(host.page, "#advance-btn", 30000);
    await host.page.waitForFunction(() => { const e = document.getElementById("skip-encourage"); return e && getComputedStyle(e).display !== "none" && /時間切れ/.test(e.textContent); }, null, { timeout: 20000 });
    const r5 = { hostOpen: await aOpen(host.page), enc: await enc(host.page) };
    check("R5 考える時間の時間切れは答えを開かない（" + r5.enc + "）", !r5.hostOpen && /あとでもう一度/.test(r5.enc), JSON.stringify(r5));
    check("画面のエラー 0", host.errs.length + guest.errs.length === 0, host.errs.concat(guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); await shot(host.page, "ERR_host"); await shot(guest.page, "ERR_guest"); }
  finally { await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT + "（一問一答）", await run("base", BASELINE, "qa"));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
let ng = report("いまの index.html（一問一答）", await run("now", CURRENT, "qa"));
ng += report("いまの index.html（大問の小問）", await run("now", CURRENT, "daimon"));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
