// 理科の大問: 答え合わせが終わった前の小問を1行にたたむ／各小問に「図を見る」／ゲストの「やっぱり直す」を小さく離す（2026-10-02）
// 本物の Chrome・390x844。数は決め打ちしない（DAIMON_DATA から条件で選ぶ）。スクショは tools/mikaku/shots_fig1002/（コミットしない）
// 見ること:
//   F1 (solo) 1問目の小問にはたたんだ行が0／k問目は「いまより前の小問の数」だけ .daimon-fold があり、先頭の行に〇が出る
//   F2 (solo) たたんだ行の中身は初めは見えない／押すと見える（aria-expanded）／もう一度押すとたたまる
//   F3 (solo) 「図を見る」→ lightbox が開き、画像は大問の図。閉じると戻る
//   F4 (solo) いまの小問の見出しが、大問の図の下 40px*たたんだ行数+40px 以内にある（図と問題が遠くならない）
//   F5 (battle) ホストにもゲストにも たたんだ行・図を見るが出る
//   F6 (battle guest) 「やっぱり…直す」は判定ボタンの下端から 120px 以上はなれ、高さ 32px 以下・文字 12px 以下。機能は残る
// 2026-10-10 追記: 二人の流れを新しくした（ホストの「わかった！」・ホストの〇✕を押す所を消した。ゲストの〇だけでホストの答えが開く）。F5・F6 の中身は同じ
// 自己テスト: 直す前（4363c8a）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_fig1002"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "4363c8a";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "figfold" });
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
let SERVED = CURRENT;
function withFakeRelay(src) {
  const i0 = src.indexOf("const RELAY_URLS = ["), i1 = src.indexOf("];", i0);
  if (i0 < 0 || i1 < 0) throw new Error("RELAY_URLS が見つかりません");
  return src.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + src.slice(i1);
}
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(withFakeRelay(SERVED), "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };

// 仕込み: 大問の図があり・小問に図/aFile が無い大問を1つ選び、その小問だけが「答える」状態。ほかの理科は全部おぼえ済み
const SEED = (mig) => {
  const now = Date.now();
  const g = DAIMON_DATA.find(g => !g.paper && g.file && g.items.length >= 3 && g.items.length <= 6 && !g.items.some(it => it.file || it.aFile));
  if (!g) return { err: "条件に合う大問がありません" };
  const units = [...new Set(QA_DATA.filter(d => d.subj === "理科").map(d => d.u))];
  const known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 };
  const st = {};
  QA_DATA.forEach(d => { if (d.subj === "理科" && d.kind !== "daimon") st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => { if (h !== g) h.items.forEach(it => { st[it.id] = Object.assign({}, known); }); });
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
    subject: "理科", unitsBySubject: { "理科": units }, units: units, count: g.items.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, reviewAllUnits: true,
    headStartSec: 1, answerTimeSec: 1, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600
  }));
  return { key: g.key, ids: g.items.map(i => i.id), file: g.file, n: g.items.length };
};

