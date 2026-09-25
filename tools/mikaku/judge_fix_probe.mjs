// ★★ゲストが「一個前の判定」を直したとき、**ホストの端末の記録が本当に変わるか**を見る。
//
// 使い方: node tools/mikaku/judge_fix_probe.mjs
//
// ■ なぜ要るか（2026-09-25 ユーザー依頼）
//   ユーザー「ゲストがホストを直すだけでいいんですが、一個前の正誤を直せるようにしたいです。
//             いつまでも子供が答えなくて、時間切れで正解になっちゃうのを直したいです」
//   依頼書の失敗条件 1・2 が、この検査の本体:
//     1. 直したのに、ホストの記録が変わらない（画面だけ変わる）
//     2. 二重に記録される（前の判定が打ち消されず correct/wrong/box が2回動く）
//
// ■ ★スタブではない（確認ポイント 4-1）
//   `battle_buttons_probe` など既存の「2人ぶん」の検査は通信を node のスタブに差し替えていて、
//   **待ち合わせを一度も試していなかった**（2026-09-20 の実例。このアプリのもの）。
//   ここは **本物の Chrome を2つ開き、まねごとの待ち合わせ先ごしに実際に出会わせて**、
//   片方で直したら **もう片方の localStorage の記録が変わる**ところまで見る。
//
// ■ ★入口の自己テスト3つ（4-6）。本番の前に必ず走り、外れたら本番の数字を出さずに終わる
//   (a) 偽の実装（打ち消しを外した index.html）で **鳴る**
//   (b) いまの index.html で **鳴らない**
//   (c) 対照（直す前のコミット BASE_COMMIT で固定）で **鳴る**
//
// ■ ★見ていないもの（4-2）
//   - 本物の relay（ここは まねごと）。実機・実回線での見え方は B-12 で別に見る
//   - ホストが読み込み直して「再開」したあとの直し（★仕様として直せない。ゲストに理由が出る）
//   - 「まちがえた問題だけもう一勝負」の中身（リストの出入りはコードで足したが、ここでは通していない）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_judgefix");
fs.mkdirSync(SHOTS, { recursive: true });

// ★対照はコミットで固定する（HEAD にすると、直したものを commit した瞬間に対照でなくなる）
const BASE_COMMIT = "00d573b";

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();

const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// ---- 偽の実装: ★打ち消しを外す（＝前の判定が残ったまま、もう1回記録される）----
const UNDO_LINES = "  if(r.statBefore === null) delete stats[r.qid];\n  else stats[r.qid] = JSON.parse(r.statBefore);";
function fakeNoUndo(src) {
  if (src.indexOf(UNDO_LINES) < 0) throw new Error("偽の実装を作れません（打ち消しの2行が見つかりません）");
  return src.replace(UNDO_LINES, "  /* ★偽の実装: わざと打ち消さない */");
}

const relay = await startFakeRelay({ broadcast: true, label: "judgefix" });
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
let SERVED = CURRENT;           // いま配っている index.html（変種ごとに差し替える）
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

