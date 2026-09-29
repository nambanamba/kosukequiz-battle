// ★★bug0930（2026-09-30）「間違えていない問題が×・やり直しになる」ほかの直しを、本物の Chrome で見る。
// 報告と承認: 司令塔 2026-09-30（①④ 司令塔承認／②③⑤ ユーザー判断）。作業メモ 2026-09-30 の節。
//
// ■ 見ること（一人＝1枚、二人＝2枚＋まねごとの待ち合わせ先 fake_relay）
//   一人（理科 第3回・一問一答1問＋大問1つ(小問3つ)＝4問・出題順どおり）
//   S1 ② 大問の(1)を✕→読み込み直し→再開すると(1)に戻る。(1)を〇にすると ×リスト・「前回まちがえた問題」に残らず、
//        記録は二重に付かない（correct 1・wrong 0）。点は「4 / 4」
//   S2 ③ 直前が大問の小問でも「ひとつ前の判定をやり直す」が出る。押すと記録が答える前に戻り、〇で入れ直せる
//   S3 ⑤ 大問の小問にだけスキップが出る。押すとこたえが出て✕で記録、「つぎへ」で次の小問（末尾に回さない・分母そのまま）
//   二人（同じ4問。ホスト 答える4秒・判定2秒／ゲスト 答える1秒・判定1秒）
//   B1 ④ 一問一答はこれまでどおり（ゲストは自分の1秒で開く）
//   B2 ⑤ ホストの小問にスキップが出る。押すとホストの記録は✕、次は次の小問（「3 / 4」）。ゲストにはその小問を出さない
//   B3 ④ 大問の小問は、ゲストもホストの秒数×2（8秒）で開く。判定の時間切れも ホストの判定2秒×2（4秒）
//   B4 ④ 390×844 で「こたえを見る」・時計・判定ボタンが両方の画面の中に見える（スクショあり）
//   B5 ① もう一勝負で、ゲストが〇にした小問はゲストの記録も〇（✕にならない）
//   B6 画面のエラー0
// ■ 自己テスト = 直す前の版（1605b0d・コミットで固定）でも同じ手順を走らせ、鳴った件数を数える
// 使い方: node tools/mikaku/bug0930_probe.mjs            （now と base の両方）
//         node tools/mikaku/bug0930_probe.mjs --only now  （now / base）
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_bug0930");
fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "1605b0d";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

const relay = await startFakeRelay({ broadcast: true, label: "bug0930" });
let SERVED = CURRENT;
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") {
    const i0 = SERVED.indexOf("const RELAY_URLS = ["), i1 = SERVED.indexOf("];", i0);
    const src = SERVED.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + SERVED.slice(i1);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(Buffer.from(src, "utf8")); return;
  }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": rel.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });

// ★仕込みは条件で選ぶ（番号の決め打ちをしない）。第3回の一問一答1問だけ未実施・大問は小問3つの（紙でない）1つだけ未実施
const SEED = ({ isHost, answer, judge }) => {
  const now = Date.now();
  const u3 = QA_DATA.find(d => d.subj === "理科" && /^第3回\./.test(d.u) && d.kind !== "daimon").u;
  const st = {};
  let plan = null;
  if (isHost) {
    const qa3 = QA_DATA.filter(d => d.u === u3 && d.kind !== "daimon");
    qa3.slice(1).forEach(d => { st[d.id] = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }; });
    const G = DAIMON_DATA.filter(g => g.kai === 3 && !g.paper && QA_DATA.some(d => d.id === g.key));
    const g = G.find(g => g.items.length === 3);
    if (!g) return { err: "小問3つの大問がありません" };
    G.forEach(x => { if (x !== g) x.items.forEach(it => { st[it.id] = { correct: 1, wrong: 0, box: 1, lastCorrectAt: now - 5e8, lastAnswered: now - 5e8 }; }); });
    plan = [qa3[0].id].concat(g.items.map(it => it.id));
  }
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "理科", unitsBySubject: { "理科": [u3] }, units: [u3], count: 4, shuffle: false, tiers: [0],
    fairMode: false, reviewAllUnits: 1, headStartSec: 3, answerTimeSec: answer, judgeTimeSec: judge, nextTimeSec: 600, skipNextTimeSec: 600 }));
  return { plan };
};

