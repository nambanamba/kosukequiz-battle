// 対戦の途中でホストがリロードしても、「続きから再開」で壊れないかを確かめる。
//
// 使い方: node tools/test_battle_resume.mjs
//
// なぜ要るか（2026-09-13・ユーザーが実機で見つけた不具合）:
//   「まちがえた問題だけもう一度」の途中でリロード → 再開後、やり直しができなかった。
//   調べると原因は3つあった:
//   ① まちがいリスト（myMissesThisRound）が保存されておらず、再開すると空になる。
//      → ラウンドの最後に「もう一勝負」が出ない。★しかも「前回まちがえた問題」を空で上書きする
//   ② 再開したあとの保存で、部屋のコードが「----」になる（再開の経路で表示欄を埋めていない）。
//      → 2回目のリロードで、ゲストのいない部屋に入ってしまい、つながらない
//   ③ 採点ずみの問題に戻ってやり直すため、正誤の記録が二重に入る
//
// ★2台目の端末は要らない。trystero を「2つのブラウザ文脈を node が中継する」スタブに
//   差し替えている。文脈を分けているのは、localStorage（正誤の記録）を分けるため。
// ⚠️ このテストが見ないもの:
//   - 本物の通信（WebRTC）。つながる速さ・切れたときに相手側で onPeerLeave が出ること
//     （スタブは、ホストのリロードでゲスト側に onPeerLeave を出さない）
//   - 実機の画面。★本物の2台での確認は別に要る
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  try {
    const { createRequire } = await import("node:module");
    return createRequire(import.meta.url)("playwright");
  } catch {}
  try {
    const { execSync } = await import("node:child_process");
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
  } catch {}
  return null;
}
const pw = await loadPlaywright();
if (!pw) { console.error("playwright が見つかりません。"); process.exit(2); }

const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".json":"application/json", ".jpg":"image/jpeg", ".png":"image/png"};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {"content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream"});
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/index.html";

// ---- 中継つきスタブ。send は node へ渡し、node が同じ部屋のもう片方へ届ける ----
const STUB = `
export function joinRoom(cfg, code){
  const actions = {};
  const room = {
    onPeerJoin(){}, onPeerLeave(){},
    makeAction(name){ const a = { send: d => window.__kqSend({code, name, data: d}), onMessage: null }; actions[name] = a; return a; },
    leave(){ window.__kqSend({code, leave: true}); }
  };
  window.__kqDeliver = (name, data) => { const a = actions[name]; if (a && a.onMessage) a.onMessage(data); };
  window.__kqPeerJoin = () => room.onPeerJoin();
  setTimeout(() => window.__kqSend({code, join: true}), 0);
  return room;
}`;

let browser;
try { browser = await pw.chromium.launch(); }
catch { browser = await pw.chromium.launch({ channel: "chrome" }); }

const rooms = new Map(); // code -> Set<page>
const errors = [];
const unloadDialogs = {}; // ページを離れるときの確認（beforeunload）が出た回数。ページの名前ごと
async function makePeer(label) {
  const ctx = await browser.newContext();
  await ctx.route(/(esm\.run\/trystero|cdn\.jsdelivr\.net\/npm\/trystero)/, r =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(label + " JSエラー: " + e.message));
  page.on("dialog", d => {
    if (d.type() === "beforeunload") unloadDialogs[label] = (unloadDialogs[label] || 0) + 1;
    d.accept();
  });
  await ctx.exposeBinding("__kqSend", (src, msg) => {
    const p = src.page;
    for (const [code, set] of rooms) if (code !== msg.code) set.delete(p);
    const set = rooms.get(msg.code) || new Set();
    rooms.set(msg.code, set);
    if (msg.leave) { set.delete(p); return; }
    if (msg.join) {
      set.add(p);
      for (const q of set) q.evaluate(() => window.__kqPeerJoin && window.__kqPeerJoin()).catch(() => {});
      return;
    }
    for (const q of set) if (q !== p) q.evaluate(([n, d]) => window.__kqDeliver && window.__kqDeliver(n, d), [msg.name, msg.data]).catch(() => {});
  });
  return { ctx, page, label };
}

const checks = [];
const ok = (label, cond, detail) => checks.push({ label, ok: !!cond, detail });

const visible = (page, sel, timeout = 8000) =>
  page.waitForFunction(s => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== "none" && e.offsetParent !== null; }, sel, { timeout });
