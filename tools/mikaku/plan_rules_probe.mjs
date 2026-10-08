// 今日やること：ルールで自動にできるところ（2026-10-09 ユーザー「アプリでルールベースで自動化できるところはお願いします。
//   でも自動化がおかしくなることもあると想定されるので、現行は維持してください」）
// 本物の Chrome・390x844・まねの GitHub API サーバ（本物の GitHub には触らない）。使い方: node tools/mikaku/plan_rules_probe.mjs
// 見ること:
//   I  セットがあるとき（新しい欄なし）は、直す前（BASE_COMMIT）と同じ動き: ホームの「今日やること」の HTML・各行の中身を見る（出る問題と順番）・
//      一人で1行やったあとの HTML・plan_done に送った中身（時刻はのぞく）が1バイトも同じ（Math.random は同じ種で固定）
//   A1 セットが全部済んだ → 「今日やること：つぎ（自動）」・行は最後に読めたセットと同じ名前
//   A2 自動の行をやり終える → 「✔ できた」・できた印は自動用（kq_battle_plan_done_auto_v1）・本物の入れ物（v2）は変わらない・plan_done には送らない
//   A3 自動のセットを全部やる → 「おわり！」・すぐ下に次の「つぎ（自動）」
//   A4 index が空・オフライン → 写しから自動のセット
//   A5 kosuke-records に新しいセット（2）が来たら、そちらを出す（自動は出ない）
//   A6 ホームのスイッチ「自動のセットを使わない」→ 端末に保存・セットが無いとき何も出さない・オフにもどすとまた出る
//   F1 fill_ids: 候補の「まだ」が count に足りない → 足りない分だけ fill_ids から（候補3＋前の回2＝5）
//   F2 fill_ids: 候補が足りている → 欄が無い行と同じ問題・同じ順番
//   W1 merge_on に今日の曜日 → まとめて（答える問題：4問（4枚））／ほかの曜日 → 今までどおり分けて
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で A・F・W が鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "d81f2e6";   // 直す前（#33 見るだけ まで）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "planrules" });
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
let mode = "up", written = new Map();
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version" };
const api = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  if (mode === "down") { req.socket.destroy(); return; }
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
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (cfg) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
};
// Math.random を同じ種で（I で直す前といまを同じ乱数で比べる）
const FIX_RANDOM = () => { let x = 123456789; Math.random = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1000000) / 1000000; }; };
const PARSE_SRC = (() => { const h = CURRENT, a = h.indexOf("function parseAnswerParts(q, a){"), b = h.indexOf("(function addSplitCards(){"); return h.slice(a, b); })();
const INSTALL = (src) => { window.__parts = new Function(src + "; return parseAnswerParts;")();
  window.__w = id => { const d = QA_DATA.find(x => x.id === id); if (!d) return 0; if (d.kind === "daimon") return d.itemIds.length;
    if (d.subj === "理科" && d.kind !== "calc") { const p = window.__parts(d.q, d.a); if (p) return p.length; } return 1; };
  window.__split = id => { const d = QA_DATA.find(x => x.id === id); return !!(d && d.subj === "理科" && d.kind !== "daimon" && d.kind !== "calc" && window.__parts(d.q, d.a)); }; };
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); const errs = [];
  await ctx.addInitScript(FIX_RANDOM);
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  return { ctx, pg, errs };
}
function helpers(pg) {
  const txt = (sel) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : ""; }, sel);
  const vis = (sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const head = (sel) => pg.evaluate(s => { const e = document.querySelector(s + " .plan-head"); return e ? e.textContent : ""; }, sel);
  const rows = (sel) => pg.evaluate(s => [...document.querySelectorAll(s + " .plan-row")].map(r => ({ t: r.querySelector(".plan-row-title").textContent, m: r.querySelector(".plan-mark").textContent })), sel);
  const onSolo = () => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const home = async () => { await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h && document.getElementById("screen-solo-result").classList.contains("active")) h.click(); }); await pg.waitForTimeout(500); };
  const startRow = (box, i) => pg.evaluate(([box, i]) => document.querySelectorAll(box + " .plan-row")[i].querySelector(".plan-start-btn").click(), [box, i]);
  const answerAll = async (max) => { let k = 0; for (; k < max && (await onSolo()); k++) {
    await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(50); await pg.$eval("#solo-judge-ok", e => e.click()); await pg.waitForTimeout(100); } return k; };
  const doRow = async (box, i) => { await startRow(box, i); await pg.waitForTimeout(300); const k = await answerAll(80); await home(); return k; };
  const peek = async (box, i) => { await pg.evaluate(([box, i]) => document.querySelectorAll(box + " .plan-row")[i].querySelector(".plan-peek-btn").click(), [box, i]); await pg.waitForTimeout(200);
    const r = await pg.evaluate(([box, i]) => { const p = document.querySelectorAll(box + " .plan-peek")[i]; if (!p) return null;
      return { ids: [...p.querySelectorAll("li")].map(l => l.dataset.qid), cnt: (p.querySelector(".plan-peek-count") || {}).textContent || "" }; }, [box, i]);
    await pg.evaluate(([box, i]) => document.querySelectorAll(box + " .plan-row")[i].querySelector(".plan-peek-btn").click(), [box, i]); return r; };
  const reload = async () => { await pg.reload(); await pg.waitForTimeout(1800); };
  return { txt, vis, head, rows, doRow, peek, reload };
}
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === "at" || k === "doneAt" || k === "skippedAt") ? "" : v));

