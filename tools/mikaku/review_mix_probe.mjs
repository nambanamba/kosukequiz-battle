// ★「今週の単元をやりながら、昔クリアした問題も忘れたころに戻ってくるか」を実機（Chrome・390px）で調べる。
//   2026-09-23 ユーザーの困りごと（1日30問／授業直後に1回で答えられた用語も、いまは忘れているはず）から、司令塔の依頼で調査。
//   ★調べるだけの道具。index.html は触っていない。
// 使い方: node tools/mikaku/review_mix_probe.mjs
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
let ng = 0;
const check = (label, ok, extra) => { console.log("  " + (ok ? "✔" : "✘") + " " + label + (extra ? " … " + extra : "")); if (!ok) ng++; };

const MAIN = "第4回.平安時代";                                                   // 今週の単元（121問）
const OLD = ["第1回.旧石器時代・縄文時代・弥生時代", "第2回.古墳時代・飛鳥時代"];  // 昔の単元（88・115問）

// 昔の単元は「全部クリアずみ・一度もまちがえていない」＝3段目。正解した日は問ごとにちがう（古いものほど昔）
function seed(oldIds, futureDue) {
  const st = {}, now = Date.now(), day = 86400000;
  oldIds.forEach((id, i) => {
    st[id] = {
      correct: 3, wrong: 0, box: 3,
      lastCorrectAt: now - (oldIds.length - i) * day,
      lastAnswered: now - day,
      nextDue: futureDue ? now + 365 * day : now - day   // ★次に出す日を1年先にしておく
    };
  });
  return st;
}
async function open(opt) {
  const { count = 20, mix = 10, stars = [], futureDue = true, shuffle = false, knownAll = true } = opt || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(PAGE_URL); await page.waitForTimeout(400);
  const info = await page.evaluate((a) => {
    const oldIds = QA_DATA.filter(q => a.OLD.includes(q.u)).map(q => q.id);
    const st = (new Function("ids", "f", "return (" + a.seedSrc + ")(ids, f)"))(oldIds, a.futureDue);
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
      subject: "社会", unitsBySubject: { "社会": [a.MAIN] }, units: [a.MAIN],
      count: a.count, shuffle: a.shuffle, filterUnmastered: false, filterWeak: false,
      // ★reviewUnitsKnown に「今の科目の全単元」を入れる。入れないと、知らない単元は自動でONになり、
      //   復習ミックスの対象が「選んでいない単元ぜんぶ」になってしまう（＝下の■5で別に確かめる）
      reviewMixCount: a.mix, reviewSelectedUnits: a.OLD,
      reviewUnitsKnown: a.knownAll ? Array.from(new Set(QA_DATA.filter(q => q.subj === "社会").map(q => q.u))) : a.OLD,
      reviewPriority: "all", reviewLevel: "all", reviewType: "all"
    }));
    if (a.stars.length) localStorage.setItem("kq_battle_priority_v1", JSON.stringify(a.stars));
    // ★期待値はアプリと別に作る: 昔の単元を「正解した日が古い順」に並べる
    const byOld = oldIds.slice().sort((x, y) => st[x].lastCorrectAt - st[y].lastCorrectAt);
    return { oldest: byOld.slice(0, 24), oldIds: oldIds };
  }, { MAIN, OLD, count, mix, stars, futureDue, shuffle, knownAll, seedSrc: seed.toString() });
  await page.reload(); await page.waitForTimeout(900);
  return { ctx, page, errs, oldest: info.oldest, oldIds: info.oldIds };
}
// 実際に始めて、出た順に id を読む（〇を押して進める）
async function playIds(page, max) {
  await page.click("#solo-start-btn"); await page.waitForTimeout(700);
  const out = [];
  for (let i = 0; i < max; i++) {
    out.push((await page.$eval("#solo-q-id", e => e.textContent)).replace(/^\s*No\.?/, "").trim());
    await page.click("#solo-reveal-btn"); await page.waitForTimeout(110);
    await page.click("#solo-judge-ok"); await page.waitForTimeout(240);
  }
  return out;
}
const unitOf = (page, ids) => page.evaluate(ids => ids.map(id => (QA_DATA.find(q => q.id === id) || {}).u), ids);

