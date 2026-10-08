// まとめて出す（2026-10-09 ユーザー「テストも近いので細かく分けずにまとめて出せるところは出しませんか？」）
// 本物の Chrome・390x844・まねの GitHub API サーバ（本物の GitHub には触らない）。使い方: node tools/mikaku/merge_mode_probe.mjs
// 見ること:
//   M1 今日やることの行 "merge":true（分けてのカードだけ・order:weak・count 4）→ 中身を見る「答える問題：4問（4枚）」・一人で「1 / 4」・出るのはカードの id（~ が無い）・「まとめて」の印
//   M2 記録はふつうどおり: カードの記録に○が付く・部分の記録（kq_battle_parts_v1）は付かない
//   M3 印の無い行（同じ候補・count 4）→ 今までどおり分けて（~ の id が出る）
//   S1 ホームのスイッチ「分けずにまとめて出す」→ 端末に保存（開き直してもオン）
//   S2 スイッチがオンの間は、印の無い行もまとめて（「1 / 4」・~ が無い）
//   B1 二人: ホストのスイッチがオン（ゲストはオフ）→ 二人とも同じカードの id（~ が無い）・ゲストにも「まとめて」
//   S3 スイッチをオフにもどすと、また分けて（~ の id）
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "2b10c14";   // 直す前（choice-shuffle と plan-skip-row を取りこんだところ）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "plan" });
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
const TOKEN = "github_pat_TESTONLY_1234567890";
let SETS = {};
let mode = "up", gets = 0, written = new Map();
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version" };
const api = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  if (mode === "down") { req.socket.destroy(); return; }
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const send = (st, o) => { res.writeHead(st, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify(o)); };
    const m = /^\/repos\/nambanamba\/kosuke-records\/contents\/([^?]+)/.exec(req.url);
    if (!m) return send(404, {});
    const p = decodeURIComponent(m[1]);
    if (req.method === "GET" && p.startsWith("plan/")) gets++;
    if (req.headers.authorization !== "Bearer " + TOKEN) return send(401, { message: "Bad credentials" });
    if (req.method === "GET") {
      if (p.startsWith("plan/")) { if (mode === "missing" || !SETS[p]) return send(404, {}); return send(200, { sha: "x", content: Buffer.from(JSON.stringify(SETS[p]), "utf8").toString("base64") }); }
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
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": ["第6回.鎌倉時代"] }, units: ["第6回.鎌倉時代"], count: 5, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (cfg) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
};

// アプリの中（type="module"）は外から見えないので、分け方（parseAnswerParts）をアプリから写して、ページに入れる。数え方も同じ（記録が空なので、分けてのカードは全部の部分・大問は全部の小問）
const PARSE_SRC = (() => { const h = CURRENT, a = h.indexOf("function parseAnswerParts(q, a){"), b = h.indexOf("(function addSplitCards(){"); return h.slice(a, b); })();
const INSTALL = (src) => { window.__parts = new Function(src + "; return parseAnswerParts;")();
  window.__w = id => { const d = QA_DATA.find(x => x.id === id); if (!d) return 0; if (d.kind === "daimon") return d.itemIds.length;
    if (d.subj === "理科" && d.kind !== "calc") { const p = window.__parts(d.q, d.a); if (p) return p.length; } return 1; };
  window.__split = id => { const d = QA_DATA.find(x => x.id === id); return !!(d && d.subj === "理科" && d.kind !== "daimon" && d.kind !== "calc" && window.__parts(d.q, d.a)); }; };