// I: 直す前といまで同じか（中身を集めて文字列で返す）
async function identityRun(src, ids) {
  SERVED = src; mode = "up"; written = new Map();
  SETS = { "plan/index.json": { sets: [1, 2] }, "plan/0001.json": { no: 1, label: "10/9 のぶん", message: "がんばろう", items: [
      { subj: "社会", title: "朝：ランダム", unit: "第6回.鎌倉時代", count: 6 },
      { subj: "社会", title: "晩：苦手から", ids: ids.soc, order: "weak", count: 6 },
      { subj: "理科", title: "理科 weak", ids: ids.split, order: "weak", count: 5 },
      { subj: "理科", title: "理科 まとめて", ids: ids.split, order: "weak", count: 4, merge: true },
      { subj: "社会", title: "この順", ids: ids.soc.slice(0, 4) } ] },
    "plan/0002.json": { no: 2, label: "10/10 のぶん", items: [{ subj: "社会", title: "つぎ", unit: "第6回.鎌倉時代", count: 3 }] } };
  const { ctx, pg, errs } = await newPage(); const h = helpers(pg); const parts = [];
  try {
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); await h.reload();
    parts.push(await pg.$eval("#plan-box", e => e.outerHTML));
    for (let i = 0; i < 5; i++) parts.push(JSON.stringify(await h.peek("#plan-cur", i)));
    await h.doRow("#plan-cur", 0);
    await h.doRow("#plan-cur", 1);
    await pg.waitForTimeout(2500);
    parts.push(await pg.$eval("#plan-box", e => e.outerHTML));
    const w = written.get("battle/plan_done/0001.json");
    parts.push(JSON.stringify(w ? strip(w.content) : null));
    parts.push("errs:" + errs.length);
  } catch (e) { parts.push("ERR " + String(e && e.message || e).split("\n")[0]); }
  finally { await ctx.close(); }
  return parts;
}

