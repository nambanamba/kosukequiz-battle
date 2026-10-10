// 今日やること → 番号のセットを順に進める（kosuke-records の plan/index.json・plan/0001.json …）
// 2026-10-07 ユーザー「今日の理科ってなにやるかとかってタブレットに配信できますか？」
//   →「今日は終わったら、次に行く方式にしませんか？『今日』じゃないといけない理由はありますか？」
// 本物の Chrome・390x844・まねの GitHub API サーバ（本物の GitHub には触らない）。使い方: node tools/mikaku/plan_probe.mjs
// 見ること:
//   Q1 鍵があれば index と、まだ全部できていないいちばん小さい番号のセット（1）を出す・ひとこと・行の名前（日付は使わない）
//   Q2 行の「はじめる」→ その問題だけで一人（ids・その順番）→ 終えると「✔ できた」・battle/plan_done/0001.json に送る
//   Q3 とちゅうでやめたら「できた」にならない → 再開して終えると「できた」（unit＋count）→ 全部で「おわり！」と、すぐ下に「つぎ（明日のぶん）」（セット2）
//   Q4 「つぎ」の行もそのまま始められる
//   Q5 開き直すと、いま進めているセットは2になる（「おわり！」は出ない）
//   Q6 読みに行くのは開いたとき1回（ホームに何度もどっても増えない）
//   Q7 オフライン → 前に読めた分で出す
//   Q8 index が無い（404）・写しも無い → 何も出さない／鍵が無い → 読みに行かない
//   Q9 「二人で」→ その行の問題で二人の部屋を作る → やり終えたらその行は「できた」（ユーザー「二人でやりたいときはどうしますか？」）
//   Q10 order:"weak"＋count → 同じセットの前の行（朝）で1回目にまちがえた問題から（ユーザー「今日の朝どれができたかで、今日の夜やるのかわりませんか？」）
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_plan"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "96c257d";   // 直す前（日付の版）
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
const SETS = {
  "plan/index.json": { sets: [1, 2, 3] },
  "plan/0001.json": { no: 1, label: "10/7 のぶん", message: "きょうは心臓と鎌倉！", items: [
    { subj: "理科", title: "②心臓と血管（2枚）", ids: ["r6p12", "r6p11"] },
    { subj: "社会", title: "朝：今週の回を3問", unit: "第6回.鎌倉時代", count: 3 },
    { subj: "理科", title: "夜：朝まちがえたのから2問", ids: ["r6p13", "r6p11", "r6p12", "r6p14"], order: "weak", count: 2 } ] },
  "plan/0002.json": { no: 2, label: "10/8 のぶん", items: [ { subj: "理科", title: "③血液の循環（2枚）", ids: ["r6p22", "r6p21"] } ] },
  "plan/0003.json": { no: 3, label: "10/9 のぶん", items: [ { subj: "理科", title: "④（1枚）", ids: ["r6p31"] } ] }
};
const TOKEN = "github_pat_TESTONLY_1234567890";
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
async function run(label, src) {
  SERVED = src; mode = "up"; gets = 0; written = new Map(); const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  const vis = sel => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const txt = sel => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : ""; }, sel);
  const qid = () => pg.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, "")).catch(() => "");
  const onSolo = () => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const rows = sel => pg.evaluate(s => [...document.querySelectorAll(s + " .plan-row")].map(r => ({ t: r.querySelector(".plan-row-title").textContent, m: r.querySelector(".plan-mark").textContent })), sel);
  const head = sel => pg.evaluate(s => { const e = document.querySelector(s + " .plan-head"); return e ? e.textContent : ""; }, sel);
  const home = async () => { await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h && document.getElementById("screen-solo-result").classList.contains("active")) h.click(); }); await pg.waitForTimeout(500); };
  const startRow = (sel, i, which) => pg.evaluate(a => document.querySelectorAll(a[0] + " .plan-row")[a[1]].querySelectorAll(".plan-start-btn")[a[2]].click(), [sel, i, which || 0]);
  // 1問ずつ答える。okOf(id, 何回目) が false なら✕
  const answerBy = async (okOf, max) => { const seen = []; for (let k = 0; k < (max || 10) && (await onSolo()); k++) { const id = await qid(); seen.push(id); const ok = okOf ? okOf(id, seen.filter(x => x === id).length) : true;
    await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(80); await pg.$eval(ok ? "#solo-judge-ok" : "#solo-judge-ng", e => e.click()); await pg.waitForTimeout(180); } return seen; };
  try {
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); gets = 0; await pg.reload(); await pg.waitForTimeout(1800);
    // Q1
    const r1 = await rows("#plan-cur");
    check("Q1 いま進めているセット1「今日やること：10/7 のぶん」・ひとこと・行（日付は使わない）・各行に「一人で」「二人で」",
      (await vis("#plan-box")) && (await head("#plan-cur")) === "今日やること：10/7 のぶん" && /きょうは心臓と鎌倉！/.test(await txt("#plan-cur")) && r1.length === 3 && r1[0].t === "理科：②心臓と血管（2枚）" && !(await vis("#plan-next"))
      && (await pg.evaluate(() => [...document.querySelectorAll("#plan-cur .plan-row")].every(r => [...r.querySelectorAll(".plan-start-btn")].map(b => b.textContent).join("|") === "一人で|二人で"))), JSON.stringify(r1));
    const gets1 = gets;
    // Q2 朝: r6p11 を1回目に✕（正解するまで回る）
    await startRow("#plan-cur", 0); await pg.waitForTimeout(300);
    const c2 = await txt("#solo-counter"); const s2 = await answerBy((id, n) => !(id === "r6p11" && n === 1)); await home();
    const r2 = await rows("#plan-cur");
    await pg.waitForTimeout(800);
    const w2 = written.get("battle/plan_done/0001.json");
    check("Q2 一人で → その問題だけ（" + s2.join(" ") + "・" + c2 + "）→「✔ できた」・battle/plan_done/0001.json（1行目 done・miss=[r6p11]・all=false）",
      c2 === "1 / 2" && s2.join(",") === "r6p12,r6p11,r6p11" && r2[0].m === "✔ できた" && r2[1].m === "" && w2 && w2.content.no === 1 && w2.content.items[0].done && /^\d{4}-/.test(w2.content.items[0].doneAt)
      && JSON.stringify(w2.content.items[0].miss) === '["r6p11"]' && !w2.content.all, JSON.stringify(w2 && w2.content));
    // Q3
    await startRow("#plan-cur", 1); await pg.waitForTimeout(300);
    const c3 = await txt("#solo-counter"), f3 = await qid();
    await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(80); await pg.$eval("#solo-judge-ok", e => e.click()); await pg.waitForTimeout(200);
    await pg.evaluate(() => document.getElementById("solo-back").click()); await pg.waitForTimeout(300);
    const r3a = await rows("#plan-cur");
    await pg.$eval("#resume-solo-btn", e => e.click()); await pg.waitForTimeout(300);
    const s3 = [f3].concat(await answerBy()); await home();
    const r3b = await rows("#plan-cur");
    check("Q3 とちゅうでやめたら「できた」にならない → 再開して終えると「できた」（unit から3問・" + c3 + "）・まだ全部ではない",
      r3a[1].m === "" && r3b[1].m === "✔ できた" && c3 === "1 / 3" && s3.length === 3 && !(await vis("#plan-done")), JSON.stringify({ r3a, r3b }));
    // Q10 夜: order:"weak"・count 2 → ① 朝まちがえた r6p11 ② ③ まだ正解していない r6p13（r6p14）④ r6p12（正解ずみ）
    const r10 = await rows("#plan-cur");
    await startRow("#plan-cur", 2); await pg.waitForTimeout(300);
    const c10 = await txt("#solo-counter"); const s10 = await answerBy(); await home();
    check("Q10 order:weak・count 2 →「朝まちがえた1問から出します」・朝まちがえた r6p11 → まだ正解していない r6p13 の順（" + s10.join(" ") + "・" + c10 + "）",
      /朝まちがえた1問から出します/.test(r10[2].t) && c10 === "1 / 2" && s10.join(",") === "r6p11,r6p13", JSON.stringify(r10[2]));
    // Q3b 全部できた → おわり！と つぎ
    const nx = await rows("#plan-next");
    await pg.waitForTimeout(800);
    const w3 = written.get("battle/plan_done/0001.json");
    check("Q3b 全部できたら「おわり！」と、すぐ下に「つぎ（明日のぶん）：10/8 のぶん」・all=true を送る",
      (await vis("#plan-done")) && (await txt("#plan-done")) === "おわり！" && (await vis("#plan-next")) && (await head("#plan-next")) === "つぎ（明日のぶん）：10/8 のぶん" && nx.length === 1 && w3 && w3.content.all === true,
      JSON.stringify({ nx, all: w3 && w3.content.all }));
    await pg.screenshot({ path: path.join(SHOTS, label + "_Q3_next.png") }).catch(() => {});
    // Q4
    await startRow("#plan-next", 0); await pg.waitForTimeout(300);
    const c4 = await txt("#solo-counter"), id4 = await qid();
    await pg.evaluate(() => document.getElementById("solo-back").click()); await pg.waitForTimeout(300);
    check("Q4 「つぎ」の行もそのまま始められる（" + id4 + "・" + c4 + "）", id4 === "r6p22" && c4 === "1 / 2");
    check("Q6 読みに行くのは開いたとき1回（ホームに何度もどっても増えない: " + gets1 + " → " + gets + "）", gets1 > 0 && gets === gets1, gets1 + "→" + gets);
    // Q5 開き直す
    await pg.reload(); await pg.waitForTimeout(1800);
    check("Q5 開き直すと、いま進めているセットは2（「おわり！」は出ない）", (await head("#plan-cur")) === "今日やること：10/8 のぶん" && !(await vis("#plan-done")) && !(await vis("#plan-next")), await head("#plan-cur"));
    // Q9 二人で: その行の問題で二人の部屋を作る → やり終えたら「できた」
    const gctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const gp = await gctx.newPage();
    gp.on("pageerror", e => errs.push("guest: " + String(e))); gp.on("dialog", d => d.accept().catch(() => {}));
    try {
      await gp.goto(PAGE_URL); await gp.evaluate(SEED, [MIG, null]); await gp.reload(); await gp.waitForTimeout(800);
      await startRow("#plan-cur", 0, 1);
      await pg.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
      const code = await pg.$eval("#room-code-display", e => e.textContent);
      await gp.$eval("#go-join", e => e.click()); await gp.fill("#join-code-input", code); await gp.$eval("#join-btn", e => e.click());
      const wv = (p, sel, ms) => p.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 30000 });
      await wv(pg, "#start-together-btn", 60000);
      await pg.$eval("#start-together-btn", e => e.click()); await gp.$eval("#join-start-together-btn", e => e.click());
      const bseq = [];
      for (let k = 0; k < 4; k++) {
        // ★2026-10-10 二人は問題が両方に同時に出る（「わかった！」は無い）。ホストは「スキップ」が出たら問題が出ている
        const got = await wv(pg, "#skip-btn", 20000).then(() => true).catch(() => false);
        if (!got) break;
        const id = await pg.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, "")); bseq.push(id);
        await gp.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 });
        // ★2026-10-10 判定はゲスト（親）だけ。〇✕は最初から出ている。ホストの答えはゲストの〇✕で開く（ホストの判定は無い）
        await wv(gp, "#judge-row", 15000); await gp.$eval("#judge-ok", e => e.click());
        await pg.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
        await pg.$eval("#next-btn", e => e.click()); await pg.waitForTimeout(500);
      }
      await pg.waitForTimeout(800);
      const onRes = await pg.evaluate(() => document.getElementById("screen-result").classList.contains("active"));
      await pg.evaluate(() => document.getElementById("result-home-btn").click()); await pg.waitForTimeout(800);
      const r9 = await rows("#plan-cur");
      check("Q9 「二人で」→ その行の問題で二人の部屋（" + bseq.join(" ") + "）→ やり終えたらその行は「できた」", bseq.join(",") === "r6p22,r6p21" && onRes && r9[0].m === "✔ できた", JSON.stringify(r9));
    } finally { await gctx.close(); }
    // Q7 オフライン（セット2は「二人で」で終わったので、写しにあるセット3）
    mode = "down";
    await pg.reload(); await pg.waitForTimeout(1500);
    check("Q7 つながらないときは前に読めた分（セット3）", (await vis("#plan-box")) && (await head("#plan-cur")) === "今日やること：10/9 のぶん", await head("#plan-cur"));
    mode = "up";
    // Q8
    mode = "missing";
    await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); await pg.reload(); await pg.waitForTimeout(1500);
    const a8 = !(await vis("#plan-box"));
    mode = "up";
    await pg.evaluate(SEED, [MIG, { api: API_URL }]); const g8 = gets; await pg.reload(); await pg.waitForTimeout(1500);
    check("Q8 index が無い・写しも無い → 何も出さない／鍵が無い → 読みに行かない", a8 && !(await vis("#plan-box")) && gets === g8, "GET " + (gets - g8));
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
