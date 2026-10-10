// 今日やること: ids＋count で order が無い行（ランダムの行）も count ちょうどにする
// （2026-10-09 ユーザー「社会の何問中何問の母数が、おかしいです。15問になってないと子供がやらないので直して欲しい」
//   セット3の「朝：鎌倉時代（第6回）から15問」＝ ids 39件・count 15・order なし → 始めたら「1 / 39」だった）
// 本物の Chrome・390x844・まねの GitHub API サーバ（本物の GitHub には書かない）。使い方: node tools/mikaku/plan_count_random_probe.mjs
// ★セットの中身は本物の kosuke-records の plan/0003〜0005.json を gh api で読んで、まねの API に入れる
//   （直す前の形＝社会の朝の行に order が無い 0003 は、コミット 3a482d4 の版）
// 見ること:
//   R1 直す前の形の 0003・社会の朝の行（ids 39・count 15・order なし）→ 中身を見る「答える問題：15問」・一人で「1 / 15」「のこり15問」
//   R2 同じ行を「二人で」→ ホストの「1 / 15」「のこり15問」・ゲストも「1 / 15」
//   R3 同じ行に fill_ids を足した形（候補の「まだ」が足りているので前の回は入らない）でも 15
//   R4 直す前に保存した一覧（39件）が端末に残っていても、一人で「1 / 15」（選び直す）
//   R5 本物の 0003・0004・0005（いまの版）の4行すべて: 中身を見る・一人で の分母が 理科 20／社会 15
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "01728b8";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const ghPlan = (f, ref) => JSON.parse(Buffer.from(execSync('gh api "repos/nambanamba/kosuke-records/contents/plan/' + f + (ref ? "?ref=" + ref : "") + '" -q .content', { encoding: "utf8" }).replace(/\s+/g, ""), "base64").toString("utf8"));
const REAL = { 3: ghPlan("0003.json"), 4: ghPlan("0004.json"), 5: ghPlan("0005.json") };
const OLD3 = ghPlan("0003.json", "3a482d4");
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
let SETS = {}, written = new Map();
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
  const [mig, cfg, extra] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": ["第6回.鎌倉時代"] }, units: ["第6回.鎌倉時代"], count: 5, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (cfg) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
  if (extra) Object.keys(extra).forEach(k => localStorage.setItem(k, extra[k]));
};
const want = it => it.subj === "理科" ? 20 : 15;

