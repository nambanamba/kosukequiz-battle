// 今日やることの count を「答える回数」で数える（2026-10-08 ユーザー「理科だけで35問出ました。ちゃんと理科20と社会15出るようにしてください」）
// 本物の Chrome・390x844・まねの GitHub API サーバ（本物の GitHub には触らない）。使い方: node tools/mikaku/plan_count_probe.mjs
// 見ること:
//   C1 order:"weak"・count 20 の理科の行（候補の先頭に「分けて」のカードを並べる）→ 一人で「1 / 20」・答える回数がちょうど20
//   C2 「中身を見る」の一覧の答える回数（weightOf と同じ数え方）が20・「答える問題：20問」が出る・分けてのカードが入っている
//   C3 unit＋count 15 の行（分けてのカードか大問が多い単元）→ 中身を見るで15・一人で「1 / 15」・答える回数がちょうど15
//   C4 order:"weak"・count 5 で、候補が「3問に分かれるカード」ばかり → 飛ばしても合わないので 6（1問こえ）まで。7 以上にはならない
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "76cc222";   // 直す前
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
  const txt = sel => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : ""; }, sel);
  const qid = () => pg.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, "")).catch(() => "");
  const onSolo = () => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const home = async () => { await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h && document.getElementById("screen-solo-result").classList.contains("active")) h.click(); }); await pg.waitForTimeout(500); };
  const startRow = (i) => pg.evaluate(i => document.querySelectorAll("#plan-cur .plan-row")[i].querySelectorAll(".plan-start-btn")[0].click(), i);
  // 全部○で答える。答えた回数を返す
  const answerAll = async (max) => { const seen = []; for (let k = 0; k < max && (await onSolo()); k++) { seen.push(await qid());
    await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(60); await pg.$eval("#solo-judge-ok", e => e.click()); await pg.waitForTimeout(120); } return seen; };
  const peek = async i => { await pg.evaluate(i => document.querySelectorAll("#plan-cur .plan-row")[i].querySelector(".plan-peek-btn").click(), i); await pg.waitForTimeout(200);
    return pg.evaluate(i => { const p = document.querySelectorAll("#plan-cur .plan-peek")[i]; if (!p) return null;
      const ids = [...p.querySelectorAll("li")].map(l => l.dataset.qid);
      const w = ids.reduce((a, id) => a + window.__w(id), 0);
      return { ids, w, split: ids.filter(id => window.__split(id)).length, text: p.innerText }; }, i); };
  try {
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); await pg.reload(); await pg.waitForTimeout(1500);
    // 候補を作る（記録は空なので、分けてのカードは全部の部分を答える）
    await pg.evaluate(INSTALL, PARSE_SRC);
    const C = await pg.evaluate(() => {
      const card = d => d && d.kind !== "calc" && d.kind !== "daimon";
      const rika = QA_DATA.filter(d => d.subj === "理科" && card(d));
      const rs = rika.filter(d => window.__split(d.id)), r1 = rika.filter(d => !window.__split(d.id));
      const cand = rs.slice(0, 12).map(d => d.id).concat(r1.slice(0, 20).map(d => d.id));
      const three = rs.filter(d => window.__w(d.id) === 3).slice(0, 4).map(d => d.id);
      // unit＋count の行: 分けてのカードか大問がある単元（重いカードが多い順）
      const units = {};
      QA_DATA.filter(d => d.kind !== "calc").forEach(d => { const u = units[d.u] || (units[d.u] = { w: 0, s: 0, subj: d.subj }); const w = window.__w(d.id); u.w += w; if (w > 1) u.s++; });
      const su = Object.keys(units).filter(u => units[u].s >= 2 && units[u].w > 20).sort((a, b) => units[b].s - units[a].s)[0];
      return { cand, three, su, suSubj: su && units[su].subj, rsN: rs.length, partsHead: rs.slice(0, 12).reduce((a, d) => a + window.__w(d.id), 0) };
    });
    check("前提: 理科の分けてカード " + C.rsN + " 枚（先頭12枚で部分 " + C.partsHead + "）・3つに分かれるカード " + C.three.length + " 枚・unit の行の単元 " + C.su, C.rsN >= 6 && C.three.length >= 2 && C.su && C.partsHead > 20, JSON.stringify(C));
    SETS = { "plan/index.json": { sets: [1] }, "plan/0001.json": { no: 1, label: "10/8 のぶん", items: [
      { subj: "理科", title: "理科20問", ids: C.cand, order: "weak", count: 20 },
      { subj: C.suSubj, title: "15問", unit: C.su, count: 15 },
      { subj: "理科", title: "3つに分かれるのから5問", ids: C.three, order: "weak", count: 5 } ] } };
    await pg.reload(); await pg.waitForTimeout(1800); await pg.evaluate(INSTALL, PARSE_SRC);
    // C2 → C1
    const p0 = await peek(0);
    check("C2 理科の行の「中身を見る」: 答える回数 " + (p0 && p0.w) + "（" + (p0 && p0.ids.length) + "枚・分けて " + (p0 && p0.split) + "枚）・「答える問題：20問」",
      p0 && p0.w === 20 && p0.split > 0 && /答える問題：20問/.test(p0.text), JSON.stringify(p0 && p0.ids));
    await startRow(0); await pg.waitForTimeout(300);
    const c1 = await txt("#solo-counter"); const s1 = await answerAll(60); await home();
    check("C1 理科 order:weak・count 20 → 一人で " + c1 + "・答えた回数 " + s1.length, c1 === "1 / 20" && s1.length === 20, s1.join(" "));
    // C3
    const p1 = await peek(1);
    await startRow(1); await pg.waitForTimeout(300);
    const c3 = await txt("#solo-counter"); const s3 = await answerAll(60); await home();
    check("C3 unit＋count 15（" + C.su + "） → 中身を見る " + (p1 && p1.w) + "（分けて " + (p1 && p1.split) + "枚）・一人で " + c3 + "・答えた回数 " + s3.length,
      p1 && p1.w === 15 && c3 === "1 / 15" && s3.length === 15, JSON.stringify(p1 && p1.ids));
    // C4
    const p2 = await peek(2);
    check("C4 3つに分かれるカードだけで count 5 → 答える回数 " + (p2 && p2.w) + "（6 まで。こえるのは2問まで）", p2 && p2.w === 6, JSON.stringify(p2 && p2.ids));
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
