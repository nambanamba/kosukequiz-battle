// ★3段の並び順を「実機（PCに入っている本物のChrome・スマホ幅390px）」で目視する。
//   テストが緑でも、実際の画面で並びが見えなければ意味がないため（B-12）。
//   使い方: node tools/mikaku/tier_order_probe.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

// ★playwright はこのPCではグローバルにしか入っていない（`npx playwright install` が
//   通らないため）。mikaku_check2.mjs と同じ読み方にそろえる
const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(gRoot, "playwright", "index.mjs")).href);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const MIME = { ".html":"text/html", ".js":"application/javascript", ".jpg":"image/jpeg",
               ".png":"image/png", ".css":"text/css", ".ico":"image/x-icon" };
const srv = http.createServer((q, s) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]) === "/" ? "index.html" : decodeURIComponent(q.url.split("?")[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(s);
}).listen(0);
const BASE = "http://127.0.0.1:" + srv.address().port + "/index.html";

const browser = await chromium.launch({ channel: "chrome", headless: false });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on("pageerror", e => errs.push(e.message));
page.on("dialog", d => d.accept());
await page.goto(BASE); await page.waitForTimeout(800);

const UNIT = "夏期講習 復習編2.工業・資源・輸送機関";
const DAY = 86400000, T0 = Date.now();
// ★ありそうな状態を作る: 半分は手つかず、いくつか間違えたまま、いくつかは卒業ずみ
const seeded = await page.evaluate(([u, T0, DAY]) => {
  const ids = QA_DATA.filter(q => q.u === u).map(q => q.id);
  localStorage.clear();
  const st = {};
  ids.forEach((id, i) => {
    if (i % 3 === 0) return;                                        // 1段目: 手つかず
    if (i % 3 === 1) st[id] = { correct: 1, wrong: 2, box: 0,       // 2段目: 苦手
      lastCorrectAt: T0 - (60 - i) * DAY, lastAnswered: T0 - DAY };
    else st[id] = { correct: 4, wrong: 1, box: 3,                   // 3段目: 卒業ずみ
      lastCorrectAt: T0 - (30 - i % 20) * DAY, lastAnswered: T0 - DAY };
  });
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4":1, "lastcorrect-backfill":1 }));
  return ids.length;
}, [UNIT, T0, DAY]);
await page.reload(); await page.waitForTimeout(800);

// 単元をこの1つにして、未クリア＋よく間違える をONにする
await page.click('#unit-choices .choice[data-unit="ALL"]');
await page.waitForTimeout(200);
if ((await page.$$('#unit-choices .choice.selected')).length) {
  await page.click('#unit-choices .choice[data-unit="ALL"]'); await page.waitForTimeout(200);
}
// ★夏期講習の単元は「地理」グループの中。アコーディオンを開かないと押せない
//   （UNIT_GROUPS の geo は「公民でも第◯回でもないもの」）
const gh = await page.$('#unit-choices .unit-group-header[data-group="geo"]');
if (gh && !(await gh.evaluate(e => e.classList.contains("open")))) await gh.click();
await page.waitForTimeout(250);
await page.click(`#unit-choices .choice[data-unit="${UNIT}"]`); await page.waitForTimeout(200);
// ★ 2026-09-26: 出題モードが段の選択になった。
//   経路1は「メイン側で 1段目と2段目を見る」ので、その2つだけ ON
await page.evaluate(() => {
  document.querySelectorAll(".mode-filter").forEach(e => {
    if (e.classList.contains("on") !== (e.dataset.tier !== "2")) e.click();
  });
  const b = [...document.querySelectorAll(".count-choice")].find(e => e.dataset.count === "all");
  if (b && !b.classList.contains("on")) b.click();
});
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(HERE, "tier_order_1_設定.png") });

await page.click("#solo-start-btn"); await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(HERE, "tier_order_2_1問目.png") });

const rows = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("kq_battle_solo_session_v1") || "{}");
  const ids = s.quizIds || (s.quizQueue || []).map(i => QA_DATA[i].id);
  const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}");
  return ids.map(id => {
    const r = st[id];
    const tier = !r ? "1 未実施" : ((r.wrong||0) > 0 && (r.box||0) <= 1 ? "2 苦手  " : "3 それ以外");
    const d = r && r.lastCorrectAt ? new Date(r.lastCorrectAt).toISOString().slice(0,10) : "（正解なし）";
    return { id, tier, 最後に正解: d, 連続正解: r ? (r.box||0) : "-", まちがえ: r ? (r.wrong||0) : "-" };
  });
});
console.log("");
console.log("【経路1】メイン側: " + UNIT + "（" + seeded + "問）／未クリア＋よく間違える をON／全部");
console.table(rows);
// ★ここを `[...tiers].sort().join()` と書いて、区切り文字が入って必ず❌になりました。
//   **引数なしの join はカンマ区切り**で、検査そのものが壊れていた。アプリは正しかった
const asc = a => a.join("") === [...a].sort().join("");
const report = (label, rs) => {
  const tiers = rs.map(r => r.tier[0]);
  const n = c => tiers.filter(x => x === c).length;
  console.log("  段の並び: " + tiers.join("")
    + "\n  （1段目 " + n("1") + "問 / 2段目 " + n("2") + "問 / 3段目 " + n("3") + "問）");
  console.log(asc(tiers) ? "  ✅ " + label + ": 段が昇順（混ざっていない）"
                         : "  ❌ " + label + ": 段が混ざっている");
  let prev = "";
  rs.forEach((r, i) => { if (r.tier !== prev) {
    console.log("    " + String(i + 1).padStart(3) + "問目から " + r.tier + "（" + r.id + "）"); prev = r.tier; } });
};
report("経路1", rows);
console.log("  → ★3段目が0問なのは正しい。トグルが先に絞りこむため（buildFinalPool のコメント）");

