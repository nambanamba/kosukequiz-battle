// 今日やることの「今回の分を完了にする」（2026-10-10）
// ユーザー「1問残して子供が放棄or学校に行く時間になってしまったら、やったところまで記録してクラウドにあげたい。
//   今回の分を完了にするというボタンがあれば。完了にしたら次のセットで画面を出してください」
// 本物の Chrome・390x844・まねの GitHub API サーバ。使い方: node tools/mikaku/plan_close_probe.mjs
//   C1 セットの下（行のすぐ下）に「今回の分を完了にする」。全部できたセットには出ない
//   C2 押すと確認。キャンセルなら何も変わらない・送らない
//   C3 OK → 残りの行は「できたことにする」・plan_done に closed:true・all:true。記録（スナップショット）はボタンでは送らない
//   C4 記録（plan_／送信以外の localStorage）は変わらない
//   C5 次のセットが「いま進めているセット」として出る（10/8）。次が無ければ「おわり！」のまま
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_plan_close"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "606b72e";   // 直す前（「今回の分を完了にする」が無い版）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "plan_close" });
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
let mode = "up", gets = 0, written = new Map(), puts = new Map();
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
    if (req.method === "PUT") { puts.set(p, (puts.get(p) || 0) + 1); const j = JSON.parse(b), w = written.get(p); if (w && j.sha !== w.sha) return send(409, {}); const sha = "s" + Math.random(); written.set(p, { sha, content: JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) }); return send(w ? 200 : 201, {}); }
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
  SERVED = src; mode = "up"; gets = 0; written = new Map(); puts = new Map(); const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); const errs = [];
  let dialogs = [], accept = true;
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => { dialogs.push(d.message()); (accept ? d.accept() : d.dismiss()).catch(() => {}); });
  const vis = sel => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const head = sel => pg.evaluate(s => { const e = document.querySelector(s + " .plan-head"); return e ? e.textContent : ""; }, sel);
  const rows = sel => pg.evaluate(s => [...document.querySelectorAll(s + " .plan-row")].map(r => ({ m: r.querySelector(".plan-mark").textContent })), sel);
  const onSolo = () => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const snapRec = () => pg.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^kq_battle_(plan_|outbox|send_)/.test(k)) continue; o[k] = localStorage.getItem(k); } return JSON.stringify(o); });
  const sent = n => { const w = written.get("battle/plan_done/000" + n + ".json"); return w ? w.content : null; };
  const snapPath = () => [...written.keys()].find(k => k.startsWith("battle/snapshot/"));
  const clickClose = () => pg.evaluate(() => { const b = document.getElementById("plan-close-btn"); if (!b) throw new Error("完了にするボタンが無い"); b.click(); });
  try {
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); await pg.reload(); await pg.waitForTimeout(1800);
    // 記録を少し作る: 1行目を一人でやり終える（残りの2行は手つかず＝「1問残して放棄」の形）
    await pg.evaluate(() => document.querySelectorAll("#plan-cur .plan-row")[0].querySelector(".plan-start-btn").click()); await pg.waitForTimeout(300);
    for (let k = 0; k < 6 && (await onSolo()); k++) { await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(80); await pg.$eval("#solo-judge-ok", e => e.click()); await pg.waitForTimeout(180); }
    await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h) h.click(); }); await pg.waitForTimeout(1200);
    // C1
    const g = await pg.evaluate(() => { const b = document.getElementById("plan-close-btn"); if (!b) return null; const rs = [...document.querySelectorAll("#plan-cur .plan-row")], last = rs[rs.length - 1].getBoundingClientRect(), r = b.getBoundingClientRect();
      return { txt: b.textContent, below: r.top >= last.bottom - 1, inCur: !!b.closest("#plan-cur"), w: Math.round(r.width) }; });
    check("C1 セットの下（行のすぐ下・いまのセットの中）に「今回の分を完了にする」", g && g.txt === "今回の分を完了にする" && g.below && g.inCur && g.w > 200, JSON.stringify(g));
    await pg.screenshot({ path: path.join(SHOTS, label + "_C1.png") }).catch(() => {});
    // C2 キャンセル
    const before = await snapRec(), puts0 = JSON.stringify([...puts]);
    accept = false; dialogs = [];
    await clickClose(); await pg.waitForTimeout(600);
    const r2 = await rows("#plan-cur");
    check("C2 押すと確認が出る・キャンセルなら何も変わらない（行の印・セット・送信）", dialogs.length === 1 && /完了にしますか/.test(dialogs[0]) && r2[1].m === "" && r2[2].m === "" && (await head("#plan-cur")) === "今日やること：10/7 のぶん" && JSON.stringify([...puts]) === puts0, JSON.stringify({ dialogs, r2 }));
    // C3 OK
    accept = true; dialogs = [];
    await pg.waitForTimeout(1500);
    const snapPuts0 = snapPath() ? puts.get(snapPath()) : 0;
    await clickClose(); await pg.waitForTimeout(2500);
    const w1 = sent(1), sp = snapPath();
    check("C3 OK → plan_done(1) に closed:true・all:true・残りの行は done＋manual・最初の行は manual ではない",
      dialogs.length === 1 && w1 && w1.closed === true && /^\d{4}-/.test(w1.closedAt || "") && w1.all === true && w1.items.every(x => x.done) && !w1.items[0].manual && w1.items[1].manual && w1.items[2].manual, JSON.stringify(w1 && { closed: w1.closed, all: w1.all, items: w1.items.map(x => [x.done, x.manual]) }));
    check("C3b 記録（スナップショット）は、ボタンでは新しく送らない（これまでの契機だけ）", sp && snapPuts0 >= 1 && puts.get(sp) === snapPuts0, JSON.stringify({ sp, before: snapPuts0, after: sp && puts.get(sp) }));
    check("C4 記録（plan_／送信以外）は変わらない", (await snapRec()) === before && before.length > 50, before.length);
    // C5 次のセット
    const cur = await head("#plan-cur");
    check("C5 次のセット（10/8）が、いま進めているセットとして出る", cur === "今日やること：10/8 のぶん" && (await vis("#plan-close-btn")), cur);
    await pg.screenshot({ path: path.join(SHOTS, label + "_C5.png") }).catch(() => {});
    // 10/8 → 10/9 → 次が無い
    await clickClose(); await pg.waitForTimeout(1500);
    const cur2 = await head("#plan-cur");
    await clickClose(); await pg.waitForTimeout(1500);
    const cur3 = await head("#plan-cur");
    check("C5b 続けて完了にすると 10/9（読み直して出る）→ 次の kosuke-records のセットが無ければ、今までどおり自動のセット", cur2 === "今日やること：10/9 のぶん" && cur3 === "今日やること：つぎ（自動）", JSON.stringify({ cur2, cur3 }));
    await pg.reload(); await pg.waitForTimeout(1800);
    check("C6 開き直しても、済んだセットは戻らない（自動のセットのまま）", (await head("#plan-cur")) === "今日やること：つぎ（自動）", await head("#plan-cur"));
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
