// 「見るだけ（この端末の記録は送らない）」（2026-10-09）
// ユーザー「親のスマホでも、子どもと同じ『今日やること』を見たい。でも親のスマホの正誤の記録が kosuke-records に送られて子どもの記録とまざるのは困る」
// 本物の Chrome・390x844・まねの GitHub API サーバ（本物の GitHub には触らない）。使い方: node tools/mikaku/view_only_probe.mjs
// 見ること:
//   V1 ホームの「記録の送り先」に「見るだけ」のチェック。入れると端末に保存（kq_battle_view_only_v1）・数の欄に「この端末の記録です」
//   V2 「ためしに送る」→「見るだけなので送りません」・PUT 0
//   V3 開き直すと plan（index・セット）と battle/plan_done を読む。行の印は子どもの端末の印（✔できた／— やらなかった／まだ）。
//      この端末の印（できた）より子どもの端末の印を優先。「やらなかった」ボタンは出ない
//   V4 この端末で1行やり終えても PUT 0・ためる入れ物（IndexedDB kq_battle_outbox）も 0 件・行は子どもの端末の印のまま・この端末の記録（stats）は残る
//   V5 見るだけを外すと数の欄の知らせが消え、送り始める（PUT が出る）＝止めていたのは見るだけ
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_view_only"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "5d5b165";   // 直す前（「見るだけ」が無い版）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "view_only" });
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
const SETS = {
  "plan/index.json": { sets: [1, 2] },
  "plan/0001.json": { no: 1, label: "10/9 のぶん", items: [
    { subj: "理科", title: "朝：心臓と血管（2枚）", ids: ["r6p12", "r6p11"] },
    { subj: "理科", title: "昼：血液（2枚）", ids: ["r6p22", "r6p21"] },
    { subj: "理科", title: "夜：もう一度（1枚）", ids: ["r6p13"] } ] },
  "plan/0002.json": { no: 2, label: "10/10 のぶん", items: [ { subj: "理科", title: "④（1枚）", ids: ["r6p31"] } ] }
};
// 子どもの端末が送った plan_done（行0 できた・行1 やらなかった・行2 まだ）
const CHILD_DONE = { app: "battle", no: 1, label: "10/9 のぶん", all: false, at: "2026-10-09T07:00:00.000Z", items: [
  { i: 0, subj: "理科", title: "朝：心臓と血管（2枚）", done: true, doneAt: "2026-10-09T07:00:00.000Z", miss: [] },
  { i: 1, subj: "理科", title: "昼：血液（2枚）", done: false, doneAt: "", miss: [], skipped: true, skippedAt: "2026-10-09T08:00:00.000Z" },
  { i: 2, subj: "理科", title: "夜：もう一度（1枚）", done: false, doneAt: "", miss: [] } ] };
const TOKEN = "github_pat_TESTONLY_1234567890";
let puts = [], gets = [], written = new Map();
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version" };
const api = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const send = (st, o) => { res.writeHead(st, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify(o)); };
    const m = /^\/repos\/nambanamba\/kosuke-records\/contents\/([^?]+)/.exec(req.url);
    if (!m) return send(404, {});
    const p = decodeURIComponent(m[1]);
    if (req.headers.authorization !== "Bearer " + TOKEN) return send(401, { message: "Bad credentials" });
    if (req.method === "GET") {
      gets.push(p);
      if (SETS[p]) return send(200, { sha: "x", content: Buffer.from(JSON.stringify(SETS[p]), "utf8").toString("base64") });
      const w = written.get(p); return w ? send(200, { sha: w.sha, content: Buffer.from(JSON.stringify(w.content), "utf8").toString("base64") }) : send(404, {});
    }
    if (req.method === "PUT") { puts.push(p); const j = JSON.parse(b), w = written.get(p); if (w && j.sha !== w.sha) return send(409, {}); const sha = "s" + Math.random(); written.set(p, { sha, content: JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) }); return send(w ? 200 : 201, {}); }
    send(405, {});
  });
});
await new Promise(r => api.listen(0, "127.0.0.1", r));
const API_URL = "http://127.0.0.1:" + api.address().port;
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
const SEED = (arg) => {
  const [mig, cfg, k2] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "理科", count: 5, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
  localStorage.setItem("kq_battle_send_snapday_v1", "2000-01-01");
  // この端末（親）では行2を「できた」にしてある → 見るだけでは子どもの端末の「まだ」を出すこと
  localStorage.setItem("kq_battle_plan_done_v2", JSON.stringify({ 1: { [k2]: Date.now() } }));
};
const K2 = "2:夜：もう一度（1枚）";

