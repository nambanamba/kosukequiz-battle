// ★2026-11-14 ユーザー「ギリギリがありません」（二人の親の画面・分けての部分 r11m18~3）→ 分けての部分にも △ を出す
// 使い方: node tools/mikaku/giri_part_1114_probe.mjs（NOW_ONLY=1 で今の版だけ）。本物の Chrome 2枚・まねの待ち合わせ先
// 見ること（理科 第6回・12問・順番どおり。2問目から r6m29 の分けての部分）:
//   G1 親の画面: 分けての部分（r6m29~1）で「△ ぎりぎり」が出る
//   G2 △を押す → 子どもの端末の部分の記録: 〇の数 +1・lastGiri あり・連続の〇（box）は 0 のまま・h は増えない
//   G3 学習ログ（送った回）のその部分に △ の印
//   E  画面のエラー 0
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "83359d8";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "plan_keep_1106" });
function withFakeRelay(s) { if (process.env.REAL) return s; const i0 = s.indexOf("const RELAY_URLS = ["), i1 = s.indexOf("];", i0); return s.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + s.slice(i1); }
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
const R = ["g6r1","g6r2","g6r3","g6r4","g6r5","g6r6","g6r7","g6r8","g6r9","g6r10","g6r11","g6r12"];
const SETS = {
};
const TOKEN = "github_pat_TESTONLY_1234567890";
let written = new Map();
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
      if (p.startsWith("plan/")) { if (!SETS[p]) return send(404, {}); return send(200, { sha: "x", content: Buffer.from(JSON.stringify(SETS[p]), "utf8").toString("base64") }); }
      const w = written.get(p); return w ? send(200, { sha: w.sha }) : send(404, {});
    }
    if (req.method === "PUT") { const j = JSON.parse(b), w = written.get(p); if (w && j.sha !== w.sha) return send(409, {}); const sha = "s" + Math.random(); written.set(p, { sha, content: JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) }); return send(w ? 200 : 201, {}); }
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
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": ["第6回.鎌倉時代"], "理科": ["第6回.ヒトと動物の呼吸・循環"] }, units: ["第6回.鎌倉時代"], count: 12, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 60, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 3, skipNextTimeSec: 600, speedLevel: 2 }));
  if (cfg) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
};
async function run(label, src) {
  SERVED = src; written = new Map(); const out = [];
  const check = (n, ok, x) => { out.push({ n, ok: !!ok, x: x == null ? "" : String(x) }); console.log("  [" + label + "] " + (ok ? "✔" : "✘") + " " + n.slice(0, 60)); };
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(400); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = pg => pg.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
  const H = await mk(), G = await mk();
  const counter = () => H.page.$eval("#battle-counter", e => e.textContent.trim());
  const kidRows = () => H.page.evaluate(() => [...document.querySelectorAll("#plan-cur .plan-kid-row")].map(r => ({ subj: r.dataset.subj, sub: r.querySelector(".plan-kid-sub").textContent })));
  const reloadHost = async () => { await H.page.evaluate(() => localStorage.removeItem("kq_battle_last_code_v1")); await H.page.reload(); await H.page.waitForTimeout(1800); };
  const onResult = () => H.page.evaluate(() => document.getElementById("screen-result").classList.contains("active"));
  const startKidBattle = async (subj) => {
    await H.page.waitForSelector("#plan-cur .plan-kid-row", { timeout: 20000, state: "attached" });
    await H.page.evaluate(sj => { const r = document.querySelector('#plan-cur .plan-kid-row[data-subj="' + sj + '"]'); r.querySelector('.plan-kid-btn[data-kind="battle"]').click(); }, subj);
    await H.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await H.page.$eval("#room-code-display", e => e.textContent);
    await H.page.waitForTimeout(1500);
    await G.page.reload(); await G.page.waitForTimeout(800);
    await tap(G.page, "#go-join"); await G.page.fill("#join-code-input", code); await tap(G.page, "#join-btn");
    await waitVis(H.page, "#start-together-btn", 60000);
    await tap(H.page, "#start-together-btn"); await tap(G.page, "#join-start-together-btn");
    await H.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 30000 });
    await H.page.waitForTimeout(600);
  };
  const waitShown = async () => { await H.page.waitForFunction(() => { const e = document.querySelector("#skip-btn"); return e && getComputedStyle(e).display !== "none" && e.offsetParent !== null; }, null, { timeout: 30000 }).catch(() => {}); };
  const answerOne = async (ok) => {
    await waitShown();
    const id = await qid(H.page);
    await G.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 }).catch(() => {});
    await G.page.waitForTimeout(300);
    await waitVis(G.page, "#judge-row", 15000).catch(() => {});
    await tap(G.page, ok ? "#judge-ok" : "#judge-ng").catch(() => {});
    await H.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 }).catch(() => {});
    await tap(H.page, "#next-btn").catch(() => {}); await H.page.waitForTimeout(700);
    return id;
  };
  const skipOne = async () => {
    await waitShown();
    const id = await qid(H.page);
    await tap(H.page, "#skip-btn");
    await waitVis(H.page, "#skip-continue-btn", 15000).catch(() => {});
    await tap(H.page, "#skip-continue-btn").catch(() => {}); await H.page.waitForTimeout(700);
    return id;
  };
  const at = async () => { await waitShown(); return { c: await counter(), q: await qid(H.page), left: await H.page.$eval("#battle-left", e => e.textContent) }; };
  const endBattle = async () => {
    await tap(H.page, "#battle-end-btn"); await H.page.waitForTimeout(1200);
    await H.page.evaluate(() => { const b = document.getElementById("result-home-btn"); if (b) b.click(); }); await H.page.waitForTimeout(1200);
  };
  const sessFiles = () => [...written.keys()].filter(p => p.startsWith("battle/session/"));
  try {
    for (const [x, cfg] of [[H, { token: TOKEN, api: API_URL }], [G, null]]) { await x.page.evaluate(SEED, [MIG, cfg]); await x.page.reload(); await x.page.waitForTimeout(1800); }
    const lab = () => H.page.$eval("#next-btn", e => (e.querySelector(".fill-label") || e).textContent.trim());
    const judge = async (ok) => { await waitShown(); const id = await qid(H.page);
      await G.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i, id, { timeout: 20000 }).catch(() => {});
      await G.page.waitForTimeout(300); await waitVis(G.page, "#judge-row", 15000).catch(() => {});
      await tap(G.page, ok ? "#judge-ok" : "#judge-ng");
      await H.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 15000 }).catch(() => {});
      return id; };
    await startKidBattle("理科");
    await judge(true); await tap(H.page, "#next-btn"); await H.page.waitForTimeout(900);
    const id2 = await qid(H.page);
    await waitShown();
    await G.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i, id2, { timeout: 20000 }).catch(() => {});
    await G.page.waitForTimeout(400); await waitVis(G.page, "#judge-row", 15000).catch(() => {});
    const gv = await G.page.evaluate(() => { const e = document.getElementById("judge-giri"); return !!e && getComputedStyle(e).display !== "none"; });
    check("G1 親の画面 " + id2 + " に △ " + gv, /~\d+$/.test(id2) && gv, "");
    if (gv) await tap(G.page, "#judge-giri");
    await H.page.waitForTimeout(1500);
    const ps = await H.page.evaluate(i => (JSON.parse(localStorage.getItem("kq_battle_parts_v1") || "{}"))[i] || null, id2);
    check("G2 部分の記録 " + JSON.stringify(ps), ps && ps.correct === 1 && ps.lastGiri > 0 && !(ps.box > 0) && !(Array.isArray(ps.h) && ps.h.length), "");
    await tap(H.page, "#next-btn").catch(() => {}); await H.page.waitForTimeout(800);
    await tap(H.page, "#battle-end-btn").catch(() => {}); await H.page.waitForTimeout(3500);
    const recs = [...written.keys()].filter(k => k.startsWith("battle/session/")).flatMap(k => written.get(k).content.q || []);
    const e2 = recs.find(e => e.id === id2);
    check("G3 学習ログ " + JSON.stringify(e2), e2 && e2.r === "o" && e2.g, "");
    check("E 画面のエラー 0", H.errs.length + G.errs.length === 0, [].concat(H.errs, G.errs).join(" | "));
  } catch (e) { check("（途中で止まった）", false, (e && e.message || e) + " / errs=" + [].concat(H.errs, G.errs).join(" | ")); }
  finally { await H.ctx.close(); await G.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); relay.close(); process.exit(c); };
if (!process.env.NOW_ONLY) {
  console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
  const outB = await run("base", BASELINE);
  const ngB = report("対照 " + BASE_COMMIT, outB);
  const must = ["G1"].filter(t => !outB.some(c => !c.ok && c.n.startsWith(t)));
  console.log(must.length === 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格（鳴らなかった: " + must.join(" ") + "）");
  if (must.length) await done(3);
}
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
