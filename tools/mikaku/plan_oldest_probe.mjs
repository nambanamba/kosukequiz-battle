// 今日やることの復習の並び: 段の中は「最後に正解した日が古い順」（2026-10-15 ユーザー「案A」。調査: 司令塔\回答\復習で同じ問題ばかり_調査_2026-10-15.md）
// 10-12〜15 の社会第6回の朝は、候補のほとんどが「おぼえかけ」で、段の中が id 順のまま → 同じ先頭（日蓮など）が毎朝出ていた。
// 本物の Chrome・390x844・まねの GitHub API サーバ。使い方: node tools/mikaku/plan_oldest_probe.mjs
// 見ること（社会 第6回の10枚。order:"weak"・「中身を見る」の一覧で並びを見る）:
//   O1 おぼえかけ8枚（前日に正解2・2日前2・6日前2・9日前2。id 順では前日に正解したものが先頭）・count 4 → 古い順の 9日前2・6日前2 が選ばれる（前日の2枚は後ろに回る）
//   O2 段は変わらない: 苦手2枚（古い→新しい）が先頭・つぎにおぼえかけが古い順。count 6
//   O3 まだ正解していない問題は、おぼえかけより前（段）・正解なしは先頭
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で O1・O2 が鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "4cbd7f7";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "planoldest" });
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

const DAY = 86400000;
async function run(label, src) {
  SERVED = src; mode = "up"; gets = 0; written = new Map(); SETS = {}; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  const peek = async i => { await pg.evaluate(i => document.querySelectorAll("#plan-cur .plan-row")[i].querySelector(".plan-peek-btn").click(), i); await pg.waitForTimeout(200);
    return pg.evaluate(i => { const p = document.querySelectorAll("#plan-cur .plan-peek")[i]; if (!p) return null;
      return [...p.querySelectorAll("li")].map(l => l.dataset.qid); }, i); };
  try {
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); await pg.reload(); await pg.waitForTimeout(1500);
    const ids = await pg.evaluate(() => QA_DATA.filter(d => d.subj === "社会" && d.u === "第6回.鎌倉時代" && d.kind !== "daimon" && d.kind !== "calc").slice(0, 11).map(d => d.id));
    check("前提: 社会 第6回のカード " + ids.length + " 枚", ids.length === 11, ids.join(" "));
    // ids[0..7] おぼえかけ（✕なし・正解した日が1日）: 前日2・2日前2・6日前2・9日前2 ／ ids[8],[9] 苦手（新しい方が後ろ…id順では逆にして古い方を後ろに置く）／ ids[10] まだ正解なし
    const ago = [1, 1, 2, 2, 6, 6, 9, 9];
    await pg.evaluate(([ids, ago, DAY]) => {
      const ymd = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
      const noon = Date.now() - 0; const st = {};
      ids.slice(0, 8).forEach((id, k) => { const t = noon - ago[k] * DAY; st[id] = { correct: 1, wrong: 0, box: 1, correctDays: [ymd(t)], lastCorrectAt: t, lastAnswered: t }; });
      st[ids[8]] = { correct: 1, wrong: 1, box: 0, correctDays: [ymd(noon - 3 * DAY)], lastCorrectAt: noon - 3 * DAY, lastAnswered: noon - 1 * DAY };   // 苦手（新しい方）
      st[ids[9]] = { correct: 1, wrong: 1, box: 0, correctDays: [ymd(noon - 20 * DAY)], lastCorrectAt: noon - 20 * DAY, lastAnswered: noon - 1 * DAY };  // 苦手（古い方）
      localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    }, [ids, ago, DAY]);
    SETS = { "plan/index.json": { sets: [1] }, "plan/0001.json": { no: 1, label: "10/16 のぶん", items: [
      { subj: "社会", title: "O1", ids: ids.slice(0, 8), order: "weak", count: 4 },
      { subj: "社会", title: "O2", ids: ids.slice(0, 10), order: "weak", count: 6 },
      { subj: "社会", title: "O3", ids: ids.slice(0, 8).concat([ids[10]]), order: "weak", count: 3 } ] } };
    await pg.reload(); await pg.waitForTimeout(1800);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const o1 = await peek(0), want1 = [ids[6], ids[7], ids[4], ids[5]];
    check("O1 おぼえかけ8枚・count 4 → 古い順（9日前→6日前）。前日に正解した 2 枚は選ばれない", o1 && same(o1, want1), "選ばれた " + JSON.stringify(o1) + " ／ 期待 " + JSON.stringify(want1));
    const o2 = await peek(1), want2 = [ids[9], ids[8], ids[6], ids[7], ids[4], ids[5]];
    check("O2 苦手2枚（古い正解日→新しい）が先頭・つぎにおぼえかけが古い順（段は変わらない）", o2 && same(o2, want2), "選ばれた " + JSON.stringify(o2) + " ／ 期待 " + JSON.stringify(want2));
    const o3 = await peek(2), want3 = [ids[10], ids[6], ids[7]];
    check("O3 まだ正解していない 1 枚が先頭（段）・つぎにおぼえかけの古い順", o3 && same(o3, want3), "選ばれた " + JSON.stringify(o3) + " ／ 期待 " + JSON.stringify(want3));
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