const text = (page, sel) => page.$eval(sel, e => e.textContent);
// ボタンは「塗りのカウントダウン」で動き続けるので、playwright の click は「止まるまで待つ」で固まる。
// DOM の click を直接呼ぶ
const tap = (page, sel) => page.$eval(sel, e => e.click());
const qid = async page => (await text(page, "#battle-q-id")).replace(/^No\./, "");
const stats = page => page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"));
const lastMiss = page => page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_last_miss_v1") || "[]"));

async function setup(host, guest) {
  await host.page.goto(BASE);
  const unit = await host.page.evaluate(() => QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc").u);
  const settings = { subject: "社会", unitsBySubject: { "社会": [unit] }, units: [unit], count: 3, shuffle: false,
    filterUnmastered: false, filterWeak: false, type: "all", priority: "all", level: "all", reviewMixCount: 0,
    fairMode: false, headStartSec: 0, answerTimeSec: 120, judgeTimeSec: 120, nextTimeSec: 120, skipNextTimeSec: 120 };
  for (const p of [host.page, guest.page]) {
    if (p !== host.page) await p.goto(BASE);
    await p.evaluate(s => { localStorage.clear(); localStorage.setItem("kq_battle_settings_v1", JSON.stringify(s)); }, settings);
    await p.reload();
    await p.waitForTimeout(600);
  }
  await tap(host.page,"#create-btn");
  await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent));
  const code = await text(host.page, "#room-code-display");
  await tap(guest.page,"#go-join");
  await guest.page.fill("#join-code-input", code);
  await tap(guest.page,"#join-btn");
  await visible(host.page, "#start-together-btn");
  await tap(host.page,"#start-together-btn");
  return code;
}

// 1問ぶん: 両方が「答えを見る」→ ゲストがホストを判定（＝ホストの記録）→ ホストがゲストを判定
async function reveal(host, guest) {
  await visible(host.page, "#answer-reveal-btn");
  await visible(guest.page, "#answer-reveal-btn");
  await tap(host.page,"#answer-reveal-btn");
  await tap(guest.page,"#answer-reveal-btn");
  await visible(host.page, "#judge-row");
  await visible(guest.page, "#judge-row");   // 2026-09-16 から判定ボタンは0.3秒遅れて出る。出るのを待ってから押す
}
async function guestJudgesHost(guest, hostCorrect) {
  await tap(guest.page,hostCorrect ? "#judge-ok" : "#judge-ng");
}
async function hostJudgesGuest(host) {
  await tap(host.page,"#judge-ok");
  await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"));
}
async function playQuestion(host, guest, hostCorrect) {
  await reveal(host, guest);
  await guestJudgesHost(guest, hostCorrect);
  await host.page.waitForTimeout(300);
  await hostJudgesGuest(host);
}
async function next(host) { await tap(host.page,"#next-btn"); await host.page.waitForTimeout(400); }
// リロードして、ページを離れる確認が出たかを返す
async function reloadAsks(peer) {
  // ★画面を実際に触っておく。一度も触っていないページには、ブラウザが確認を出さない
  //   （これを忘れると「出ない」の確認が、何を直しても通ってしまう）
  await peer.page.mouse.click(2, 400);
  const before = unloadDialogs[peer.label] || 0;
  await peer.page.reload();
  await peer.page.waitForTimeout(800);
  return (unloadDialogs[peer.label] || 0) > before;
}
let lastReloadAsked = false;
async function reloadAndResume(host) {
  lastReloadAsked = await reloadAsks(host);
  await visible(host.page, "#resume-battle-btn", 3000);
  await tap(host.page,"#resume-battle-btn");
  await host.page.waitForTimeout(800);
}
async function onResult(page) {
  await page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 8000 });
}

