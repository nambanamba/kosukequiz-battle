// ★★対戦を始めたとき、画面の「◯ / ◯」と点数に**前回の対戦の数字が残っていないか**を見る。
//
// 使い方: node tools/mikaku/round_reset_probe.mjs
//
// ■ なぜ要るか（2026-09-26 ユーザー指摘）
//   ユーザー原文「クイズのアプリですが、開始時点で前回の記録が表示されます。嫌なので直してください」
//   　　　　　　「2人で対戦の時ですが、開始すると前回の対戦の時の問題数や、正解数がそのままのこっています」
//   依頼書 = 司令塔\回答\対戦_開始時に前回のスコアと問題数が残る_依頼_2026-09-26.md
//
//   原因は1つ: **対戦画面の「◯ / ◯」と点数を書いているのは showQuestion() の中だけ**だった。
//   ゲストは「1問目が届く前にホストの様子を見せるため」対戦画面へ移されるので、
//   そのあいだ showQuestion() を通らず、**DOM に前回の対戦の文字が残る**。
//   ★battle-counter と .score-row は battle-view の外にあるため、
//     showGuestWaitStatus() が battle-view を隠しても古い数字は見えたままだった。
//
// ■ ★スタブではない（確認ポイント 4-1）
//   既存の「2人ぶん」の検査（battle_buttons_probe など）は通信を node のスタブに差し替えていて、
//   **待ち合わせを一度も試していなかった**（2026-09-20 の実例）。
//   ここは judge_fix_probe.mjs と同じく **本物の Chrome を2つ開き、まねごとの待ち合わせ先ごしに
//   実際に出会わせて**、ゲストの画面に出ている文字そのものを読む。
//
// ■ 見ている3つの場面
//   S1 はじめの対戦。1問目が出る前のゲストの画面（★HTML の作り置き「1 / 10」も、ここで捕まる）
//   S2 ★「まちがえた問題だけもう一勝負」。★このときゲストの `scores` 変数**そのもの**が
//      前のラウンドの点数のまま（endGame が結果画面に出すために残している）。依頼書の失敗3
//   S3 ★再接続（resync）。★こちらは**0 に戻してはいけない**。依頼書の失敗4（逆向きの事故）
//
// ■ ★入口の自己テスト（4-6）。本番の前に必ず走り、外れたら本番の数字を出さずに終わる
//   (a) 点数だけ戻して問題数を戻さない偽の実装 … ★鳴るのが正しい
//   (b) 問題数だけ戻して点数を戻さない偽の実装 … ★鳴るのが正しい
//   (c) ★再接続のときにも 0 に戻す偽の実装     … ★鳴るのが正しい（失敗4が鳴るか）
//   (d) 対照 BASE_COMMIT（直す前）             … ★鳴るのが正しい（4-6c。HEAD で表さない）
//   そして本番 (e) いまの index.html           … ★鳴らないのが正しい（4-3 網を広げすぎていない側）
//   ★偽の実装は**出荷される index.html から組み立てる**（写しを持たない・4-6d）。
//     置換できなかったら例外で止める（＝壊し損ねを「異常なし」に化けさせない・4-1）
//
// ■ ★見ていないもの（4-2）
//   - 本物の relay・本物の回線（ここは まねごとで、1台のPCの中の2つの画面）。実機は B-12 で別に見る
//   - battle-unit-tag / battle-q-id（No.）/ battle-source-tag（出典）。
//     ★これらも battle-view の外にあり、「つぎの問題の準備中…」のあいだ1つ前の問題のものが残る。
//     ①の依頼書が「触ってよいのは点数と問題数の初期化だけ」としているため、今回は直していない
//   - 一人練習の画面（solo）。今回の依頼は対戦だけ
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_roundreset");
fs.mkdirSync(SHOTS, { recursive: true });

// ★対照はコミットで固定する（4-6c）。HEAD にすると、直したものを commit した瞬間に対照でなくなる
const BASE_COMMIT = "e1d1167";

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();

const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// ---- 偽の実装（★出荷される index.html から組み立てる。写しを持たない・4-6d）----
function cut(src, needle, replacement, what) {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error("偽の実装を作れません（" + what + " が " + n + " 件見つかりました。1件でないと壊し損ねます）");
  return src.replace(needle, replacement);
}
// (a) 点数だけ戻して、問題数（◯ / ◯）を戻さない
const COUNTER_WRITE =
  '      els["battle-counter"].textContent =\n' +
  '        (data && typeof data.position === "number" && typeof data.total === "number")\n' +
  '          ? data.position+" / "+data.total : "";\n';