async function run(label, src, ids) {
  SERVED = src; mode = "up"; written = new Map(); const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  let { ctx, pg, errs } = await newPage(); let h = helpers(pg);
  try {
    const set1 = { no: 1, label: "10/9 のぶん", items: [
      { subj: "社会", title: "朝：社会3問", ids: ids.soc.slice(0, 3) },
      { subj: "社会", title: "晩：社会 苦手から2", ids: ids.soc.slice(3, 8), order: "weak", count: 2 } ] };
    SETS = { "plan/index.json": { sets: [1] }, "plan/0001.json": set1 };
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); await h.reload();
    await h.doRow("#plan-cur", 0); await h.doRow("#plan-cur", 1);
    await pg.waitForTimeout(2000);
    try {
    const v2Before = await pg.evaluate(() => localStorage.getItem("kq_battle_plan_done_v2"));
    // A1
    await h.reload();
    const r1 = await h.rows("#plan-cur");
    check("A1 全部済んだ → 「" + (await h.head("#plan-cur")) + "」・行 " + r1.map(r => r.t).join("／"),
      (await h.head("#plan-cur")) === "今日やること：つぎ（自動）" && r1.length === 2 && r1[0].t === "社会：朝：社会3問" && r1[1].t.startsWith("社会：晩：社会 苦手から2") && r1.every(r => r.m === ""), JSON.stringify(r1));
    // A2
    const putsBefore = [...written.keys()].filter(k => k.startsWith("battle/plan_done/")).length;
    const k2 = await h.doRow("#plan-cur", 0);
    await pg.waitForTimeout(2000);
    const st = await pg.evaluate(() => ({ auto: localStorage.getItem("kq_battle_plan_done_auto_v1"), v2: localStorage.getItem("kq_battle_plan_done_v2") }));
    const r2 = await h.rows("#plan-cur");
    const putsAfter = [...written.keys()].filter(k => k.startsWith("battle/plan_done/")).length;
    check("A2 自動の行をやる（" + k2 + "問）→ " + (r2[0] && r2[0].m) + "・自動の入れ物 " + (st.auto ? "あり" : "なし") + "・v2 は同じ・plan_done は増えない（" + putsBefore + "→" + putsAfter + "）",
      k2 === 3 && r2[0].m === "✔ できた" && st.auto && /"A1"/.test(st.auto) && st.v2 === v2Before && putsAfter === putsBefore, st.auto);
    // A3
    await h.doRow("#plan-cur", 1);
    check("A3 自動のセットを全部 → 「おわり！」・下に「" + (await h.head("#plan-next")) + "」",
      (await h.vis("#plan-done")) && (await h.vis("#plan-next")) && (await h.head("#plan-next")) === "つぎ（自動）", "");
    await h.reload();
    const auto2 = await h.head("#plan-cur"), r3 = await h.rows("#plan-cur");
    check("A3b 開き直すと次の自動のセット（できた印なし）", auto2 === "今日やること：つぎ（自動）" && r3.every(r => r.m === "") && !(await h.vis("#plan-done")), JSON.stringify(r3));
    // A4
    SETS = { "plan/index.json": { sets: [] } };
    await h.reload();
    const a4a = await h.head("#plan-cur");
    mode = "down"; await h.reload();
    const a4b = await h.head("#plan-cur");
    mode = "up";
    check("A4 index が空「" + a4a + "」・オフライン「" + a4b + "」→ 写しから自動", a4a === "今日やること：つぎ（自動）" && a4b === "今日やること：つぎ（自動）", "");
    // A6（スイッチ）
    const t0 = await pg.evaluate(() => { const e = document.getElementById("plan-auto-off-toggle"); return e ? e.classList.contains("on") : null; });
    await pg.$eval("#plan-auto-off-toggle", e => e.click()).catch(() => {}); await pg.waitForTimeout(200);
    const saved = await pg.evaluate(() => localStorage.getItem("kq_battle_plan_auto_off_v1"));
    await h.reload();
    const boxOff = await h.vis("#plan-box");
    const t1 = await pg.evaluate(() => { const e = document.getElementById("plan-auto-off-toggle"); return e ? e.classList.contains("on") : null; });
    await pg.$eval("#plan-auto-off-toggle", e => e.click()).catch(() => {}); await pg.waitForTimeout(300);
    const backOn = await h.head("#plan-cur");
    check("A6 スイッチ: はじめオフ（" + t0 + "）・押すと保存（" + saved + "）・開き直してもオン（" + t1 + "）・何も出さない（" + !boxOff + "）・もどすと「" + backOn + "」",
      t0 === false && saved === "1" && t1 === true && !boxOff && backOn === "今日やること：つぎ（自動）", "");
    // A5
    SETS = { "plan/index.json": { sets: [2] }, "plan/0002.json": { no: 2, label: "10/10 のぶん", items: [{ subj: "社会", title: "新しい行", ids: ids.soc.slice(0, 2) }] } };
    await h.reload();
    check("A5 新しいセット（2）が来たら、そちら「" + (await h.head("#plan-cur")) + "」", (await h.head("#plan-cur")) === "今日やること：10/10 のぶん" && !(await h.vis("#plan-next")), "");
    } catch (e) { check("A 最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
    // F・W（記録の無い新しい端末で）
    check("E 画面のエラー 0（A）", errs.length === 0, errs.join(" | "));
    await ctx.close();
    ({ ctx, pg, errs } = await newPage()); h = helpers(pg);
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]);
    const today = DOW[new Date().getDay()], other = DOW[(new Date().getDay() + 3) % 7];
    SETS = { "plan/index.json": { sets: [3] }, "plan/0003.json": { no: 3, label: "欄", items: [
      { subj: "社会", title: "F1", ids: ids.soc.slice(0, 3), order: "weak", count: 5, fill_ids: ids.prev },
      { subj: "社会", title: "F2", ids: ids.soc, order: "weak", count: 5, fill_ids: ids.prev },
      { subj: "社会", title: "F2 欄なし", ids: ids.soc, order: "weak", count: 5 },
      { subj: "理科", title: "W today", ids: ids.split, order: "weak", count: 4, merge_on: [today] },
      { subj: "理科", title: "W other", ids: ids.split, order: "weak", count: 4, merge_on: [other] } ] } };
    await h.reload();
    const f1 = await h.peek("#plan-cur", 0), f2 = await h.peek("#plan-cur", 1), f2n = await h.peek("#plan-cur", 2);
    const want1 = ids.soc.slice(0, 3).concat(ids.prev.slice(0, 2));
    check("F1 候補3＋前の回2（" + (f1 && f1.ids.join(" ")) + "）", f1 && JSON.stringify(f1.ids) === JSON.stringify(want1) && /答える問題：5問/.test(f1.cnt), JSON.stringify(want1));
    check("F2 足りているときは欄なしと同じ（" + (f2 && f2.ids.join(" ")) + "）", f2 && f2n && JSON.stringify(f2.ids) === JSON.stringify(f2n.ids) && f2.ids.every(id => ids.soc.includes(id)), f2n && f2n.ids.join(" "));
    const w1 = await h.peek("#plan-cur", 3), w2 = await h.peek("#plan-cur", 4);
    check("W1 merge_on 今日（" + today + "）「" + (w1 && w1.cnt) + "」／ほかの日（" + other + "）「" + (w2 && w2.cnt) + "」",
      w1 && /答える問題：4問（4枚）/.test(w1.cnt) && w2 && !/（4枚）/.test(w2.cnt) && /答える問題：4問/.test(w2.cnt), "");
    check("E 画面のエラー 0（F・W）", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); relay.close(); process.exit(c); };

