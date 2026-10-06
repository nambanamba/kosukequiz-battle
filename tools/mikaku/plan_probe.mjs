// 今日やること（kosuke-records の plan/YYYY-MM-DD.json をホームに出す・2026-10-07 ユーザー「今日の理科ってなにやるかとかってタブレットに配信できますか？」）
// 本物の Chrome・390x844・まねの GitHub API サーバ（本物の GitHub には触らない）。使い方: node tools/mikaku/plan_probe.mjs
// 見ること:
//   P1 鍵があって今日のファイルがある → ホームの上に「今日やること」・ひとこと・行の名前
//   P2 行の「はじめる」→ その問題だけで一人が始まる（ids・その順番）→ 最後まで終えると「✔ できた」
//   P3 とちゅうでやめたら「できた」にならない → 再開して終えると「できた」（unit＋count はその単元から count 問）
//   P4 全部できたら「今日はおわり！」
//   P5 今日のファイルが無い（404）→ 何も出さない
//   P6 鍵が無い → 読みに行かない・何も出さない
//   P7 オフライン（つながらない）→ 前に読めた今日の分を出す
//   P8 読みに行くのは開いたとき1回（ホームに何度もどっても増えない）
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_plan"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "b2c7478";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(SERVED, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const d = new Date(), p2 = n => String(n).padStart(2, "0");
const DAY = d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
const PLAN = { date: DAY, message: "きょうは心臓と鎌倉！", items: [
  { subj: "理科", title: "②心臓と血管（2枚）", ids: ["r6p12", "r6p11"] },
  { subj: "社会", title: "朝：今週の回を3問", unit: "第6回.鎌倉時代", count: 3 } ] };
const TOKEN = "github_pat_TESTONLY_1234567890";
let mode = "up", gets = 0;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version" };
const api = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  if (mode === "down") { req.socket.destroy(); return; }
  const send = (st, o) => { res.writeHead(st, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify(o)); };
  const m = /^\/repos\/nambanamba\/kosuke-records\/contents\/plan\/([^?]+)/.exec(req.url);
  if (req.method === "GET" && m) gets++;
  if (req.headers.authorization !== "Bearer " + TOKEN) return send(401, { message: "Bad credentials" });
  if (!m || mode === "missing" || decodeURIComponent(m[1]) !== DAY + ".json") return send(404, { message: "Not Found" });
  send(200, { path: "plan/" + DAY + ".json", sha: "x", encoding: "base64", content: Buffer.from(JSON.stringify(PLAN), "utf8").toString("base64") });
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
async function run(label, src) {
  SERVED = src; mode = "up"; gets = 0; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  const vis = sel => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const txt = sel => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : ""; }, sel);
  const qid = () => pg.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, "")).catch(() => "");
  const onSolo = () => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const rows = () => pg.evaluate(() => [...document.querySelectorAll("#plan-items .plan-row")].map(r => ({ t: r.querySelector(".plan-row-title").textContent, m: r.querySelector(".plan-mark").textContent, b: r.querySelector(".plan-start-btn").textContent })));
  const startRow = i => pg.evaluate(i => document.querySelectorAll("#plan-items .plan-start-btn")[i].click(), i);
  const answer = async (max) => { const seen = []; for (let k = 0; k < max && (await onSolo()); k++) { seen.push(await qid()); await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(80); await pg.$eval("#solo-judge-ok", e => e.click()); await pg.waitForTimeout(180); } return seen; };
  const home = async () => { await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h && document.getElementById("screen-solo-result").classList.contains("active")) h.click(); }); await pg.waitForTimeout(300); };
  const open = async (cfg) => { await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, cfg]); await pg.reload(); await pg.waitForTimeout(1500); };
  try {
    // P1
    await open({ token: TOKEN, api: API_URL });
    const r1 = await rows();
    check("P1 「今日やること」・ひとこと・行（理科：②心臓と血管（2枚）／社会：朝：今週の回を3問）",
      (await vis("#plan-box")) && (await txt("#plan-msg")) === "きょうは心臓と鎌倉！" && r1.length === 2 && r1[0].t === "理科：②心臓と血管（2枚）" && r1[1].t === "社会：朝：今週の回を3問" && r1.every(r => r.b === "はじめる"), JSON.stringify(r1));
    await pg.screenshot({ path: path.join(SHOTS, label + "_P1_home.png") }).catch(() => {});
    // P8（あとで数を見る）
    const gets1 = gets;
    // P2
    await startRow(0); await pg.waitForTimeout(300);
    const c2 = await txt("#solo-counter");
    const s2 = await answer(6); await home();
    const r2 = await rows();
    check("P2 はじめる → その問題だけ・その順番（" + s2.join(" ") + "・" + c2 + "）→ 終えると「✔ できた」", c2 === "1 / 2" && s2.join(",") === "r6p12,r6p11" && r2[0].m === "✔ できた" && r2[1].m === "" && !(await vis("#plan-done")), JSON.stringify(r2));
    // P3
    await startRow(1); await pg.waitForTimeout(300);
    const c3 = await txt("#solo-counter"), first3 = await qid();
    await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(80); await pg.$eval("#solo-judge-ok", e => e.click()); await pg.waitForTimeout(200);
    await pg.evaluate(() => document.getElementById("solo-back").click()); await pg.waitForTimeout(300);
    const r3a = await rows();
    await pg.$eval("#resume-solo-btn", e => e.click()); await pg.waitForTimeout(300);
    const s3 = [first3].concat(await answer(6)); await home();
    const r3b = await rows();
    const unit6 = await pg.evaluate(() => QA_DATA.filter(d => d.u === "第6回.鎌倉時代").map(d => d.id));
    check("P3 とちゅうでやめたら「できた」にならない → 再開して終えると「できた」・unit から3問（" + s3.join(" ") + "・" + c3 + "）",
      r3a[1].m === "" && r3b[1].m === "✔ できた" && c3 === "1 / 3" && s3.length === 3 && s3.every(id => unit6.includes(id)), JSON.stringify({ r3a, r3b }));
    // P4
    check("P4 全部できたら「今日はおわり！」", (await vis("#plan-done")) && (await txt("#plan-done")) === "今日はおわり！");
    await pg.screenshot({ path: path.join(SHOTS, label + "_P4_alldone.png") }).catch(() => {});
    check("P8 読みに行くのは開いたとき1回（ホームに何度もどっても増えない: " + gets1 + " → " + gets + "）", gets1 === 1 && gets === 1);
    // P7 オフライン → 前に読めた今日の分
    mode = "down";
    await pg.reload(); await pg.waitForTimeout(1500);
    const r7 = await rows();
    check("P7 つながらないときは、前に読めた今日の分を出す（できた印も残る）", (await vis("#plan-box")) && r7.length === 2 && r7[0].m === "✔ できた", JSON.stringify(r7));
    mode = "up";
    // P5 ファイルが無い
    mode = "missing";
    await open({ token: TOKEN, api: API_URL });
    check("P5 今日のファイルが無い → 何も出さない", !(await vis("#plan-box")));
    mode = "up";
    // P6 鍵が無い
    await pg.evaluate(SEED, [MIG, { api: API_URL }]);
    const g6 = gets;
    await pg.reload(); await pg.waitForTimeout(1500);
    check("P6 鍵が無い → 読みに行かない・何も出さない", !(await vis("#plan-box")) && gets === g6, "GET " + (gets - g6));
    check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
