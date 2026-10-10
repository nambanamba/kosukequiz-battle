// 今日やること：時間切れが残ったままやめた行も「できた（やり直しは途中）」／行の「できたことにする」（2026-10-10）
// ユーザー（10-10 13:40）「セット4の理科『朝：テスト前のおさらい（まとめて出す）20問』を最後までやったのに『✔ できた』にならない」
//   原因: 出し直しで時間切れが続いた問題（r6m40）は【1回目の答え】が付かないまま。おわる・やめたで「1回目が全部ついた」とみなされず、印が付かなかった
// ユーザー「朝の理科を終わったことにすることもできない」→ 行に「できたことにする」（「やらなかった」と同じ見た目・同じ並び・その日のうちは「もどす」）
// 本物の Chrome・390x844・まねの GitHub API サーバ・まねの待ち合わせ先（本物には触らない）。使い方: node tools/mikaku/plan_fix1010_probe.mjs
// 見ること:
//   F1 一人・まとめての行（merge:true）を最後まで →「✔ できた」・plan_done done:true
//   F2 一人・分けての行（印なし・同じカード）を最後まで →「✔ できた」
//   F3 二人（ホスト）・まとめての行を最後まで（1問✕→出し直しで〇）→「✔ できた」
//   F4 二人（ホスト）・分けての行を最後まで →「✔ できた」
//   T2 二人（ホスト）: 時間切れ（答えが付かないまま）が残った対戦を閉じた（保存した続きが残る）→ 開き直したホームで「✔ できた（やり直しは途中）」
//      ※いまの版の二人（親子・こどもどうし）・一人には時間切れが起きないので、時間切れが起きていた前の版の対戦の形を保存した続きで作る
//   D1 まだの行に「できたことにする」（「やらなかった」のとなり・同じ見た目）
//   D2 押す →「✔ できた」・plan_done に done:true／manual:true・記録（stats・学習ログ）は変わらない
//   D3 押したその日は「もどす」→ もとにもどる（plan_done done:false・manual なし）
//   D4 前の日に押した行は「もどす」が出ない／本当に最後までやった行には出ない
//   D5 見るだけの端末には出さない
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で T2 D1 D2 D3 が鳴る（F1〜F4 は直す前も通る＝最後までやれば印は付いていた）
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_plan_fix1010"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "f684cdb";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "plan_fix1010" });
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
const U = "第6回.鎌倉時代";
const CARDS = ["r6m11", "r6m14", "r6m15"];   // 答えが複数のカード（まとめて／分けて）
const SETS = {
  "plan/index.json": { sets: [1] },
  "plan/0001.json": { no: 1, label: "10/10 のぶん", items: [
    { subj: "理科", title: "一人：まとめて", ids: CARDS, merge: true },
    { subj: "理科", title: "一人：分けて", ids: CARDS },
    { subj: "理科", title: "二人：まとめて", ids: CARDS, merge: true },
    { subj: "理科", title: "二人：分けて", ids: CARDS },
    { subj: "社会", title: "時間切れ：3問", ids: ["g6r1", "g6r2", "g6r3"] },
    { subj: "社会", title: "閉じた対戦：2問", ids: ["g6r4", "g6r5"] },
    { subj: "社会", title: "できたことにする：2問", ids: ["g6r6", "g6r7"] },
    { subj: "社会", title: "前の日：2問", ids: ["g6r8", "g6r10"] } ] }
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
      const w = written.get(p); return w ? send(200, { sha: w.sha, content: Buffer.from(JSON.stringify(w.content), "utf8").toString("base64") }) : send(404, {});
    }
    if (req.method === "PUT") {
      const j = JSON.parse(b), w = written.get(p);
      if (w && !j.sha) return send(422, {});
      if (w && j.sha !== w.sha) return send(409, {});
      const sha = "s" + Math.random(); written.set(p, { sha, n: (w ? w.n : 0) + 1, content: JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) }); return send(w ? 200 : 201, {});
    }
    send(405, {});
  });
});
await new Promise(r => api.listen(0, "127.0.0.1", r));
const API_URL = "http://127.0.0.1:" + api.address().port;
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
const SEED = (arg) => {
  const [mig, cfg, unit, head] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [unit] }, units: [unit], count: 5, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: head || 60, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (cfg) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
};