async function run(label, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    page.on("dialog", d => d.accept().catch(() => {}));
    await page.goto(PAGE_URL); await page.waitForTimeout(600);
    return { ctx, page, errs };
  };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 30000 });
  const stats = pg => pg.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"));
  const inView = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); if (!e || e.offsetParent === null) return false; const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, sel);
  const allErrs = [];

  // ================= 一人 =================
  const solo = await mk();
  const sp = solo.page;
  const soloShown = () => sp.evaluate(() => (document.getElementById("solo-q-id").textContent || "").replace(/^No\./, ""));
  const soloStart = async () => {
    const S = await sp.evaluate(SEED, { isHost: true, answer: 8, judge: 10 });
    if (S.err) throw new Error(S.err);
    await sp.reload(); await sp.waitForTimeout(700);
    await tap(sp, "#solo-start-btn"); await sp.waitForTimeout(200);
    return S.plan;
  };
  const judge = async ok => { await waitVis(sp, "#solo-reveal-btn"); await tap(sp, "#solo-reveal-btn"); await sp.waitForTimeout(40); await tap(sp, ok ? "#solo-judge-ok" : "#solo-judge-ng"); await sp.waitForTimeout(60); };
  const soloResult = () => sp.evaluate(() => ({
    score: document.getElementById("solo-result-score").textContent,
    misses: document.querySelectorAll("#solo-miss-list .miss-item").length,
    lastMiss: JSON.parse(localStorage.getItem("kq_battle_last_miss_v1") || "[]")
  }));
  let plan;
  try {
    // ---- S1 ② ----
    plan = await soloStart();
    const [x, d1, d2, d3] = plan;
    check("（下じき）一人の並びが 一問一答→小問3つ", (await soloShown()) === x, await soloShown());
    await judge(true); await judge(false);   // x 〇、d1 ✕
    await sp.reload(); await sp.waitForTimeout(800);
    await tap(sp, "#resume-solo-btn"); await sp.waitForTimeout(200);
    check("S1 再開すると大問の(1)に戻る（下じき）", (await soloShown()) === d1, await soloShown());
    await judge(true); await judge(true); await judge(true);
    const r1 = await soloResult(), st1 = await stats(sp);
    check("★S1 ② (1)を再開後に〇 → ×リストに残らない", r1.misses === 0, "×リスト " + r1.misses + "件");
    check("★S1 ② 「前回まちがえた問題」に残らない", !r1.lastMiss.includes(d1), JSON.stringify(r1.lastMiss));
    check("★S1 ② 記録が二重に付かない（(1) correct1・wrong0）", st1[d1] && st1[d1].correct === 1 && (st1[d1].wrong || 0) === 0, JSON.stringify(st1[d1]));
    check("★S1 ② 点は 4 / 4（判定の数＝問題数）", r1.score.replace(/\s/g, "") === "4/4", r1.score);

    // ---- S2 ③ ----
    await soloStart();
    await judge(true); await judge(false);   // x 〇、d1 ✕ → d2 の画面
    check("S2 （下じき）いまは(2)", (await soloShown()) === d2, await soloShown());
    const undoVis = await vis(sp, "#solo-undo-link");
    check("★S2 ③ 直前が大問の小問でも「ひとつ前の判定をやり直す」が出る", undoVis);
    if (undoVis) {
      await tap(sp, "#solo-undo-link"); await sp.waitForTimeout(80);
      const st2 = await stats(sp);
      check("★S2 ③ やり直すと(1)に戻り、記録は答える前（記録なし）に戻る", (await soloShown()) === d1 && st2[d1] === undefined, (await soloShown()) + " " + JSON.stringify(st2[d1]));
      await judge(true);
      const st2b = await stats(sp);
      check("★S2 ③ 〇で入れ直すと correct1・wrong0・box1", st2b[d1] && st2b[d1].correct === 1 && (st2b[d1].wrong || 0) === 0 && st2b[d1].box === 1, JSON.stringify(st2b[d1]));
    }

    // ---- S3 ⑤ 一人 ----
    await soloStart();
    check("★S3 ⑤ 一問一答にはスキップが出ない", !(await vis(sp, "#solo-skip-btn")));
    await judge(true);
    const skipVis = await vis(sp, "#solo-skip-btn");
    check("★S3 ⑤ 大問の小問にはスキップが出る", skipVis);
    if (skipVis) {
      await tap(sp, "#solo-skip-btn"); await sp.waitForTimeout(80);
      const st3 = await stats(sp);
      const aShown = await sp.evaluate(() => document.getElementById("solo-a-block").classList.contains("show"));
      check("★S3 ⑤ スキップ: こたえが出て、記録は✕（wrong1・box0）", aShown && st3[d1] && st3[d1].wrong === 1 && (st3[d1].box || 0) === 0, JSON.stringify(st3[d1]));
      check("S3 ⑤ 「つぎへ」が出る", await vis(sp, "#solo-skip-next-btn"));
      await tap(sp, "#solo-skip-next-btn"); await sp.waitForTimeout(80);
      const ctr = await sp.$eval("#solo-counter", e => e.textContent.replace(/\s/g, ""));
      check("★S3 ⑤ 次は(2)で「3 / 4」（末尾に回さない・分母そのまま）", (await soloShown()) === d2 && ctr === "3/4", (await soloShown()) + " " + ctr);
      await judge(true); await judge(true);
      const r3 = await soloResult();
      check("S3 ⑤ 点は 3 / 4、×リストはスキップした1問", r3.score.replace(/\s/g, "") === "3/4" && r3.misses === 1, r3.score + " ×" + r3.misses);
    }
  } catch (e) { check("一人の手順が最後まで進む", false, String(e).split("\n")[0]); }
  allErrs.push(...solo.errs);
  await solo.ctx.close();

  // ================= 二人 =================
  const host = await mk(), guest = await mk();
  const H = host.page, G = guest.page;
  const shown = pg => pg.evaluate(() => (document.getElementById("battle-q-id").textContent || "").replace(/^No\./, ""));
  const counter = pg => pg.$eval("#battle-counter", e => e.textContent.replace(/\s/g, ""));
  let step = "";
  // ゲストの判定: 判定の列が出た瞬間に押す（直す前の版はゲストの判定1秒で自動〇になるため、待ってから押すと間に合わない）
  const guestJudgeWhenShown = (ok, ms) => G.waitForFunction(ok => { const r = document.getElementById("judge-row");
    if (getComputedStyle(r).display === "none") return false; document.getElementById(ok ? "judge-ok" : "judge-ng").click(); return true; }, ok, { timeout: ms || 40000, polling: 50 });
  const aOpen = pg => pg.evaluate(() => document.getElementById("battle-a-block").classList.contains("show"));
  try {
    const S = await H.evaluate(SEED, { isHost: true, answer: 4, judge: 2 });
    await G.evaluate(SEED, { isHost: false, answer: 1, judge: 1 });
    await H.reload(); await G.reload(); await H.waitForTimeout(800); await G.waitForTimeout(800);
    const [x, d1, d2, d3] = S.plan;
    await tap(H, "#create-btn");
    await H.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 40000 });
    const code = await H.$eval("#room-code-display", e => e.textContent);
    await tap(G, "#go-join"); await G.fill("#join-code-input", code); await tap(G, "#join-btn");
    await waitVis(H, "#start-together-btn", 60000);
    await tap(H, "#start-together-btn"); await tap(G, "#join-start-together-btn");
    const guestSeen = new Set();
    const noteGuest = async () => { const v = await G.evaluate(() => getComputedStyle(document.getElementById("battle-view")).display !== "none"); if (v) guestSeen.add(await shown(G)); };
    step = "手1";
    // ---- 手1: 一問一答 x ----
    await waitVis(H, "#advance-btn"); await tap(H, "#advance-btn");
    await G.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", x, { timeout: 20000 });
    let t0 = Date.now();
    await G.waitForFunction(() => document.getElementById("battle-a-block").classList.contains("show"), null, { timeout: 20000 });
    const gOpenX = Date.now() - t0;
    check("B1 ④ 一問一答はこれまでどおり: ゲストは自分の1秒で開く（3秒未満）", gOpenX < 3000, gOpenX + "ms");
    // ★ゲストは自分の判定1秒で自動〇になっているので、出ていれば押す
    await waitVis(H, "#judge-row"); await tap(H, "#judge-ok");
    if (await vis(G, "#judge-row")) await tap(G, "#judge-ok");
    await H.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 20000 });
    await tap(H, "#next-btn");
    step = "手2";
    // ---- 手2: 小問(1) → スキップ ----
    await waitVis(H, "#advance-btn");
    check("B2 （下じき）ホストの手2は(1)", (await shown(H)) === d1, await shown(H));
    const skipVis = await vis(H, "#skip-btn");
    check("★B2 ⑤ ホストの小問にスキップが出る", skipVis);
    if (skipVis) {
      await tap(H, "#skip-btn"); await H.waitForTimeout(150);
      const hs = await stats(H);
      check("★B2 ⑤ スキップ: ホストの記録は✕（wrong1）・こたえが出る", hs[d1] && hs[d1].wrong === 1 && await aOpen(H), JSON.stringify(hs[d1]));
      await noteGuest();
      await tap(H, "#skip-continue-btn");
    } else {
      await tap(H, "#advance-btn");   // 直す前の版: スキップが無いので、ふつうに進めて(1)を両方〇にする
      await waitVis(H, "#judge-row", 40000); await tap(H, "#judge-ok");
      if (await vis(G, "#judge-row")) await tap(G, "#judge-ok");
      await H.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 20000 });
      await tap(H, "#next-btn");
    }
    step = "手3";
    // ---- 手3: 小問(2)（時間・見えるか）----
    await waitVis(H, "#advance-btn");
    check("★B2 ⑤ スキップのあとは(2)で「3 / 4」（末尾に回さない）", (await shown(H)) === d2 && (await counter(H)) === "3/4", (await shown(H)) + " " + (await counter(H)));
    check("★B4 ④ ホスト: 小問の「わかった！」が画面の中", await inView(H, "#advance-btn"));
    await tap(H, "#advance-btn");
    await G.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", d2, { timeout: 20000 });
    await noteGuest();
    t0 = Date.now();
    await G.waitForTimeout(300);
    check("★B4 ④ ホスト: 「こたえを見る」が画面の中", await inView(H, "#answer-reveal-btn"));
    check("★B4 ④ ゲスト: 「こたえを見る」が画面の中", await inView(G, "#answer-reveal-btn"));
    check("B4 ④ ホスト・ゲスト: 時計（チーズ）が画面の中", (await inView(H, "#answer-countdown")) && (await inView(G, "#answer-countdown")));
    await H.screenshot({ path: path.join(SHOTS, label + "_host_daimon_answering.png") });
    await G.screenshot({ path: path.join(SHOTS, label + "_guest_daimon_answering.png") });
    await G.waitForFunction(() => document.getElementById("battle-a-block").classList.contains("show"), null, { timeout: 30000 });
    const gOpenD = Date.now() - t0;
    check("★B3 ④ 小問: ゲストもホストの秒数×2（8秒）で開く（7秒以上）", gOpenD >= 7000, gOpenD + "ms");
    await waitVis(G, "#judge-row"); await waitVis(H, "#judge-row");
    const tj = Date.now();
    check("★B4 ④ 判定ボタンが画面の中（ホスト・ゲスト）", (await inView(H, "#judge-row")) && (await inView(G, "#judge-row")));
    await H.screenshot({ path: path.join(SHOTS, label + "_host_daimon_judge.png") });
    await G.screenshot({ path: path.join(SHOTS, label + "_guest_daimon_judge.png") });
    // だれも押さない → ゲストの判定の時間切れ（自動〇）までの時間
    await G.waitForFunction(() => getComputedStyle(document.getElementById("judge-row")).display === "none", null, { timeout: 30000 });
    const gJudge = Date.now() - tj;
    check("★B3 ④ 小問の判定の時間切れは ホストの判定2秒×2（3.5秒以上）", gJudge >= 3500, gJudge + "ms");
    await H.waitForFunction(() => getComputedStyle(document.getElementById("judge-row")).display === "none", null, { timeout: 30000 }).catch(() => {});
    await H.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 30000 });
    await tap(H, "#next-btn");
    step = "手4";
    // ---- 手4: 小問(3): ゲストはホストを✕、ホストはゲストを〇 ----
    await waitVis(H, "#advance-btn");
    const gNg = guestJudgeWhenShown(false);
    await tap(H, "#advance-btn");
    await G.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", d3, { timeout: 20000 });
    await noteGuest();
    await gNg;
    await waitVis(H, "#judge-row", 40000); await tap(H, "#judge-ok");
    await H.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 20000 });
    await tap(H, "#next-btn");
    if (skipVis) check("★B2 ⑤ ゲストにはスキップした小問(1)を出していない", !guestSeen.has(d1), [...guestSeen].join(","));
    const gBefore = (await stats(G))[d3];
    check("B5 （下じき）1回目: ゲストは(3)を〇で記録", gBefore && (gBefore.wrong || 0) === 0 && gBefore.correct === 1, JSON.stringify(gBefore));
    step = "もう一勝負";
    // ---- もう一勝負（自動）: 出る手はぜんぶ両方〇 ----
    for (let k = 0; k < 6; k++) {
      const got = await H.waitForFunction(() => { const a = document.querySelector(".screen.active"); return a && a.id === "screen-battle" && getComputedStyle(document.getElementById("advance-btn")).display !== "none"; }, null, { timeout: 15000 }).then(() => true).catch(() => false);
      if (!got) break;
      const gOk = guestJudgeWhenShown(true).catch(() => {});
      await tap(H, "#advance-btn");
      await gOk;
      await waitVis(H, "#judge-row", 40000); await tap(H, "#judge-ok");
      await H.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 20000 });
      await tap(H, "#next-btn");
      await H.waitForTimeout(300);
    }
    const gAfter = (await stats(G))[d3];
    check("★B5 ① もう一勝負でゲストが〇にした(3)は、ゲストの記録も〇（wrong0・correct2）", gAfter && (gAfter.wrong || 0) === 0 && gAfter.correct === 2, JSON.stringify(gAfter));
    const hAfter = (await stats(H))[d3];
    check("B5 ① ホストの(3)はこれまでどおり（もう一勝負の〇も✕で記録＝wrong2）", hAfter && hAfter.wrong === 2, JSON.stringify(hAfter));
  } catch (e) { check("二人の手順が最後まで進む", false, step + ": " + String(e).split("\n")[0]); }
  allErrs.push(...host.errs, ...guest.errs);
  check("B6 画面のエラー0", allErrs.length === 0, allErrs.slice(0, 2).join(" | "));
  await host.ctx.close(); await guest.ctx.close();
  return out;
}

const runs = only ? [only] : ["now", "base"];
let bad = 0;
for (const r of runs) {
  const res = await run(r, r === "now" ? CURRENT : BASELINE);
  const fails = res.filter(c => !c.ok);
  console.log("\n==== " + (r === "now" ? "いまの版" : "自己テスト: 直す前の版 " + BASE_COMMIT) + "  " + (res.length - fails.length) + "/" + res.length + " 通過・" + fails.length + "件 鳴った");
  res.forEach(c => console.log((c.ok ? "  ○ " : "  ✕ ") + c.name + (c.ok || !c.extra ? "" : "  … " + c.extra)));
  if (r === "now" && fails.length) bad++;
  if (r === "base" && fails.filter(c => c.name.startsWith("★")).length < 10) { console.log("  ★自己テストが鳴っていません（★の項目が10件未満）"); bad++; }
}
await browser.close(); server.close(); relay.close && relay.close();
process.exit(bad ? 1 : 0);
