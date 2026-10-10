// ★★ゲストの「つぎの問題の準備中…」の画面に、**1つ前の問題の残りかす**が出ていないかを見る。
//
// 使い方: node tools/mikaku/wait_screen_stale_probe.mjs
//
// ■ なぜ要るか（2026-09-26）
//   ①（対戦の開始時に前回の点数と「◯ / ◯」が残る）を公開URLで確かめたとき、
//   その写真に **1つ前の問題の単元名と No. が写っていました**（担当が気づいて司令塔に報告）。
//   ユーザー判断: 「直す」。
//   ★**点数と「◯ / ◯」と、まったく同じ型の残りかすです。**
//   根っこも同じで、**battle-counter / .score-row / 単元名・No.・出典 は
//   `battle-view` の「外」にあるため、battle-view を隠しても消えない**こと。
//
// ■ ★名指しされた3つだけを見ていません（確認ポイント D-14）
//   `battle-view` より前にある id を全部洗い出して、1つずつ当たりました。
//   その結果、**4つ目の残りかす**が見つかりました:
//     ★アバターの進化（絵と Lv.）が、前のラウンドのまま残る。
//     resetAvatars() は startBattleNow / startMissRetryRound / startAction / 再開 でしか
//     呼ばれておらず、ゲストが statusAction の道で対戦画面に入ると通らないため。
//   battle-img-wrap（図）は showGuestWaitStatus() が元から隠していました（無事）。
//
// ■ ★入口の自己テスト（4-6）。本番の前に必ず走り、外れたら本番の数字を出さずに終わる
//   (a) 単元名・No.・出典を消さない偽の実装        … ★鳴るのが正しい
//   (b) ★消したまま戻さない偽の実装（消しすぎ）    … ★鳴るのが正しい（失敗3）
//   (c) ★アバターを戻さない偽の実装                … ★鳴るのが正しい
//   (d) 対照 BASE_COMMIT（Bを入れる前）            … ★鳴るのが正しい（4-6c）
//   そして本番 (e) いまの index.html               … ★鳴らないのが正しい（4-3）
//   ★偽の実装は**出荷される index.html から組み立てる**（写しを持たない・4-6d）。
//
// ■ ★対照は 4abef23（②を入れたあと）。e1d1167 ではありません
//   e1d1167 を対照にすると、②の変更も一緒に鳴ってしまい、
//   「Bが効いているか」を見られなくなります（4-6c: 対照はコミットで固定する）。
//
// ■ ★見ていないもの（4-2）
//   - 実機・実回線（ここは まねごとの待ち合わせ先で、1台のPCの中の2つの画面）
//   - ホスト側。★showGuestWaitStatus() は role !== "guest" で早く返るため、ホストは通らない
// ★★2026-10-10 追記（二人の新しい流れ）: ゲストの「つぎの問題の準備中…」待ち画面は二人では無くなった
//   （status thinking はもう送らない・問題は両方に同時に出る）。そこで「残りかす」の確認を次に変えた:
//   ①③ 問題が着いた／変わったとき、ゲストの単元名・No.・出典がホストの今の問題と同じ（1つ前のものが残らない）
//   ③b スキップのあと（showGuestWaitStatus は今も通る）は引っこめ、次の問題で戻る（消したまま戻さない側）
//   ④ 次のラウンドの1問目で、ゲストのアバターの進化と単元名・No.・出典が前のラウンドのままではない
//   「もう一勝負」は 2026-10-06 から出ない（ce0ce6f でも同じ）ので、ホストが作り直す次のラウンドで確かめる。
//   偽の実装(c)は startAction のアバター初期化を外すものに替えた（(a)(b) はそのまま showGuestWaitStatus の道に当たる）。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_waitstale");
fs.mkdirSync(SHOTS, { recursive: true });

// ★対照はコミットで固定（4-6c）。★②を入れたあとの版にすること
const BASE_COMMIT = "4abef23";

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();

const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// ---- 偽の実装（★出荷される index.html から組み立てる・4-6d）----
function cut(src, needle, replacement, what) {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error("偽の実装を作れません（" + what + " が " + n + " 件。1件でないと壊し損ねます）");
  return src.replace(needle, replacement);
}
const CLEAR_TAGS =
  '  ["battle-unit-tag", "battle-q-id", "battle-source-tag"].forEach(k => {\n' +
  '    els[k].textContent = "";\n' +
  '    els[k].style.display = "none";\n' +
  '  });\n';
