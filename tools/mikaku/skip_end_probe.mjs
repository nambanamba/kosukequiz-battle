// 分けての部分（答えが2つ以上のカードを分けたもの）のスキップ・✕は、ラウンドの末尾に回る（2026-10-11）
//   ユーザー「スキップの挙動がおかしい気がします。最後に出てくるのかと思ったらすぐに出てきます。」
//   直す前は「同じカードの残りの部分のうしろ」に入れていたので、1〜2問あとにすぐ戻っていた。
//   本物の大問（daimon_data）の小問は問題文を共有しているので今までどおり（同じ大問の残りのうしろ）
// 本物の Chrome・390x844・まねごとの待ち合わせ先。使い方: node tools/mikaku/skip_end_probe.mjs
// 見ること（r6m36 = ①②③ の3つに分かれる・r6m40 = ふつうの一問一答。並びは ~1 ~2 ~3 r6m40）:
//   S1 一人・スキップ: ①をスキップ → ②③のあと r6m40 が出て、①は最後（直す前は ②③ のすぐあと）
//   S1 最後に戻った①の画面: カードの本文と図が出る・「分けて 1/3」・答えを見ると ②③ が答えつきで出る（文脈が切れない）
//   S2 一人・✕: ①を✕ → 同じく最後
//   D1 一人・本物の大問の小問は今までどおり: 問4をスキップ → 問5のすぐあとにもう一度（次の大問の前）
//   B1 二人: ホストが①をスキップ・ゲストが②に✕ → ③のあと r6m40・そのあと ①・② の順（ゲストも同じ並び）
//   B1 二人: 最後に戻った①の画面（ホスト・ゲスト）にカードの本文が出る
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "0862d66";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "skipend" });
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
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
const U = "第6回.ヒトと動物の呼吸・循環";
// 答えるのは ids だけ（理科のほかの一問一答と大問の小問は全部おぼえ済み）
const SEED = (arg) => {
  const [mig, ids, o] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8, correctDays: ["2026-09-01", "2026-09-02", "2026-09-03"] }, st = {};
  QA_DATA.forEach(d => { if (d.subj === "理科" && d.kind !== "daimon" && !ids.includes(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { if (!ids.includes(it.id)) st[it.id] = Object.assign({}, known); }));
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify(Object.assign({ subject: "理科", unitsBySubject: { "理科": [o.unit] }, units: [o.unit], count: "all", shuffle: false, tiers: [0, 1],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }, o.extra || {})));
};
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = (pg, p) => pg.$eval("#" + p + "-q-id", e => e.textContent.replace(/^No\./, ""));
  const txt = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : ""; }, sel);
  const onSolo = pg => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const judge = async (pg, ok) => { await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, ok ? "#solo-judge-ok" : "#solo-judge-ng"); await pg.waitForTimeout(250); };
  const skip = async pg => { await tap(pg, "#solo-skip-btn"); await pg.waitForTimeout(250); await tap(pg, "#solo-skip-next-btn"); await pg.waitForTimeout(250); };
  const start = async (pg, ids) => {
    await pg.evaluate(SEED, [MIG, ids, { unit: U }]); await pg.reload(); await pg.waitForTimeout(800);
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(300);
  };
  const cardView = async (pg, p) => ({ id: await qid(pg, p), title: await txt(pg, "#" + p + "-daimon .battle-daimon-title"), q: await txt(pg, "#" + p + "-q"), img: await vis(pg, "#" + p + "-img-wrap") });
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    const pg = solo.page;
    // ===== S1 一人・スキップ =====
    await start(pg, ["r6m36", "r6m40"]);
    const seq1 = [await qid(pg, "solo")];
    await skip(pg);
    for (let k = 0; k < 2; k++) { seq1.push(await qid(pg, "solo")); await judge(pg, true); }
    seq1.push(await qid(pg, "solo"));
    check("S1 一人・①をスキップ → ②③のあとは r6m40（①は最後）: " + seq1.join(" "), seq1.join(",") === "r6m36~1,r6m36~2,r6m36~3,r6m40");
    await judge(pg, true);
    const s1 = await cardView(pg, "solo");
    await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(150);
    s1.a = await txt(pg, "#solo-a"); s1.afig = await txt(pg, "#solo-daimon-afig");
    check("S1 最後に戻った①: カードの本文と図・「分けて 1/3」・答えは①だけ・答えを見ると②③が答えつきで出る",
      s1.id === "r6m36~1" && /分けて 1\/3/.test(s1.title) && /ろっ骨は（①）/.test(s1.q) && s1.img && s1.a === "上がる" && /下がる/.test(s1.afig) && /大きくなる/.test(s1.afig), JSON.stringify(s1));
    await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250);
    check("S1 全部〇で終わる", !(await onSolo(pg)));
    // ===== S2 一人・✕ =====
    await start(pg, ["r6m36", "r6m40"]);
    const seq2 = [await qid(pg, "solo")];
    await judge(pg, false);
    for (let k = 0; k < 2; k++) { seq2.push(await qid(pg, "solo")); await judge(pg, true); }
    seq2.push(await qid(pg, "solo"));
    await judge(pg, true); seq2.push(await qid(pg, "solo")); await judge(pg, true);
    check("S2 一人・①を✕ → ②③のあとは r6m40・①は最後: " + seq2.join(" "), seq2.join(",") === "r6m36~1,r6m36~2,r6m36~3,r6m40,r6m36~1" && !(await onSolo(pg)));
    // ===== D1 一人・本物の大問の小問は今までどおり =====
    await start(pg, ["r6y041", "r6y051", "r6k101", "r6k102"]);
    const seqD = [await qid(pg, "solo")];
    await skip(pg);
    seqD.push(await qid(pg, "solo")); await judge(pg, true);
    seqD.push(await qid(pg, "solo"));
    check("D1 本物の大問: 問4をスキップ → 問5のすぐあとにもう一度（次の大問の前）: " + seqD.join(" "), seqD.join(",") === "r6y041,r6y051,r6y041");
    // ===== B1 二人 =====
    for (const p of [host.page, guest.page]) { await p.evaluate(SEED, [MIG, ["r6m36", "r6m40"], { unit: U }]); await p.reload(); await p.waitForTimeout(800); }
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    const hseq = [], gseq = []; let hBack = null, gBack = null;
    const gWait = id => guest.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 });
    for (let k = 0; k < 6; k++) {
      await waitVis(host.page, "#skip-btn", 30000);
      const id = await qid(host.page, "battle"); hseq.push(id);
      await gWait(id); await guest.page.waitForTimeout(300);
      gseq.push(await qid(guest.page, "battle"));
      if (k === 4) { hBack = await cardView(host.page, "battle"); gBack = await cardView(guest.page, "battle"); }
      if (k === 0) {
        // ホストが①をスキップ → 「つぎの問題へ」
        await tap(host.page, "#skip-btn");
        await host.page.waitForFunction(() => { const b = document.getElementById("skip-continue-btn"); return b && getComputedStyle(b).display !== "none"; }, null, { timeout: 15000 });
        await host.page.waitForTimeout(300);
        await tap(host.page, "#skip-continue-btn"); await host.page.waitForTimeout(500);
        continue;
      }
      await waitVis(guest.page, "#judge-row", 15000);
      await tap(guest.page, k === 1 ? "#judge-ng" : "#judge-ok");   // ②はゲストが✕
      await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
      await tap(host.page, "#next-btn"); await host.page.waitForTimeout(500);
    }
    check("B1 二人: ①スキップ・②✕ → ③ r6m40 ① ② の順（ホスト " + hseq.join(" ") + "）・ゲストも同じ並び（" + gseq.join(" ") + "）",
      hseq.join(",") === "r6m36~1,r6m36~2,r6m36~3,r6m40,r6m36~1,r6m36~2" && gseq.join(",") === hseq.join(","));
    check("B1 二人: 最後に戻った①の画面にカードの本文と「分けて 1/3」（ホスト・ゲスト）",
      hBack && gBack && /ろっ骨は（①）/.test(hBack.q) && /分けて 1\/3/.test(hBack.title) && hBack.img && /ろっ骨は（①）/.test(gBack.q) && /分けて 1\/3/.test(gBack.title), JSON.stringify({ hBack, gBack }));
    await host.page.waitForTimeout(800);
    check("B1 全部〇で結果画面へ", await host.page.evaluate(() => document.getElementById("screen-result").classList.contains("active")));
    check("E 画面のエラー 0", solo.errs.length + host.errs.length + guest.errs.length === 0, [].concat(solo.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
