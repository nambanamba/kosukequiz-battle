// ★「紙で出す」（2026-09-28）。依頼書: 司令塔\回答\理科_大問を紙で出す_依頼_2026-09-28.md B節
// ユーザー「大問見ました。やはり、かみじゃないとぜったいむりそうなものが混ざっていますね。
//   紙で出すボタンとか、紙で出すフラグとかつけて、紙で出す機能が欲しいです」
//
// ★理科担当が実際に paper:true を付けるのはこれから（本物の元データはまだ0件）。
//   ここでは daimon_data.js の「写し」に paper:true / paperReason を仮に付けて検査する
//   （確認ポイント 4-6o「本物のファイルを書く関数を、試しに呼ばない」と同じ考え方。本物の
//   元データ JSON・daimon_data.js は1バイトも書かない。サーバーが返す中身だけ差し替える）。
//
// ■ 見ること
//   P1 印の付いた大問の id（大問・小問とも）が QA_DATA に1つも入らない
//   P2 ホームの総数・「◯問」が、印の分だけ減る（印を付ける前と後を同じ画面・同じ関数で比べる）
//   P3 「紙で出す」ボタンは、理科・印が1件以上のときだけ出る（社会では出ない）
//   P4 一覧の「紙の大問」フィルタに印の付いた大問が出る。「大問」「一問一答」には出ない
//   P5 問題の紙に答え（a・aFile）が1文字も出ない。答えの紙には出る。改ページで別ページ
//   P6 印0件（元のまま）なら、印なし版と一問一答・大問の数が変わらない（4-6o の対照）
//
// ■ 自己テスト（★鳴るのが正しい）
//   (z) 紙の大問を QA_DATA から外す分岐そのものを消す → P1・P2 が鳴る
//
// 使い方: node tools/mikaku/paper_daimon_probe.mjs [--only z|now]
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const INDEX_SRC = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const DAIMON_SRC = fs.readFileSync(path.join(ROOT, "daimon_data.js"), "utf8");

// ---- daimon_data.js の「写し」を作る（本物は書かない）。印を付けるのは2つの大問だけ ----
function patchDaimon(src, keys, reasonOf) {
  let out = src, n = 0;
  for (const key of keys) {
    const needle = '"key": "' + key + '",';
    const cnt = out.split(needle).length - 1;
    if (cnt !== 1) throw new Error("大問が見つかりません（" + cnt + "件）: " + key);
    out = out.replace(needle, needle + '\n  "paper": true,\n  "paperReason": "' + reasonOf(key) + '",');
    n++;
  }
  if (n !== keys.length) throw new Error("印を付けた数が合いません");
  return out;
}
// 実データから「小問2つ以上」の大問を2つ選ぶ（決め打ちしない・4-6p）
const keysAll = [...DAIMON_SRC.matchAll(/"key": "([^"]+)"/g)].map(m => m[1]);
function itemCountOf(key) {
  const i = DAIMON_SRC.indexOf('"key": "' + key + '"');
  const next = DAIMON_SRC.indexOf('"key": "', i + 1);
  const block = DAIMON_SRC.slice(i, next < 0 ? DAIMON_SRC.length : next);
  return (block.match(/"id":/g) || []).length;
}
// ★本物の元データにすでに paper:true が付いている大問（2026-09-28〜）は候補から外す。
//   外さないと「すでに紙」の大問を選んでしまい、対照（base）との差分計算が合わなくなる
function alreadyPaper(key) {
  const i = DAIMON_SRC.indexOf('"key": "' + key + '"');
  const next = DAIMON_SRC.indexOf('"key": "', i + 1);
  const block = DAIMON_SRC.slice(i, next < 0 ? DAIMON_SRC.length : next);
  return /"paper":\s*true/.test(block);
}
const candidates = keysAll.filter(k => itemCountOf(k) >= 2 && !alreadyPaper(k));
if (candidates.length < 2) throw new Error("小問2つ以上・まだ紙でない大問が2つ見つかりません");
const PAPER_KEYS = [candidates[0], candidates[candidates.length - 1]];
const REASON = { [PAPER_KEYS[0]]: "作図が必要（テスト用の仮の印）", [PAPER_KEYS[1]]: "長い計算の途中式が要る（テスト用の仮の印）" };
const PATCHED_DAIMON = patchDaimon(DAIMON_SRC, PAPER_KEYS, k => REASON[k]);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
let SERVED_DAIMON = DAIMON_SRC;
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "daimon_data.js") { res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-store" }); res.end(Buffer.from(SERVED_DAIMON, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL0 = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });

async function withPage(daimonSrc, fn) {
  SERVED_DAIMON = daimonSrc;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(String(e)));
  p.on("dialog", d => d.accept().catch(() => {}));
  await p.goto(URL0); await p.waitForTimeout(500);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(700);
  const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
  try { await fn(p, check); } catch (e) { check("例外なく走りきる", false, String(e.message || e).split("\n")[0]); }
  check("画面のエラー0", errs.length === 0, errs.slice(0, 2).join(" / "));
  await ctx.close();
  return out;
}

