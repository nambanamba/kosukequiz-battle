// ★「社会の第1〜4回をまとめて、まちがえた問題だけ」が、いまの画面で何タップで出せるかを見る。
//
// 使い方: node tools/mikaku/narrow_probe.mjs
//
// ■ なぜ要るか（2026-09-21 ユーザー「第5回の準備を。1-4の復習かとは思いますが、結局全部はできないので」）
//   第1〜4回は 437問。**全部はできない**ので、**絞って回せるか**を、作る前に実機で確かめる。
//
// ■ 何を見るか
//   A. 初めて開いたとき、何タップで「1〜4回 × よく間違える」になるか
//   B. ★開き直したとき、その設定が残っているか（毎回えらび直しが要るか）
//   C. 正誤の記録ごとに、何問になるか（★テスト用の記録。お子さんの端末の記録ではない）
//        ① ふつう（まちがえた30問・正解ずみ150問・残りは未実施）
//        ② ★新しく始めた子（記録なし）＝まちがえた問題 0件
//        ③ ★全部できた子（全問 2回連続正解）＝まちがえた問題 0件
//   D. ★「問題がありません」で止まらないか（0件のとき）
//
// ■ ★見ていないもの（4-2）
//   - **お子さんの実際の記録での問題数**（端末の中にしか無い）
//   - 二人対戦のとき（ここは一人の練習だけ）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_narrow");
fs.mkdirSync(SHOTS, { recursive: true });
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

// 記録を仕込んで開く。settings は null なら「初めて開いた」状態
async function open(statsKind, settings) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", d => d.accept());
  await page.goto(BASE); await page.waitForTimeout(600);
  await page.evaluate(({ statsKind, settings }) => {
    localStorage.clear();
    const ids = QA_DATA.filter(q => q.subj === "社会" && /^第[1-4]回/.test(q.u) && q.kind !== "calc").map(q => q.id);
    const st = {}, day = 86400000, now = Date.now();
    if (statsKind === "normal") {
      // まちがえた30問（間違えて、まだ正解していない）／ 正解ずみ150問（2連続正解）／ 残りは未実施
      ids.forEach((id, i) => {
        if (i % 14 === 0) st[id] = { correct: 0, wrong: 1, box: 0, lastAnswered: now - day };   // ★437問中 32問
        else if (i % 3 === 0) st[id] = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 3 * day, lastAnswered: now - 3 * day };
      });
    } else if (statsKind === "allDone") {
      ids.forEach(id => { st[id] = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 3 * day, lastAnswered: now - 3 * day }; });
    }
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
    if (settings) localStorage.setItem("kq_battle_settings_v1", JSON.stringify(settings));
  }, { statsKind, settings });
  await page.reload(); await page.waitForTimeout(900);
  return { ctx, page };
}
const label = page => page.$eval("#pool-count-label", e => e.textContent);
// ★index.html の本体は <script type="module"> なので、selectedUnits や isWeak は外から見えない。
//   **画面に出ているもの**と**保存されたもの（localStorage）**から読む。
//   isWeak は index.html と同じ式: wrong > 0 && box <= 1
const weakCount = page => page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}");
  return QA_DATA.filter(q => q.subj === "社会" && /^第[1-4]回/.test(q.u) && q.kind !== "calc").filter(q => {
    const s = st[q.id]; return !!s && (s.wrong || 0) > 0 && (s.box || 0) <= 1;
  }).length;
});
const selUnits = page => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("kq_battle_settings_v1") || "{}");
  return (s.unitsBySubject && s.unitsBySubject["社会"]) || s.units || [];
});