async function run(label, src) {
  SERVED = src; written = new Map(); const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(400); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = (pg, p) => pg.$eval("#" + p + "-q-id", e => e.textContent.replace(/^No\./, ""));
  const onScr = (pg, s) => pg.evaluate(x => document.getElementById(x).classList.contains("active"), s);
  const mark = (pg, i) => pg.evaluate(k => { const r = document.querySelectorAll("#plan-cur .plan-row")[k]; return r ? r.querySelector(".plan-mark").textContent : "(行なし)"; }, i);
  const rowBtns = (pg, i) => pg.evaluate(k => { const r = document.querySelectorAll("#plan-cur .plan-row")[k]; return r ? [...r.querySelectorAll(".plan-row-left button")].map(b => b.textContent + "|" + b.className) : null; }, i);
  const clickRowBtn = (pg, i, text) => pg.evaluate(a => { const r = document.querySelectorAll("#plan-cur .plan-row")[a[0]]; const b = [...r.querySelectorAll(".plan-row-left button")].find(x => x.textContent === a[1]); if (b) b.click(); return !!b; }, [i, text]);
  const judge = async (pg, ok) => { await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(60); await tap(pg, ok ? "#solo-judge-ok" : "#solo-judge-ng"); await pg.waitForTimeout(200); };
  const startRow = async (pg, i, which) => { await pg.evaluate(a => document.querySelectorAll("#plan-cur .plan-row")[a[0]].querySelectorAll(".plan-start-btn")[a[1]].click(), [i, which]); await pg.waitForTimeout(400); };
  const stats = pg => pg.evaluate(() => localStorage.getItem("kq_battle_stats_v1") || "");
  const logLen = async () => [...written.keys()].filter(p => p.startsWith("battle/session/")).length;   // 学習ログの1回分の送信の数
  const planItem = i => { const w = written.get("battle/plan_done/0001.json"); return w ? w.content.items[i] : null; };
  const soloHome = async pg => { await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h && document.getElementById("screen-solo-result").classList.contains("active")) h.click(); }); await pg.waitForTimeout(1200); };
  const soloAll = async (pg, max) => { const seen = []; for (let k = 0; k < max && (await onScr(pg, "screen-solo")); k++) { seen.push(await qid(pg, "solo")); await judge(pg, true); } return seen; };
  // 二人: ホストが行の「二人で」→ ゲストが入る → 開始 → ngFirst なら1問目だけ✕、あとは〇で最後まで → 結果の画面からホームへ
  const battleRow = async (H, i, ngFirst) => {
    const gc = await mk(); const G = gc.page; guestErrs.push(gc.errs);   // ゲストは対戦ごとに新しい端末
    await G.evaluate(SEED, [MIG, null, U]); await G.reload(); await G.waitForTimeout(600);
    await H.reload(); await H.waitForTimeout(1800);   // ホストも開き直してから（前の部屋を残さない）
    await startRow(H, i, 1);
    await H.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 }).catch(() => {});
    const code = await H.$eval("#room-code-display", e => e.textContent);
    await tap(G, "#go-join"); await G.fill("#join-code-input", code); await tap(G, "#join-btn");
    await waitVis(H, "#start-together-btn", 60000);
    await waitVis(G, "#join-start-together-btn", 60000);
    await tap(H, "#start-together-btn"); await tap(G, "#join-start-together-btn");
    const seq = [];
    for (let k = 0; k < 30; k++) {
      await H.waitForTimeout(500);
      if (await onScr(H, "screen-result")) break;
      const id = await qid(H, "battle").catch(() => ""); seq.push(id);
      await G.waitForFunction(x => document.getElementById("battle-q-id").textContent === "No." + x, id, { timeout: 20000 }).catch(() => {});
      await waitVis(G, "#judge-row", 15000).catch(() => {});
      await tap(G, (ngFirst && k === 0) ? "#judge-ng" : "#judge-ok").catch(() => {});
      await H.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 }).catch(() => {});
      await tap(H, "#next-btn").catch(() => {}); await H.waitForTimeout(400);
    }
    const res = await onScr(H, "screen-result");
    await H.evaluate(() => { const b = document.getElementById("result-home-btn"); if (b) b.click(); }); await H.waitForTimeout(1500);
    await gc.ctx.close();
    return { seq, res };
  };
  const guestErrs = [];
  const solo = await mk(), host = await mk();
  try {
    const pg = solo.page;
    await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, U]); await pg.reload(); await pg.waitForTimeout(1800);
    // ===== D1 まだの行の「できたことにする」 =====
    const b1 = await rowBtns(pg, 6);
    check("D1 まだの行に「できたことにする」（「やらなかった」のとなり・同じ見た目 plan-skip-btn）",
      b1 && b1.length === 2 && b1[0].startsWith("やらなかった|") && b1[1].startsWith("できたことにする|") && /plan-skip-btn/.test(b1[1]), JSON.stringify(b1));
    await pg.evaluate(() => document.querySelectorAll("#plan-cur .plan-row")[6].scrollIntoView({ block: "center" })); await pg.waitForTimeout(150);
    await pg.screenshot({ path: path.join(SHOTS, label + "_D1_row_buttons.png") }).catch(() => {});
    // ===== D2 押す =====
    const st0 = await stats(pg), lg0 = await logLen(pg);
    const c2 = await clickRowBtn(pg, 6, "できたことにする"); await pg.waitForTimeout(1500);
    const m2 = await mark(pg, 6), it2 = planItem(6), st1 = await stats(pg), lg1 = await logLen(pg), b2 = await rowBtns(pg, 6);
    check("D2 押す →「✔ できた」・plan_done done:true／manual:true・記録（stats・学習ログ）は変わらない",
      c2 && m2 === "✔ できた" && it2 && it2.done === true && it2.manual === true && st0 === st1 && lg0 === lg1, JSON.stringify({ m2, it2, same: st0 === st1, lg: [lg0, lg1] }));
    await pg.evaluate(() => document.querySelectorAll("#plan-cur .plan-row")[6].scrollIntoView({ block: "center" })); await pg.waitForTimeout(150);
    await pg.screenshot({ path: path.join(SHOTS, label + "_D2_manual_done.png") }).catch(() => {});
    // ===== D3 もどす =====
    const c3 = await clickRowBtn(pg, 6, "もどす"); await pg.waitForTimeout(1500);
    const m3 = await mark(pg, 6), it3 = planItem(6), b3 = await rowBtns(pg, 6);
    check("D3 その日は「もどす」→ もとにもどる（plan_done done:false・manual なし・ボタンは元の2つ）",
      c3 && JSON.stringify(b2) !== JSON.stringify(b1) && m3 === "" && it3 && it3.done === false && !it3.manual && JSON.stringify(b3) === JSON.stringify(b1), JSON.stringify({ b2, m3, it3, b3 }));
    // ===== D4 前の日に押した行 =====
    await clickRowBtn(pg, 7, "できたことにする"); await pg.waitForTimeout(600);
    await pg.evaluate(() => { const k = "kq_battle_plan_manual_v2"; const a = JSON.parse(localStorage.getItem(k) || "{}"); for (const no in a) for (const r in a[no]) a[no][r] -= 86400000 * 2;
      localStorage.setItem(k, JSON.stringify(a)); const d = JSON.parse(localStorage.getItem("kq_battle_plan_done_v2") || "{}"); for (const no in d) for (const r in d[no]) d[no][r] -= 86400000 * 2; localStorage.setItem("kq_battle_plan_done_v2", JSON.stringify(d)); });
    await pg.reload(); await pg.waitForTimeout(1800);
    const m4 = await mark(pg, 7), b4 = await rowBtns(pg, 7);
    // ===== F1・F2 一人 =====
    await startRow(pg, 0, 0); const s1 = await soloAll(pg, 20); await soloHome(pg);
    const m5 = await mark(pg, 0), it5 = planItem(0), b5 = await rowBtns(pg, 0);
    check("F1 一人・まとめての行を最後まで →「✔ できた」・plan_done done:true", m5 === "✔ できた" && it5 && it5.done === true, JSON.stringify({ s1, m5, it5 }));
    check("D4 前の日に押した行・本当に最後までやった行には「もどす」も「できたことにする」も出ない", m4 === "✔ できた" && b4 && b4.length === 0 && b5 && b5.length === 0, JSON.stringify({ m4, b4, b5 }));
    await startRow(pg, 1, 0); const s2 = await soloAll(pg, 20); await soloHome(pg);
    const m6 = await mark(pg, 1), it6 = planItem(1);
    check("F2 一人・分けての行を最後まで →「✔ できた」", m6 === "✔ できた" && it6 && it6.done === true && s2.some(x => x.includes("~")), JSON.stringify({ s2, m6 }));
    // ===== D5 見るだけ =====
    const v = await mk();
    await v.page.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, U]);
    await v.page.evaluate(() => localStorage.setItem("kq_battle_view_only_v1", "1"));
    await v.page.reload(); await v.page.waitForTimeout(2500);
    const vb = await v.page.evaluate(() => [...document.querySelectorAll("#plan-cur .plan-row .plan-row-left button")].map(b => b.textContent));
    const vrows = await v.page.evaluate(() => document.querySelectorAll("#plan-cur .plan-row").length);
    check("D5 見るだけの端末には「できたことにする」「もどす」を出さない", vrows > 0 && vb.length === 0, JSON.stringify({ vrows, vb }));
    await v.ctx.close();
    // ===== F3・F4 二人 =====
    const H = host.page;
    await H.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, U]); await H.reload(); await H.waitForTimeout(1800);
    const r3 = await battleRow(H, 2, true);
    const m8 = await mark(H, 2), it8 = planItem(2);
    check("F3 二人（ホスト）・まとめての行を最後まで（1問✕→出し直しで〇）→「✔ できた」", r3.res && m8 === "✔ できた" && it8 && it8.done === true && !it8.partial, JSON.stringify({ r3, m8, it8 }));
    const r4 = await battleRow(H, 3, false);
    const m9 = await mark(H, 3), it9 = planItem(3);
    check("F4 二人（ホスト）・分けての行を最後まで →「✔ できた」", r4.res && m9 === "✔ できた" && it9 && it9.done === true && r4.seq.some(x => x.includes("~")), JSON.stringify({ r4, m9, it9 }));
    // ===== T2 時間切れが残った対戦を閉じた（前の版の対戦で起きた形・保存した続き） =====
    await H.evaluate(() => {
      const key = "5:" + "閉じた対戦：2問";
      localStorage.setItem("kq_battle_host_session_v1", JSON.stringify({ code: "1234", questionIds: ["g6r5", "g6r4", "g6r4"], currentIndex: 2, scores: { host: 1, guest: 0 }, hostSkippedIds: [], inMissRetryRound: false,
        misses: [], doneIds: ["g6r5"], recordedIdx: 0, scoredIdx: 0, answered: ["g6r5"], requeuedIdx: -1, plan: { no: 1, key: key }, timeupIds: ["g6r4"] }));
    });
    const bsKey = await H.evaluate(() => Object.keys(localStorage).filter(k => /battle.*session/i.test(k)));
    await H.reload(); await H.waitForTimeout(2200);
    const m10 = await mark(H, 5), it10 = planItem(5);
    check("T2 二人（ホスト）: 時間切れ（g6r4）が残った対戦を閉じた → 開き直したホームで「✔ できた（やり直しは途中）」・miss に g6r4",
      m10 === "✔ できた（やり直しは途中）" && it10 && it10.partial === true && (it10.miss || []).includes("g6r4"), JSON.stringify({ bsKey, m10, it10 }));
    check("E 画面のエラー 0", solo.errs.length + host.errs.length + guestErrs.flat().length === 0, [].concat(solo.errs, host.errs, guestErrs.flat()).join(" | "));
  } catch (e) { check("（途中で止まった）", false, e && e.stack || e); }
  finally { await solo.ctx.close(); await host.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); relay.close(); process.exit(c); };
if (!process.env.NOW_ONLY) {
  console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
  const outB = await run("base", BASELINE);
  const ngB = report("対照 " + BASE_COMMIT, outB);
  const must = ["T2", "D1", "D2", "D3"].filter(t => !outB.some(c => !c.ok && c.n.startsWith(t)));
  console.log(must.length === 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格（鳴らなかった: " + must.join(" ") + "）");
  if (must.length) await done(3);
}
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