// ============================================================ シナリオ1・2
{
  const host = await makePeer("host"), guest = await makePeer("guest");
  try {
    await setup(host, guest);
    const ids = [];
    ids.push(await qid(host.page)); await playQuestion(host, guest, false); await next(host);   // 1問目 ✕
    ids.push(await qid(host.page)); await playQuestion(host, guest, false); await next(host);   // 2問目 ✕
    ids.push(await qid(host.page));
    await reloadAndResume(host);                                                               // 3問目の前でリロード
    let reconnected = true;
    try { await visible(host.page, "#answer-reveal-btn", 5000); } catch { reconnected = false; }
    ok("[4] ★対戦中にリロードすると、ページを離れる確認が出る", lastReloadAsked);
    ok("[1] 1回目のリロードのあと、ゲストとつながって続きが出る", reconnected);
    if (reconnected) {
      await playQuestion(host, guest, true); await next(host);                                // 3問目 〇
      await onResult(host.page);
      const btn = await host.page.$eval("#result-retry-battle-btn", e => getComputedStyle(e).display !== "none" ? e.textContent : "");
      ok("[1] ★再開したラウンドの最後に「もう一勝負（2問）」が出る", btn.includes("2問"), btn);
      const lm = await lastMiss(host.page);
      ok("[1] ★「前回まちがえた問題」が空で上書きされない（2問残る）", lm.length === 2 && lm.includes(ids[0]) && lm.includes(ids[1]), lm);
      const st = await stats(host.page);
      ok("[1] 記録: 1・2問目の✕が1回ずつ／3問目の〇が1回", st[ids[0]]?.wrong === 1 && st[ids[1]]?.wrong === 1 && st[ids[2]]?.correct === 1,
        JSON.stringify(ids.map(i => st[i])));

      // ---- シナリオ2: やり直しラウンドの途中でもう一度リロード（2回目）----
      let retryStarted = true;
      try { await host.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 8000 }); }
      catch { retryStarted = false; }
      ok("[2] やり直しラウンドが始まる", retryStarted);
      if (retryStarted) {
        const r1 = await qid(host.page);
        await playQuestion(host, guest, false); await next(host);                             // やり直し1問目 ✕
        const r2 = await qid(host.page);
        await reloadAndResume(host);                                                           // ★2回目のリロード
        const code2 = await host.page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_host_session_v1") || "{}").code);
        ok("[2] ★保存された部屋のコードが4桁のまま（「----」にならない）", /^\d{4}$/.test(code2 || ""), code2);
        let again = true;
        try { await visible(host.page, "#answer-reveal-btn", 5000); } catch { again = false; }
        ok("[2] ★やり直しラウンドの途中で再開して、ゲストとつながる", again);
        if (again) {
          await playQuestion(host, guest, true); await next(host);                            // やり直し2問目 〇（記録は✕のまま）
          await onResult(host.page);
          const btn2 = await host.page.$eval("#result-retry-battle-btn", e => getComputedStyle(e).display !== "none" ? e.textContent : "");
          ok("[2] ★やり直しラウンドの最後に「もう一勝負（1問）」が出る", btn2.includes("1問"), btn2);
          const lm2 = await lastMiss(host.page);
          ok("[2] ★「前回まちがえた問題」がやり直し1問目だけになる", lm2.length === 1 && lm2[0] === r1, lm2);
          const st2 = await stats(host.page);
          ok("[2] 記録: やり直しは正解でも✕のまま・二重に入らない（各2回）",
            st2[r1]?.wrong === 2 && st2[r2]?.wrong === 2 && (st2[r2]?.correct || 0) === 0, JSON.stringify([st2[r1], st2[r2]]));

          // ---- [4] 「中断」を押してホームへもどったあとは、確認を出さない ----
          await host.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 8000 });
          await tap(host.page, "#battle-pause-btn");          // 「中断しますか」は自動で OK
          await host.page.waitForFunction(() => document.getElementById("screen-home").classList.contains("active"), null, { timeout: 5000 });
          ok("[4] ★「中断」でホームへもどったあとのリロードでは、確認が出ない", !(await reloadAsks(host)));
          const again2 = await host.page.$eval("#resume-battle-btn", e => getComputedStyle(e).display !== "none");
          ok("[4] 中断したあとも「前回の対戦を再開する」が出る", again2);
        }
      }
    }
  } catch (e) { ok("シナリオ1・2が最後まで動く", false, String(e.message).slice(0, 200)); }
  await host.ctx.close(); await guest.ctx.close();
}