let pass = 0, fail = 0;
function report(title, out) {
  console.log("\n── " + title + " ──");
  for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.name + (c.extra ? " … " + c.extra : "")); c.ok ? pass++ : fail++; }
}

const only = process.argv.indexOf("--only") >= 0 ? process.argv[process.argv.indexOf("--only") + 1] : null;

// ---- 対照: 素の daimon_data.js（写しに何も足す前）の理科の総数・「◯問」を測る ----
//   ★2026-09-28: 本物の元データにすでに paper:true が付いている（理科担当が印を付け終わった）。
//   「印0件」ではなく「いま実際に付いている数」で期待値を作る（4-6p: 決め打ちしない）
const realPaperKeys = keysAll.filter(alreadyPaper);
const baseOut = [];
let baseTotal = 0, basePoolLabel = "";
{
  const out = await withPage(DAIMON_SRC, async (p, check) => {
    await p.click("#subject-science"); await p.waitForTimeout(300);
    baseTotal = await p.evaluate(() => parseInt(document.getElementById("stat-total").textContent, 10));
    basePoolLabel = await p.evaluate(() => document.getElementById("pool-count-label").textContent);
    const paperBtn = await p.evaluate(() => getComputedStyle(document.getElementById("paper-open-btn")).display);
    const wantShown = realPaperKeys.length > 0;
    check("★P3 素の daimon_data.js（紙 " + realPaperKeys.length + "件）で「紙で出す」ボタンの表示が正しい",
      (paperBtn !== "none") === wantShown, paperBtn + " ／ 紙 " + realPaperKeys.length + "件");
    check.p = p;
  });
  report("(base) 素の daimon_data.js（紙 " + realPaperKeys.length + "件） ── 対照", out);
}