const fakeNoCounter = src => cut(src, COUNTER_WRITE, "      /* ★偽の実装: わざと問題数を戻さない */\n", "問題数を書く3行");
// (b) 問題数だけ戻して、点数を戻さない
//     ★`scores = {host:0, guest:0};` は他にもあるので、前後ごと指定して1件に絞る
const SCORES_RESET =
  '      scores = {host:0, guest:0};\n' +
  '      // 「◯ / ◯」はホストが送ってきた位置と総数をそのまま使う。\n';
const fakeNoScores = src => cut(src, SCORES_RESET,
  '      /* ★偽の実装: わざと点数を戻さない */\n      // 「◯ / ◯」はホストが送ってきた位置と総数をそのまま使う。\n',
  "点数を戻す1行");
// (c) ★再接続（resync）のときにも 0 に戻してしまう（依頼書の失敗4）
const RESYNC_KEEP = "      scores = data.scores || {host:0, guest:0};";
const fakeResyncZero = src => cut(src, RESYNC_KEEP,
  "      scores = {host:0, guest:0};   /* ★偽の実装: 再接続でも 0 に戻す */", "再接続で点数を保つ1行");

const relay = await startFakeRelay({ broadcast: true, label: "roundreset" });
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
let SERVED = CURRENT;
function withFakeRelay(src) {
  const i0 = src.indexOf("const RELAY_URLS = [");
  const i1 = src.indexOf("];", i0);
  if (i0 < 0 || i1 < 0) throw new Error("RELAY_URLS が見つかりません");
  return src.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + src.slice(i1);
}
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") {
    res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" });
    res.end(Buffer.from(withFakeRelay(SERVED), "utf8"));
    return;
  }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => {
    if (e) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
    res.end(b);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });

// ★考える時間を長めに取る。ここが「1問目がまだ画面に無い」窓なので、短いと見る前に過ぎてしまう
const HEAD_START_SEC = 12;
const Q_COUNT = 4;

