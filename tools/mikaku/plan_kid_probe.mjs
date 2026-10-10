// 今日やること: 子ども向けの形（2026-10-11）
// ユーザー「子供が見づらいし押しづらい。朝の分か夜の分かも選ばせたくなくて、朝終わったら『完了』→夜の一人or二人の理科と社会が並ぶ、
//   終わったら完了をおす、というシンプルな構成に。朝間違えたところを先に、などの親向けの情報は下に小さく書いてあれば十分」
// 本物の Chrome・390x844・まねの GitHub API サーバ。使い方: node tools/mikaku/plan_kid_probe.mjs
//   K1 子どもの画面は「朝のぶん」だけ・行は 理科・社会 の2行（教科名と大きいボタン「一人で」「二人で」）。親向けの文字（朝：・まちがえた・まだ定着）は見えない・夜の行も見えない
//   K2 理科の「一人で」→ 朝の理科2行をつないで出す（第7回のぶん→第6回のぶん）。最後まで終えると、元の2行とも「できた」（plan_done）
//   K3 「完了」→ 確認 → 夜のぶん（理科・社会）に変わる。やっていない社会の朝は「できたことにする」・parts_closed に 朝
//   K4 夜も「完了」→ セットが済み、次のセットの子どもの行が出る・plan_done に closed:true
//   K5 「おうちの人向け」を開くと、元の行（「朝：…」「晩：…」）と「中身を見る」が出る
//   K6 記録（plan_／送信以外の localStorage）は「完了」で変わらない
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_plan_kid"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "abd4d80";   // 直す前（行がそのまま並ぶ版）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "plan_kid" });
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
  "plan/0001.json": { no: 1, label: "第7回のおさらい 1", message: "まちがえても正解するまで出るから大丈夫。", items: [
    { subj: "理科", title: "朝：第7回の苦手・まだの問題から2問", ids: ["r6p12", "r6p11"], order: "weak", count: 2 },
    { subj: "理科", title: "朝：第6回のまだ定着していない問題 1問", ids: ["r6p21"], order: "weak", count: 1 },
    { subj: "社会", title: "朝：室町時代（第7回）から3問", unit: "第6回.鎌倉時代", count: 3, order: "weak" },
    { subj: "理科", title: "晩：朝まちがえたのから2問", ids: ["r6p13", "r6p14"], order: "weak", count: 2 },
    { subj: "社会", title: "晩：朝まちがえたのから2問", unit: "第6回.鎌倉時代", count: 2, order: "weak" } ] },
  "plan/0002.json": { no: 2, label: "第7回のおさらい 2", items: [
    { subj: "理科", title: "朝：2問", ids: ["r6p22", "r6p31"] }, { subj: "社会", title: "朝：2問", unit: "第6回.鎌倉時代", count: 2 },
    { subj: "理科", title: "晩：1問", ids: ["r6p23"] }, { subj: "社会", title: "晩：1問", unit: "第6回.鎌倉時代", count: 1 } ] }
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
  let dialogs = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => { dialogs.push(d.message()); d.accept().catch(() => {}); });
  const kid = () => pg.evaluate(() => { const k = document.querySelector("#plan-cur .plan-kid"); if (!k) return null;
    const vt = el => el && el.offsetParent !== null;
    return { part: (k.querySelector(".plan-part-head") || {}).textContent || "", rows: [...k.querySelectorAll(".plan-kid-row")].map(r => ({ subj: r.dataset.subj, sub: r.querySelector(".plan-kid-sub").textContent, btns: [...r.querySelectorAll(".plan-kid-btn")].filter(vt).map(b => b.textContent).join("|"), h: Math.round(r.querySelector(".plan-kid-btn").getBoundingClientRect().height) })),
      close: (k.querySelector("#plan-close-btn") || {}).textContent || "" }; });
  const visibleText = () => pg.evaluate(() => { const b = document.getElementById("plan-cur"); return b ? b.innerText : ""; });
  const onSolo = () => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const snapRec = () => pg.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^kq_battle_(plan_|outbox|send_)/.test(k)) continue; o[k] = localStorage.getItem(k); } return JSON.stringify(o); });
  const sent = n => { const w = written.get("battle/plan_done/000" + n + ".json"); return w ? w.content : null; };
  const head = () => pg.evaluate(() => { const e = document.querySelector("#plan-cur .plan-head"); return e ? e.textContent : ""; });
  const clickKid = (subj, kind) => pg.evaluate(a => { const r = [...document.querySelectorAll("#plan-cur .plan-kid-row")].find(x => x.dataset.subj === a[0]); if (!r) throw new Error("子どもの行が無い " + a[0]); r.querySelector('.plan-kid-btn[data-kind="' + a[1] + '"]').click(); }, [subj, kind]);
  try {
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); await pg.reload(); await pg.waitForTimeout(1800);
    // K1
    const k1 = await kid(), vt1 = await visibleText();
    await pg.screenshot({ path: path.join(SHOTS, label + "_K1.png") }).catch(() => {});
    check("K1 子どもの画面は「朝のぶん」・行は理科・社会の2行（大きいボタン 一人で｜二人で）・親向けの文字と夜の行は見えない",
      k1 && k1.part === "朝のぶん" && k1.rows.length === 2 && k1.rows[0].subj === "理科" && k1.rows[1].subj === "社会" && k1.rows.every(r => r.btns === "一人で|二人で" && r.h >= 44)
        && !/朝：|晩：|まちがえた|まだ定着|中身を見る|やらなかった/.test(vt1), JSON.stringify({ k1, vt1: vt1.slice(0, 200) }));
    // K2 理科の一人で
    await clickKid("理科", "solo"); await pg.waitForTimeout(400);
    const q = [];
    for (let k = 0; k < 8 && (await onSolo()); k++) { const id = await pg.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, "")); if (!q.includes(id)) q.push(id); await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(80); await pg.$eval("#solo-judge-ok", e => e.click()); await pg.waitForTimeout(180); }
    await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h) h.click(); }); await pg.waitForTimeout(1200);
    const w2 = sent(1), k2 = await kid();
    check("K2 理科の「一人で」→ 朝の理科2行をつないで出す（第7回2問→第6回1問）・終えると元の2行とも できた・子どもの行は ✔",
      q.length === 3 && q[2] === "r6p21" && ["r6p11", "r6p12"].every(x => q.slice(0, 2).includes(x)) && w2 && w2.items[0].done && w2.items[1].done && !w2.items[2].done && k2 && k2.part === "朝のぶん" && /できた/.test(k2.rows[0].sub),
      JSON.stringify({ q, items: w2 && w2.items.map(x => x.done), k2: k2 && k2.rows }));
    // K3 完了（社会の朝はやっていない）
    const before = await snapRec();
    dialogs = [];
    await pg.evaluate(() => document.getElementById("plan-close-btn").click()); await pg.waitForTimeout(1500);
    const k3 = await kid(), w3 = sent(1);
    await pg.screenshot({ path: path.join(SHOTS, label + "_K3.png") }).catch(() => {});
    check("K3 「完了」→ 確認 → 夜のぶん（理科・社会）・社会の朝は「できたことにする」・parts_closed に 朝・セットはまだ途中",
      dialogs.length === 1 && /朝のぶんを完了/.test(dialogs[0]) && k3 && k3.part === "夜のぶん" && k3.rows.map(r => r.subj).join() === "理科,社会" && w3 && w3.items[2].done && w3.items[2].manual && !w3.items[3].done && w3.parts_closed && w3.parts_closed["朝"] && !w3.closed && w3.all === false,
      JSON.stringify({ dialogs, k3, items: w3 && w3.items.map(x => [x.done, !!x.manual]), pc: w3 && w3.parts_closed }));
    check("K6 記録（plan_／送信以外）は「完了」で変わらない", (await snapRec()) === before && before.length > 50, before.length);
    // K4 夜も完了 → 次のセット
    await pg.evaluate(() => document.getElementById("plan-close-btn").click()); await pg.waitForTimeout(2500);
    const w4 = sent(1), k4 = await kid(), h4 = await head();
    check("K4 夜も「完了」→ 次のセット（おさらい 2）の朝のぶん・plan_done に closed:true・all:true",
      w4 && w4.closed === true && w4.all === true && h4 === "今日やること：第7回のおさらい 2" && k4 && k4.part === "朝のぶん" && k4.rows.length === 2, JSON.stringify({ h4, k4, closed: w4 && w4.closed }));
    // K5 おうちの人向け
    await pg.evaluate(() => { const d = document.querySelector("#plan-cur details.plan-parent"); if (d) d.open = true; }); await pg.waitForTimeout(200);
    const p5 = await pg.evaluate(() => { const d = document.querySelector("#plan-cur details.plan-parent"); return d ? { rows: [...d.querySelectorAll(".plan-row-title")].filter(e => e.offsetParent !== null).map(e => e.textContent), peek: [...d.querySelectorAll(".plan-peek-btn")].filter(e => e.offsetParent !== null).length } : null; });
    await pg.screenshot({ path: path.join(SHOTS, label + "_K5.png"), fullPage: true }).catch(() => {});
    check("K5 「おうちの人向け」を開くと、元の行（朝：…／晩：…）と「中身を見る」が見える", p5 && p5.rows.length === 4 && p5.rows.some(t => /晩：/.test(t)) && p5.peek === 4, JSON.stringify(p5));
    check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split(String.fromCharCode(10))[0]); }
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