async function run(label, src) {
  SERVED = src; mode = "up"; gets = 0; written = new Map(); SETS = {}; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  const txt = (sel, p) => (p || pg).evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : ""; }, sel);
  const qid = () => pg.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, "")).catch(() => "");
  const onSolo = () => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const home = async () => { await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h && document.getElementById("screen-solo-result").classList.contains("active")) h.click(); }); await pg.waitForTimeout(500); };
  const startRow = (i, b) => pg.evaluate(([i, b]) => document.querySelectorAll("#plan-cur .plan-row")[i].querySelectorAll(".plan-start-btn")[b].click(), [i, b || 0]);
  const answerAll = async (max) => { const seen = [], tags = []; for (let k = 0; k < max && (await onSolo()); k++) { seen.push(await qid()); tags.push(await txt("#solo-daimon .split-mode-tag"));
    await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(60); await pg.$eval("#solo-judge-ok", e => e.click()); await pg.waitForTimeout(120); } return { seen, tags }; };
  const peek = async i => { await pg.evaluate(i => document.querySelectorAll("#plan-cur .plan-row")[i].querySelector(".plan-peek-btn").click(), i); await pg.waitForTimeout(200);
    const r = await pg.evaluate(i => { const p = document.querySelectorAll("#plan-cur .plan-peek")[i]; if (!p) return null;
      return { ids: [...p.querySelectorAll("li")].map(l => l.dataset.qid), cnt: (p.querySelector(".plan-peek-count") || {}).textContent || "" }; }, i);
    await pg.evaluate(i => document.querySelectorAll("#plan-cur .plan-row")[i].querySelector(".plan-peek-btn").click(), i); return r; };
  try {
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); await pg.reload(); await pg.waitForTimeout(1500);
    await pg.evaluate(INSTALL, PARSE_SRC);
    const C = await pg.evaluate(() => QA_DATA.filter(d => window.__split(d.id) && window.__w(d.id) >= 2).slice(0, 8).map(d => d.id));
    check("前提: 分けて出すカード " + C.length + " 枚", C.length >= 6, C.join(" "));
    SETS = { "plan/index.json": { sets: [1] }, "plan/0001.json": { no: 1, label: "10/9 のぶん", items: [
      { subj: "理科", title: "まとめて4問", ids: C, order: "weak", count: 4, merge: true },
      { subj: "理科", title: "ふつう4問", ids: C, order: "weak", count: 4 },
      { subj: "理科", title: "ふつう4問（2）", ids: C, order: "weak", count: 4 },
      { subj: "理科", title: "二人で", ids: C, order: "weak", count: 4 } ] } };
    await pg.reload(); await pg.waitForTimeout(1800); await pg.evaluate(INSTALL, PARSE_SRC);
    // M1
    const p0 = await peek(0);
    await startRow(0); await pg.waitForTimeout(300);
    const c1 = await txt("#solo-counter"); const a1 = await answerAll(30); await home();
    check("M1 merge 行: 中身を見る「" + (p0 && p0.cnt) + "」・一人で " + c1 + "・出た " + a1.seen.join(" "),
      p0 && /答える問題：4問（4枚）/.test(p0.cnt) && c1 === "1 / 4" && a1.seen.length === 4 && a1.seen.every(x => x && !/~/.test(x)) && a1.tags.every(t => /まとめて/.test(t)), a1.tags.join("|"));
    const rec = await pg.evaluate(ids => { const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"), ps = JSON.parse(localStorage.getItem("kq_battle_parts_v1") || "{}");
      return { card: ids.map(i => st[i] ? st[i].correct : 0), parts: Object.keys(ps).length }; }, a1.seen);
    check("M2 記録: カードに○ " + rec.card.join(",") + "・部分の記録 " + rec.parts + " 件", rec.card.length === 4 && rec.card.every(n => n === 1) && rec.parts === 0, JSON.stringify(rec));
    // M3
    await startRow(1); await pg.waitForTimeout(300);
    const a3 = await answerAll(30); await home();
    check("M3 印の無い行は分けて（" + a3.seen.join(" ") + "）", a3.seen.some(x => /~/.test(x)), "");
    // S1
    const off0 = await pg.evaluate(() => document.getElementById("merge-all-toggle").classList.contains("on"));
    await pg.$eval("#merge-all-toggle", e => e.click()); await pg.waitForTimeout(200);
    const saved = await pg.evaluate(() => localStorage.getItem("kq_battle_merge_all_v1"));
    await pg.reload(); await pg.waitForTimeout(1800); await pg.evaluate(INSTALL, PARSE_SRC);
    const on1 = await pg.evaluate(() => document.getElementById("merge-all-toggle").classList.contains("on"));
    check("S1 スイッチ: はじめオフ・押すと保存（" + saved + "）・開き直してもオン", !off0 && saved === "1" && on1, "");
    // S2
    const p2 = await peek(2);
    await startRow(2); await pg.waitForTimeout(300);
    const c2 = await txt("#solo-counter"); const a2 = await answerAll(30); await home();
    check("S2 スイッチがオン: 印の無い行もまとめて（中身を見る「" + (p2 && p2.cnt) + "」・" + c2 + "・" + a2.seen.join(" ") + "）",
      p2 && /答える問題：4問（4枚）/.test(p2.cnt) && c2 === "1 / 4" && a2.seen.length === 4 && a2.seen.every(x => x && !/~/.test(x)), "");
    // B1 二人（ホストはスイッチがオン・ゲストはオフ）
    const gctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const gp = await gctx.newPage();
    gp.on("pageerror", e => errs.push("guest: " + String(e))); gp.on("dialog", d => d.accept().catch(() => {}));
    try {
      await gp.goto(PAGE_URL); await gp.evaluate(SEED, [MIG, null]); await gp.reload(); await gp.waitForTimeout(800);
      await startRow(3, 1);
      await pg.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
      const code = await pg.$eval("#room-code-display", e => e.textContent);
      await gp.$eval("#go-join", e => e.click()); await gp.fill("#join-code-input", code); await gp.$eval("#join-btn", e => e.click());
      const wv = (p, sel, ms) => p.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 30000 });
      await wv(pg, "#start-together-btn", 60000);
      await pg.$eval("#start-together-btn", e => e.click()); await gp.$eval("#join-start-together-btn", e => e.click());
      await wv(pg, "#advance-btn", 20000);
      const hid = await pg.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
      await pg.$eval("#advance-btn", e => e.click());
      await gp.waitForFunction(() => getComputedStyle(document.getElementById("battle-view")).display !== "none" && /^No\./.test(document.getElementById("battle-q-id").textContent), null, { timeout: 20000 });
      const gid = await gp.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
      const gtag = await txt("#battle-daimon .split-mode-tag", gp);
      const gm = await gp.evaluate(() => localStorage.getItem("kq_battle_merge_all_v1"));
      check("B1 二人: ホストのスイッチで決まる（ホスト " + hid + "・ゲスト " + gid + "・ゲストの印「" + gtag + "」・ゲストのスイッチ " + gm + "）",
        hid && hid === gid && !/~/.test(hid) && /まとめて/.test(gtag) && gm !== "1", "");
    } catch (e) { check("B1 二人", false, String(e && e.message || e).split("\n")[0]); }
    finally { await gctx.close(); }
    // S3
    await pg.reload(); await pg.waitForTimeout(1800);
    await pg.$eval("#merge-all-toggle", e => e.click()); await pg.waitForTimeout(200);
    const saved3 = await pg.evaluate(() => localStorage.getItem("kq_battle_merge_all_v1"));
    await startRow(1); await pg.waitForTimeout(300);
    const a4 = await answerAll(30); await home();
    check("S3 スイッチをオフ（" + saved3 + "）→ また分けて（" + a4.seen.join(" ") + "）", saved3 === "0" && a4.seen.some(x => /~/.test(x)), "");
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