console.log("■ 1. 問題数20＋復習ミックス10（昔の単元は全部クリアずみ・次に出す日は1年先）");
{
  const { ctx, page, errs, oldest } = await open({ count: 20, mix: 10 });
  const label = await page.$eval("#pool-count-label", e => e.textContent);
  check("ボタンの表示は「30問（復習10問こみ）」", label.indexOf("30問（復習10問こみ）") === 0, label);
  const ids = await playIds(page, 30);
  const us = await unitOf(page, ids);
  const mainN = us.filter(u => u === MAIN).length, oldN = us.filter(u => OLD.indexOf(u) >= 0).length;
  check("★内わけは 今週20＋昔10", mainN === 20 && oldN === 10, "今週 " + mainN + " / 昔 " + oldN);
  const gotOld = ids.filter((id, k) => OLD.indexOf(us[k]) >= 0);
  check("★昔の単元が全部クリアずみでも、ちゃんと足される", oldN > 0, oldN + "問");
  check("★足されるのは「正解したのが古い順」の10問",
    JSON.stringify(gotOld.slice().sort()) === JSON.stringify(oldest.slice(0, 10).sort()),
    "出た " + gotOld.slice(0, 3).join(",") + "… / 期待 " + oldest.slice(0, 3).join(",") + "…");
  check("★次に出す日が1年先でも出る（isDue は出題に効いていない）", oldN === 10, oldN + "問");
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 2. 問題数30＋復習ミックス10（司令塔の問い: メイン20＋復習10 になるか）");
{
  const { ctx, page, errs } = await open({ count: 30, mix: 10 });
  const label = await page.$eval("#pool-count-label", e => e.textContent);
  const ids = await playIds(page, 40);
  const us = await unitOf(page, ids);
  const mainN = us.filter(u => u === MAIN).length, oldN = us.filter(u => OLD.indexOf(u) >= 0).length;
  check("★30＋10 は「合わせて30」ではなく 40問 になる",
    label.indexOf("40問") === 0 && mainN === 30 && oldN === 10,
    label + " / 今週 " + mainN + " / 昔 " + oldN);
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 3. ★最優先は復習ミックスに効くか");
{
  const probe = await open({ count: 20, mix: 10 });
  const starTargets = probe.oldIds.slice(-3);   // いちばん新しく正解した3問＝ふつうなら選ばれない
  await probe.ctx.close();
  const { ctx, page, errs, oldest } = await open({ count: 20, mix: 10, stars: starTargets });
  const ids = await playIds(page, 30);
  const us = await unitOf(page, ids);
  const gotOld = ids.filter((id, k) => OLD.indexOf(us[k]) >= 0);
  const starsIn = gotOld.filter(i => starTargets.indexOf(i) >= 0).length;
  check("★を付けても、復習ミックスで『選ばれる問題』は変わらない（選び方は古い順のまま）",
    JSON.stringify(gotOld.slice().sort()) === JSON.stringify(oldest.slice(0, 10).sort()),
    "★を付けた3問のうち " + starsIn + "問が入った");
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 4. 画面（ユーザーに渡す手順の裏取り）");
{
  const { ctx, page, errs } = await open({ count: 20, mix: 10 });
  const texts = await page.evaluate(() => ({
    sectionTitles: Array.from(document.querySelectorAll(".section-title")).map(e => e.textContent.trim()).slice(0, 14),
    mixValue: document.querySelector("#review-mix-input").value,
    reviewUnits: Array.from(document.querySelectorAll("#review-unit-choices .choice"))
      .filter(e => e.classList.contains("selected")).map(e => e.dataset.unit)
  }));
  check("復習ミックスの問題数の欄に 10 が入っている", texts.mixValue === "10", texts.mixValue);
  check("復習の単元として、昔の2単元が選ばれている", texts.reviewUnits.length === 2, texts.reviewUnits.join(" / "));
  console.log("    画面の見出し: " + texts.sectionTitles.join(" | "));
  await (await page.$("#review-mix-input")).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(ROOT, "tools/mikaku/shots/review_mix.png") });
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 5. ★はじめの状態（復習する単元を選び直していないとき）は何が足されるか");
{
  const { ctx, page, errs } = await open({ count: 20, mix: 10, knownAll: false });
  const units = await page.evaluate(() => Array.from(document.querySelectorAll("#review-unit-choices .choice"))
    .filter(e => e.classList.contains("selected")).map(e => e.dataset.unit));
  check("★選んでいない単元が、ぜんぶ自動で復習の対象になる", units.length > OLD.length, units.length + "単元");
  const ids = await playIds(page, 30);
  const us = await unitOf(page, ids);
  const got = us.slice(20);
  const fromOld = got.filter(u => OLD.indexOf(u) >= 0).length;
  check("★その場合、足される10問は『まだ一度も解いていない単元』から来て、昔クリアした単元は回ってこない",
    fromOld === 0, "昔の単元から " + fromOld + "問 / 内わけ " + Array.from(new Set(got)).join(" , "));
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 6. ★2回目は、次の10問に進むか（同じ問題が居すわらないか）");
{
  const { ctx, page, errs, oldest } = await open({ count: 20, mix: 10 });
  const first = (await playIds(page, 30)).slice(20);
  await page.click("#solo-result-home-btn"); await page.waitForTimeout(700);   // 30問やりきると結果の画面になる
  const second = (await playIds(page, 30)).slice(20);
  const same = first.filter(i => second.indexOf(i) >= 0).length;
  check("★1回目に解いた10問は、2回目には出てこない（次に古い10問に進む）", same === 0, "重なり " + same + "問");
  check("2回目に出たのは、次に古い10問（11〜20番目）",
    JSON.stringify(second.slice().sort()) === JSON.stringify(oldest.slice(10, 20).slice().sort()),
    "2回目 " + second.slice(0, 3).join(",") + "… / 期待 " + oldest.slice(10, 13).join(",") + "…");
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 7. ★来週になって単元を変えたら、先週の単元は自動で復習に入るか");
{
  const { ctx, page, errs } = await open({ count: 20, mix: 10 });
  const before = await page.evaluate(() => Array.from(document.querySelectorAll("#review-unit-choices .choice"))
    .filter(e => e.classList.contains("selected")).map(e => e.dataset.unit));
  // 今週の単元を 第4回 → 第5回 に付けかえる（ユーザーが毎週やる操作）
  await page.evaluate(m => document.querySelector('#unit-choices [data-unit="' + m + '"]').click(), MAIN);
  await page.evaluate(() => document.querySelector('#unit-choices [data-unit="第5回.総合"]').click());
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => Array.from(document.querySelectorAll("#review-unit-choices .choice"))
    .filter(e => e.classList.contains("selected")).map(e => e.dataset.unit));
  // ★実測（2026-09-23）: 入らない。一度でも復習の一覧に出た単元は「知っている単元」として覚えられ、
  //   自動でONになるのは初めて見る単元だけのため。→ 毎週、先週の単元を手でタップして足す操作が要る
  check("★先週の単元（" + MAIN + "）は、復習の対象に自動では入らない（毎週タップして足す操作が要る）",
    after.indexOf(MAIN) < 0, "前 " + before.length + "単元 → 後 " + after.length + "単元: " + after.join(" / "));
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
await browser.close(); server.close();
console.log(ng ? "\n✘ " + ng + " 件 ちがう" : "\n===== 合計: 問題なし =====");
process.exit(ng ? 1 : 0);
