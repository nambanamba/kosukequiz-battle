// 二人対戦を「社会 → 理科 → 社会 → 理科」と続けて回せるか（2026-10-03・ユーザー）
//   ユーザー原文「社会が終わってすぐ理科をいつもやってるんですが、ゲスト側が終わったっていう画面のまま、
//   ホスト側が理科を開始して、ゲスト側が元の画面に戻るを押すと切れちゃうんです。連続でできれば何でもいいです。」
// 本物の Chrome 2枚（390x844）＋まねごとの待ち合わせ先（fake_relay）。trystero は本物。
// 使い方: node tools/mikaku/serial_battle_probe.mjs [--only now|base]
// 手順（ゲストは部屋の番号を入れ直さない）:
//   第1戦 社会（ふつうに出会う）
//   つなぎ A: ホストが先に「はじめの画面にもどる」→ 理科 → 二人で始める → 二人で開始。
//             ゲストはそのあと（まだ出ていれば）結果画面のボタンを押す（★ユーザーの報告どおりの順）
//   第2戦 理科
//   つなぎ B: ゲストが先に結果画面のボタンを押す → ホストが社会で作り直す
//   第3戦 社会 → つなぎ A → 第4戦 理科   （＝社会→理科 を2回）
// 見ること（各戦）:
//   K1 ゲストが番号を入れ直さずに、次の対戦の「開始する」まで来る（ホストの「二人で開始する」も出る）
//   K2 その戦が最後の問題まで二人とも通る（出た問題がその科目）
//   K3 「接続が切れました」が一度も出ない
//   K4 記録（correct+wrong の合計）が、その戦の問題数ぶんだけ増える（二重にも、抜けにもならない）。ホスト・ゲスト両方
// 2026-10-10 追記: 二人の新しい流れに合わせた。ホストの「わかった！」・ホストが付ける〇✕は無い。
//   問題は両方に同時に出る → ゲスト（親）が〇を押す → ホストの記録が付く・次へ。ゲストの端末には記録が付かない（K4 はそこを変えた）。
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_serial"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "4363c8a";
const ai = process.argv.indexOf("--only");
const ONLY = ai >= 0 ? process.argv[ai + 1] : null;
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "serial" });
let SERVED = CURRENT;
function withFakeRelay(src) {
  const i0 = src.indexOf("const RELAY_URLS = ["), i1 = src.indexOf("];", i0);
  if (i0 < 0 || i1 < 0) throw new Error("RELAY_URLS が見つかりません");
  return src.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + src.slice(i1);
}
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
const browser = await chromium.launch({ channel: "chrome" });
const Q_COUNT = 2;