async function run(label, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => { out.push({ name: name, ok: !!ok, extra: extra == null ? "" : String(extra) }); };
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});

  const seed = async (page) => {
    await page.evaluate((n) => {
      const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
      localStorage.clear();
      localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
        subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: n,
        shuffle: false, filterUnmastered: false, filterWeak: false, fairMode: false,
        headStartSec: 12, answerTimeSec: 1, judgeTimeSec: 600,
        nextTimeSec: 600, skipNextTimeSec: 600
      }));
    }, Q_COUNT);
    await page.reload(); await page.waitForTimeout(700);
  };
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });   // ★390px で見る
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    await page.goto(PAGE_URL); await page.waitForTimeout(600);
    await seed(page);
    return { ctx: ctx, page: page, errs: errs };
  };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const txt = (pg, sel) => pg.$eval(sel, e => (e.textContent || "").trim());
  const visible = (pg, sel) => pg.evaluate(s => {
    const e = document.querySelector(s);
    return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null);
  }, sel);
  const onBattle = pg => pg.evaluate(() => document.getElementById("screen-battle").classList.contains("active"));
  const header = async pg => ({
    counter: await txt(pg, "#battle-counter"),
    me: await txt(pg, "#score-me"),
    opp: await txt(pg, "#score-opp")
  });
  const waitVisible = (pg, sel, ms) => pg.waitForFunction(s => {
    const e = document.querySelector(s);
    return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null);
  }, sel, { timeout: ms || 25000 });
  const waitBattle = (pg, ms) => pg.waitForFunction(
    () => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: ms || 25000 });

  const host = await mk(), guest = await mk();
  try {
    // ================= 出会う =================
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await txt(host.page, "#room-code-display");
    await tap(guest.page, "#go-join");
    await guest.page.fill("#join-code-input", code);
    await tap(guest.page, "#join-btn");
    await waitVisible(host.page, "#start-together-btn", 60000);

    // ★対照を先に取る（0-3c 操作したら状態が変わったことを確かめる／4-1 基準を取る）。
    //   まだ対戦画面に入っていないので、ここは HTML の作り置きのまま
    const before = await header(guest.page);
    check("【下じき】開始前のゲストの画面は、HTML の作り置きのまま（1 / 10）",
      before.counter === "1 / 10", JSON.stringify(before));

    await tap(host.page, "#start-together-btn");
    await tap(guest.page, "#join-start-together-btn");

    // ================= S1: はじめの対戦。1問目が出る前のゲストの画面 =================
    await waitBattle(guest.page, 40000);
    await waitVisible(guest.page, "#guest-wait-status", 20000);
    // ★1問目がまだ出ていないことを確かめる（出ていたら、この場面を見ていない＝検査が空振り）
    const notYet = !(await visible(guest.page, "#battle-view"));
    check("★S1 いま見ているのは「1問目がまだ画面に無い」場面（battle-view は隠れている）", notYet);
    const s1 = await header(guest.page);
    await shot(guest.page, "S1_guest_before_q1");
    check("★S1 ゲストの「◯ / ◯」が、この対戦のもの（1 / " + Q_COUNT + "）になっている",
      s1.counter === "1 / " + Q_COUNT, "battle-counter=" + JSON.stringify(s1.counter));
    check("★S1 ゲストの点数が 0 / 0 になっている", s1.me === "0" && s1.opp === "0", JSON.stringify(s1));

    // ================= 1問目を、二人とも〇で通す =================
    const judge = async (hostOk, guestOk) => {
      await waitVisible(host.page, "#judge-row", 30000);
      await waitVisible(guest.page, "#judge-row", 30000);
      await tap(host.page, hostOk ? "#judge-ok" : "#judge-ng");
      await tap(guest.page, guestOk ? "#judge-ok" : "#judge-ng");
      await host.page.waitForFunction(
        () => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
    };
    await waitVisible(host.page, "#advance-btn", 30000);
    await tap(host.page, "#advance-btn");
    await judge(true, true);            // ホストもゲストも「相手はせいかい」→ 1 / 1
    const afterQ1 = await header(guest.page);
    check("1問目のあと、ゲストの画面が 1 / 1 点になっている",
      afterQ1.me === "1" && afterQ1.opp === "1", JSON.stringify(afterQ1));
    check("ホストとゲストの「◯ / ◯」が食いちがっていない（失敗5）",
      (await txt(host.page, "#battle-counter")) === afterQ1.counter,
      "host=" + (await txt(host.page, "#battle-counter")) + " guest=" + afterQ1.counter);

    // ================= S3: 再接続（resync）。★ここは 0 に戻してはいけない =================
    // ホストをリロードすると renderHome() が走って「前回の対戦を再開する」が出る。
    // （★onPeerLeave は refreshResumeBattleButton() を呼んでいないので、リロードで出す）
    await host.page.reload(); await host.page.waitForTimeout(900);
    await guest.page.reload(); await guest.page.waitForTimeout(900);
    await waitVisible(host.page, "#resume-battle-btn", 15000);
    await tap(host.page, "#resume-battle-btn");
    await waitBattle(host.page, 40000);
    await tap(guest.page, "#go-join");
    await guest.page.fill("#join-code-input", code);
    await tap(guest.page, "#join-btn");
    await waitBattle(guest.page, 60000);
    await guest.page.waitForFunction(() => {
      const e = document.getElementById("battle-view");
      return !!(e && getComputedStyle(e).display !== "none");
    }, null, { timeout: 30000 });
    await guest.page.waitForTimeout(500);
    const s3 = await header(guest.page);
    await shot(guest.page, "S3_guest_resync");
    // ★ここが依頼書の失敗4（逆向きの事故）。再接続でホストの送ってきた点数を捨ててはいけない
    check("★S3 再接続したゲストの点数が 1 / 1 のまま（0 に戻していない）",
      s3.me === "1" && s3.opp === "1", JSON.stringify(s3));

    // ================= 残りの問題。★2問目はゲストがホストを ✕ にする（もう一勝負を出すため）==
    await judge(false, false);          // 2問目: おたがい「まちがい」→ ホストにも まちがい が1件
    await tap(host.page, "#next-btn");
    for (let i = 3; i <= Q_COUNT; i++) {
      await waitVisible(host.page, "#advance-btn", 30000);
      await tap(host.page, "#advance-btn");
      await judge(true, true);
      await tap(host.page, "#next-btn");
    }

    // ================= S2: 「まちがえた問題だけもう一勝負」 =================
    await guest.page.waitForFunction(
      () => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 30000 });
    // ★この場面の下じきを取る。ゲストの `scores` 変数**そのもの**が前のラウンドのまま
    const stale = await header(guest.page);
    await shot(guest.page, "S2_guest_result");
    check("【下じき】結果画面では、ゲストの画面に前のラウンドの数字が残っている（これが次で消えるべきもの）",
      stale.me !== "0" && stale.counter === Q_COUNT + " / " + Q_COUNT, JSON.stringify(stale));
    await waitVisible(host.page, "#result-retry-battle-btn", 20000);
    if (await visible(host.page, "#result-retry-battle-btn")) {
      await tap(host.page, "#result-retry-battle-btn").catch(() => {});
    }
    await waitBattle(guest.page, 40000);
    await waitVisible(guest.page, "#guest-wait-status", 25000);
    const notYet2 = !(await visible(guest.page, "#battle-view"));
    check("★S2 いま見ているのは「もう一勝負の1問目がまだ画面に無い」場面", notYet2);
    const s2 = await header(guest.page);
    const hostCounter = await txt(host.page, "#battle-counter");
    await shot(guest.page, "S2_guest_retry_before_q1");
    await shot(host.page, "S2_host_retry_before_q1");
    check("★★S2 もう一勝負で、ゲストの点数が 0 / 0 に戻っている（依頼書の失敗3）",
      s2.me === "0" && s2.opp === "0", JSON.stringify(s2) + " ／ 前のラウンドは " + JSON.stringify(stale));
    check("★★S2 もう一勝負で、ゲストの「◯ / ◯」がこのラウンドのものになっている",
      s2.counter === hostCounter && /^1 \/ \d+$/.test(s2.counter),
      "guest=" + JSON.stringify(s2.counter) + " host=" + JSON.stringify(hostCounter));

    check("画面のエラーが 0（ホスト）", host.errs.length === 0, host.errs.join(" | "));
    check("画面のエラーが 0（ゲスト）", guest.errs.length === 0, guest.errs.join(" | "));
  } catch (e) {
    check("通しが最後まで走った", false, String((e && e.message) || e));
    await shot(host.page, "ERR_host"); await shot(guest.page, "ERR_guest");
  } finally {
    await host.ctx.close(); await guest.ctx.close();
  }
  return out;
}

