// ひとこと（2026-10-10 ユーザー「テストの練習だよ、3秒以内に答えてね、というメッセージをアプリから子どもに送れませんか？」）
// 本物の Chrome（390x844）・まねの GitHub API サーバ・まねごとの待ち合わせ先。使い方: node tools/mikaku/kid_message_probe.mjs
// 見ること:
//   K1 今日やることの「一人で」→ 1問目の前にカード。行に start_msg が無ければセットの start_msg・押すと消える
//   K2 行の start_msg はセットのより優先・3秒で自動で消える・カードの下で1問目は出ている
//   K3 start_msg が行にもセットにも無い → カードは出ない
//   K4 「二人で」→ ホスト（子ども）にカード → 対戦が始まったら消える
//   K5 ゲスト（親）の対戦画面にだけ「ひとこと」ボタン（ホストには出ない）・定型文4つ
//   K6 ゲストが選ぶ → ホストの画面の上に出る・数秒で消える・記録（kq_battle_stats_v1）は変わらない
//   K7 古い版のホスト（BASE_COMMIT）に新しい版のゲストが送っても、ホストはエラーなし・対戦はそのまま続く
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_kid_message"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "01728b8";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "kidmsg" });
function withFakeRelay(s) { const i0 = s.indexOf("const RELAY_URLS = ["), i1 = s.indexOf("];", i0); return s.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + s.slice(i1); }
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const [p0, qs] = req.url.split("?");
  const rel = decodeURIComponent(p0).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { const src = /(^|&)v=base(&|$)/.test(qs || "") ? BASELINE : SERVED; res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(withFakeRelay(src), "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const SET_MSG = "テストの練習だよ！3秒で答えてね";
const ROW_MSG = "まずは心臓から！";
let SETS = {};
const SETS_WITH = {
  "plan/index.json": { sets: [1] },
  "plan/0001.json": { no: 1, label: "10/10 のぶん", start_msg: SET_MSG, items: [
    { subj: "理科", title: "心臓（2枚）", ids: ["r6p12", "r6p11"] },
    { subj: "理科", title: "血液（2枚）", ids: ["r6p22", "r6p21"], start_msg: ROW_MSG } ] } };
const SETS_WITHOUT = {
  "plan/index.json": { sets: [1] },
  "plan/0001.json": { no: 1, label: "10/10 のぶん", items: [ { subj: "理科", title: "心臓（2枚）", ids: ["r6p12", "r6p11"] } ] } };
const TOKEN = "github_pat_TESTONLY_1234567890";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version" };
const api = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const send = (st, o) => { res.writeHead(st, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify(o)); };
    const m = /^\/repos\/nambanamba\/kosuke-records\/contents\/([^?]+)/.exec(req.url);
    if (!m) return send(404, {});
    const p = decodeURIComponent(m[1]);
    if (req.headers.authorization !== "Bearer " + TOKEN) return send(401, { message: "Bad credentials" });
    if (req.method === "GET") { if (p.startsWith("plan/") && SETS[p]) return send(200, { sha: "x", content: Buffer.from(JSON.stringify(SETS[p]), "utf8").toString("base64") }); return send(404, {}); }
    if (req.method === "PUT") return send(201, {});
    send(405, {});
  });
});
await new Promise(r => api.listen(0, "127.0.0.1", r));
const API_URL = "http://127.0.0.1:" + api.address().port;
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
const SEED = (arg) => {
  const [mig, cfg] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: 4, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (cfg) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
};
const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
const shown = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none"); }, sel);   // position:fixed は offsetParent が null
const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 30000 });
const cardText = pg => pg.evaluate(() => { const o = document.getElementById("start-msg-overlay"); return o && getComputedStyle(o).display !== "none" ? document.getElementById("start-msg-text").textContent : ""; });
const toastText = pg => pg.evaluate(() => { const o = document.getElementById("kidmsg-toast"); return o && getComputedStyle(o).display !== "none" ? o.textContent : ""; });
const startRow = (pg, i, which) => pg.evaluate(a => document.querySelectorAll("#plan-cur .plan-row")[a[0]].querySelectorAll(".plan-start-btn")[a[1]].click(), [i, which || 0]);
async function mk(errs, tag, url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage();
  pg.on("pageerror", e => errs.push(tag + ": " + String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  await pg.goto(url || PAGE_URL); return { ctx, pg };
}
async function seedPlan(pg, sets) { SETS = sets; await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); await pg.reload(); await pg.waitForTimeout(1800); }

async function run(label, src) {
  SERVED = src; const out = []; const errs = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png") }).catch(() => {});
  // ===== 一人 =====
  const a = await mk(errs, "solo");
  try {
    await seedPlan(a.pg, SETS_WITH);
    await startRow(a.pg, 0); await a.pg.waitForTimeout(400);
    const k1 = { card: await cardText(a.pg), onSolo: await a.pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active")) };
    await shot(a.pg, "K1_card");
    await a.pg.click("#start-msg-overlay").catch(() => {}); await a.pg.waitForTimeout(200);
    k1.after = await cardText(a.pg);
    check("K1 一人で → セットの start_msg のカード・押すと消える", k1.card === SET_MSG && k1.onSolo && k1.after === "", JSON.stringify(k1));
    await a.pg.goto(PAGE_URL); await a.pg.waitForTimeout(1800);
    await startRow(a.pg, 1); await a.pg.waitForTimeout(400);
    const k2 = { card: await cardText(a.pg), q: await a.pg.$eval("#solo-q-id", e => e.textContent).catch(() => "") };
    await a.pg.waitForTimeout(3300);
    k2.after3s = await cardText(a.pg);
    check("K2 行の start_msg が優先・3秒で自動で消える・1問目は出ている（" + k2.q + "）", k2.card === ROW_MSG && k2.after3s === "" && /r6p22/.test(k2.q), JSON.stringify(k2));
    await seedPlan(a.pg, SETS_WITHOUT);
    await startRow(a.pg, 0); await a.pg.waitForTimeout(400);
    const k3 = { card: await cardText(a.pg), onSolo: await a.pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active")) };
    check("K3 start_msg が無い → カードは出ない", k3.card === "" && k3.onSolo, JSON.stringify(k3));
  } catch (e) { check("一人: 最後まで走った", false, String(e && e.message || e).split("\n")[0]); await shot(a.pg, "ERR_solo"); }
  finally { await a.ctx.close(); }
  // ===== 二人（今日やることの「二人で」） =====
  const h = await mk(errs, "host"), g = await mk(errs, "guest");
  try {
    await seedPlan(h.pg, SETS_WITH);
    await g.pg.evaluate(SEED, [MIG, null]); await g.pg.reload(); await g.pg.waitForTimeout(800);
    await startRow(h.pg, 0, 1);
    await h.pg.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const k4 = { cardWaiting: await cardText(h.pg) };
    await shot(h.pg, "K4_host_waiting");
    const code = await h.pg.$eval("#room-code-display", e => e.textContent);
    await g.pg.$eval("#go-join", e => e.click()); await g.pg.fill("#join-code-input", code); await g.pg.$eval("#join-btn", e => e.click());
    await waitVis(h.pg, "#start-together-btn", 60000);
    await h.pg.$eval("#start-together-btn", e => e.click()); await g.pg.$eval("#join-start-together-btn", e => e.click());
    await waitVis(h.pg, "#advance-btn", 30000);
    k4.cardStarted = await cardText(h.pg);
    check("K4 「二人で」→ ホストにカード（" + k4.cardWaiting + "）→ 対戦が始まったら消える", k4.cardWaiting === SET_MSG && k4.cardStarted === "", JSON.stringify(k4));
    await g.pg.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 20000 });
    const k5 = { guestBtn: await vis(g.pg, "#kidmsg-btn"), hostBtn: await vis(h.pg, "#kidmsg-btn") };
    if (k5.guestBtn) await g.pg.click("#kidmsg-btn");
    await g.pg.waitForTimeout(200);
    k5.phrases = await g.pg.$$eval("#kidmsg-menu .kidmsg-phrase", bs => bs.map(b => b.textContent)).catch(() => []);
    k5.menuShown = await shown(g.pg, "#kidmsg-menu");
    await shot(g.pg, "K5_guest_menu");
    check("K5 ゲストにだけ「ひとこと」・定型文4つ", k5.guestBtn && !k5.hostBtn && k5.menuShown && k5.phrases.length === 4 && k5.phrases[0] === "テストの練習だよ！3秒で答えてね", JSON.stringify(k5));
    const st0 = await h.pg.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
    if (k5.menuShown) await g.pg.click("#kidmsg-menu .kidmsg-phrase >> nth=0");
    await h.pg.waitForFunction(() => { const o = document.getElementById("kidmsg-toast"); return o && getComputedStyle(o).display !== "none"; }, null, { timeout: 8000 }).catch(() => {});
    const k6 = { host: await toastText(h.pg), guest: await toastText(g.pg), menuAfter: await shown(g.pg, "#kidmsg-menu") };
    await shot(h.pg, "K6_host_toast");
    await h.pg.waitForTimeout(4500);
    k6.hostAfter = await toastText(h.pg);
    k6.statsSame = (await h.pg.evaluate(() => localStorage.getItem("kq_battle_stats_v1"))) === st0;
    k6.stillPlaying = await vis(h.pg, "#advance-btn");
    check("K6 ゲストが選ぶ → ホストの上に出る（" + k6.host + "）・数秒で消える・記録は変わらない", k6.host === "テストの練習だよ！3秒で答えてね" && /送りました/.test(k6.guest) && !k6.menuAfter && k6.hostAfter === "" && k6.statsSame && k6.stillPlaying, JSON.stringify(k6));
  } catch (e) { check("二人: 最後まで走った", false, String(e && e.message || e).split("\n")[0]); await shot(h.pg, "ERR_host"); await shot(g.pg, "ERR_guest"); }
  finally { await h.ctx.close(); await g.ctx.close(); }
  check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
  return out;
}
// 古い版のホスト × 新しい版のゲスト
async function runCompat() {
  SERVED = CURRENT; const out = []; const errs = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const h = await mk(errs, "oldhost", PAGE_URL + "?v=base"), g = await mk(errs, "guest");
  try {
    for (const p of [h.pg, g.pg]) { await p.evaluate(SEED, [MIG, null]); await p.reload(); await p.waitForTimeout(800); }
    await h.pg.$eval("#create-btn", e => e.click());
    await h.pg.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await h.pg.$eval("#room-code-display", e => e.textContent);
    await g.pg.$eval("#go-join", e => e.click()); await g.pg.fill("#join-code-input", code); await g.pg.$eval("#join-btn", e => e.click());
    await waitVis(h.pg, "#start-together-btn", 60000);
    await h.pg.$eval("#start-together-btn", e => e.click()); await g.pg.$eval("#join-start-together-btn", e => e.click());
    await waitVis(h.pg, "#advance-btn", 30000);
    await g.pg.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 20000 });
    await g.pg.click("#kidmsg-btn"); await g.pg.click("#kidmsg-menu .kidmsg-phrase >> nth=2");
    await h.pg.waitForTimeout(1200);
    const q1 = await h.pg.$eval("#battle-q-id", e => e.textContent);
    await h.pg.$eval("#advance-btn", e => e.click());
    await g.pg.waitForFunction(i => document.getElementById("battle-q-id").textContent === i && getComputedStyle(document.getElementById("battle-view")).display !== "none", q1, { timeout: 20000 });
    await g.pg.$eval("#answer-reveal-btn", e => e.click());
    await waitVis(g.pg, "#judge-row", 15000); await g.pg.$eval("#judge-ok", e => e.click());
    await waitVis(h.pg, "#judge-row", 15000); await h.pg.$eval("#judge-ok", e => e.click());
    const nextOk = await h.pg.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 }).then(() => true).catch(() => false);
    check("K7 古い版のホストに送っても、エラーなし・対戦はそのまま続く（1問目を判定して「つぎへ」まで）", nextOk && errs.length === 0, errs.join(" | "));
  } catch (e) { check("K7 最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await h.ctx.close(); await g.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
let ng = report("いまの index.html", await run("now", CURRENT));
ng += report("古い版のホスト × いまのゲスト", await runCompat());
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