const RESTORE_TAGS =
  '  ["battle-unit-tag", "battle-q-id", "battle-source-tag"].forEach(k => {\n' +
  '    els[k].style.display = "";\n' +
  '  });\n';
const RESET_AVATARS = "    resetAvatars();\n    setupAvatarLabels();\n";
// (a) 待ち画面で消さない
const fakeNoClear = src => cut(src, CLEAR_TAGS, "  /* ★偽の実装: わざと消さない */\n", "待ち画面で消すところ");
// (b) ★消したまま戻さない（消しすぎ・失敗3）
const fakeNoRestore = src => cut(src, RESTORE_TAGS, "  /* ★偽の実装: わざと戻さない */\n", "問題を出すとき戻すところ");
// (c) ★アバターを戻さない
const fakeNoAvatar = src => cut(src, RESET_AVATARS, "    setupAvatarLabels();\n", "アバターを戻すところ（startAction）");

const relay = await startFakeRelay({ broadcast: true, label: "waitstale" });
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

const Q_COUNT = 4;
const HEAD_START_SEC = 12;   // ★「1問目がまだ画面に無い」窓。短いと見る前に過ぎる

async function run(label, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => { out.push({ name: name, ok: !!ok, extra: extra == null ? "" : String(extra) }); };
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});

  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    await page.goto(PAGE_URL); await page.waitForTimeout(600);
    await page.evaluate((a) => {
      // ★出典（note）のある問題が入る単元を選ぶ。出典が空だと「消えたか」を測れない
      const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img && q.note).u;
      localStorage.clear();
      localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
        subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: a.n,
        shuffle: false, filterUnmastered: false, filterWeak: false, fairMode: false,
        headStartSec: a.hs, answerTimeSec: 1, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600
      }));
    }, { n: Q_COUNT, hs: HEAD_START_SEC });
    await page.reload(); await page.waitForTimeout(700);
    return { ctx, page, errs };
  };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVisible = (pg, sel, ms) => pg.waitForFunction(s => {
    const e = document.querySelector(s);
    return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null);
  }, sel, { timeout: ms || 30000 });
  const waitBattle = (pg, ms) => pg.waitForFunction(
    () => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: ms || 30000 });
  // ★「文字が入っているか」ではなく「★画面に見えているか」で測る（確認ポイント 4-3c）
  const tags = pg => pg.evaluate(() => {
    const read = id => {
      const e = document.getElementById(id);
      const shown = !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null);
      return { shown: shown, text: shown ? (e.textContent || "").trim() : "" };
    };
    const av = id => (document.getElementById(id).textContent || "").trim();
    return {
      unit: read("battle-unit-tag"), qid: read("battle-q-id"), src: read("battle-source-tag"),
      hostAvatar: av("host-avatar"), hostLevel: av("host-avatar-level"),
      guestAvatar: av("guest-avatar"), guestLevel: av("guest-avatar-level")
    };
  });

  const host = await mk(), guest = await mk();
  try {
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join");
    await guest.page.fill("#join-code-input", code);
    await tap(guest.page, "#join-btn");
    await waitVisible(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn");
    await tap(guest.page, "#join-start-together-btn");
    await waitBattle(guest.page, 40000);
    // ★2026-10-10: 二人では「準備中」の待ち画面は出ない。1問目は両方に同時に出る
    const waitQ = (pg, prev) => pg.waitForFunction(q => {
      const v = document.getElementById("battle-view"), e = document.getElementById("battle-q-id");
      return !!(v && getComputedStyle(v).display !== "none" && e && /^No\./.test(e.textContent) && e.textContent !== q);
    }, prev || "", { timeout: 30000 });
    const sameTags = (g, h) => g.unit.text === h.unit.text && g.qid.text === h.qid.text && g.src.text === h.src.text;
    const judgeOk = async () => {
      await waitVisible(guest.page, "#judge-row", 30000);
      await tap(guest.page, "#judge-ok");
      await host.page.waitForFunction(
        () => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
    };
    const resultActive = () => guest.page.evaluate(() => document.getElementById("screen-result").classList.contains("active"));
    // ===== ① はじめの対戦。1問目が着いたとき、ゲストの単元名・No.・出典がホストと同じ =====
    await waitQ(guest.page, "");
    const t0 = await tags(guest.page), h0 = await tags(host.page);
    check("★① 1問目: ゲストに単元名・No.・出典が出ていて、ホストと同じ",
      t0.unit.shown && t0.qid.shown && t0.src.shown && t0.src.text.length > 0 && sameTags(t0, h0), JSON.stringify(t0) + " / " + JSON.stringify(h0));
    const initAvatar = { host: t0.hostAvatar, guest: t0.guestAvatar };
    await judgeOk();
    // ===== ② 問題が出ているときは、ちゃんと出ている（消しすぎていない・失敗3）=====
    const t1 = await tags(guest.page);
    const hostTags = await tags(host.page);
    await shot(guest.page, "2_guest_question");
    check("★② 判定のあとも、単元名が出ている", t1.unit.shown && t1.unit.text.length > 0, JSON.stringify(t1.unit));
    check("★② 判定のあとも、No. が出ている", t1.qid.shown && /^No\./.test(t1.qid.text), JSON.stringify(t1.qid));
    check("★② 判定のあとも、出典が出ている", t1.src.shown && t1.src.text.length > 0, JSON.stringify(t1.src));
    check("★② ホストとゲストで、単元名・No.・出典が同じ", sameTags(t1, hostTags), JSON.stringify(t1) + " / " + JSON.stringify(hostTags));
    // ===== ③ 問題が変わったとき。★1つ前の問題のものが残らず、新しい問題のものに替わっている =====
    await tap(host.page, "#next-btn");
    await waitQ(guest.page, t1.qid.text);
    const t2 = await tags(guest.page), h2 = await tags(host.page);
    await shot(guest.page, "3_guest_next_q");
    check("★★③ 問題が変わったとき、ゲストの No. が1つ前のものではない", t2.qid.shown && t2.qid.text !== t1.qid.text, JSON.stringify(t2.qid) + " ／ 1つ前は " + JSON.stringify(t1.qid.text));
    check("★★③ 問題が変わったとき、ゲストの単元名・No.・出典がホストの新しい問題と同じ（残りかすなし）",
      t2.unit.shown && t2.src.shown && sameTags(t2, h2), JSON.stringify(t2) + " / " + JSON.stringify(h2));
    check("★★③ ゲストに「準備中」の待ち画面は出ない（二人では無い）",
      !(await guest.page.evaluate(() => { const e = document.getElementById("guest-wait-status"); return !!(e && getComputedStyle(e).display !== "none" && e.classList.contains("show") && /準備中/.test(e.textContent)); })));
    // ===== ③b スキップ。★ゲストは「相手がこの問題をスキップしました」になり、この問題の単元名・No.・出典を引っこめる =====
    await waitVisible(host.page, "#skip-btn", 20000);
    await tap(host.page, "#skip-btn");
    await waitVisible(guest.page, "#guest-wait-status", 20000);
    const t3 = await tags(guest.page);
    await shot(guest.page, "3b_guest_skipped");
    check("★★③b スキップのあと、ゲストに単元名が残っていない", !t3.unit.shown, JSON.stringify(t3.unit));
    check("★★③b スキップのあと、ゲストに No. が残っていない", !t3.qid.shown, JSON.stringify(t3.qid));
    check("★★③b スキップのあと、ゲストに出典が残っていない", !t3.src.shown, JSON.stringify(t3.src));
    await waitVisible(host.page, "#skip-continue-btn", 20000);
    await tap(host.page, "#skip-continue-btn");
    await waitQ(guest.page, "");
    await guest.page.waitForTimeout(300);
    const t4 = await tags(guest.page), h4 = await tags(host.page);
    check("★★③b スキップのあと次の問題が出たら、単元名・No.・出典が戻りホストと同じ（消したまま戻さない側・失敗3）",
      t4.unit.shown && t4.qid.shown && t4.src.shown && sameTags(t4, h4), JSON.stringify(t4) + " / " + JSON.stringify(h4));
    // ===== 残りを流して、結果画面まで（親は全部〇）=====
    for (let i = 0; i < 14; i++) {
      if (await resultActive()) break;
      await waitVisible(guest.page, "#judge-row", 30000).catch(() => {});
      if (await resultActive()) break;
      await judgeOk();
      await tap(host.page, "#next-btn");
      await host.page.waitForTimeout(300);
    }
    await guest.page.waitForFunction(
      () => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 30000 });
    // ===== ④ 次のラウンド。★アバターの進化・単元名・No.・出典が前のラウンドのまま残っていないか =====
    const stale = await tags(guest.page);
    check("【下じき】前のラウンドで、ゲストの画面のアバターが育っている（これが次で戻るべきもの）",
      stale.hostAvatar !== initAvatar.host || stale.hostLevel !== "" || stale.guestAvatar !== initAvatar.guest,
      "host=" + stale.hostAvatar + stale.hostLevel + " guest=" + stale.guestAvatar + stale.guestLevel + " ／ はじめは " + JSON.stringify(initAvatar));
    // ★「まちがえた問題だけもう一勝負」は 2026-10-06 から出ない（ce0ce6f でも同じ）。かわりに、ホストが作り直す次のラウンド
    await tap(host.page, "#result-home-btn"); await host.page.waitForTimeout(400);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    await waitVisible(host.page, "#start-together-btn", 30000);
    await tap(host.page, "#start-together-btn");
    await host.page.waitForTimeout(1500);
    if (await guest.page.evaluate(() => { const e = document.getElementById("result-home-btn"); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); })) { await tap(guest.page, "#result-home-btn"); await guest.page.waitForTimeout(1500); }
    await waitVisible(guest.page, "#join-start-together-btn", 20000);
    await tap(guest.page, "#join-start-together-btn");
    await waitBattle(guest.page, 40000);
    await waitQ(guest.page, "");
    const t5 = await tags(guest.page), h5 = await tags(host.page);
    await shot(guest.page, "4_guest_next_round");
    check("★★④ 次のラウンドの1問目: ゲストの単元名・No.・出典がホストと同じ（前のラウンドのものではない）",
      t5.unit.shown && t5.qid.shown && t5.src.shown && sameTags(t5, h5), JSON.stringify(t5) + " / " + JSON.stringify(h5));
    check("★★④ ★アバターが前のラウンドのまま残っていない（名指しの3つ以外の残りかす）",
      t5.hostAvatar === initAvatar.host && t5.guestAvatar === initAvatar.guest && t5.hostLevel === "" && t5.guestLevel === "",
      "host=" + t5.hostAvatar + t5.hostLevel + " guest=" + t5.guestAvatar + t5.guestLevel
        + " ／ 前のラウンドは host=" + stale.hostAvatar + stale.hostLevel + " guest=" + stale.guestAvatar + stale.guestLevel);
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

console.log("■ 入口の自己テスト（この検査そのものが効いているか）");
let selfNg = 0;
const selfTests = [
  ["(a) 偽の実装: 待ち画面で消さない", () => fakeNoClear(CURRENT)],
  ["(b) ★偽の実装: 消したまま戻さない（消しすぎ）", () => fakeNoRestore(CURRENT)],
  ["(c) ★偽の実装: アバターを戻さない", () => fakeNoAvatar(CURRENT)],
  ["(d) 対照 " + BASE_COMMIT + "（Bを入れる前）", () => BASELINE]
];
for (let i = 0; i < selfTests.length; i++) {
  const [title, make] = selfTests[i];
  let src;
  try { src = make(); }
  catch (e) { console.log("\n── " + title + " ──\n  ✘ " + e.message); selfNg++; continue; }
  const ng = report(title + " … ★鳴るのが正しい", await run("self" + i, src));
  console.log(ng > 0 ? "  → ✔ 自己テスト合格（" + ng + " 件で鳴った）"
                     : "  → ✘ 自己テスト不合格（鳴るべきなのに鳴らない＝検査が効いていない）");
  if (ng === 0) selfNg++;
}
if (selfNg > 0) {
  console.log("\n★入口の自己テストが " + selfNg + " 件通らないので、本番の結果は出しません。");
  await done(3);
}

console.log("\n■ (e) いまの index.html … ★鳴らないのが正しい");
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng === 0 ? 0 : 1);
