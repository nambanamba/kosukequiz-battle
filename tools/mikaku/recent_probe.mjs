// ★「直近足した問題を確認したい。どうフィルターすれば見られるか」（2026-09-21 ユーザー）への答えを、
//   **実機で**確かめる。司令塔が index.html から読んだ手順が合っているかを見る。
//
// 使い方: node tools/mikaku/recent_probe.mjs
//
// ■ 仕込む記録（テスト用）
//   「すでに練習ずみ」の子を想定して、社会 第1〜4回・理科 第4回 r4m01〜79 に記録を入れる。
//   新しく足した **社会 g5r1〜29・理科 r4m80〜90** は記録なし（＝まだ一度も解いていない）。
//
// ■ 見るもの
//   A. 社会: 単元「第5回.総合」だけにすると 29問になるか
//   B. 理科: 単元「第4回」＋「出題順どおり」で、80〜90問目が r4m80〜90 になるか
//   C. 問題一覧: 単元で絞れるか／並びは id 順か（最後が r4m80〜90 か）／表の絵が一覧にも出るか
//   D. ★もっと簡単な見方: 一覧の「未実施のみ」で、新しい問だけが残るか
//
// ■ ★見ていないもの（4-2）
//   - お子さんの端末の実際の記録（新しい問をもう解いていれば「未実施のみ」から消える）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ channel: "chrome" });
let ng = 0;
const check = (label, ok, extra) => { console.log(`  ${ok ? "✔" : "✘"} ${label}${extra ? " … " + extra : ""}`); if (!ok) ng++; };

async function open(settings) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", d => d.accept());
  await page.goto(BASE); await page.waitForTimeout(500);
  await page.evaluate((settings) => {
    localStorage.clear();
    const st = {}, now = Date.now(), day = 86400000;
    QA_DATA.forEach(q => {
      const old = (/^g[1-4]r/.test(q.id)) || (/^r4m/.test(q.id) && +q.id.slice(3) <= 79);
      if (old) st[q.id] = { correct: 1, wrong: 0, box: 1, lastCorrectAt: now - 2 * day, lastAnswered: now - 2 * day };
    });
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
    if (settings) localStorage.setItem("kq_battle_settings_v1", JSON.stringify(settings));
  }, settings);
  await page.reload(); await page.waitForTimeout(900);
  return { ctx, page };
}
const label = page => page.$eval("#pool-count-label", e => e.textContent);

// ── A. 社会 第5回だけ ──
console.log("\n── A. 社会: 単元「第5回.総合」だけ ──");
{
  const { ctx, page } = await open(null);
  await page.$eval('.choice[data-unit="ALL"]', e => e.click());                 // 全単元 → 空
  await page.$eval('.unit-group-header[data-group="history"]', e => e.click()); // 歴史をひらく
  await page.waitForTimeout(200);
  await page.$eval('.choice[data-unit="第5回.総合"]', e => e.click());
  const lab = await label(page);
  console.log(`  「全単元」で空 →「歴史」をひらく →「第5回.総合」 → ${lab}`);
  check("★29問だけになる", lab === "29問", lab);
  await ctx.close();
}

// ── B. 理科 第4回 ＋ 出題順どおり ──
console.log("\n── B. 理科: 単元「第4回」＋「出題順どおり」で一人で始める ──");
{
  const { ctx, page } = await open(null);
  await page.$eval("#subject-science", e => e.click()); await page.waitForTimeout(400);
  await page.$eval('.choice[data-unit="ALL"]', e => e.click());
  const u4 = await page.evaluate(() => QA_DATA.find(q => q.id === "r4m01").u);
  await page.$eval(`.choice[data-unit="${u4}"]`, e => e.click());
  await page.$eval("#order-toggle", e => e.click());
  console.log(`  単元「${u4}」: ${await label(page)}`);
  await page.click("#solo-start-btn"); await page.waitForTimeout(600);
  const seen = [];
  for (let n = 1; n <= 90; n++) {
    const id = ((await page.textContent("#solo-q-id").catch(() => "")) || "").match(/[A-Za-z][A-Za-z0-9_]*$/);
    seen.push(id ? id[0] : "?");
    const b = await page.$("#solo-reveal-btn"); if (!b || !(await b.isVisible())) break;
    await b.click(); await page.waitForTimeout(30);
    const ok = await page.$("#solo-judge-ok"); if (!ok || !(await ok.isVisible())) break;
    await ok.click(); await page.waitForTimeout(40);
  }
  const tail = seen.slice(79, 90);
  console.log(`  80〜90問目: ${tail.join(" ")}`);
  const want = Array.from({ length: 11 }, (_, i) => "r4m" + (80 + i));
  check("★80〜90問目が r4m80〜r4m90（消化の表①〜⑪）", JSON.stringify(tail) === JSON.stringify(want));
  check("1〜79問目は r4m01〜r4m79 の順", seen.slice(0, 79).every((id, i) => id === "r4m" + String(i + 1).padStart(2, "0")));
  await ctx.close();
}

