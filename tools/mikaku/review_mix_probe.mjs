// ★「今週の単元をやりながら、昔クリアした問題も忘れたころに戻ってくるか」を実機（Chrome・390px）で調べる。
//   2026-09-23 ユーザーの困りごと（1日30問／授業直後に1回で答えられた用語も、いまは忘れているはず）から、司令塔の依頼で調査。
//   ★調べるだけの道具。index.html は触っていない。
//
// ★★2026-09-26: 出題の組み立てが変わり、この道具の仕込み方を直しました。
//   依頼書: 司令塔/回答/対戦_合計を決めて足りない分を復習で埋める_依頼_2026-09-26.md
//   ユーザー判断: 「復習ミックスからで。足りないときに自動で持ってきてほしいです」
//
//   旧: 問題数20 ＋ 復習ミックス10 ＝ 40問（★足し算）
//   新: 問題数が★**合計**。メインが足りない分だけを復習から埋める
//   ★つまり **メインが合計を満たす日は、復習は1問も入りません**。
//   そのため、ここでは★**「未クリアの問題」を ON にして、メインの問数を仕込みで決めます**。
//   ★これは「期待値を緩めた」のではなく、「測りたい場面（今週N問＋昔M問）を
//   新しい規則で作り直した」ものです（確認ポイント 4-1b）。
//   ★新しい規則そのものの関門は tools/mikaku/total_fill_probe.mjs です。
//   こちらは「どの単元が復習の候補になるか」を見る道具として残しています。
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
  // ★mainN = メイン（今週の単元）から出したい数 ／ reviewN = 復習から入ってほしい数
  //   問題数（合計）は mainN + reviewN にする。メインは★未クリアを mainN 問だけ残して作る
  const { mainN = 20, reviewN = 10, stars = [], futureDue = true, shuffle = false, knownAll = true } = opt || {};
  const count = mainN + reviewN;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(PAGE_URL); await page.waitForTimeout(400);
  const info = await page.evaluate((a) => {
    const oldIds = QA_DATA.filter(q => a.OLD.includes(q.u)).map(q => q.id);
    const st = (new Function("ids", "f", "return (" + a.seedSrc + ")(ids, f)"))(oldIds, a.futureDue);
    // ★★ 2026-09-26: メインの単元を「未クリア mainN 問だけ」にする。
    //   新しい規則では、メインが合計を満たすと復習が1問も入らないため。
    // ⚠★ここで「社会の全問をクリアずみにする」毛布団をかけてはいけません。
    //   メインに選んでいるのは MAIN だけなので、ほかの単元の記録はメインの問数に関係なく、
    //   かけると ■5の「まだ一度も解いていない単元」という場面が消えます（実際 1回消しました）
    const now2 = Date.now(), day2 = 86400000;
    QA_DATA.filter(q => q.u === a.MAIN).forEach((q, i) => {
      st[q.id] = i < a.mainN
        ? { correct: 0, wrong: 1, box: 0, lastAnswered: now2 - day2 }
        : { correct: 3, wrong: 0, box: 3, lastCorrectAt: now2 - day2, lastAnswered: now2 - day2 };
    });
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
      subject: "社会", unitsBySubject: { "社会": [a.MAIN] }, units: [a.MAIN],
      count: a.count, shuffle: a.shuffle,
      filterUnmastered: true, filterWeak: false,   // ★メインの問数を仕込みで決めるため ON（2026-09-26）
      // ★reviewUnitsKnown に「今の科目の全単元」を入れる。入れないと、知らない単元は自動でONになり、
      //   復習ミックスの対象が「選んでいない単元ぜんぶ」になってしまう（＝下の■5で別に確かめる）
      reviewSelectedUnits: a.OLD,   // ★reviewMixCount（旧）は使わない。合計に足りない分が自動で入る
      reviewUnitsKnown: a.knownAll ? Array.from(new Set(QA_DATA.filter(q => q.subj === "社会").map(q => q.u))) : a.OLD,
      reviewPriority: "all", reviewLevel: "all", reviewType: "all"
    }));
    if (a.stars.length) localStorage.setItem("kq_battle_priority_v1", JSON.stringify(a.stars));
    // ★期待値はアプリと別に作る: 昔の単元を「正解した日が古い順」に並べる
    const byOld = oldIds.slice().sort((x, y) => st[x].lastCorrectAt - st[y].lastCorrectAt);
    // ★ 2026-09-26: 24 → 60 に広げた。■6の2回目はメインが0問になるので
    //   合計30問がぜんぶ復習になり、oldest[10..39] まで必要になるため
    return { oldest: byOld.slice(0, 60), oldIds: oldIds };
  }, { MAIN, OLD, count, mainN, stars, futureDue, shuffle, knownAll, seedSrc: seed.toString() });
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