async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  const txt = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : ""; }, sel);
  const startRow = (i, which) => pg.evaluate(a => document.querySelectorAll("#plan-cur .plan-row")[a[0]].querySelectorAll(".plan-start-btn")[a[1]].click(), [i, which || 0]);
  const peekN = async i => { await pg.evaluate(i => document.querySelectorAll("#plan-cur .plan-row")[i].querySelector(".plan-peek-btn").click(), i); await pg.waitForTimeout(200);
    return pg.evaluate(i => { const p = document.querySelectorAll("#plan-cur .plan-peek")[i]; const m = p && /答える問題：(\d+)問/.exec(p.innerText); return m ? +m[1] : null; }, i); };
  // 1つのセットだけを置いて、まっさらな端末で開く
  const openSet = async (no, set, extra) => {
    SETS = { "plan/index.json": { sets: [no] } }; SETS["plan/" + String(no).padStart(4, "0") + ".json"] = set; written = new Map();
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, extra || null]); await pg.reload(); await pg.waitForTimeout(1800);
  };
  // 一人で始めた直後の「◯ / ◯」と「のこり◯問」
  const soloStart = async i => { await startRow(i, 0); await pg.waitForTimeout(400); return { c: await txt(pg, "#solo-counter"), l: await txt(pg, "#solo-left") }; };
  try {
    // R1
    const old = OLD3.items[1];
    check("前提: 直す前の 0003 の社会の朝の行は ids " + old.ids.length + "・count " + old.count + "・order " + (old.order || "なし"), old.ids.length > 15 && old.count === 15 && !old.order);
    await openSet(3, OLD3);
    const p1 = await peekN(1);
    await openSet(3, OLD3);
    const s1 = await soloStart(1);
    check("R1 直す前の形の社会の朝の行 → 中身を見る " + p1 + "問・一人で " + s1.c + "・" + s1.l, p1 === 15 && s1.c === "1 / 15" && /^のこり15問/.test(s1.l));
    // R2 二人で
    await openSet(3, OLD3);
    const gctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const gp = await gctx.newPage();
    gp.on("pageerror", e => errs.push("guest: " + String(e))); gp.on("dialog", d => d.accept().catch(() => {}));
    try {
      await gp.goto(PAGE_URL); await gp.evaluate(SEED, [MIG, null, null]); await gp.reload(); await gp.waitForTimeout(800);
      await startRow(1, 1);
      await pg.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
      const code = await pg.$eval("#room-code-display", e => e.textContent);
      await gp.$eval("#go-join", e => e.click()); await gp.fill("#join-code-input", code); await gp.$eval("#join-btn", e => e.click());
      const wv = (p, sel, ms) => p.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 30000 });
      await wv(pg, "#start-together-btn", 60000);
      await pg.$eval("#start-together-btn", e => e.click()); await gp.$eval("#join-start-together-btn", e => e.click());
      await wv(pg, "#advance-btn", 30000); await pg.waitForTimeout(300);
      const hc = await txt(pg, "#battle-counter"), hl = await txt(pg, "#battle-left");
      await pg.$eval("#advance-btn", e => e.click());
      await gp.waitForFunction(() => getComputedStyle(document.getElementById("battle-view")).display !== "none", null, { timeout: 20000 }).catch(() => {});
      await gp.waitForTimeout(500);
      const gc = await txt(gp, "#battle-counter");
      check("R2 同じ行を二人で → ホスト " + hc + "・" + hl + "・ゲスト " + gc, hc === "1 / 15" && /^のこり15問/.test(hl) && gc === "1 / 15");
    } catch (e) { check("R2 二人で（最後まで走った）", false, String(e && e.message || e).split("\n")[0]); }
    finally { await gctx.close(); }
    // R3 fill_ids あり（候補の「まだ」は39問で足りているので前の回は入らない）
    const withFill = JSON.parse(JSON.stringify(OLD3)); withFill.items[1].fill_ids = ["g5r1", "g5r2", "g5r3"];
    await openSet(3, withFill);
    const s3 = await soloStart(1);
    check("R3 fill_ids を足しても → 一人で " + s3.c + "・" + s3.l, s3.c === "1 / 15" && /^のこり15問/.test(s3.l));
    // R4 直す前に保存した一覧（39件）が残っている
    const key = "1:" + old.title;
    const stale = JSON.stringify({ 3: { [key]: { ids: old.ids, miss: 0 } } });
    await openSet(3, OLD3, { kq_battle_plan_pick_v2: stale });
    const s4 = await soloStart(1);
    check("R4 直す前に保存した39件の一覧が残っていても → 一人で " + s4.c, s4.c === "1 / 15");
    // R5 本物の 0003〜0005（いまの版）の4行
    for (const no of [3, 4, 5]) {
      const set = REAL[no];
      for (let i = 0; i < set.items.length; i++) {
        const it = set.items[i], w = want(it);
        await openSet(no, set);
        const pn = await peekN(i);
        await openSet(no, set);
        const s = await soloStart(i);
        check("R5 " + String(no).padStart(4, "0") + " 行" + (i + 1) + "（" + it.subj + "・ids " + it.ids.length + "・order " + (it.order || "なし") + (it.merge ? "・merge" : "") + "）→ 中身を見る " + pn + "問・一人で " + s.c + "・" + s.l,
          pn === w && s.c === "1 / " + w && new RegExp("^(🔁 もう一度　)?のこり" + w + "問").test(s.l));
      }
    }
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
