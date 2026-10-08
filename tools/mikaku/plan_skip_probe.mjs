// 今日やることの「やらなかった」（2026-10-09）
// ユーザー「今日やることの行にスキップボタン。今晩は飛ばした、今朝は飛ばした、みたいなかんじで」
//   →（司令塔が確認）「暗記カードの『今朝の分、今晩の分』を丸ごとやらなかったことにする」
// 本物の Chrome・390x844・まねの GitHub API サーバ（本物の GitHub には触らない）。使い方: node tools/mikaku/plan_skip_probe.mjs
// 見ること:
//   S1 できていない行に「やらなかった」。「一人で」「二人で」とは別のボタン（plan-start-btn ではない）で、離れた位置（左がわ・重ならない）
//   S2 押しまちがえ防止: 押すと確認が出る。「キャンセル」なら何も変わらない・送らない
//   S3 OK →「— やらなかった」（「✔ できた」とは別）・「一人で」「二人で」は消える・plan_done に skipped:true（done:false）
//   S4 記録（stats・部分・大問・学習ログなど plan_／送信以外の localStorage）は変わらない
//   S5 「中身を見る」で保存した一覧は、やらなかったにすると消える
//   S6 「もどす」→ 元にもどる（plan_done の skipped も消える）
//   S7 1行できた＋残りをやらなかった → セットは済み（「おわり！」と「つぎ」）・all:true・開き直すと次のセット
//   S8 前の日に「やらなかった」にした行には「もどす」が出ない（その日のうち）
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_plan_skip"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "1c1fe4f";   // 直す前（「やらなかった」が無い版）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "plan_skip" });
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
  let dialogs = [], accept = true;
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => { dialogs.push(d.message()); (accept ? d.accept() : d.dismiss()).catch(() => {}); });
  const vis = sel => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const head = sel => pg.evaluate(s => { const e = document.querySelector(s + " .plan-head"); return e ? e.textContent : ""; }, sel);
  const rows = sel => pg.evaluate(s => [...document.querySelectorAll(s + " .plan-row")].map(r => ({
    m: r.querySelector(".plan-mark").textContent,
    skip: (r.querySelector(".plan-skip-btn") || {}).textContent || "",
    starts: [...r.querySelectorAll(".plan-start-btn")].filter(b => b.offsetParent !== null).map(b => b.textContent).join("|") })), sel);
  const clickSkip = (sel, i) => pg.evaluate(a => { const b = document.querySelectorAll(a[0] + " .plan-row")[a[1]].querySelector(".plan-skip-btn"); if (!b) throw new Error("やらなかったボタンが無い"); b.click(); }, [sel, i]);
  const onSolo = () => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const snapRec = () => pg.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^kq_battle_(plan_|outbox|send_)/.test(k)) continue; o[k] = localStorage.getItem(k); } return JSON.stringify(o); });
  const sent = () => { const w = written.get("battle/plan_done/0001.json"); return w ? w.content : null; };
  const PK = "1:朝：今週の回を3問";
  try {
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); await pg.reload(); await pg.waitForTimeout(1800);
    // 記録を少し作る: 1行目を一人でやり終える（stats・学習ログに中身がある状態で S4 を見る）
    await pg.evaluate(() => document.querySelectorAll("#plan-cur .plan-row")[0].querySelector(".plan-start-btn").click()); await pg.waitForTimeout(300);
    for (let k = 0; k < 6 && (await onSolo()); k++) { await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(80); await pg.$eval("#solo-judge-ok", e => e.click()); await pg.waitForTimeout(180); }
    await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h) h.click(); }); await pg.waitForTimeout(800);
    // S1
    const geo = await pg.evaluate(() => { const r = document.querySelectorAll("#plan-cur .plan-row")[1]; const s = r && r.querySelector(".plan-skip-btn"); if (!s) return null;
      const a = s.getBoundingClientRect(), bs = [...r.querySelectorAll(".plan-start-btn")].map(b => b.getBoundingClientRect());
      return { cls: s.className, txt: s.textContent, sRight: Math.round(a.right), bLeft: Math.round(Math.min(...bs.map(b => b.left))), overlap: bs.some(b => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)) }; });
    const r1 = await rows("#plan-cur");
    check("S1 できていない行に「やらなかった」・一人で／二人でとは別のボタンで離れた位置（左がわ・重ならない・12px以上あく）",
      geo && geo.txt === "やらなかった" && !/plan-start-btn/.test(geo.cls) && !geo.overlap && geo.bLeft - geo.sRight >= 12 && r1[1].skip === "やらなかった" && r1[2].skip === "やらなかった" && r1[0].skip === "", JSON.stringify({ geo, r1 }));
    await pg.screenshot({ path: path.join(SHOTS, label + "_S1.png") }).catch(() => {});
    // S2 キャンセル
    await pg.waitForTimeout(800);
    const before = await snapRec(), sent0 = JSON.stringify(sent());
    accept = false; dialogs = [];
    await clickSkip("#plan-cur", 1); await pg.waitForTimeout(500);
    const r2 = await rows("#plan-cur");
    check("S2 押すと確認が出る（「やらなかったことにしますか」）・キャンセルなら何も変わらない・送らない",
      dialogs.length === 1 && /やらなかったことにしますか/.test(dialogs[0]) && r2[1].m === "" && r2[1].starts === "一人で|二人で" && JSON.stringify(sent()) === sent0, JSON.stringify({ dialogs, r2: r2[1] }));
    // S5 の用意: 2行目の「中身を見る」で一覧を保存
    await pg.evaluate(() => document.querySelectorAll("#plan-cur .plan-row")[1].querySelector(".plan-peek-btn").click()); await pg.waitForTimeout(300);
    const pickOf = () => pg.evaluate(k => { const a = JSON.parse(localStorage.getItem("kq_battle_plan_pick_v2") || "{}"); return !!(a[1] && a[1][k]); }, PK);
    const pick0 = await pickOf();
    // S3 OK
    accept = true; dialogs = [];
    await clickSkip("#plan-cur", 1); await pg.waitForTimeout(1200);
    const r3 = await rows("#plan-cur"), w3 = sent();
    check("S3 OK →「— やらなかった」（「できた」とは別）・一人で／二人では消える・plan_done に skipped:true（done:false）・セットはまだ途中",
      dialogs.length === 1 && r3[1].m === "— やらなかった" && r3[1].starts === "" && r3[0].m === "✔ できた" && w3 && w3.items[1].skipped === true && w3.items[1].done === false && /^\d{4}-/.test(w3.items[1].skippedAt || "") && !w3.items[0].skipped && !w3.items[2].skipped && w3.all === false && !(await vis("#plan-done")),
      JSON.stringify({ r3: r3[1], item: w3 && w3.items[1], all: w3 && w3.all }));
    await pg.screenshot({ path: path.join(SHOTS, label + "_S3.png") }).catch(() => {});
    check("S4 記録（stats・学習ログ など plan_／送信以外）は変わらない", (await snapRec()) === before && before.length > 50, before.length);
    const pick1 = await pickOf();
    check("S5 「中身を見る」で保存した一覧は、やらなかったにすると消える", pick0 && !pick1, pick0 + "→" + pick1);
    // S6 もどす
    const r6a = await rows("#plan-cur");
    await clickSkip("#plan-cur", 1); await pg.waitForTimeout(1200);
    const r6 = await rows("#plan-cur"), w6 = sent();
    check("S6 「もどす」→ 元にもどる（一人で／二人でが出る・plan_done の skipped が消える・記録は変わらない）",
      r6a[1].skip === "もどす" && r6[1].m === "" && r6[1].starts === "一人で|二人で" && r6[1].skip === "やらなかった" && w6 && !w6.items[1].skipped && !w6.items[1].done && (await snapRec()) === before, JSON.stringify({ r6a: r6a[1], r6: r6[1] }));
    // S7 残り2行をやらなかった → おわり！と つぎ
    await clickSkip("#plan-cur", 1); await pg.waitForTimeout(400); await clickSkip("#plan-cur", 2); await pg.waitForTimeout(1200);
    const w7 = sent();
    const ok7a = (await vis("#plan-done")) && (await vis("#plan-next")) && (await head("#plan-next")) === "つぎ（明日のぶん）：10/8 のぶん" && w7 && w7.all === true && w7.items[1].skipped && w7.items[2].skipped && w7.items[0].done;
    await pg.screenshot({ path: path.join(SHOTS, label + "_S7.png") }).catch(() => {});
    await pg.reload(); await pg.waitForTimeout(1800);
    const cur7 = await head("#plan-cur");
    check("S7 1行できた＋残りやらなかった → 「おわり！」と「つぎ」・all:true・開き直すと次のセット（10/8）",
      ok7a && cur7 === "今日やること：10/8 のぶん", JSON.stringify({ ok7a, all: w7 && w7.all, cur7 }));
    // S8 前の日にやらなかったにした行には「もどす」が出ない（セット1の2行目だけ、きのうの時刻で。ほかは未）
    await pg.evaluate(k => { localStorage.removeItem("kq_battle_plan_done_v2"); localStorage.setItem("kq_battle_plan_skip_v2", JSON.stringify({ 1: { [k]: Date.now() - 86400000 * 1.5 } })); }, PK);
    await pg.reload(); await pg.waitForTimeout(1800);
    const cur8 = await head("#plan-cur"), r8 = await rows("#plan-cur");
    check("S8 前の日にやらなかった行は「— やらなかった」のまま「もどす」は出ない（その日のうち）",
      cur8 === "今日やること：10/7 のぶん" && r8[1].m === "— やらなかった" && r8[1].skip === "" && r8[1].starts === "" && r8[0].skip === "やらなかった", JSON.stringify({ cur8, r8 }));
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