console.log("■ 1. ★合計30問（今週の未クリア 20問）→ 足りない 10問が復習から入るか（昔の単元は全部クリアずみ・次に出す日は1年先）");
{
  const { ctx, page, errs, oldest } = await open({ mainN: 20, reviewN: 10 });
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
console.log("■ 2. ★合計40問（今週の未クリア 30問）→ 足りない 10問が復習から");
{
  const { ctx, page, errs } = await open({ mainN: 30, reviewN: 10 });
  const label = await page.$eval("#pool-count-label", e => e.textContent);
  const ids = await playIds(page, 40);
  const us = await unitOf(page, ids);
  const mainN = us.filter(u => u === MAIN).length, oldN = us.filter(u => OLD.indexOf(u) >= 0).length;
  // ★★2026-09-26 に仕様が変わったところ。
  //   旧: 問題数30 ＋ 復習30 は「足し算」で 40問
  //   新: ★問題数が**合計**。合計40のうちメインが30問しか無ければ、10問だけ復習から入る
  //   （ユーザー「合計を指定する、メインの問題数が、合計に満たない場合復習から持ってくる」）
  check("★合計は 40問で、内わけは 今遑30＋昔10",
    label.indexOf("40問") === 0 && mainN === 30 && oldN === 10,
    label + " / 今週 " + mainN + " / 昔 " + oldN);
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 3. ★最優先は復習ミックスに効くか");
{
  const probe = await open({ mainN: 20, reviewN: 10 });
  const starTargets = probe.oldIds.slice(-3);   // いちばん新しく正解した3問＝ふつうなら選ばれない
  await probe.ctx.close();
  const { ctx, page, errs, oldest } = await open({ mainN: 20, reviewN: 10, stars: starTargets });
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
  const { ctx, page, errs } = await open({ mainN: 20, reviewN: 10 });
  const texts = await page.evaluate(() => ({
    sectionTitles: Array.from(document.querySelectorAll(".section-title")).map(e => e.textContent.trim()).slice(0, 14),
    mixValue: document.querySelector("#review-mix-input").value,
    reviewUnits: Array.from(document.querySelectorAll("#review-unit-choices .choice"))
      .filter(e => e.classList.contains("selected")).map(e => e.dataset.unit)
  }));
  // ★★2026-09-26: この欄は「復習ミックスの問題数」ではなくなりました。
  //   今は「問題数を全部にしたときの、最低出題数」です。
  //   ★数字を選んでいるときは使わないので、0 のままで正しい。
  //   ★古い見出しが残っていないことを代わりに見ます（確認ポイント 4-3c）
  check("★古い見出し「復習ミックスの問題数」が画面に残っていない",
    texts.sectionTitles.every(t => t !== "復習ミックスの問題数"), texts.sectionTitles.join(" | "));
  check("★欄の見出しが「最低出題数」になっている",
    texts.sectionTitles.some(t => t.indexOf("最低出題数") >= 0), texts.sectionTitles.join(" | "));
  check("復習の単元として、昔の2単元が選ばれている", texts.reviewUnits.length === 2, texts.reviewUnits.join(" / "));
  console.log("    画面の見出し: " + texts.sectionTitles.join(" | "));
  await (await page.$("#review-mix-input")).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(ROOT, "tools/mikaku/shots/review_mix.png") });
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 5. ★はじめの状態（復習する単元を選び直していないとき）は何が足されるか");
{
  const { ctx, page, errs } = await open({ mainN: 20, reviewN: 10, knownAll: false });
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
  const { ctx, page, errs, oldest } = await open({ mainN: 20, reviewN: 10 });
  // ★★ 2026-09-26: 切り出し位置（以前は .slice(20) 固定）をやめました。
  //   1回目を全部〇で答えるとメインの20問がクリアずみになるので、
  //   ★2回目はメインが0問になり、合計30問が**ぜんぶ復習**になります。
  //   ★位置で切るとそこを読み違えるので、**単元で選びます**（確認ポイント 2-4: 位置照合を使わない）
  const pickOld = async (ids) => {
    const us = await unitOf(page, ids);
    return ids.filter((id, k) => OLD.indexOf(us[k]) >= 0);
  };
  const first = await pickOld(await playIds(page, 30));
  await page.click("#solo-result-home-btn"); await page.waitForTimeout(700);   // 30問やりきると結果の画面になる
  const second = await pickOld(await playIds(page, 30));
  const same = first.filter(i => second.indexOf(i) >= 0).length;
  check("★1回目に解いた復習の問題は、2回目には出てこない（次に古いものに進む）",
    same === 0, "1回目 " + first.length + "問 / 2回目 " + second.length + "問 / 重なり " + same + "問");
  check("★2回目に出た復習は、「1回目の次に古いもの」から順に続いている",
    JSON.stringify(second.slice().sort()) === JSON.stringify(oldest.slice(first.length, first.length + second.length).slice().sort()),
    "2回目 " + second.slice(0, 3).join(",") + "… / 期待 " + oldest.slice(10, 13).join(",") + "…");
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}
console.log("■ 7. ★来週になって単元を変えたら、先週の単元は自動で復習に入るか");
{
  const { ctx, page, errs } = await open({ mainN: 20, reviewN: 10 });
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