async function run(label, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
    await page.goto(PAGE_URL); await page.waitForTimeout(500);
    return { ctx, page, errs };
  };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const host = await mk(), guest = await mk(), solo = await mk();
  let S = null;
  try {
    // ================= 一人 =================
    S = await solo.page.evaluate(SEED, MIG);
    if (S.err) throw new Error(S.err);
    await solo.page.reload(); await solo.page.waitForTimeout(800);
    await tap(solo.page, "#solo-start-btn"); await solo.page.waitForTimeout(300);
    for (let k = 0; k < S.n; k++) {
      await waitVis(solo.page, "#solo-reveal-btn", 15000);
      const m = await solo.page.evaluate(() => {
        const box = document.getElementById("solo-daimon");
        const folds = [...box.querySelectorAll(".daimon-fold")];
        const cur = box.querySelector(".battle-daimon-cur");
        const bigfig = box.querySelector(":scope > .daimon-fig img");
        const body = folds[0] && folds[0].querySelector(".battle-daimon-prev");
        return { folds: folds.length, head: folds[0] ? folds[0].querySelector(".daimon-fold-head").textContent : "",
          bodyVisible: !!(body && body.offsetParent !== null),
          gap: cur && bigfig ? cur.getBoundingClientRect().top - bigfig.getBoundingClientRect().bottom : null,
          figBtn: !!document.querySelector("#solo-daimon .daimon-fig-btn") };
      });
      if (k === 0) check("F1 solo 1問目: たたんだ行は0", m.folds === 0, m.folds);
      if (k >= 1) {
        check("F1 solo " + (k + 1) + "問目: たたんだ行が前の小問の数（" + k + "）", m.folds === k, m.folds);
        if (k === 1) check("F1 solo 先頭の行に〇が出る", /〇/.test(m.head), m.head);
        check("F2 solo 初めは中身が見えない", !m.bodyVisible);
        check("F4 solo いまの小問が図のすぐ下（隙間 " + Math.round(m.gap) + "px ≤ " + (40 * k + 40) + "）", m.gap != null && m.gap <= 40 * k + 40, m.gap);
      }
      check("F3 solo 「図を見る」ボタンがある（" + (k + 1) + "問目）", m.figBtn);
      if (k === 1) {
        await tap(solo.page, "#solo-daimon .daimon-fold-head");
        const o = await solo.page.evaluate(() => { const f = document.querySelector("#solo-daimon .daimon-fold"); const b = f.querySelector(".battle-daimon-prev"); return { open: b.offsetParent !== null, exp: f.querySelector(".daimon-fold-head").getAttribute("aria-expanded") }; });
        check("F2 solo 押すと開く", o.open && o.exp === "true", JSON.stringify(o));
        await shot(solo.page, "solo_open");
        await tap(solo.page, "#solo-daimon .daimon-fold-head");
        check("F2 solo もう一度押すとたたまる", !(await solo.page.evaluate(() => document.querySelector("#solo-daimon .daimon-fold .battle-daimon-prev").offsetParent !== null)));
        await tap(solo.page, "#solo-daimon .daimon-fig-btn"); await solo.page.waitForTimeout(200);
        const lb = await solo.page.evaluate(() => ({ show: document.getElementById("lightbox-overlay").classList.contains("show"), src: document.getElementById("lightbox-img").getAttribute("src") }));
        check("F3 solo 図を見る→画面いっぱいに開く・大問の図", lb.show && lb.src.endsWith("images/" + S.file), JSON.stringify(lb));
        await shot(solo.page, "solo_lightbox");
        await tap(solo.page, "#lightbox-close"); await solo.page.waitForTimeout(200);
        check("F3 solo 閉じると戻る", !(await solo.page.evaluate(() => document.getElementById("lightbox-overlay").classList.contains("show"))));
        await shot(solo.page, "solo_item2");
      }
      await tap(solo.page, "#solo-reveal-btn"); await solo.page.waitForTimeout(80);
      await waitVis(solo.page, "#solo-judge-ok", 5000);
      await tap(solo.page, "#solo-judge-ok"); await solo.page.waitForTimeout(250);
    }
    // ================= 二人 =================
    await host.page.evaluate(SEED, MIG);
    await guest.page.evaluate(mig => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig)); }, MIG);
    await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(800); await guest.page.waitForTimeout(600);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    let prevQ = "";
    for (let k = 0; k < 3; k++) {
      // 2026-10-10: 「わかった！」はなくした。問題は両方の画面に同時に出る（ホストはスキップが出る・ゲストは最初から〇✕）
      await host.page.waitForFunction(p => { const e = document.getElementById("skip-btn"); return document.getElementById("battle-q-id").textContent !== p && !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, prevQ, { timeout: 30000 });
      prevQ = await host.page.$eval("#battle-q-id", e => e.textContent);
      await guest.page.waitForFunction(prevQ => getComputedStyle(document.getElementById("battle-view")).display !== "none" && document.getElementById("battle-q-id").textContent === prevQ, prevQ, { timeout: 20000 });
      await waitVis(guest.page, "#judge-row", 30000);
      await guest.page.waitForTimeout(500);
      if (k >= 1) {
        for (const [who, pg] of [["ホスト", host.page], ["ゲスト", guest.page]]) {
          const m = await pg.evaluate(() => ({ folds: document.querySelectorAll("#battle-daimon .daimon-fold").length, fig: !!document.querySelector("#battle-daimon .daimon-fig-btn") }));
          check("F5 " + who + " " + (k + 1) + "問目: たたんだ行 " + k + "・図を見る", m.folds === k && m.fig, JSON.stringify(m));
        }
      }
      if (k === 2) {
        const d = await guest.page.evaluate(() => {
          const ng = document.getElementById("judge-ng").getBoundingClientRect(), ok = document.getElementById("judge-ok").getBoundingClientRect();
          const f = document.getElementById("judge-fix-btn"), r = f.getBoundingClientRect();
          return { show: getComputedStyle(document.getElementById("judge-fix-row")).display !== "none",
            dist: r.top - Math.max(ng.bottom, ok.bottom), h: r.height, fs: parseFloat(getComputedStyle(f).fontSize) };
        });
        check("F6 ゲスト: 「やっぱり直す」が出ている", d.show);
        check("F6 ゲスト: 判定ボタンから 120px 以上はなれている（" + Math.round(d.dist) + "px）", d.dist >= 120, d.dist);
        check("F6 ゲスト: 小さい（高さ " + Math.round(d.h) + "px ≤ 32・文字 " + d.fs + "px ≤ 12）", d.h <= 32 && d.fs <= 12, d.h + "/" + d.fs);
        await shot(host.page, "host_item3"); await shot(guest.page, "guest_item3");
        const s0 = await host.page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1")));
        await tap(guest.page, "#judge-fix-btn"); await guest.page.waitForTimeout(1800);
        const s1 = await host.page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1")));
        check("F6 機能は残っている（押すとホストの直前の記録が変わる）", JSON.stringify(s0) !== JSON.stringify(s1));
      }
      await tap(guest.page, "#judge-ok");   // ゲストの〇でホストの答えが開く（ホストに〇✕は出ない）
      await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 }).catch(() => {});
      await tap(host.page, "#next-btn").catch(() => {});
    }
    check("画面のエラー 0", solo.errs.length + host.errs.length + guest.errs.length === 0, [].concat(solo.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("通しが最後まで走った", false, String((e && e.message) || e)); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(title, out) {
  console.log("\n── " + title + " ──"); let ng = 0;
  for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.name + (c.extra ? " … " + c.extra : "")); if (!c.ok) ng++; }
  return ng;
}
const done = async (c) => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格（直す前なのに鳴らない）");
if (ngB === 0) await done(3);
console.log("\n■ いまの index.html … ★鳴らないのが正しい");
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng === 0 ? 0 : 1);
