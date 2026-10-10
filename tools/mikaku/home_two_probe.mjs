// 今日やること：やり直しの途中でやめても「できた」（A）／ホームの「一人で始める」「二人で始める」と、二人で押したあとの画面（B）（2026-10-10）
// A ユーザー「理科が最後の一問のやり直しを放棄してやめていました。記録は本体には20問分の正誤が残ってると思う。そんなこともあると思うので回避策が欲しい」
// B ユーザー「二人でを押しても画面が切り替わらないので二人で開始するが出ていることに気づかない」
// 本物の Chrome・390x844・まねの GitHub API サーバ・まねの待ち合わせ先（本物には触らない）。使い方: node tools/mikaku/home_two_probe.mjs
// 見ること:
//   A1 1回目の答えがまだ残っているうちにやめた → その行は「できた」にならない（今のまま）
//   A2 1回目の答えが全部ついて、ぐるぐるの出し直しの途中でやめた（← もどる）→「✔ できた（やり直しは途中）」・plan_done に done:true／partial:true・やめた操作で記録（stats）は変わらない
//   A3 途中でやめた回も学習ログの1回分として自動送信される（battle/session/…・途中でやめた＝はい）
//   A4 続きから再開して最後まで → ふつうの「✔ できた」・plan_done の partial が消える・同じ session のファイルが終えた中身で上書き（途中でやめた≠はい）
//   A5 閉じた（やめるボタンを押さずに開き直した）→ 開き直したホームで「✔ できた（やり直しは途中）」・閉じた回も送られる
//   A6 二人（ホスト）：1回目が全部ついて出し直しの途中で「おわる」→「✔ できた（やり直しは途中）」・plan_done に partial:true
//   B1 ホームの「一人で始める」「二人で始める」が大きい（文字20px以上・高さ60px以上）
//   B2 ホームの「二人で始める」→ 選ぶ欄（単元・問題数）・今日やること・数のカードがかくれ、部屋の番号・もどる だけ（いちばん上）
//   B3 相手が来ると「二人で開始する」が出る（同じ画面のまま見える）／「もどる」で選ぶ画面にもどる
//   B4 今日やることの「二人で」も同じ画面（番号と開始だけ）
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_home_two"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "620b898";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "home_two" });
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
const SETS = {
  "plan/index.json": { sets: [1] },
  "plan/0001.json": { no: 1, label: "10/10 のぶん", items: [
    { subj: "社会", title: "一人：3問", ids: ["g6r1", "g6r2", "g6r3"] },
    { subj: "社会", title: "二人：2問", ids: ["g6r4", "g6r5"] },
    { subj: "社会", title: "閉じる：2問", ids: ["g6r6", "g6r7"] } ] }
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
    if (req.method === "PUT") {
      const j = JSON.parse(b), w = written.get(p);
      if (w && !j.sha) return send(422, {});   // 本物と同じ: sha なしでもうあるファイルは書けない
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
  const [mig, cfg, unit] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [unit] }, units: [unit], count: 5, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 60, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
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
  const onSolo = pg => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const mark = (pg, i) => pg.evaluate(k => { const r = document.querySelectorAll("#plan-cur .plan-row")[k]; return r ? r.querySelector(".plan-mark").textContent : "(行なし)"; }, i);
  const judge = async (pg, ok) => { await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(80); await tap(pg, ok ? "#solo-judge-ok" : "#solo-judge-ng"); await pg.waitForTimeout(220); };
  const startRow = async (pg, i, which) => { await pg.evaluate(a => document.querySelectorAll("#plan-cur .plan-row")[a[0]].querySelectorAll(".plan-start-btn")[a[1]].click(), [i, which]); await pg.waitForTimeout(400); };
  const stats = pg => pg.evaluate(() => localStorage.getItem("kq_battle_stats_v1") || "");
  const planItem = i => { const w = written.get("battle/plan_done/0001.json"); return w ? w.content.items[i] : null; };
  const sessions = () => [...written.entries()].filter(([p]) => p.startsWith("battle/session/")).map(([p, w]) => ({ p, n: w.n, quit: w.content.summary && w.content.summary["途中でやめた"], q: (w.content.q || []).length }));
  // 画面に見えている、ホームの直下の子（id）
  const homeVisible = pg => pg.evaluate(() => [...document.querySelectorAll("#screen-home > *")].filter(e => getComputedStyle(e).display !== "none" && e.offsetParent !== null && e.getBoundingClientRect().height > 0).map(e => e.id || e.className));
  const waitShape = async pg => ({ kids: await homeVisible(pg), code: await pg.$eval("#room-code-display", e => e.textContent).catch(() => ""), units: await vis(pg, "#unit-choices"), count: await vis(pg, "#count-row"),
    plan: await vis(pg, "#plan-box"), stat: await vis(pg, ".stat-row"), back: await vis(pg, "#create-cancel"), y: await pg.evaluate(() => Math.round(window.scrollY)),
    codeTop: await pg.evaluate(() => Math.round(document.getElementById("room-code-display").getBoundingClientRect().top)) });
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    const pg = solo.page;
    await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, U]); await pg.reload(); await pg.waitForTimeout(1800);
    // ===== B1 大きいボタン =====
    const big = await pg.evaluate(() => ["#solo-start-btn", "#create-btn"].map(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return { fs: parseFloat(getComputedStyle(e).fontSize), h: Math.round(r.height) }; }));
    check("B1 ホームの「一人で始める」「二人で始める」が大きい（文字20px以上・高さ60px以上）", big.every(b => b.fs >= 20 && b.h >= 60), JSON.stringify(big));
    await pg.evaluate(() => document.getElementById("create-btn").scrollIntoView()); await pg.waitForTimeout(200);
    await pg.screenshot({ path: path.join(SHOTS, label + "_B1_home_buttons.png") }).catch(() => {});
    // ===== A1 1回目がまだ残っているうちにやめた =====
    await startRow(pg, 0, 0);
    await judge(pg, false);   // 1問目 ✕（2問目・3問目はまだ）
    await tap(pg, "#solo-back"); await pg.waitForTimeout(1200);
    const m1 = await mark(pg, 0), it1 = planItem(0);
    check("A1 1回目がまだ残っているうちにやめた → その行は「できた」にならない", m1 === "" && !(it1 && it1.done), JSON.stringify({ m1, it1 }));
    // ===== A2 1回目が全部ついて、出し直しの途中でやめた =====
    await startRow(pg, 0, 0);
    const seq = [];
    for (let k = 0; k < 3 && (await onSolo(pg)); k++) { seq.push(await qid(pg, "solo")); await judge(pg, k !== 0); }   // ✕ 〇 〇
    const again = await onSolo(pg) ? await qid(pg, "solo") : "";
    const st0 = await stats(pg);
    const sesBefore = sessions().length;
    await tap(pg, "#solo-back"); await pg.waitForTimeout(1500);
    const m2 = await mark(pg, 0), it2 = planItem(0), st1 = await stats(pg);
    check("A2 1回目が全部ついて出し直し（" + again + "）の途中でやめた →「✔ できた（やり直しは途中）」・plan_done に done:true／partial:true・記録（stats）はやめても変わらない",
      again === seq[0] && m2 === "✔ できた（やり直しは途中）" && it2 && it2.done === true && it2.partial === true && st0 === st1 && st0.length > 10, JSON.stringify({ seq, again, m2, it2 }));
    await pg.evaluate(() => document.getElementById("plan-box").scrollIntoView()); await pg.waitForTimeout(150);
    await pg.screenshot({ path: path.join(SHOTS, label + "_A2_partial_done.png") }).catch(() => {});
    const ses2 = sessions(), last2 = ses2.find(s => s.q === 3 && s.quit === "はい");
    check("A3 途中でやめた回も学習ログの1回分として自動送信（途中でやめた＝はい・3問）", ses2.length > sesBefore && !!last2, JSON.stringify(ses2));
    // ===== A4 続きから再開して最後まで =====
    await tap(pg, "#resume-solo-btn"); await pg.waitForTimeout(400);
    for (let k = 0; k < 3 && (await onSolo(pg)); k++) await judge(pg, true);
    await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h) h.click(); }); await pg.waitForTimeout(1500);
    const m4 = await mark(pg, 0), it4 = planItem(0), ses4 = sessions(), same4 = last2 ? ses4.find(s => s.p === last2.p) : null;
    check("A4 続きから最後まで →「✔ できた」・partial が消える・同じ session のファイルが終えた中身で上書き（途中でやめた≠はい・4問）",
      m4 === "✔ できた" && it4 && it4.done === true && !it4.partial && same4 && same4.n >= 2 && same4.quit !== "はい" && same4.q === 4, JSON.stringify({ m4, it4, same4 }));
    // ===== A5 閉じた =====
    await startRow(pg, 2, 0);
    for (let k = 0; k < 2 && (await onSolo(pg)); k++) await judge(pg, k !== 0);   // ✕ 〇 → 出し直しが残る
    const on5 = await onSolo(pg);
    await pg.reload(); await pg.waitForTimeout(2200);
    const m5 = await mark(pg, 2), it5 = planItem(2), ses5 = sessions().filter(s => s.q === 2 && s.quit === "はい");
    check("A5 閉じて開き直した → ホームで「✔ できた（やり直しは途中）」・閉じた回も送られる", on5 && m5 === "✔ できた（やり直しは途中）" && it5 && it5.partial === true && ses5.length >= 1, JSON.stringify({ on5, m5, it5, ses5 }));
    // ===== B2・B3 ホームの「二人で始める」 =====
    await pg.evaluate(() => document.getElementById("create-btn").scrollIntoView()); await pg.waitForTimeout(150);
    await tap(pg, "#create-btn");
    await pg.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 }).catch(() => {});
    await pg.waitForTimeout(300);
    const w2 = await waitShape(pg);
    check("B2 「二人で始める」→ 選ぶ欄・今日やること・数のカードがかくれ、部屋の番号ともどるだけ（いちばん上）",
      w2.kids.length === 1 && w2.kids[0] === "home-waiting" && /^\d{4}$/.test(w2.code) && !w2.units && !w2.count && !w2.plan && !w2.stat && w2.back && w2.y === 0 && w2.codeTop < 300, JSON.stringify(w2));
    await pg.screenshot({ path: path.join(SHOTS, label + "_B2_waiting.png") }).catch(() => {});
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", w2.code); await tap(guest.page, "#join-btn");
    let started = true; await waitVis(pg, "#start-together-btn", 60000).catch(() => { started = false; });
    const w3 = await waitShape(pg);
    const btnTop = await pg.evaluate(() => Math.round(document.getElementById("start-together-btn").getBoundingClientRect().bottom));
    await pg.screenshot({ path: path.join(SHOTS, label + "_B3_start_together.png") }).catch(() => {});
    await tap(pg, "#create-cancel"); await pg.waitForTimeout(600);
    const back3 = { setup: await vis(pg, "#home-setup"), units: await vis(pg, "#unit-choices"), plan: await vis(pg, "#plan-box"), waiting: await vis(pg, "#home-waiting") };
    check("B3 相手が来ると「二人で開始する」が同じ画面に見える（画面の中）・「もどる」で選ぶ画面にもどる",
      started && w3.kids.length === 1 && btnTop > 0 && btnTop < 844 && back3.setup && back3.units && back3.plan && !back3.waiting, JSON.stringify({ started, w3, btnTop, back3 }));
    await guest.page.evaluate(() => { const b = document.getElementById("join-back"); if (b) b.click(); }); await guest.page.waitForTimeout(400);
    // ===== B4・A6 今日やることの「二人で」→ おわる =====
    const H = host.page, G = guest.page;
    await H.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, U]); await H.reload(); await H.waitForTimeout(1800);
    await G.evaluate(SEED, [MIG, null, U]); await G.reload(); await G.waitForTimeout(600);
    await startRow(H, 1, 1);
    await H.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 }).catch(() => {});
    await H.waitForTimeout(300);
    const w4 = await waitShape(H);
    check("B4 今日やることの「二人で」も同じ画面（番号ともどるだけ・いちばん上）",
      w4.kids.length === 1 && w4.kids[0] === "home-waiting" && /^\d{4}$/.test(w4.code) && !w4.plan && !w4.units && w4.y === 0, JSON.stringify(w4));
    await H.screenshot({ path: path.join(SHOTS, label + "_B4_plan_waiting.png") }).catch(() => {});
    await tap(G, "#go-join"); await G.fill("#join-code-input", w4.code); await tap(G, "#join-btn");
    let ok6 = true;
    await waitVis(H, "#start-together-btn", 60000).catch(() => { ok6 = false; });
    const bseq = [];
    if (ok6) {
      await tap(H, "#start-together-btn"); await tap(G, "#join-start-together-btn");
      for (let k = 0; k < 2; k++) {
        await H.waitForFunction(() => ["#skip-btn", "#advance-btn"].some(s => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== "none" && e.offsetParent !== null; }), null, { timeout: 30000 }).catch(() => {});
        const legacy = await vis(H, "#advance-btn");
        const id = await qid(H, "battle"); bseq.push(id);
        if (legacy) await tap(H, "#advance-btn");
        await G.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 }).catch(() => {});
        await G.waitForTimeout(300);
        if (legacy) await tap(G, "#answer-reveal-btn").catch(() => {});
        await waitVis(G, "#judge-row", 15000).catch(() => {});
        await tap(G, k === 0 ? "#judge-ng" : "#judge-ok").catch(() => {});
        if (legacy) { await waitVis(H, "#judge-row", 15000).catch(() => {}); await tap(H, "#judge-ok").catch(() => {}); }
        await H.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 }).catch(() => {});
        await tap(H, "#next-btn").catch(() => {}); await H.waitForTimeout(600);
      }
      const again6 = await qid(H, "battle").catch(() => "");
      await tap(H, "#battle-end-btn").catch(() => {}); await H.waitForTimeout(800);
      await H.evaluate(() => { const b = document.getElementById("result-home-btn"); if (b) b.click(); }); await H.waitForTimeout(1500);
      const m6 = await mark(H, 1), it6 = planItem(1);
      check("A6 二人（ホスト）：1回目が全部ついて出し直し（" + again6 + "）の途中で「おわる」→「✔ できた（やり直しは途中）」・plan_done に partial:true",
        again6 === bseq[0] && m6 === "✔ できた（やり直しは途中）" && it6 && it6.done === true && it6.partial === true, JSON.stringify({ bseq, again6, m6, it6 }));
    } else check("A6 二人（ホスト）：おわる で「できた（やり直しは途中）」", false, "相手とつながらなかった");
    check("E 画面のエラー 0", solo.errs.length + host.errs.length + guest.errs.length === 0, [].concat(solo.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("（途中で止まった）", false, e && e.stack || e); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); relay.close(); process.exit(c); };
if (!process.env.NOW_ONLY) {
  console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
  const outB = await run("base", BASELINE);
  const ngB = report("対照 " + BASE_COMMIT, outB);
  const must = ["A2", "A3", "A4", "A5", "A6", "B1", "B2", "B4"].filter(t => !outB.some(c => !c.ok && c.n.startsWith(t)));
  console.log(must.length === 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格（鳴らなかった: " + must.join(" ") + "）");
  if (must.length) await done(3);
}
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