// ---- 1回ぶんの通し（部屋を作る→入る→1問目を時間切れで自動「せいかい」→直す→直し戻す）----
const JUDGE_SEC = 3;
async function run(label, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => { out.push({ name: name, ok: !!ok, extra: extra || "" }); };
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});

  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });   // ★390px で見る
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    await page.goto(PAGE_URL); await page.waitForTimeout(600);
    await page.evaluate((sec) => {
      const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
      localStorage.clear();
      localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
        subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: 3,
        shuffle: false, filterUnmastered: false, filterWeak: false, fairMode: false,
        headStartSec: 1, answerTimeSec: 1, judgeTimeSec: sec,
        nextTimeSec: 600, skipNextTimeSec: 600
      }));
    }, JUDGE_SEC);
    await page.reload(); await page.waitForTimeout(700);
    return { ctx: ctx, page: page, errs: errs };
  };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const visible = (pg, sel) => pg.evaluate(s => {
    const e = document.querySelector(s);
    return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null);
  }, sel);
  const statsOf = pg => pg.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"));
  const qidOf = pg => pg.$eval("#battle-q-id", e => (e.textContent || "").replace(/^No\./, ""));

  const host = await mk(), guest = await mk();
  try {
    // --- 出会う ---
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join");
    await guest.page.fill("#join-code-input", code);
    await tap(guest.page, "#join-btn");
    await host.page.waitForFunction(() => {
      const e = document.getElementById("start-together-btn");
      return e && getComputedStyle(e).display !== "none";
    }, null, { timeout: 60000 });
    await tap(host.page, "#start-together-btn");
    await tap(guest.page, "#join-start-together-btn");

    // --- 1問目。ホストが「わかった！」を押して、二人の答え合わせに入る ---
    await host.page.waitForSelector("#advance-btn", { state: "visible", timeout: 20000 });
    await tap(host.page, "#advance-btn");
    await host.page.waitForFunction(() => /^No\..+/.test(document.getElementById("battle-q-id").textContent), null, { timeout: 20000 });
    const qid0 = await qidOf(host.page);

    // --- ★判定を押さずに待つ。時間切れの自動「せいかい」が出るはず（依頼書の失敗4の見張り）---
    await host.page.waitForTimeout((JUDGE_SEC + 4) * 1000);
    const autoPressed = await guest.page.$eval("#judge-ok", e => e.classList.contains("auto-press")).catch(() => false);
    check("★時間切れの自動「せいかい」が、そのまま残っている", autoPressed);

    const s1 = await statsOf(host.page);
    check("時間切れのあと、ホストの記録が「正解」で入っている（" + qid0 + "）",
      !!s1[qid0] && s1[qid0].correct === 1 && !(s1[qid0].wrong > 0) && s1[qid0].box === 1,
      JSON.stringify(s1[qid0] || null));
    const score1 = await host.page.$eval("#score-me", e => e.textContent);
    check("ホストの得点が 1 になっている", score1 === "1", "score-me=" + score1);

    // --- ホスト側には直す導線が無いこと（依頼書の失敗7）---
    check("★ホストの画面には「直す」導線が出ていない", !(await visible(host.page, "#judge-fix-row")));
    check("ゲストの画面には「直す」導線が出ている", await visible(guest.page, "#judge-fix-row"));
    await shot(guest.page, "1_guest_judged");

    // --- つぎの問題へ進む（＝ここから「一個前」になる）---
    await tap(host.page, "#next-btn");
    await host.page.waitForFunction(id => document.getElementById("battle-q-id").textContent !== "No." + id, qid0, { timeout: 20000 });
    const qid1 = await qidOf(host.page);
    check("2問目に進んだ（1問目とは別の問題）", !!qid1 && qid1 !== qid0, qid0 + " → " + qid1);
    check("★2問目に進んでも、ゲストの「直す」導線は残っている", await visible(guest.page, "#judge-fix-row"));
    await shot(guest.page, "2_guest_next");

    // --- ★ここが本番。ゲストが「一個前」を ✕ に直す ---
    await tap(guest.page, "#judge-fix-btn");
    await guest.page.waitForFunction(() => {
      const e = document.getElementById("judge-fix-status");
      return e && getComputedStyle(e).display !== "none" && !/送っています/.test(e.textContent);
    }, null, { timeout: 15000 }).catch(() => {});
    const fixMsg = await guest.page.$eval("#judge-fix-status", e => e.textContent).catch(() => "（出ませんでした）");
    check("ゲストに「直しました」と出た", /直しました/.test(fixMsg), fixMsg);
    await guest.page.waitForTimeout(700);

    const s2 = await statsOf(host.page);
    const a = s2[qid0] || {};
    // ★ここが依頼書の失敗2。打ち消していないと correct:1 と wrong:1 が**両方**残る
    check("★★ホストの記録が「まちがい」に変わった（id で照合: " + qid0 + "）",
      a.wrong === 1 && !(a.correct > 0) && !(a.box > 0), JSON.stringify(s2[qid0] || null));
    check("★二重に記録されていない（correct と wrong が両方立っていない）",
      !((a.correct > 0) && (a.wrong > 0)), JSON.stringify(s2[qid0] || null));
    const score2 = await host.page.$eval("#score-me", e => e.textContent);
    check("ホストの得点が 0 に戻った", score2 === "0", "score-me=" + score2);
    const gScore2 = await guest.page.$eval("#score-opp", e => e.textContent);
    check("ゲストの画面の「相手の得点」も 0 になった", gScore2 === "0", "score-opp=" + gScore2);
    check("★いま出ている2問目の記録は動いていない", !s2[qid1], JSON.stringify(s2[qid1] || null));
    await shot(guest.page, "3_guest_fixed");
    await shot(host.page, "3_host_fixed");

    // --- もう一度押して 〇 に戻す（押しまちがえても戻せること／積み上がらないこと）---
    await tap(guest.page, "#judge-fix-btn");
    await guest.page.waitForTimeout(2000);
    const s3 = await statsOf(host.page);
    const b = s3[qid0] || {};
    check("★もう一度押すと 〇 に戻る（数字が積み上がらない）",
      b.correct === 1 && !(b.wrong > 0) && b.box === 1, JSON.stringify(s3[qid0] || null));
    const score3 = await host.page.$eval("#score-me", e => e.textContent);
    check("ホストの得点も 1 に戻った", score3 === "1", "score-me=" + score3);

    // --- ゲスト自身の記録（＝ホストが下した判定）は動いていないこと（鳴りすぎない側）---
    const gs = await statsOf(guest.page);
    check("★ゲスト自身の記録は、この直しでは動かない",
      !!gs[qid0] && gs[qid0].correct === 1 && !(gs[qid0].wrong > 0), JSON.stringify(gs[qid0] || null));

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

// ================= 入口の自己テスト（本番の前に必ず走る） =================
console.log("■ 入口の自己テスト（この検査そのものが効いているか）");
let selfNg = 0;
{
  const ng = report("(a) 偽の実装（打ち消しを外した）… ★鳴るのが正しい", await run("a_fake", fakeNoUndo(CURRENT)));
  console.log(ng > 0 ? "  → ✔ 自己テスト(a) 合格（" + ng + " 件で鳴った）"
                     : "  → ✘ 自己テスト(a) 不合格（偽の実装なのに鳴らない＝検査が効いていない）");
  if (ng === 0) selfNg++;
}
{
  const ng = report("(c) 対照 " + BASE_COMMIT + "（直す前）… ★鳴るのが正しい", await run("c_base", BASELINE));
  console.log(ng > 0 ? "  → ✔ 自己テスト(c) 合格（" + ng + " 件で鳴った）"
                     : "  → ✘ 自己テスト(c) 不合格（直す前なのに鳴らない）");
  if (ng === 0) selfNg++;
}
if (selfNg > 0) {
  console.log("\n★入口の自己テストが通らないので、本番の結果は出しません（数字を信じられないため）。");
  await done(3);
}

// ================= 本番 =================
console.log("\n■ (b) いまの index.html … ★鳴らないのが正しい");
const ng = report("いまの index.html", await run("b_now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng === 0 ? 0 : 1);