// ---- 印を2件付けた写しで検査 ----
if (!only || only === "now") {
  const flaggedItemCounts = PAPER_KEYS.map(k => itemCountOf(k));
  const out = await withPage(PATCHED_DAIMON, async (p, check) => {
    await p.click("#subject-science"); await p.waitForTimeout(300);
    const total = await p.evaluate(() => parseInt(document.getElementById("stat-total").textContent, 10));
    const poolLabel = await p.evaluate(() => document.getElementById("pool-count-label").textContent);
    const poolN = parseInt(poolLabel, 10);
    const basePoolN = parseInt(basePoolLabel, 10);

    // ---- P1 ----
    for (const k of PAPER_KEYS) {
      const r = await p.evaluate((key) => {
        const g = DAIMON_DATA.find(x => x.key === key);
        const itemIds = g ? g.items.map(i => i.id) : [];
        return { inQA: QA_DATA.some(d => d.id === key), itemInQA: itemIds.some(id => QA_DATA.some(d => d.id === id)) };
      }, k);
      check("★P1 印の付いた大問 " + k + " が QA_DATA に無い", r.inQA === false, r.inQA);
      check("★P1 その小問も QA_DATA に無い", r.itemInQA === false, r.itemInQA);
    }

    // ---- P2: 総数・「◯問」が、印を付けた分だけ減る（同じ答える小問の数え方 weightOf を使わせる。UIの数字だけを見る） ----
    // ★「答える小問」の数え方は本体の weightOf と同じ関数を使わせるため、印を付ける前に一度も
    //   出題していない（前回○が無い）状態＝小問の数がそのまま答える小問の数、という前提で比べる
    check("★P2 印を付けた分（小問 " + flaggedItemCounts.join("+") + "）だけ総数が減っている",
      baseTotal - total === flaggedItemCounts.reduce((a, b) => a + b, 0), baseTotal + " → " + total);
    check("★P2 「◯問」（全部・全単元）も同じだけ減っている",
      basePoolN - poolN === flaggedItemCounts.reduce((a, b) => a + b, 0), basePoolN + " → " + poolN);

    // ---- P3: 「紙で出す」ボタンは理科・印1件以上のときだけ出る ----
    const paperBtnSci = await p.evaluate(() => getComputedStyle(document.getElementById("paper-open-btn")).display);
    check("★P3 理科・印2件のとき「紙で出す」ボタンが出る", paperBtnSci !== "none", paperBtnSci);
    await p.click("#subject-social"); await p.waitForTimeout(200);
    const paperBtnSoc = await p.evaluate(() => getComputedStyle(document.getElementById("paper-open-btn")).display);
    check("★P3 社会では「紙で出す」ボタンが出ない", paperBtnSoc === "none", paperBtnSoc);
    await p.click("#subject-science"); await p.waitForTimeout(200);

    // ---- P4: 一覧のフィルタ ----
    await p.click("#list-btn"); await p.waitForTimeout(400);
    // ★一覧は「単元か絞りこみを選ぶまで何も描かない」作り（listHasCondition）。
    //   全単元のままだと種類を選んでも何も出ないので、段を1つ選んで条件を満たす
    await p.click('.list-filter-toggle[data-tier="0"]'); await p.waitForTimeout(150);
    await p.click('#list-kind-row .toggle[data-list-kind="paper"]'); await p.waitForTimeout(300);
    const paperRows = await p.evaluate(() => [...document.querySelectorAll("#list-items .daimon-list-item")].map(e => e.dataset.daimonKey));
    check("★P4 一覧「紙の大問」に印の付いた大問が両方出る", PAPER_KEYS.every(k => paperRows.includes(k)), paperRows.join(","));
    const listCountTxt = await p.evaluate(() => document.getElementById("list-count").textContent);
    check("★P4 件数の表示が出題の「◯問」と別の文言（混ぜない）", listCountTxt.includes("紙の大問") && listCountTxt.includes("出題には出ません"), listCountTxt);

    await p.click('#list-kind-row .toggle[data-list-kind="daimon"]'); await p.waitForTimeout(300);
    const daimonRows = await p.evaluate(() => [...document.querySelectorAll("#list-items .daimon-list-item")].map(e => e.dataset.daimonKey));
    check("★P4 「大問」フィルタに印の付いた大問は出ない", PAPER_KEYS.every(k => !daimonRows.includes(k)), daimonRows.filter(k => PAPER_KEYS.includes(k)).join(","));

    await p.click('#list-kind-row .toggle[data-list-kind="qa"]'); await p.waitForTimeout(300);
    const qaHasDaimon = await p.evaluate(() => document.querySelectorAll("#list-items .daimon-list-item").length > 0);
    check("「一問一答」フィルタに大問（紙もふつうも）が出ない", qaHasDaimon === false, qaHasDaimon);
    await p.click("#list-back"); await p.waitForTimeout(300);

    // ---- P5: 問題の紙に答えが1文字も出ない・答えの紙には出る・改ページで分かれる ----
    await p.click("#paper-open-btn"); await p.waitForTimeout(300);
    const rowKeys = await p.evaluate(() => [...document.querySelectorAll("#paper-list-body .paper-row")].map(e => e.dataset.key));
    check("紙の一覧に印の付いた大問が両方出る", PAPER_KEYS.every(k => rowKeys.includes(k)), rowKeys.join(","));
    for (const k of PAPER_KEYS) {
      await p.click('.paper-row[data-key="' + k + '"]'); await p.waitForTimeout(300);
      const info = await p.evaluate((key) => {
        const g = DAIMON_DATA.find(x => x.key === key);
        const sheets = [...document.querySelectorAll("#paper-print-body .paper-sheet")];
        const qSheet = sheets[0], aSheet = sheets[1];
        const qHtml = qSheet ? qSheet.textContent : "";
        const aHtml = aSheet ? aSheet.textContent : "";
        const answers = g.items.map(it => it.a).filter(Boolean);
        // ★構造で見る（本体）: 答えを入れる要素（.paper-item-a）そのものが問題の紙に無いか。
        //   「イ」「H」のような1文字の答えは、文字列一致だとリード文・他の設問に必ず紛れて
        //   誤検出になる（確認ポイント 0-1）。DOM の要素の有無で見れば、この型を避けられる
        const qHasAnswerEl = qSheet ? qSheet.querySelectorAll(".paper-item-a").length > 0 : true;
        const aFileNames = g.items.map(it => it.aFile).filter(Boolean);
        const qImgSrcs = qSheet ? [...qSheet.querySelectorAll("img")].map(im => im.getAttribute("src") || "") : [];
        const qHasAnswerImg = aFileNames.some(n => qImgSrcs.some(src => src.includes(n)));
        // ★参考: 2文字以上の答えの文字列一致（1文字の答えは判定できないので対象外・0-1）
        const longAnswers = answers.filter(a => a.length >= 2);
        const qHasLongAnswerText = longAnswers.some(a => qHtml.includes(a));
        return {
          nSheets: sheets.length,
          qHasAnswerEl, qHasAnswerImg, qHasLongAnswerText,
          aHasAllAnswers: answers.every(a => aHtml.includes(a)),
          qBreak: qSheet ? qSheet.classList.contains("paper-page-break") : false,
        };
      }, k);
      check("P5 " + k + " 問題の紙・答えの紙の2枚がある", info.nSheets === 2, info.nSheets);
      check("★P5 " + k + " 問題の紙に答えの要素（.paper-item-a）が無い", info.qHasAnswerEl === false, info.qHasAnswerEl);
      check("★P5 " + k + " 問題の紙に答えの図（aFile）が無い", info.qHasAnswerImg === false, info.qHasAnswerImg);
      check("P5 " + k + " 問題の紙に2文字以上の答えの文字列が紛れていない（参考）", info.qHasLongAnswerText === false, info.qHasLongAnswerText);
      check("P5 " + k + " 答えの紙に全部の答えが出る", info.aHasAllAnswers === true, info.aHasAllAnswers);
      check("P5 " + k + " 問題の紙が改ページで分かれている", info.qBreak === true, info.qBreak);
      await p.click("#paper-print-back"); await p.waitForTimeout(300);
    }
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check("横のはみ出し 0", ov <= 0, ov);
  });
  report("(now) 印を2件付けた写し", out);
}