function report(title, out) {
  console.log("\n── " + title + " ──");
  let ng = 0;
  for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.name + (c.extra ? " … " + c.extra : "")); if (!c.ok) ng++; }
  return ng;
}
const done = async (code) => { await browser.close(); server.close(); relay.close(); process.exit(code); };

// ================= 入口の自己テスト（本番の前に必ず走る・4-6）=================
console.log("■ 入口の自己テスト（この検査そのものが効いているか）");
let selfNg = 0;
const selfTests = [
  ["(a) 偽の実装: 点数だけ戻して問題数を戻さない", () => fakeNoCounter(CURRENT)],
  ["(b) 偽の実装: 問題数だけ戻して点数を戻さない", () => fakeNoScores(CURRENT)],
  ["(c) ★偽の実装: 再接続のときにも 0 に戻す", () => fakeResyncZero(CURRENT)],
  ["(d) 対照 " + BASE_COMMIT + "（直す前）", () => BASELINE]
];
for (let i = 0; i < selfTests.length; i++) {
  const [title, make] = selfTests[i];
  let src;
  try { src = make(); }
  catch (e) {
    console.log("\n── " + title + " ──\n  ✘ " + e.message);
    selfNg++; continue;
  }
  const ng = report(title + " … ★鳴るのが正しい", await run("self" + i, src));
  console.log(ng > 0 ? "  → ✔ 自己テスト合格（" + ng + " 件で鳴った）"
                     : "  → ✘ 自己テスト不合格（鳴るべきなのに鳴らない＝検査が効いていない）");
  if (ng === 0) selfNg++;
}
if (selfNg > 0) {
  console.log("\n★入口の自己テストが " + selfNg + " 件通らないので、本番の結果は出しません（数字を信じられないため）。");
  await done(3);
}

// ================= 本番 =================
console.log("\n■ (e) いまの index.html … ★鳴らないのが正しい");
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng === 0 ? 0 : 1);
