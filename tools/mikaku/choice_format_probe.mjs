// 選ぶ問題の見せ方（2026-10-08 ユーザー「社会の長文の正しいものを選ぶ問題ですが、改行してほしい、記号をつけてほしい、もう少し時間を延ばしてほしい」）
// 本物の Chrome・390x844・まねごとの待ち合わせ先・まねの GitHub API サーバ（本物には触らない）。使い方: node tools/mikaku/choice_format_probe.mjs
// スクショは tools/mikaku/shots_choice/（コミットしない）
// 見ること:
//   S1 一人: g6r44 の問いが「本文 → 1行あけ → ア　… / イ　… / ウ　… / エ　…」（「」は外す）
//   S2 一人: 答えが「ア（問注所では…）が正しい文です。」
//   S3 一人: ほかの問題（g6r1）は問い・答えとも data.js のまま
//   L1 問題一覧: g6r44・g6r45 は改行・記号つき、g6r45 の答えは「ア（…）と エ（…）」
//   L2 問題一覧: 対象（「…」「…」で終わる選ぶ問題）以外の行は、問い・答えとも data.js のまま
//   P1 今日やることの「中身を見る」: g6r44 は選択肢を1つずつ記号つきで（切らない）、合言葉で開いた答えも「ア（…）」
//   B1 二人: ホスト・ゲストとも g6r44 が改行・記号つき、答えも「ア（…）」
//   T1 二人・ふつう・基本10秒: g6r44 の考える時間＝35秒（直す前の15秒＋選択肢4つ×5秒）、g6r1 は10秒のまま
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_choice"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "b3f7f51";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "choice" });
let SERVED = CURRENT;
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
// まねの GitHub API（今日やること＝plan だけ返す）
const TOKEN = "github_pat_TESTONLY_1234567890";
const SETS = { "plan/index.json": { sets: [1] }, "plan/0001.json": { no: 1, label: "10/8 のぶん", items: [{ subj: "社会", title: "選ぶ問題", ids: ["g6r44", "g6r1"] }] } };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version" };
const api = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const send = (st, o) => { res.writeHead(st, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify(o)); };
    const m = /^\/repos\/nambanamba\/kosuke-records\/contents\/([^?]+)/.exec(req.url);
    if (!m || req.headers.authorization !== "Bearer " + TOKEN) return send(404, {});
    const p = decodeURIComponent(m[1]);
    if (req.method === "GET") return SETS[p] ? send(200, { sha: "x", content: Buffer.from(JSON.stringify(SETS[p]), "utf8").toString("base64") }) : send(404, {});
    if (req.method === "PUT") return send(201, {});
    send(405, {});
  });
});
await new Promise(r => api.listen(0, "127.0.0.1", r));
const API_URL = "http://127.0.0.1:" + api.address().port;
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
const U = "第6回.鎌倉時代";
const SEED = (arg) => {
  const [mig, ids, o] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }, st = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.kind !== "daimon" && !ids.includes(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { st[it.id] = Object.assign({}, known); }));
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [o.unit] }, units: [o.unit], count: ids.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 10, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (o.gh) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(o.gh));
};
// 期待する見え方（テスト側で独立に組み立てる）
const CHOICE_RE = /^([\s\S]*?[^」\s　])[\s　]*((?:「[^「」]+」[、・\s　]*){2,})$/;
const KEY_RE = /正し|まちが|誤|選|どれ|どの/;
const L = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ"];
const isTarget = q => { const m = CHOICE_RE.exec(String(q || "")); return !!(m && KEY_RE.test(m[1])); };
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = (pg, p) => pg.$eval("#" + p + "-q-id", e => e.textContent.replace(/^No\./, ""));
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    const pg = solo.page;
    const D = await pg.evaluate(() => Object.fromEntries(QA_DATA.filter(d => d.kind !== "daimon").map(d => [d.id, { q: d.q, a: d.a, subj: d.subj }])));
    const g44 = D.g6r44, g45 = D.g6r45, g1 = D.g6r1;
    const c44 = g44.q.match(/「[^「」]+」/g).map(s => s.slice(1, -1)), c45 = g45.q.match(/「[^「」]+」/g).map(s => s.slice(1, -1));
    const wantQ44 = g44.q.slice(0, g44.q.indexOf("「")) + "\n\n" + c44.map((t, i) => L[i] + "　" + t).join("\n");
    const wantA44 = "ア（" + c44[0] + "）が正しい文です。";
    const wantA45 = "ア（" + c45[0] + "）と" + "エ（" + c45[3] + "）の2つです。";
    // ===== 一人 =====
    await pg.evaluate(SEED, [MIG, ["g6r44", "g6r1"], { unit: U }]); await pg.reload(); await pg.waitForTimeout(800);
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(300);
    const seen = {};
    for (let k = 0; k < 2; k++) {
      const id = await qid(pg, "solo");
      const q = await pg.$eval("#solo-q", e => e.textContent);
      if (id === "g6r44") await shot(pg, "S1_solo_q");
      await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(150);
      const a = await pg.$eval("#solo-a", e => e.textContent);
      if (id === "g6r44") await shot(pg, "S2_solo_a");
      seen[id] = { q, a };
      await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250);
    }
    check("S1 一人: g6r44 の問いが改行・記号つき（本文と選択肢の間は1行あける）", seen.g6r44 && seen.g6r44.q === wantQ44, JSON.stringify(seen.g6r44 && seen.g6r44.q));
    check("S2 一人: g6r44 の答えが「ア（…）が正しい文です。」", seen.g6r44 && seen.g6r44.a === wantA44, seen.g6r44 && seen.g6r44.a);
    check("S3 一人: g6r1 は問い・答えとも data.js のまま", seen.g6r1 && seen.g6r1.q === g1.q && seen.g6r1.a === g1.a, JSON.stringify(seen.g6r1));
    // ===== 問題一覧 =====
    await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h) h.click(); }); await pg.waitForTimeout(400);
    await tap(pg, "#list-btn"); await pg.waitForTimeout(400);
    // 単元: 対象の問題がある単元すべて（社会・第3回・第4回・第6回）
    const listUnits = await pg.evaluate(() => [...document.querySelectorAll("#list-unit-select option")].map(o => o.value).filter(v => /^第[346]回\./.test(v)));
    await pg.selectOption("#list-unit-select", listUnits); await pg.waitForTimeout(2500);
    const rows = await pg.evaluate(() => [...document.querySelectorAll("#list-items .list-item[data-qid]")].map(r => ({ id: r.dataset.qid, q: (r.querySelector(".list-q") || {}).textContent, a: (r.querySelector(".list-a") || {}).textContent })));
    const r44 = rows.find(r => r.id === "g6r44"), r45 = rows.find(r => r.id === "g6r45");
    await pg.evaluate(() => { const r = document.querySelector('#list-items .list-item[data-qid="g6r45"]'); if (r) r.scrollIntoView(); }); await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(SHOTS, label + "_L1_list.png") }).catch(() => {});
    check("L1 問題一覧: g6r44・g6r45 は改行・記号つき、g6r45 の答えは「ア（…）と エ（…）」",
      r44 && r44.q === wantQ44 && r44.a === "こたえ：" + wantA44 && r45 && /\n\nア　/.test(r45.q) && /\nエ　/.test(r45.q) && r45.a === "こたえ：" + wantA45, JSON.stringify({ r44, r45 }));
    const targets = rows.filter(r => D[r.id] && isTarget(D[r.id].q)).map(r => r.id);
    const others = rows.filter(r => D[r.id] && !isTarget(D[r.id].q));
    const changed = others.filter(r => r.q !== D[r.id].q || r.a !== "こたえ：" + D[r.id].a).map(r => r.id);
    check("L2 問題一覧: 対象以外の " + others.length + " 行は data.js のまま（対象 " + targets.length + " 行: " + targets.join(" ") + "）", others.length > 20 && changed.length === 0, changed.slice(0, 10).join(" "));
    // ===== 今日やること「中身を見る」 =====
    await pg.evaluate(SEED, [MIG, ["g6r44", "g6r1"], { unit: U, gh: { token: TOKEN, api: API_URL } }]); await pg.reload(); await pg.waitForTimeout(1800);
    const PASS = "oya-1234";
    await pg.evaluate(p => { const i = document.getElementById("parent-pass"), b = document.getElementById("parent-pass-save-btn"); if (i && b) { i.value = p; b.click(); } }, PASS); await pg.waitForTimeout(200);
    await pg.evaluate(() => { const r = document.querySelector("#plan-cur .plan-row"); r && r.querySelector(".plan-peek-btn").click(); }); await pg.waitForTimeout(250);
    await pg.evaluate(p => { const pn = document.querySelector("#plan-cur .plan-peek"); if (!pn) return; const ab = pn.querySelector(".plan-peek-ans-btn:not(.plan-peek-pass-go)"); if (ab) ab.click();
      const i = pn.querySelector(".plan-peek-pass"); if (i) { i.value = p; pn.querySelector(".plan-peek-pass-go").click(); } }, PASS); await pg.waitForTimeout(250);
    const pk = await pg.evaluate(() => { const li = document.querySelector('#plan-cur .plan-peek li[data-qid="g6r44"]'); return li ? { q: li.querySelector(".plan-peek-q").textContent, a: (li.querySelector(".plan-peek-a") || {}).textContent || "" } : null; });
    await pg.evaluate(() => { const p = document.querySelector("#plan-cur .plan-peek"); if (p) p.scrollIntoView(); }); await pg.waitForTimeout(200);
    await pg.screenshot({ path: path.join(SHOTS, label + "_P1_peek.png") }).catch(() => {});
    check("P1 中身を見る: g6r44 は選択肢を1つずつ記号つき（切らない）・合言葉で開いた答えも「ア（…）」",
      pk && c44.every((t, i) => pk.q.includes("\n" + L[i] + "　" + t)) && pk.a === "こたえ：" + wantA44, JSON.stringify(pk));
    // ===== 二人 =====
    for (const p of [host.page, guest.page]) { await p.evaluate(SEED, [MIG, ["g6r44", "g6r1"], { unit: U }]); await p.reload(); await p.waitForTimeout(800); }
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    const hostSec = () => host.page.evaluate(() => { const e = document.getElementById("think-timer"); return e && getComputedStyle(e).display !== "none" ? +e.dataset.sec : null; });
    const bs = {};
    for (let k = 0; k < 2; k++) {
      await waitVis(host.page, "#advance-btn", 30000);
      const id = await qid(host.page, "battle"), sec = await hostSec();
      await tap(host.page, "#advance-btn");
      await guest.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 });
      await tap(host.page, "#answer-reveal-btn"); await tap(guest.page, "#answer-reveal-btn"); await host.page.waitForTimeout(400);
      const one = pg2 => pg2.evaluate(() => ({ q: document.getElementById("battle-q").textContent, a: document.getElementById("battle-a").textContent }));
      bs[id] = { sec, h: await one(host.page), g: await one(guest.page) };
      if (id === "g6r44") { await shot(host.page, "B1_host"); await shot(guest.page, "B1_guest"); }
      await waitVis(host.page, "#judge-row", 15000); await waitVis(guest.page, "#judge-row", 15000);
      await tap(host.page, "#judge-ok"); await tap(guest.page, "#judge-ok");
      if (k === 0) { await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 }); await tap(host.page, "#next-btn"); }
    }
    const b = bs.g6r44;
    check("B1 二人: ホスト・ゲストとも g6r44 が改行・記号つき、答えも「ア（…）」", b && b.h.q === wantQ44 && b.g.q === wantQ44 && b.h.a === wantA44 && b.g.a === wantA44, JSON.stringify(b));
    check("T1 二人・ふつう: g6r44 の考える時間＝35秒（15秒＋4×5秒）・g6r1 は10秒のまま", b && b.sec === 35 && bs.g6r1 && bs.g6r1.sec === 10 && bs.g6r1.h.q === g1.q, JSON.stringify({ g6r44: b && b.sec, g6r1: bs.g6r1 && bs.g6r1.sec }));
    check("E 画面のエラー 0", solo.errs.length + host.errs.length + guest.errs.length === 0, [].concat(solo.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
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
