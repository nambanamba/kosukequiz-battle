// ★公開URLの2つの窓で、①（対戦の開始時に前回の点数と「◯ / ◯」が残る）が本当に直ったかを見る。
//
// 使い方: node tools/mikaku/round_reset_public_check.mjs
//
// ■ ★これは「関門（guard）」ではありません。配信のたびに1回だけ回す確認です。
//   ふだんの関門は `tools/mikaku/round_reset_probe.mjs`（まねごとの待ち合わせ先・自己テスト付き）。
//   ★こちらは **公開URL・本物の待ち合わせ先（relay）** を使うので、
//   「直した」と「届いた」が別だということを確かめる役（確認ポイント 0-4）。
//
// ⚠️★**続けて何回も回さないこと。**本物の relay に告知を出します。
//   2026-09-20 に一日で何十回も回して `relay.damus.io` に
//   `banned: too many rate-limit violations` を食らった実績があります（ROLE.md）。
//   ★必要なときに1回だけ。
//
// ■ ★まず「いま公開されているものが、見たい版か」を確かめてから測る
//   公開URLの index.html の sha256 が `origin/master` と一致しない状態で測ると、
//   古い版を見て「直っている／直っていない」と言うことになります（0-2）。
//   ★一致しなければ、測らずに終了コード2で止まります。
//
// ■ 見ていないもの（4-2）
//   - 実機（スマホ）と実回線。★1台のPCの中の2つの窓です（ROLE.md の meet_probe と同じ限界）
//   - 自己テスト（偽の実装を当てて鳴らす）は、こちらでは持ちません。
//     ★鳴ることの確認は round_reset_probe.mjs 側で済ませてから、こちらを回してください
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_roundreset");
fs.mkdirSync(SHOTS, { recursive: true });
const PUBLIC_URL = "https://nambanamba.github.io/kosukequiz-battle/index.html";
const Q_COUNT = 4;

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();
const sha = b => crypto.createHash("sha256").update(b).digest("hex");

// ---- ① 公開されているものが origin/master と同じか ----
const expected = execSync("git show origin/master:index.html", { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
const got = Buffer.from(await (await fetch(PUBLIC_URL, { cache: "no-store" })).arrayBuffer());
console.log("origin/master : " + expected.length + " bytes  " + sha(expected));
console.log("公開URL       : " + got.length + " bytes  " + sha(got));
if (sha(expected) !== sha(got)) {
  console.log("\n✘ 公開URLが origin/master と一致しません。★Pages のビルド待ちか、push できていません。測りません。");
  process.exit(2);
}
console.log("✔ ★バイト単位で一致。公開されているのは origin/master そのものです\n");

const browser = await chromium.launch({ channel: "chrome" });
let ng = 0;
const check = (name, ok, extra) => { console.log("  " + (ok ? "✔" : "✘") + " " + name + (extra ? " … " + extra : "")); if (!ok) ng++; };

const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await page.goto(PUBLIC_URL); await page.waitForTimeout(1200);
  await page.evaluate((n) => {
    const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
    localStorage.clear();
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
      subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: n,
      shuffle: false, filterUnmastered: false, filterWeak: false, fairMode: false,
      headStartSec: 12, answerTimeSec: 1, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600
    }));
  }, Q_COUNT);
  await page.reload(); await page.waitForTimeout(1400);
  return { ctx, page, errs };
};
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const txt = (pg, sel) => pg.$eval(sel, e => (e.textContent || "").trim());
const visible = (pg, sel) => pg.evaluate(s => {
  const e = document.querySelector(s);
  return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null);
}, sel);
const waitVisible = (pg, sel, ms) => pg.waitForFunction(s => {
  const e = document.querySelector(s);
  return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null);
}, sel, { timeout: ms || 40000 });
const waitBattle = (pg, ms) => pg.waitForFunction(
  () => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: ms || 40000 });
const header = async pg => ({
  counter: await txt(pg, "#battle-counter"), me: await txt(pg, "#score-me"), opp: await txt(pg, "#score-opp")
});