// ---- (z) 自己テスト: 除外分岐そのものを消した偽物で、P1・P2 が鳴るか ----
if (!only || only === "z") {
  const needle = 'if(g.paper === true){\r\n      // ★紙の大問はここで止める。QA_DATA にも DAIMON_ITEM にも入れない\r\n      PAPER_DAIMON.push(Object.assign({u: u}, g));\r\n      return;\r\n    }\r\n';
  const cnt = INDEX_SRC.split(needle).length - 1;
  if (cnt !== 1) {
    console.log("\n── (z) 偽の実装を作れません（" + cnt + "件） ──");
    fail++;
  } else {
    const fakeIndex = INDEX_SRC.replace(needle, "");
    // このテストだけ index.html も差し替えて配る
    const fakeServer = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"] }); res.end(Buffer.from(fakeIndex, "utf8")); return; }
      if (rel === "daimon_data.js") { res.writeHead(200, { "content-type": MIME[".js"] }); res.end(Buffer.from(PATCHED_DAIMON, "utf8")); return; }
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
    });
    await new Promise(r => fakeServer.listen(0, "127.0.0.1", r));
    const fakeUrl = "http://127.0.0.1:" + fakeServer.address().port + "/index.html";
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(fakeUrl); await p.waitForTimeout(500);
    await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(700);
    await p.click("#subject-science"); await p.waitForTimeout(300);
    const r = await p.evaluate((keys) => keys.map(k => QA_DATA.some(d => d.id === k)), PAPER_KEYS);
    const zOk = r.some(v => v === true);   // ★偽の実装では、印の付いた大問が QA_DATA に入ってしまうはず
    console.log("\n── (z) 偽の実装: 紙の除外分岐を消す … ★鳴るのが正しい ──");
    console.log("  " + (zOk ? "✔" : "✘") + " 印の付いた大問が QA_DATA に入ってしまう（鳴った） … " + JSON.stringify(r));
    console.log(zOk ? "  → ✔ 自己テスト合格" : "  → ✘ 自己テスト不合格（鳴るべきなのに鳴らない）");
    zOk ? pass++ : fail++;
    await ctx.close();
    fakeServer.close();
  }
}

await browser.close();
server.close();
console.log("\n===== 合計: " + pass + " 件成功 / " + fail + " 件失敗 =====");
process.exit(fail ? 1 : 0);
