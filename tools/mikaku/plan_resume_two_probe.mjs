// 今日やることの「二人で」を途中でやめたら、もう一度「二人で」で続きから（2026-10-11）
// ユーザー「今日やることの二人でを押して初めて、何らかの都合で中断した時、また二人でを押したらその続きからやりたいです。
//   5問目まで終わって2問外れまたはスキップだったら、残り17問（うち2問は誤りで判定済み、正解しても誤りのまま）。
//   朝の分（夜の分）を完了にしたら、また次の分が出て、そのセットは普通に15問なり、20問が出てくれたらいい」
// 本物の Chrome 2枚・390x844・まねの GitHub API・まねの待ち合わせ先（本物には触らない）。使い方: node tools/mikaku/plan_resume_two_probe.mjs
// 見ること:
//   P1 朝の社会（6問）を二人で、1問目✕・2問目〇・3問目〇で中断 → 行が「二人のつづき 4問」（まだの3問＋✕の1問）
//   P2 もう一度「二人で」→ 出る順は まだの3問 → ✕の1問（答えた〇の2問は出ない）
//   P3 ✕だった問題を続きで〇にしても、記録（stats）は1回目の✕のまま・終えると行は「できた」で、朝まちがえたに残る
//   P4 夜の分を途中で中断 →「つづき」が出る → 「完了」→ 次のセットの行は ふつうの問題数（続きは捨てた・保存も消えた）
//   P5 日が変わったら（保存の日付が前の日）続きは出ない
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "579d5f4";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "plan_resume_two" });
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
  "plan/0001.json": { no: 1, label: "10/11 のぶん", items: [
    { subj: "社会", title: "朝：6問", ids: ["g6r1", "g6r2", "g6r3", "g6r4", "g6r5", "g6r6"] },
    { subj: "社会", title: "夜：3問", ids: ["g6r7", "g6r8", "g6r9"] } ] },
  "plan/0002.json": { no: 2, label: "10/12 のぶん", items: [
    { subj: "社会", title: "朝：3問", ids: ["g6r10", "g6r11", "g6r12"] } ] }
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
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": ["第6回.鎌倉時代"] }, units: ["第6回.鎌倉時代"], count: 5, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 60, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (cfg) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
};
async function run(label, src) {
  SERVED = src; written = new Map(); const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(400); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = pg => pg.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
  const H = await mk(), G = await mk();
  const kidRows = () => H.page.evaluate(() => [...document.querySelectorAll("#plan-cur .plan-kid-row")].map(r => ({ subj: r.dataset.subj, sub: r.querySelector(".plan-kid-sub").textContent })));
  const head = () => H.page.evaluate(() => { const k = document.querySelector("#plan-cur .plan-kid .plan-part-head"), h = document.querySelector("#plan-cur .plan-head"); return (h ? h.textContent : "") + " / " + (k ? k.textContent : ""); });
  const stat = id => H.page.evaluate(i => { try { const s = JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}")[i]; return s ? JSON.stringify({ c: s.correct, w: s.wrong }) : ""; } catch (e) { return "?"; } }, id);
  const session = () => H.page.evaluate(() => localStorage.getItem("kq_battle_host_session_v1"));
  // 同じ番号の部屋を同じ画面で作り直すと偽の待ち合わせ先で出会えないので、番号を忘れさせて開き直す（続きは保存から読む）
  const reloadHost = async () => { await H.page.evaluate(() => localStorage.removeItem("kq_battle_last_code_v1")); await H.page.reload(); await H.page.waitForTimeout(1800); };
  const startKidBattle = async () => {
    await H.page.waitForSelector("#plan-cur .plan-kid-row", { timeout: 20000, state: "attached" });
    await H.page.evaluate(() => { const r = document.querySelector("#plan-cur .plan-kid-row"); r.querySelector('.plan-kid-btn[data-kind="battle"]').click(); });
    await H.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await H.page.$eval("#room-code-display", e => e.textContent);
    await H.page.waitForTimeout(1500);
    await G.page.reload(); await G.page.waitForTimeout(800);
    await tap(G.page, "#go-join"); await G.page.fill("#join-code-input", code); await tap(G.page, "#join-btn");
    await waitVis(H.page, "#start-together-btn", 60000);
    await tap(H.page, "#start-together-btn"); await tap(G.page, "#join-start-together-btn");
    await H.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 30000 });
    await H.page.waitForTimeout(400);
  };
  const answerOne = async (ok) => {
    await H.page.waitForFunction(() => ["#skip-btn", "#advance-btn"].some(s => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== "none" && e.offsetParent !== null; }), null, { timeout: 30000 }).catch(() => {});
    const legacy = await H.page.evaluate(() => { const e = document.querySelector("#advance-btn"); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); });
    const id = await qid(H.page);
    if (legacy) await tap(H.page, "#advance-btn");
    await G.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 }).catch(() => {});
    await G.page.waitForTimeout(300);
    if (legacy) await tap(G.page, "#answer-reveal-btn").catch(() => {});
    await waitVis(G.page, "#judge-row", 15000).catch(() => {});
    await tap(G.page, ok ? "#judge-ok" : "#judge-ng").catch(() => {});
    if (legacy) { await waitVis(H.page, "#judge-row", 15000).catch(() => {}); await tap(H.page, "#judge-ok").catch(() => {}); }
    await H.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 }).catch(() => {});
    return id;
  };
  const next = async () => { await tap(H.page, "#next-btn").catch(() => {}); await H.page.waitForTimeout(600); };
  const pause = async () => { await tap(H.page, "#battle-pause-btn"); await H.page.waitForTimeout(1500); };
  try {
    for (const [x, cfg] of [[H, { token: TOKEN, api: API_URL }], [G, null]]) { await x.page.evaluate(SEED, [MIG, cfg]); await x.page.reload(); await x.page.waitForTimeout(1800); }
    // ===== P1 朝: ✕〇〇で中断 =====
    await startKidBattle();
    const a1 = await answerOne(false); await next();
    const a2 = await answerOne(true); await next();
    const a3 = await answerOne(true); await next();
    await pause();
    const r1 = await kidRows();
    check("P1 朝の6問を ✕〇〇 で中断 → 行が「二人のつづき 4問」（まだの3問＋✕の1問）", r1[0] && /つづき 4問/.test(r1[0].sub), JSON.stringify({ r1, a1, a2, a3, h: await head() }));
    const s1 = await stat(a1);
    // ===== P2 続きから =====
    await reloadHost();
    await startKidBattle();
    const asked = [];
    for (let k = 0; k < 4; k++) { asked.push(await answerOne(true)); await next(); await H.page.waitForTimeout(300); }
    const want = ["g6r1", "g6r2", "g6r3", "g6r4", "g6r5", "g6r6"].filter(i => ![a1, a2, a3].includes(i)).concat([a1]);
    check("P2 もう一度「二人で」→ まだの3問 → ✕の1問の順（〇の2問は出ない）", JSON.stringify(asked) === JSON.stringify(want), JSON.stringify({ asked, want }));
    await H.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 30000 }).catch(() => {});
    await H.page.evaluate(() => { const b = document.getElementById("result-home-btn"); if (b) b.click(); }); await H.page.waitForTimeout(1500);
    const s2 = await stat(a1);
    const missArr = await H.page.evaluate(() => { try { const m = JSON.parse(localStorage.getItem("kq_battle_plan_miss_v2") || "{}"); return JSON.stringify(m); } catch (e) { return ""; } });
    const h2 = await head();
    check("P3 ✕の問題（" + a1 + "）を続きで〇にしても記録は1回目のまま・朝まちがえたに残る・朝は終わって夜のぶんへ",
      s1 && s1 === s2 && missArr.includes(a1) && /夜のぶん/.test(h2), JSON.stringify({ s1, s2, missArr, h2 }));
    // ===== P4 夜: 中断 → 完了 → 次のセットはふつう =====
    await reloadHost();
    await startKidBattle();
    await answerOne(true); await next();
    await pause();
    const r4a = await kidRows();
    await H.page.evaluate(() => document.getElementById("plan-close-btn").click()); await H.page.waitForTimeout(2500);
    const r4b = await kidRows(), h4 = await head(), ss4 = await session();
    check("P4 夜を中断（つづき 2問）→「完了」→ 次のセットはふつうの3問・二人の続きの保存は消えた",
      r4a[0] && /つづき 2問/.test(r4a[0].sub) && /10\/12/.test(h4) && r4b[0] && r4b[0].sub === "3問" && !ss4, JSON.stringify({ r4a, r4b, h4, ss4: !!ss4 }));
    // ===== P5 日が変わったら =====
    await reloadHost();
    await startKidBattle();
    await answerOne(true); await next();
    await pause();
    const r5a = await kidRows();
    await H.page.evaluate(() => { const s = JSON.parse(localStorage.getItem("kq_battle_host_session_v1")); s.day = "2000-01-01"; localStorage.setItem("kq_battle_host_session_v1", JSON.stringify(s)); });
    await reloadHost();
    const r5b = await kidRows();
    check("P5 続きがあっても（" + (r5a[0] && r5a[0].sub) + "）、保存の日付が前の日なら続きは出ない（3問）", r5a[0] && /つづき 2問/.test(r5a[0].sub) && r5b[0] && r5b[0].sub === "3問", JSON.stringify({ r5a, r5b }));
    check("E 画面のエラー 0", H.errs.length + G.errs.length === 0, [].concat(H.errs, G.errs).join(" | "));
  } catch (e) { check("（途中で止まった）", false, (e && e.message || e) + " / errs=" + [].concat(H.errs, G.errs).join(" | ") + " / plan=" + (await H.page.evaluate(() => { const b = document.getElementById("plan-box"); return b ? b.innerText.slice(0, 300) : "(no plan-box)"; }).catch(() => ""))); }
  finally { await H.ctx.close(); await G.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); relay.close(); process.exit(c); };
if (!process.env.NOW_ONLY) {
  console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
  const outB = await run("base", BASELINE);
  const ngB = report("対照 " + BASE_COMMIT, outB);
  const must = ["P1", "P2"].filter(t => !outB.some(c => !c.ok && c.n.startsWith(t)));
  console.log(must.length === 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格（鳴らなかった: " + must.join(" ") + "）");
  if (must.length) await done(3);
}
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