async function run(label, src) {
  SERVED = src; puts = []; gets = []; written = new Map([["battle/plan_done/0001.json", { sha: "c1", content: CHILD_DONE }]]); const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  const vis = sel => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const rows = () => pg.evaluate(() => [...document.querySelectorAll("#plan-cur .plan-row")].map(r => ({
    m: r.querySelector(".plan-mark").textContent, skip: !!r.querySelector(".plan-skip-btn"),
    starts: [...r.querySelectorAll(".plan-start-btn")].filter(b => b.offsetParent !== null).map(b => b.textContent).join("|") })));
  const onSolo = () => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const status = () => pg.evaluate(() => (document.getElementById("send-status") || {}).textContent || "");
  const outboxCount = () => pg.evaluate(async () => {
    if (indexedDB.databases) { const dbs = await indexedDB.databases(); if (!dbs.some(d => d.name === "kq_battle_outbox")) return 0; }
    return await new Promise(res => { const r = indexedDB.open("kq_battle_outbox"); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains("q")) { db.close(); return res(0); }
      const q = db.transaction(["q"], "readonly").objectStore("q").count(); q.onsuccess = () => { db.close(); res(q.result); }; q.onerror = () => res(-1); }; r.onerror = () => res(-1); });
  });
  try {
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, K2]);
    // 起動直後の送信（snapshot）を出させないため、見るだけを入れるのは最初の画面を読み込む前（チェックの操作は V1 で別に見る）
    await pg.reload(); await pg.waitForTimeout(300);
    // V1 チェックを入れる
    const hasBox = await pg.evaluate(() => !!document.getElementById("send-viewonly"));
    const lab = await pg.evaluate(() => { const e = document.getElementById("send-viewonly"); return e && e.closest("label") ? e.closest("label").textContent.trim() : ""; });
    await pg.evaluate(() => { const e = document.getElementById("send-viewonly"); if (!e) throw new Error("見るだけのチェックが無い"); e.click(); });
    await pg.waitForTimeout(300);
    const saved = await pg.evaluate(() => localStorage.getItem("kq_battle_view_only_v1"));
    const note = await vis("#stat-viewonly-note"), noteTxt = await pg.evaluate(() => (document.getElementById("stat-viewonly-note") || {}).textContent || "");
    check("V1 「見るだけ（この端末の記録は送らない）」のチェック・端末に保存・数の欄に「この端末の記録です」", hasBox && /見るだけ（この端末の記録は送らない）/.test(lab) && saved === "1" && note && /この端末の記録です/.test(noteTxt), JSON.stringify({ lab, saved, note, noteTxt }));
    await pg.waitForTimeout(2500);   // 起動後の自動送信（1.5秒後）が出ないことも V2 の PUT 0 で見る
    // V2 ためしに送る
    await pg.$eval("#send-test-btn", e => e.click()); await pg.waitForTimeout(800);
    const st2 = await status();
    check("V2 「ためしに送る」→「見るだけなので送りません」・PUT 0（起動後の自動送信もなし）", /見るだけなので送りません/.test(st2) && puts.length === 0, JSON.stringify({ st2, puts }));
    // V3 開き直す → plan と plan_done を読む・子どもの端末の印
    gets = [];
    await pg.reload(); await pg.waitForTimeout(2500);
    const r3 = await rows();
    const readPlan = gets.includes("plan/index.json") && gets.includes("plan/0001.json"), readDone = gets.includes("battle/plan_done/0001.json");
    check("V3 開き直すと plan（index・セット）と battle/plan_done を読む", readPlan && readDone, JSON.stringify(gets));
    check("V3 行の印は子どもの端末の印（✔ できた／— やらなかった／まだ）。この端末の「できた」より優先・「やらなかった」ボタンは出ない",
      r3.length === 3 && r3[0].m === "✔ できた" && r3[1].m === "— やらなかった" && r3[2].m === "まだ" && r3[2].starts === "一人で|二人で" && r3.every(r => !r.skip), JSON.stringify(r3));
    await pg.screenshot({ path: path.join(SHOTS, label + "_V3.png"), fullPage: true }).catch(() => {});
    // V4 この端末で行2を一人でやり終える
    const statsBefore = await pg.evaluate(() => localStorage.getItem("kq_battle_stats_v1") || "");
    await pg.evaluate(() => document.querySelectorAll("#plan-cur .plan-row")[2].querySelector(".plan-start-btn").click()); await pg.waitForTimeout(300);
    for (let k = 0; k < 6 && (await onSolo()); k++) { await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(80); await pg.$eval("#solo-judge-ok", e => e.click()); await pg.waitForTimeout(180); }
    await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h) h.click(); }); await pg.waitForTimeout(1500);
    const r4 = await rows(), ob = await outboxCount();
    const statsAfter = await pg.evaluate(() => localStorage.getItem("kq_battle_stats_v1") || "");
    check("V4 この端末で1行やり終えても PUT 0・ためる入れ物 0 件・行は子どもの端末の「まだ」のまま・この端末の記録（stats）は残る",
      puts.length === 0 && ob === 0 && r4[2] && r4[2].m === "まだ" && statsAfter !== statsBefore && /r6p13/.test(statsAfter), JSON.stringify({ puts, ob, r4: r4[2] }));
    // V5 見るだけを外す → 知らせが消え、送り始める
    await pg.evaluate(() => document.getElementById("send-viewonly").click()); await pg.waitForTimeout(2500);
    const note5 = await vis("#stat-viewonly-note");
    check("V5 見るだけを外すと「この端末の記録です」が消え、送り始める（PUT が出る）", !note5 && puts.length > 0 && (await pg.evaluate(() => localStorage.getItem("kq_battle_view_only_v1"))) === null, JSON.stringify({ note5, puts }));
    check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
