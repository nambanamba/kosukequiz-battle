// リンクで「今日やるカード」を開く（2026-10-06 ユーザー「今日、理科はどのカードをやればいいですか？わかるようにするか、勝手に設定してほしいです」）
// 本物の Chrome・390x844。使い方: node tools/mikaku/start_link_probe.mjs   スクショは tools/mikaku/shots_startlink/（コミットしない）
// 見ること:
//   L1 ?subj=理科&unit=第6回.今回のポイント①ヒトの呼吸 → ホームに「今日の理科：今回のポイント①ヒトの呼吸（8問）」・「はじめる」1回で
//      一人の一問一答が始まる・問題数の設定（5問）より URL が優先（1 / 8）・その単元の問題だけ・保存された設定は変わらない
//   L2 unit は「第N回.」を省いた名前でも・2つ並べても（②13問＋③10問＝23問）
//   L3 ?ids=r6p03,r6p01,zzz → その問題だけ・その順番（知らない id は除く）
//   L4 URL が無いときは何も出ない（今までどおり）
//   L5 単元名がまちがっているときは「見つかりませんでした」・はじめるは出ない
//   L6 チェックのみが ON でも、答える形で始まる
//   L7 mode=battle なら「二人ではじめる（部屋を作る）」→ 押すと二人の部屋を作って相手を待つ（2026-10-07）
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_startlink"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "6eaea8d";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(SERVED, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const ORIGIN = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
// 社会・第6回・5問の設定にしておく（リンクが設定より優先されるかを見る）
const SEED = (arg) => {
  const [mig, review] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": ["第6回.鎌倉時代"] }, units: ["第6回.鎌倉時代"], count: 5, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, reviewMode: !!review, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
};
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
  const vis = sel => page.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const txt = sel => page.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : ""; }, sel);
  const qid = () => page.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, "")).catch(() => "");
  const onSolo = () => page.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const open = async (q, review) => { await page.goto(ORIGIN); await page.evaluate(SEED, [MIG, review]); await page.goto(ORIGIN + q); await page.waitForTimeout(900); };
  const shot = n => page.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: false }).catch(() => {});
  // 最後まで答えて、出た id を集める
  const answerAll = async (max) => { const seen = []; for (let k = 0; k < max && (await onSolo()); k++) { seen.push(await qid()); await page.$eval("#solo-reveal-btn", e => e.click()).catch(() => {}); await page.waitForTimeout(80); await page.$eval("#solo-judge-ok", e => e.click()).catch(() => {}); await page.waitForTimeout(150); } return seen; };
  const startToday = async () => { await page.$eval("#today-start-btn", e => e.click()).catch(() => {}); await page.waitForTimeout(400); };
  try {
    // L1
    await open("?subj=" + encodeURIComponent("理科") + "&unit=" + encodeURIComponent("第6回.今回のポイント①ヒトの呼吸"));
    const set0 = await page.evaluate(() => localStorage.getItem("kq_battle_settings_v1"));
    const l1 = { title: await txt("#today-title"), btn: await vis("#today-start-btn") };
    await shot("L1_home");
    await startToday();
    l1.cnt = await txt("#solo-counter");
    await shot("L1_solo");
    l1.seen = await answerAll(20);
    l1.set = (await page.evaluate(() => localStorage.getItem("kq_battle_settings_v1"))) === set0;
    const unit1 = await page.evaluate(() => QA_DATA.filter(d => d.u === "第6回.今回のポイント①ヒトの呼吸").map(d => d.id));
    check("L1 「今日の理科：今回のポイント①ヒトの呼吸（8問）」と「はじめる」", l1.title === "今日の理科：今回のポイント①ヒトの呼吸（8問）" && l1.btn, JSON.stringify(l1.title));
    check("L1 はじめる1回で一人が始まる・問題数の設定（5問）よりリンクが優先（" + l1.cnt + "）・その単元の8問だけ・設定は変わらない",
      /^1 \/ 8$/.test(l1.cnt) && l1.seen.length === 8 && l1.seen.every(id => unit1.includes(id)) && l1.set, l1.seen.join(" "));
    // L2
    await open("?subj=" + encodeURIComponent("理科") + "&unit=" + encodeURIComponent("今回のポイント②心臓と血管") + "&unit=" + encodeURIComponent("今回のポイント③血液の循環"));
    const l2 = await txt("#today-title");
    await startToday();
    const l2c = await txt("#solo-counter");
    check("L2 「第N回.」を省いた単元名・2つ並べても（23問）", l2 === "今日の理科：今回のポイント②心臓と血管・今回のポイント③血液の循環（23問）" && /^1 \/ 23$/.test(l2c), l2 + " / " + l2c);
    // L3
    await open("?ids=r6p03,r6p01,zzz");
    const l3 = { title: await txt("#today-title") };
    await startToday();
    l3.seen = await answerAll(5);
    check("L3 ids のときはその問題だけ・その順番（知らない id は除く）", /（2問）$/.test(l3.title) && l3.seen.join(",") === "r6p03,r6p01", JSON.stringify(l3));
    // L4
    await open("");
    check("L4 リンクが無いときは何も出ない", !(await vis("#today-box")) && !(await vis("#today-start-btn")));
    // L5
    await open("?subj=" + encodeURIComponent("理科") + "&unit=" + encodeURIComponent("第9回.ない単元"));
    const l5 = { title: await txt("#today-title"), btn: await vis("#today-start-btn"), box: await vis("#today-box") };
    check("L5 単元名がまちがっているときは「見つかりませんでした」・はじめるは出ない", l5.box && /見つかりませんでした/.test(l5.title) && !l5.btn, JSON.stringify(l5));
    // L6
    await open("?ids=r6p01", true);
    await startToday();
    const l6 = { judgeRow: false, reveal: await vis("#solo-reveal-btn"), review: await vis("#solo-review-next-btn") };
    check("L6 チェックのみが ON でも答える形で始まる（こたえを見る が出る）", (await onSolo()) && l6.reveal && !l6.review, JSON.stringify(l6));
    // L7
    await open("?ids=r6p01,r6p02&mode=battle");
    const l7 = { btn: await txt("#today-start-btn") };
    await startToday(); await page.waitForTimeout(1500);
    l7.wait = await vis("#home-waiting"); l7.code = await txt("#room-code-display");
    check("L7 mode=battle →「二人ではじめる（部屋を作る）」→ 押すと部屋を作って相手を待つ", l7.btn === "二人ではじめる（部屋を作る）" && l7.wait && /^\d{4}$/.test(l7.code), JSON.stringify({ btn: l7.btn, wait: l7.wait, code: l7.code }));
    check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