async function run(label, src) {
  SERVED = src; const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
  const mk = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errs = [], dialogs = [];
    page.on("pageerror", e => errs.push(String(e)));
    page.on("dialog", d => { dialogs.push(d.message()); d.accept().catch(() => {}); });
    await page.goto(PAGE_URL); await page.waitForTimeout(500);
    await page.evaluate(n => {
      const pick = subj => {
        const bad = new Set(QA_DATA.filter(q => q.subj === subj && q.kind === "daimon").map(q => q.u));
        return QA_DATA.find(q => q.subj === subj && !bad.has(q.u) && QA_DATA.filter(x => x.u === q.u).length >= 8).u;
      };
      const uS = pick("社会"), uR = pick("理科");
      localStorage.clear();
      localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
      localStorage.setItem("kq_battle_daimon_merged_v1", "1");
      localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
        subject: "社会", unitsBySubject: { "社会": [uS], "理科": [uR] }, units: [uS], count: n,
        shuffle: false, filterUnmastered: false, filterWeak: false, fairMode: false,
        headStartSec: 1, answerTimeSec: 1, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600 }));
    }, Q_COUNT);
    await page.reload(); await page.waitForTimeout(700);
    return { who, ctx, page, errs, dialogs };
  };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const isVis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const screen = pg => pg.evaluate(() => (document.querySelector(".screen.active") || {}).id || "?");
  const total = pg => pg.evaluate(() => { let t = 0; for (const key of ["kq_battle_stats_v1", "kq_battle_parts_v1"]) { const s = JSON.parse(localStorage.getItem(key) || "{}"); for (const k in s) t += (s[k].correct || 0) + (s[k].wrong || 0); } return t; });   // ★2026-10-10: 「分けて」の部分(~)の記録は kq_battle_parts_v1 に入る（10-06 から）。両方数える
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const host = await mk("ホスト"), guest = await mk("ゲスト");
  const playRound = async (no, subj) => {
    const t0h = await total(host.page), t0g = await total(guest.page);
    await host.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 30000 });
    await guest.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 30000 });
    let n = 0, firstId = "";
    for (let i = 0; i < 20; i++) {
      await waitVis(host.page, "#skip-btn", 30000);
      if (!firstId) firstId = (await host.page.$eval("#battle-q-id", e => e.textContent)).replace(/^No\./, "");
      await waitVis(guest.page, "#judge-row", 30000);
      await tap(guest.page, "#judge-ok");
      await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
      n++;
      await tap(host.page, "#next-btn");
      await host.page.waitForTimeout(300);
      if (await screen(host.page) === "screen-result") break;
    }
    await guest.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 20000 });
    const isSubj = subj === "理科" ? /^r/.test(firstId) : !/^r/.test(firstId);
    check("K2 第" + no + "戦（" + subj + "）が最後まで通った（" + n + "問・最初 " + firstId + "）", n >= 1 && isSubj, firstId);
    await host.page.waitForTimeout(400);
    const dh = (await total(host.page)) - t0h, dg = (await total(guest.page)) - t0g;
    check("K4 第" + no + "戦: 記録がちょうど " + n + " 件ふえた（ホスト +" + dh + "）・ゲストの端末には付かない（+" + dg + "）", dh === n && dg === 0, dh + "/" + dg);
    await shot(guest.page, "r" + no + "_guest_result");
  };
  // order "A": ホスト先・ゲストあと ／ "B": ゲスト先
  const hop = async (no, subj, order) => {
    const subjSel = subj === "理科" ? "#subject-science" : "#subject-social";
    if (order === "B") {
      if (await isVis(guest.page, "#result-home-btn")) await tap(guest.page, "#result-home-btn");
      await guest.page.waitForTimeout(1500);
      await shot(guest.page, "hop" + no + "_guest_after_tap");
    }
    await tap(host.page, "#result-home-btn"); await host.page.waitForTimeout(400);
    await tap(host.page, subjSel); await host.page.waitForTimeout(300);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const met = await waitVis(host.page, "#start-together-btn", 25000).then(() => true, () => false);
    await shot(host.page, "hop" + no + "_host_waiting"); await shot(guest.page, "hop" + no + "_guest_waiting");
    if (met) await tap(host.page, "#start-together-btn");
    await host.page.waitForTimeout(1500);
    if (order === "A" && await isVis(guest.page, "#result-home-btn")) { await tap(guest.page, "#result-home-btn"); await guest.page.waitForTimeout(1500); }
    await shot(host.page, "hop" + no + "_host_after"); await shot(guest.page, "hop" + no + "_guest_after");
    const gReady = await waitVis(guest.page, "#join-start-together-btn", 15000).then(() => true, () => false);
    check("K1 つなぎ" + order + "→第" + no + "戦: ゲストが番号を入れ直さずに「開始する」まで来た（ホストも相手を見つけた: " + met + "）", met && gReady,
      "host=" + await screen(host.page) + " guest=" + await screen(guest.page));
    if (!gReady) throw new Error("第" + no + "戦: ゲストが次の対戦に入れない（ここで止める）");
    await tap(guest.page, "#join-start-together-btn");
  };
  try {
    // 第1戦: ふつうに出会う
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    await playRound(1, "社会");
    await hop(2, "理科", "A"); await playRound(2, "理科");
    await hop(3, "社会", "B"); await playRound(3, "社会");
    await hop(4, "理科", "A"); await playRound(4, "理科");
  } catch (e) { check("通しが最後まで走った", false, String((e && e.message) || e)); await shot(host.page, "ERR_host"); await shot(guest.page, "ERR_guest"); }
  finally {
    const all = host.dialogs.map(m => "ホスト:" + m).concat(guest.dialogs.map(m => "ゲスト:" + m));
    check("K3 「接続が切れました」が一度も出ない（ダイアログ " + all.length + " 件）", !all.some(m => /切れ/.test(m)), all.join(" | "));
    check("画面のエラー 0", host.errs.length + guest.errs.length === 0, host.errs.concat(guest.errs).join(" | "));
    await host.ctx.close(); await guest.ctx.close();
  }
  return out;
}
function report(title, out) { console.log("\n── " + title + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.name + (c.extra ? " … " + c.extra : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
if (ONLY !== "now") {
  console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
  const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
  console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格（直す前なのに鳴らない）");
  if (ngB === 0 || ONLY === "base") await done(ngB === 0 ? 3 : 0);
}
console.log("\n■ いまの index.html … ★鳴らないのが正しい");
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng === 0 ? 0 : 1);
