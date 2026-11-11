// ★2026-11-12 今日やることの 社会・理科 の「二人で」「一人で」（下の選び方どおり）を、とちゅうで止まっても同じ所から
// ユーザー「続きからのボタンが続きからできなくなっていました」（11-12 に今日のセットをやめたら、おわる で続きが消えていた）
// plan_keep_1106_probe.mjs を写したもの。本物の Chrome 2枚・まねの GitHub API・まねの待ち合わせ先。使い方: node tools/mikaku/free_keep_1112_probe.mjs（NOW_ONLY=1 で今の版だけ・REAL=1 で待ち合わせ先だけ本物）
// 設定: 社会は 第6回.鎌倉時代・理科は 第6回.ヒトと動物の呼吸・循環・どちらも12問・順番どおり
// 見ること:
//   K1 社会の行の二人で 4問（〇✕〇スキップ）→「4 / 12」で「✕ おわる」→ 開き直す → 行に「二人のつづき」→ 二人で →「4 / 12」・同じ問題から
//   K2 続きで2問 →「6 / 12」でタブを落とす → 二人で →「6 / 12」・同じ問題から
//   K3 とちゅうで理科の行の二人で（1 / 12）を始めて おわる → 社会の続きは消えていない（「6 / 12」から）
//   K4 相手（親）が落ちる → 子どもはホームへ → 二人で → 同じ所から
//   K5 1回目を全部答えたあと、やり直し（ぐるぐる）のとちゅうで おわる → 行は「二人のつづき」→ 続きのやり直しから
//   K6 最後まで → 行の「二人のつづき」は消える → もう一度押すと ふつうの12問（1 / 12）
//   K7 送った記録（battle/session）: 社会の回は 1つ（同じ id）のまま・1回目の答えは12問ちょうど・スキップは押した1問だけ
//   S1 一人で: 社会の行 3問 → やめてもどる → 理科の行 2問 → やめてもどる → 開き直す → 両方の行に「一人のつづき」→ 社会の一人で → 社会の続き（4 / 12）
//   E  画面のエラー 0
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "7496543";   // 直す前（2026-11-12 今日のセットをやめた版）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "plan_keep_1106" });
function withFakeRelay(s) { if (process.env.REAL) return s; const i0 = s.indexOf("const RELAY_URLS = ["), i1 = s.indexOf("];", i0); return s.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + s.slice(i1); }
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
const R = ["g6r1","g6r2","g6r3","g6r4","g6r5","g6r6","g6r7","g6r8","g6r9","g6r10","g6r11","g6r12"];
const SETS = {
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
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": ["第6回.鎌倉時代"], "理科": ["第6回.ヒトと動物の呼吸・循環"] }, units: ["第6回.鎌倉時代"], count: 12, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 60, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (cfg) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
};
async function run(label, src) {
  SERVED = src; written = new Map(); const out = [];
  const check = (n, ok, x) => { out.push({ n, ok: !!ok, x: x == null ? "" : String(x) }); console.log("  [" + label + "] " + (ok ? "✔" : "✘") + " " + n.slice(0, 60)); };
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(400); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = pg => pg.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
  const H = await mk(), G = await mk();
  const counter = () => H.page.$eval("#battle-counter", e => e.textContent.trim());
  const kidRows = () => H.page.evaluate(() => [...document.querySelectorAll("#plan-cur .plan-kid-row")].map(r => ({ subj: r.dataset.subj, sub: r.querySelector(".plan-kid-sub").textContent })));
  const reloadHost = async () => { await H.page.evaluate(() => localStorage.removeItem("kq_battle_last_code_v1")); await H.page.reload(); await H.page.waitForTimeout(1800); };
  const onResult = () => H.page.evaluate(() => document.getElementById("screen-result").classList.contains("active"));
  const startKidBattle = async (subj) => {
    await H.page.waitForSelector("#plan-cur .plan-kid-row", { timeout: 20000, state: "attached" });
    await H.page.evaluate(sj => { const r = document.querySelector('#plan-cur .plan-kid-row[data-subj="' + sj + '"]'); r.querySelector('.plan-kid-btn[data-kind="battle"]').click(); }, subj);
    await H.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await H.page.$eval("#room-code-display", e => e.textContent);
    await H.page.waitForTimeout(1500);
    await G.page.reload(); await G.page.waitForTimeout(800);
    await tap(G.page, "#go-join"); await G.page.fill("#join-code-input", code); await tap(G.page, "#join-btn");
    await waitVis(H.page, "#start-together-btn", 60000);
    await tap(H.page, "#start-together-btn"); await tap(G.page, "#join-start-together-btn");
    await H.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 30000 });
    await H.page.waitForTimeout(600);
  };
  const waitShown = async () => { await H.page.waitForFunction(() => { const e = document.querySelector("#skip-btn"); return e && getComputedStyle(e).display !== "none" && e.offsetParent !== null; }, null, { timeout: 30000 }).catch(() => {}); };
  const answerOne = async (ok) => {
    await waitShown();
    const id = await qid(H.page);
    await G.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 }).catch(() => {});
    await G.page.waitForTimeout(300);
    await waitVis(G.page, "#judge-row", 15000).catch(() => {});
    await tap(G.page, ok ? "#judge-ok" : "#judge-ng").catch(() => {});
    await H.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 }).catch(() => {});
    await tap(H.page, "#next-btn").catch(() => {}); await H.page.waitForTimeout(700);
    return id;
  };
  const skipOne = async () => {
    await waitShown();
    const id = await qid(H.page);
    await tap(H.page, "#skip-btn");
    await waitVis(H.page, "#skip-continue-btn", 15000).catch(() => {});
    await tap(H.page, "#skip-continue-btn").catch(() => {}); await H.page.waitForTimeout(700);
    return id;
  };
  const at = async () => { await waitShown(); return { c: await counter(), q: await qid(H.page), left: await H.page.$eval("#battle-left", e => e.textContent) }; };
  const endBattle = async () => {
    await tap(H.page, "#battle-end-btn"); await H.page.waitForTimeout(1200);
    await H.page.evaluate(() => { const b = document.getElementById("result-home-btn"); if (b) b.click(); }); await H.page.waitForTimeout(1200);
  };
  const sessFiles = () => [...written.keys()].filter(p => p.startsWith("battle/session/"));
  try {
    for (const [x, cfg] of [[H, { token: TOKEN, api: API_URL }], [G, null]]) { await x.page.evaluate(SEED, [MIG, cfg]); await x.page.reload(); await x.page.waitForTimeout(1800); }
    // ===== K1 4/12 で おわる → 開き直す =====
    await startKidBattle("社会");
    const first = [];
    first.push(["o", await answerOne(true)]); first.push(["x", await answerOne(false)]); first.push(["o", await answerOne(true)]); first.push(["skip", await skipOne()]);
    const b1 = await at();
    await endBattle();
    await reloadHost();
    const r1 = await kidRows();
    await startKidBattle("社会");
    const a1 = await at();
    check("K1 「" + b1.c + "」で おわる → 開き直す → 行「" + (r1[0] && r1[0].sub) + "」→ 二人で → 「" + a1.c + "」同じ問題（" + a1.q + "）から",
      b1.c === "4 / 12" && a1.c === b1.c && a1.q === b1.q && r1[0] && /二人のつづき/.test(r1[0].sub), JSON.stringify({ b1, a1, r1, first }));
    // ===== K2 落ちる =====
    await answerOne(true); await answerOne(true);
    const b2 = await at();
    await reloadHost();
    await startKidBattle("社会");
    const a2 = await at();
    check("K2 「" + b2.c + "」で落ちる（何も押さずに開き直す）→ 二人で → 「" + a2.c + "」同じ問題から", b2.c === "6 / 12" && a2.c === b2.c && a2.q === b2.q, JSON.stringify({ b2, a2 }));
    // ===== K3 理科を間にはさむ =====
    await endBattle();
    await reloadHost();
    await startKidBattle("理科");
    const rk = await at();
    await answerOne(true);
    await endBattle();
    await reloadHost();
    const r3 = await kidRows();
    await startKidBattle("社会");
    const a3 = await at();
    check("K3 とちゅうで理科（" + rk.c + "）を始めて おわる → 行［" + r3.map(x => x.sub).join(" / ") + "］→ 社会の続きは「" + a3.c + "」同じ問題から", rk.c === "1 / 12" && a3.c === b2.c && a3.q === b2.q && r3[1] && /二人のつづき/.test(r3[1].sub), JSON.stringify({ rk, a3, r3 }));
    // ===== K4 相手が落ちる =====
    await answerOne(true);
    const b4 = await at();
    await G.page.reload(); await H.page.waitForTimeout(5000);
    const hostHome = await H.page.evaluate(() => document.getElementById("screen-home").classList.contains("active"));
    await reloadHost();
    await startKidBattle("社会");
    const a4 = await at();
    check("K4 相手（親）が「" + b4.c + "」で落ちる → 子どもはホームへ（" + hostHome + "）→ 二人で → 「" + a4.c + "」同じ問題から", a4.c === b4.c && a4.q === b4.q, JSON.stringify({ b4, a4, hostHome }));
    // ===== K5 やり直しのとちゅうで おわる =====
    for (let k = 0; k < 14; k++) { const p = await at(); if (/もう一度/.test(p.left) || await onResult()) break; await answerOne(true); }
    const b5 = await at();
    await endBattle();
    await reloadHost();
    const r5 = await kidRows();
    await startKidBattle("社会");
    const a5 = await at();
    check("K5 やり直し（" + b5.left.slice(0, 12) + "・" + b5.q + "）で おわる → 行「" + (r5[0] && r5[0].sub) + "」→ 二人で → 同じ問題（" + a5.q + "）から",
      /もう一度/.test(b5.left) && r5[0] && /二人のつづき/.test(r5[0].sub) && a5.q === b5.q && a5.c === b5.c, JSON.stringify({ b5, a5, r5 }));
    // ===== K6 最後まで =====
    for (let k = 0; k < 10; k++) { if (await onResult()) break; await answerOne(true); }
    const fin = await onResult();
    await H.page.evaluate(() => { const b = document.getElementById("result-home-btn"); if (b) b.click(); }); await H.page.waitForTimeout(1500);
    await reloadHost();
    const r6 = await kidRows();
    await startKidBattle("社会");
    const a6 = await at();
    check("K6 最後まで（結果画面 " + fin + "）→ 行「" + (r6[0] && r6[0].sub) + "」（社会の二人のつづきは消える）→ もう一度押すと「" + a6.c + "」", fin && r6[0] && !/二人のつづき/.test(r6[0].sub) && a6.c === "1 / 12", JSON.stringify({ r6, a6 }));
    await endBattle();
    // ===== K7 記録 =====
    await H.page.waitForTimeout(3000);
    const sf = sessFiles().map(p => ({ p, b: written.get(p).content }));
    const shakai = sf.filter(x => (x.b.q || []).some(e => /^g6r/.test(e.id)) && (x.b.q || []).length > 3);
    const sb = shakai[0] ? shakai[0].b : null;
    const firstAns = sb ? sb.q.filter(e => !e.re) : [];
    const uniqFirst = new Set(firstAns.map(e => e.id));
    const skips = firstAns.filter(e => e.r === "skip").map(e => e.id);
    check("K7 社会の回の記録は 1つ（" + shakai.length + " 個）・1回目の答え " + firstAns.length + " 件・スキップは押した1問だけ（" + skips.join(",") + "）",
      shakai.length === 1 && firstAns.length === 12 && uniqFirst.size === 12 && skips.length === 1 && skips[0] === first[3][1],
      JSON.stringify({ files: sf.map(x => x.p + ":" + (x.b.q || []).length), q: sb && sb.q.map(e => e.id + ":" + e.r + (e.re ? "(re)" : "")).join(" ") }));
    // ===== S1 一人で =====
    const soloRow = async (subj) => { await H.page.evaluate(sj => document.querySelector('#plan-cur .plan-kid-row[data-subj="' + sj + '"] .plan-kid-btn[data-kind="solo"]').click(), subj); await H.page.waitForTimeout(900); };
    const soloOk = async (n) => { for (let i = 0; i < n; i++) { await tap(H.page, "#solo-reveal-btn"); await H.page.waitForTimeout(150); await tap(H.page, "#solo-judge-ok"); await H.page.waitForTimeout(350); } };
    const soloAt = () => H.page.evaluate(() => ({ c: document.getElementById("solo-counter").textContent, q: document.getElementById("solo-q-id").textContent }));
    await soloRow("社会"); await soloOk(3); const s1 = await soloAt();
    await tap(H.page, "#solo-back"); await H.page.waitForTimeout(800);
    await soloRow("理科"); await soloOk(2); const s2 = await soloAt();
    await tap(H.page, "#solo-back"); await H.page.waitForTimeout(800);
    await reloadHost();
    const rs = await kidRows();
    await soloRow("社会"); const s3 = await soloAt();
    check("S1 一人で 社会「" + s1.c + "」→ 理科「" + s2.c + "」→ 行［" + rs.map(x => x.sub).join(" / ") + "］→ 社会の一人で「" + s3.c + "」同じ問題から",
      s1.c === "4 / 12" && s3.c === s1.c && s3.q === s1.q && rs[0] && /一人のつづき/.test(rs[0].sub) && rs[1] && /一人のつづき/.test(rs[1].sub), JSON.stringify({ s1, s2, s3, rs }));
    check("E 画面のエラー 0", H.errs.length + G.errs.length === 0, [].concat(H.errs, G.errs).join(" | "));
  } catch (e) { const dbg = async pg => pg.evaluate(() => ((document.querySelector(".screen.active")||{}).id) + " :: " + document.querySelector(".screen.active").innerText.replace(/\s+/g, " ").slice(0, 300)).catch(x => String(x)); check("（途中で止まった）", false, (e && e.message || e) + " / errs=" + [].concat(H.errs, G.errs).join(" | ") + " / H=" + await dbg(H.page) + " / G=" + await dbg(G.page)); }
  finally { await H.ctx.close(); await G.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); relay.close(); process.exit(c); };
if (!process.env.NOW_ONLY) {
  console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
  const outB = await run("base", BASELINE);
  const ngB = report("対照 " + BASE_COMMIT, outB);
  const must = ["K1"].filter(t => !outB.some(c => !c.ok && c.n.startsWith(t)));
  console.log(must.length === 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格（鳴らなかった: " + must.join(" ") + "）");
  if (must.length) await done(3);
}
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