// ============================================================ シナリオ3: 採点の途中でリロード
{
  const host = await makePeer("host"), guest = await makePeer("guest");
  try {
    await setup(host, guest);
    const q1 = await qid(host.page);
    await reveal(host, guest);
    await guestJudgesHost(guest, false);                 // ホストの✕が記録された。ホストはまだ判定していない
    await host.page.waitForTimeout(400);
    await reloadAndResume(host);
    await reveal(host, guest);
    await guestJudgesHost(guest, false);
    await host.page.waitForTimeout(300);
    await hostJudgesGuest(host);
    let st = await stats(host.page);
    ok("[3] ★判定のあとリロードしてやり直しても、✕は1回だけ", st[q1]?.wrong === 1, JSON.stringify(st[q1]));
    await next(host);

    const q2 = await qid(host.page);
    await playQuestion(host, guest, true);               // 2問目 〇。採点まで済んだ
    const scoreBefore = await text(host.page, "#score-me");
    await reloadAndResume(host);                         // ★「次へ」を押す前にリロード
    st = await stats(host.page);
    ok("[3] ★採点ずみの問題に戻らず、次の問題から再開する", (await text(host.page, "#battle-counter")).startsWith("3"), await text(host.page, "#battle-counter"));
    ok("[3] 2問目の〇は1回だけ・得点が保たれる", st[q2]?.correct === 1 && (await text(host.page, "#score-me")) === scoreBefore,
      JSON.stringify(st[q2]) + " score=" + (await text(host.page, "#score-me")));
    await visible(host.page, "#answer-reveal-btn", 5000);
    await playQuestion(host, guest, true); await next(host);
    await onResult(host.page);
    // ★結果画面では「もう一勝負」が3秒後に自動で始まるので、その前にリロードする
    ok("[4] ★対戦が終わった結果画面のリロードでは、確認が出ない", !(await reloadAsks(host)));
    st = await stats(host.page);
    ok("[3] 最後まで: 1問目✕1回・2問目〇1回", st[q1]?.wrong === 1 && st[q2]?.correct === 1, JSON.stringify([st[q1], st[q2]]));
    const lm = await lastMiss(host.page);
    ok("[3] 「前回まちがえた問題」は1問目だけ", lm.length === 1 && lm[0] === q1, lm);
  } catch (e) { ok("シナリオ3が最後まで動く", false, String(e.message).slice(0, 200)); }
  await host.ctx.close(); await guest.ctx.close();
}

// ============================================================ シナリオ6: 配信前の古い保存から再開
// ★この修正より前に保存されたセッションには、まちがいリストの欄が無い。
//   そこから再開したとき、「前回まちがえた問題」を空や途中までのリストで上書きしないこと
{
  const host = await makePeer("host6"), guest = await makePeer("guest6");
  try {
    await setup(host, guest);
    await playQuestion(host, guest, false); await next(host);         // 1問目 ✕（古い保存では失われる）
    const prev = await host.page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("kq_battle_host_session_v1"));
      delete s.misses; delete s.recordedIdx; delete s.scoredIdx;       // 修正前の形にする
      localStorage.setItem("kq_battle_host_session_v1", JSON.stringify(s));
      // ★実在する問題の id にする。存在しない id は、ホームを描くときに取りのぞかれて消える
      //   （はじめ「前回の記録」という仮の文字で試して、修正の有無にかかわらず [] になった）
      const prev = QA_DATA[QA_DATA.length - 1].id;
      localStorage.setItem("kq_battle_last_miss_v1", JSON.stringify([prev]));
      return prev;
    });
    await reloadAndResume(host);
    await visible(host.page, "#answer-reveal-btn", 5000);
    await playQuestion(host, guest, false); await next(host);         // 2問目 ✕
    await playQuestion(host, guest, true); await next(host);          // 3問目 〇
    await onResult(host.page);
    const lm = await lastMiss(host.page);
    ok("[6] ★古い保存から再開したときは、「前回まちがえた問題」を上書きしない", JSON.stringify(lm) === JSON.stringify([prev]), lm);
  } catch (e) { ok("シナリオ6が最後まで動く", false, String(e.message).slice(0, 200)); }
  await host.ctx.close(); await guest.ctx.close();
}

// ============================================================ シナリオ5: ひとり練習でも確認が出る
{
  const solo = await makePeer("solo");
  try {
    await solo.page.goto(BASE);
    const unit = await solo.page.evaluate(() => QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc").u);
    await solo.page.evaluate(u => {
      localStorage.clear();
      localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [u] }, units: [u],
        count: 3, shuffle: false, filterUnmastered: false, filterWeak: false, reviewMixCount: 0 }));
    }, unit);
    await solo.page.reload();
    await solo.page.waitForTimeout(600);
    ok("[5] ホームのリロードでは、確認が出ない", !(await reloadAsks(solo)));
    await tap(solo.page, "#solo-start-btn");
    await solo.page.waitForFunction(() => document.getElementById("screen-solo").classList.contains("active"), null, { timeout: 5000 });
    ok("[5] ★ひとり練習の途中のリロードでは、確認が出る", await reloadAsks(solo));
  } catch (e) { ok("シナリオ5が最後まで動く", false, String(e.message).slice(0, 200)); }
  await solo.ctx.close();
}

await browser.close();
server.close();
let bad = 0;
for (const c of checks) {
  if (!c.ok) bad++;
  console.log((c.ok ? "  ok   " : "  NG   ") + c.label + (c.ok ? "" : "  → " + JSON.stringify(c.detail)));
}
for (const e of errors) { console.log("  NG   " + e); bad++; }
console.log(`\n${checks.length}件の確認、問題 ${bad}件`);
process.exit(bad ? 1 : 0);