// id を集める（いまの index.html で）
const ids = await (async () => {
  SERVED = CURRENT; SETS = {};
  const { ctx, pg } = await newPage();
  await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, null]); await pg.reload(); await pg.waitForTimeout(1200);
  await pg.evaluate(INSTALL, PARSE_SRC);
  const r = await pg.evaluate(() => {
    const soc = QA_DATA.filter(d => d.subj === "社会" && d.kind !== "daimon" && d.kind !== "calc" && d.u === "第6回.鎌倉時代").map(d => d.id);
    const prev = QA_DATA.filter(d => d.subj === "社会" && d.kind !== "daimon" && d.kind !== "calc" && /^第4回/.test(d.u)).map(d => d.id);
    const split = QA_DATA.filter(d => window.__split(d.id) && window.__w(d.id) >= 2).slice(0, 8).map(d => d.id);
    return { soc: soc.slice(0, 10), prev: prev.slice(0, 6), split };
  });
  await ctx.close(); return r;
})();
console.log("前提: 社会 " + ids.soc.length + "・前の回 " + ids.prev.length + "・分けて " + ids.split.length);
if (ids.soc.length < 10 || ids.prev.length < 4 || ids.split.length < 6) { console.log("✘ 前提がそろわない"); await done(2); }

console.log("■ I: セットがあるとき、直す前 " + BASE_COMMIT + " と同じか");
const iB = await identityRun(BASELINE, ids), iN = await identityRun(CURRENT, ids);
const diffAt = iB.findIndex((x, k) => x !== iN[k]);
const iOk = diffAt < 0 && iB.length === iN.length && !iB.some(x => /^ERR/.test(x)) && iB[iB.length - 1] === "errs:0";
console.log("  " + (iOk ? "✔" : "✘") + " I 同じ（" + iB.length + " か所を比べた" + (diffAt >= 0 ? "・ちがう: " + diffAt + "\n    前: " + iB[diffAt].slice(0, 400) + "\n    今: " + iN[diffAt].slice(0, 400) : "") + "）");
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE, ids));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT, ids)) + (iOk ? 0 : 1);
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