// ---- 経路2: 復習ミックス（★全3段が実際に並ぶのはこちら）----
await page.click("#solo-back"); await page.waitForTimeout(500);
await page.evaluate(() => {
  // ★経路2 は「ふだんの出題」なので、3段とも ON（旧「トグルを切る」と同じ意味）
  document.querySelectorAll(".mode-filter").forEach(e => {
    if (!e.classList.contains("on")) e.click();
  });
  const o = document.getElementById("order-toggle");         // ランダム順ではなく出題順どおり
  if (!o.classList.contains("on")) o.click();
});
await page.click(`#unit-choices .choice[data-unit="${UNIT}"]`); await page.waitForTimeout(200);
const oh = await page.$('#unit-choices .unit-group-header[data-group="history"]');
if (oh && !(await oh.evaluate(e => e.classList.contains("open")))) await oh.click();
await page.waitForTimeout(250);
const other = await page.evaluate(() => {
  const e = [...document.querySelectorAll("#unit-choices .choice")].find(x => x.dataset.unit.startsWith("第"));
  return e ? e.dataset.unit : null;
});
await page.click(`#unit-choices .choice[data-unit="${other}"]`); await page.waitForTimeout(200);
await page.evaluate(() => {
  // ★★ 2026-09-26: 出題の組み立てが変わりました。問題数は**合計**になり、
  //   復習ミックスは**合計に足りない分を埋める**形になった。
  //   「問題数10 ＋ 復琡82」では **復習が1問も入らない**（メインだけで10問埋まるため）。
  // ⚠★そのままだと rows2 が空になり、**「段が昇順」を中身ゼロで通してしまっていた**
  //   （確認ポイント 4-6g: 一部が満たされた瞬間に黙る検査）。
  // → ★合計を「メイン＋復習が全部入る大きな数」にして、復習を実際に入れる。
  //   ★期待値を緩めたのではなく、測りたいものが並ぶ状態を作り直した（4-1b）
  const b = document.querySelector(".count-choice-custom");
  if (b && !b.classList.contains("on")) b.click();
});
await page.fill("#count-custom-input", "999");
await page.dispatchEvent("#count-custom-input", "change"); await page.waitForTimeout(300);
await page.click("#review-unit-clear-link"); await page.waitForTimeout(200);
const rh = await page.$('#review-unit-choices .unit-group-header[data-review-group="geo"]');
if (rh && !(await rh.evaluate(e => e.classList.contains("open")))) await rh.click();
await page.waitForTimeout(250);
await page.click(`#review-unit-choices .choice[data-unit="${UNIT}"]`); await page.waitForTimeout(200);
// ★ review-mix-input は「問題数＝全部」のときの**最低出題数**に役割が変わった。
//   ここは数字（999）を選んでいるので、この欄は使わない（2026-09-26）
await page.waitForTimeout(300);
await page.click("#solo-start-btn"); await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(HERE, "tier_order_3_復習ミックス.png") });
const rows2 = (await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("kq_battle_solo_session_v1") || "{}");
  const ids = s.quizIds || (s.quizQueue || []).map(i => QA_DATA[i].id);
  const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}");
  return ids.map(id => {
    const r = st[id];
    return { id, tier: !r ? "1 未実施" : ((r.wrong||0) > 0 && (r.box||0) <= 1 ? "2 苦手" : "3 それ以外") };
  });
}));
// ★メインの問数は実測して切る（数を決め打ちしない・4-6b / C-8b）
const mainN2 = await page.evaluate(u => QA_DATA.filter(q => q.u === u && q.kind !== "calc").length, other);
const rows2b = rows2.slice(mainN2);
console.log();
console.log("【経路2】復習ミックス: メイン " + other + " " + mainN2 + "問 ＋ " + UNIT + " の復習 " + rows2b.length + "問（合計 " + rows2.length + "問）");
// ★★中身ゼロで通さない。復習が1問も入っていなければ、それ自体が不具合（4-6g）
if (rows2b.length === 0) {
  console.log("  ❌ 経路2: ★復習が1問も入っていません。中身ゼロで通してしまうので止めます");
  process.exitCode = 1;
} else {
  report("経路2", rows2b);
}

console.log(errs.length ? "\n  ❌ JSエラー: " + errs.join(" / ") : "\n  ✅ JSエラーなし");
console.log("画面: tools/mikaku/tier_order_1_設定.png ／ _2_1問目.png ／ _3_復習ミックス.png");
await page.waitForTimeout(2500);
await browser.close(); srv.close();