// ── A・B: タップ数と、設定が残るか ──
console.log("\n── A. 初めて開いたとき、「1〜4回 × よく間違える」まで何タップか ──");
let taps = 0, savedSettings = null;
{
  const { ctx, page } = await open("normal", null);
  console.log("  開いた直後:           " + await label(page) + "  ← ★既定は全単元が選ばれている");
  // ★2026-09-21 に1回踏んだ: 全部選ばれている状態で「歴史」を押すと、**歴史が外れる**（1377→940問）。
  //   だから先に「全単元」で空にする。これがいまの画面の正しい手順
  await page.$eval('.choice[data-unit="ALL"]', e => e.click()); taps++;
  console.log("  ① 「全単元」で空にする: " + await label(page));
  await page.$eval('.unit-group-check[data-group-check="history"]', e => e.click()); taps++;
  const sel = await selUnits(page);
  console.log(`  ② 「歴史」のチェック:  ${await label(page)}  ← 選ばれた単元 ${sel.length}つ: ${sel.map(u => u.split(".")[0]).join("・")}`);
  // ★2026-09-21 第5回（総合）が入って、「歴史」は第1〜5回になった（`u.startsWith("第")` で分けている）。
  //   「第◯回」で始まる単元が**全部**入っていること、を見る
  const allDai = await page.evaluate(() => [...new Set(QA_DATA.filter(q => q.subj === "社会" && q.u.startsWith("第")).map(q => q.u))]);
  check("★「歴史」のチェック1回で、「第◯回」の単元がまとめて選ばれる",
        sel.length === allDai.length && allDai.every(u => sel.includes(u)), `${sel.length}単元: ${sel.map(u => u.split(".")[0]).join("・")}`);
  await page.$eval("#mode-weak", e => e.click()); taps++;
  console.log("  ③ 「よく間違える」:    " + await label(page));
  const startText = await page.$eval("#solo-start-btn", e => e.textContent);
  console.log(`  ④ 「${startText}」を押せば始まる`); taps++;
  console.log(`  ★初めては ${taps}タップ`);
  savedSettings = await page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_settings_v1")));
  await page.screenshot({ path: path.join(SHOTS, "A_after_setup.png"), fullPage: true });
  await ctx.close();
}

console.log("\n── B. ★開き直したとき、設定が残っているか ──");
{
  const { ctx, page } = await open("normal", savedSettings);
  const sel = await selUnits(page);
  const weakOn = await page.$eval("#mode-weak", e => e.classList.contains("on"));
  console.log(`  選ばれている単元: ${sel.map(u => u.split(".")[0]).join("・")} ／ よく間違える: ${weakOn ? "ON" : "OFF"}`);
  console.log("  問題数の表示: " + await label(page));
  check("★開き直しても、単元とトグルが残っている（次からは1タップ）",
        sel.length >= 4 && weakOn);
  await ctx.close();
}

// ── C・D: 記録ごとの問題数 ──
console.log("\n── C. 記録ごとに、何問になるか（「全部」のまま）──");
const setAll = { ...savedSettings, count: "all" };
for (const [kind, name] of [["normal", "① ふつう（まちがえた30問）"],
                            ["none", "② ★新しく始めた子（記録なし）"],
                            ["allDone", "③ ★全部できた子（全問 2連続正解）"]]) {
  const { ctx, page } = await open(kind, setAll);
  const w = await weakCount(page);
  const lab = await label(page);
  const btn = await page.$eval("#solo-start-btn", e => ({ text: e.textContent, disabled: e.disabled }));
  console.log(`  ${name}\n      まちがえた問題 ${w}問 → 表示「${lab}」 ／ ボタン「${btn.text}」${btn.disabled ? " ★押せない" : ""}`);
  if (kind === "normal") check("まちがえた問題だけに絞れている（437問より大きく減る）", parseInt(lab) === w, `${lab}`);
  // ★★ 2026-09-26 にユーザーが、2026-09-13 の判断をこの道に限って上書きしました。
  //   09-13: 「苦手が0問になってもボタンは押せるように」
  //   09-26: ★「（未クリアも復習も0問の日は）「問題がありません」でいい」
  //   ★選んだ単元の残りから黙って埋めるのをやめたためです（fillFromRest 廃止）。
  //   ⚠★「昔の判断に反している」と思って戻さないこと。
  //   ★ここは「全部」＋最低出題数 0 なので、復習も入りません。
  //   ★復習で埋まる側の枝は、下の C2 と total_fill_probe.mjs で見ています
  else check("★メインも0問・復習も0問なら「問題がありません」で止まる",
    btn.disabled && btn.text.includes("問題がありません"), btn.text);
  await page.screenshot({ path: path.join(SHOTS, `C_${kind}.png`), fullPage: true });
  await ctx.close();
}

console.log("\n── C2. 問題数を「20問」にしたとき ──");
for (const [kind, name] of [["normal", "① ふつう"], ["none", "② 記録なし"]]) {
  // ★設定は教科ごとにも保存されていて、上書きしても教科側が勝つ。**画面で押して**変える
  const { ctx, page } = await open(kind, savedSettings);
  await page.$eval('.count-choice[data-count="20"]', e => e.click());
  // ★出る順は外から取れない（module）。表示の数だけ見る。順番はコード（orderByTiers / fillFromRest）で確認
  console.log(`  ${name}: 表示「${await label(page)}」`);
  await ctx.close();
}

await browser.close(); server.close();
console.log(`\n写真: ${SHOTS}`);
console.log(ng === 0 ? "✔ すべて確認できた" : `✘ ${ng}件 だめだった`);
console.log("★問題数はテスト用の記録です。**お子さんの端末での実数は、ここでは分かりません。**");
process.exit(ng === 0 ? 0 : 1);