const host = await mk(), guest = await mk();
try {
  console.log("■ 本物の待ち合わせ先ごしに、2つの窓を出会わせます（★この試験は1回だけ回すこと）");
  const before = await header(guest.page);
  check("【下じき】開始前のゲストの画面は、HTML の作り置きのまま（1 / 10）", before.counter === "1 / 10", JSON.stringify(before));

  await tap(host.page, "#create-btn");
  await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 60000 });
  const code = await txt(host.page, "#room-code-display");
  console.log("  部屋のコード: " + code);
  await tap(guest.page, "#go-join");
  await guest.page.fill("#join-code-input", code);
  await tap(guest.page, "#join-btn");
  await waitVisible(host.page, "#start-together-btn", 120000);
  console.log("  ✔ 出会えました（本物の relay ごし）");
  await tap(host.page, "#start-together-btn");
  await tap(guest.page, "#join-start-together-btn");

  // ---- S1: はじめの対戦。1問目が出る前のゲストの画面 ----
  await waitBattle(guest.page, 60000);
  await waitVisible(guest.page, "#guest-wait-status", 30000);
  check("★S1 いま見ているのは「1問目がまだ画面に無い」場面", !(await visible(guest.page, "#battle-view")));
  const s1 = await header(guest.page);
  await guest.page.screenshot({ path: path.join(SHOTS, "public_S1_guest.png"), fullPage: true }).catch(() => {});
  check("★S1 ゲストの「◯ / ◯」がこの対戦のもの（1 / " + Q_COUNT + "）", s1.counter === "1 / " + Q_COUNT, JSON.stringify(s1));
  check("★S1 ゲストの点数が 0 / 0", s1.me === "0" && s1.opp === "0", JSON.stringify(s1));

  // ---- 4問を通す。2問目だけ おたがい ✕（もう一勝負を出すため）----
  const judge = async (hostOk, guestOk) => {
    await waitVisible(host.page, "#judge-row", 60000);
    await waitVisible(guest.page, "#judge-row", 60000);
    await tap(host.page, hostOk ? "#judge-ok" : "#judge-ng");
    await tap(guest.page, guestOk ? "#judge-ok" : "#judge-ng");
    await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 40000 });
  };
  for (let i = 1; i <= Q_COUNT; i++) {
    await waitVisible(host.page, "#advance-btn", 60000);
    await tap(host.page, "#advance-btn");
    await judge(i !== 2, i !== 2);
    await tap(host.page, "#next-btn");
  }

  // ---- S2: ★「まちがえた問題だけもう一勝負」。ここが依頼書の失敗3 ----
  await guest.page.waitForFunction(
    () => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 60000 });
  const stale = await header(guest.page);
  check("【下じき】結果画面では、ゲストの画面に前のラウンドの数字が残っている",
    stale.me !== "0" && stale.counter === Q_COUNT + " / " + Q_COUNT, JSON.stringify(stale));
  await waitVisible(host.page, "#result-retry-battle-btn", 40000);
  await tap(host.page, "#result-retry-battle-btn").catch(() => {});
  await waitBattle(guest.page, 60000);
  await waitVisible(guest.page, "#guest-wait-status", 40000);
  check("★S2 いま見ているのは「もう一勝負の1問目がまだ画面に無い」場面", !(await visible(guest.page, "#battle-view")));
  const s2 = await header(guest.page);
  const hostCounter = await txt(host.page, "#battle-counter");
  await guest.page.screenshot({ path: path.join(SHOTS, "public_S2_guest.png"), fullPage: true }).catch(() => {});
  await host.page.screenshot({ path: path.join(SHOTS, "public_S2_host.png"), fullPage: true }).catch(() => {});
  check("★★S2 もう一勝負で、ゲストの点数が 0 / 0 に戻っている",
    s2.me === "0" && s2.opp === "0", JSON.stringify(s2) + " ／ 前のラウンドは " + JSON.stringify(stale));
  check("★★S2 もう一勝負で、ゲストの「◯ / ◯」がこのラウンドのもの（ホストと同じ）",
    s2.counter === hostCounter && /^1 \/ \d+$/.test(s2.counter),
    "guest=" + JSON.stringify(s2.counter) + " host=" + JSON.stringify(hostCounter));

  check("画面のエラーが 0（ホスト）", host.errs.length === 0, host.errs.join(" | "));
  check("画面のエラーが 0（ゲスト）", guest.errs.length === 0, guest.errs.join(" | "));
} catch (e) {
  check("通しが最後まで走った", false, String((e && e.message) || e));
  await host.page.screenshot({ path: path.join(SHOTS, "public_ERR_host.png"), fullPage: true }).catch(() => {});
  await guest.page.screenshot({ path: path.join(SHOTS, "public_ERR_guest.png"), fullPage: true }).catch(() => {});
} finally {
  await host.ctx.close(); await guest.ctx.close(); await browser.close();
}
console.log(ng === 0 ? "\n✔ 公開URLの2つの窓で、全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
console.log("画面の写真: " + SHOTS);
process.exit(ng === 0 ? 0 : 1);