// ── C・D. 問題一覧 ──
console.log("\n── C・D. 問題一覧（理科・単元「第4回」）──");
{
  const { ctx, page } = await open(null);
  await page.$eval("#subject-science", e => e.click()); await page.waitForTimeout(400);
  await page.click("#list-btn"); await page.waitForTimeout(600);
  const u4 = await page.evaluate(() => QA_DATA.find(q => q.id === "r4m01").u);
  await page.selectOption("#list-unit-select", u4); await page.waitForTimeout(400);
  // 一覧は続きを後から足すので、下まで送って全部描かせる
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 4000); await page.waitForTimeout(120); }
  const ids = await page.$$eval("#list-items .list-item[data-qid]", els => els.map(e => e.dataset.qid));
  const count = await page.textContent("#list-count");
  console.log(`  単元で絞る: ${count} ／ 描かれた行 ${ids.length} ／ 最後の11行: ${ids.slice(-11).join(" ")}`);
  check("★単元で絞って開ける（90問）", ids.length === 90, count);
  check("★並びは id 順で、いちばん下が r4m80〜r4m90", ids.slice(-11).join(",") === Array.from({ length: 11 }, (_, i) => "r4m" + (80 + i)).join(","));
  const imgs = await page.$$eval('#list-items .list-item[data-qid="r4m80"] .list-img-wrap img', els => els.map(e => e.getAttribute("src")));
  check("★一覧の r4m80 の行に、表の絵が出る", imgs.includes("images/r4_04.jpg"), imgs.join(" ") || "（絵なし）");
  await page.$eval('#list-items .list-item[data-qid="r4m80"]', e => e.scrollIntoView());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ROOT, "tools", "mikaku", "shots", "recent_list_r4m80.png") });

  // D. 未実施のみ
  await page.$eval('.list-filter-toggle[data-filter="unseen"]', e => e.click()); await page.waitForTimeout(400);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 4000); await page.waitForTimeout(100); }
  const ids2 = await page.$$eval("#list-items .list-item[data-qid]", els => els.map(e => e.dataset.qid));
  console.log(`  ＋「未実施のみ」: ${await page.textContent("#list-count")} ／ ${ids2.join(" ")}`);
  check("★「未実施のみ」で、新しい11問だけが残る", ids2.join(",") === Array.from({ length: 11 }, (_, i) => "r4m" + (80 + i)).join(","));

  // 社会 第5回も「未実施のみ」で見られるか
  await page.click("#list-back"); await page.waitForTimeout(400);
  await page.$eval("#subject-social", e => e.click()); await page.waitForTimeout(400);
  await page.click("#list-btn"); await page.waitForTimeout(600);
  const opts = await page.$$eval("#list-unit-select option", os => os.map(o => o.value));
  await page.selectOption("#list-unit-select", "ALL"); await page.waitForTimeout(300);
  const unseenOn = await page.$eval('.list-filter-toggle[data-filter="unseen"]', e => e.classList.contains("on"));
  if (!unseenOn) { await page.$eval('.list-filter-toggle[data-filter="unseen"]', e => e.click()); await page.waitForTimeout(300); }
  for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 4000); await page.waitForTimeout(100); }
  const ids3 = await page.$$eval("#list-items .list-item[data-qid]", els => els.map(e => e.dataset.qid));
  const g5 = ids3.filter(id => id.startsWith("g5r")).length;
  console.log(`  社会・全単元＋「未実施のみ」: ${await page.textContent("#list-count")} ／ うち g5r ${g5}件（ほかは公民・夏期講習など、テストで記録を入れていない単元）`);
  check("社会でも「未実施のみ」に第5回の29問が出る", g5 === 29);
  await ctx.close();
}

await browser.close(); server.close();
console.log(ng === 0 ? "\n✔ すべて確認できた" : `\n✘ ${ng}件 だめだった`);
process.exit(ng === 0 ? 0 : 1);
