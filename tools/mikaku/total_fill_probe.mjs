// ★★「問題数は合計。足りない分は復習ミックスから埋める。それでも足りなければ、足りないと画面に出す」
//    を、実際に出題させて数えて確かめる。
//
// 使い方: node tools/mikaku/total_fill_probe.mjs
//
// ■ なぜ要るか（2026-09-26 ユーザー依頼）
//   「気づいたら全部クリアになっていて、繰り返しやってました。
//     未クリアが半分くらいになったら、復習を入れたいんですよね」
//   「合計を指定する、メインの問題数が、合計に満たない場合復習から持ってくる」
//   「復習ミックスからで。いまは、復習ミックスの問題数を指定していますが、
//     足りないときに自動で持ってきてほしいです」
//   「問題数：全部」も直す →「最低◯問を決めて、そこまで埋める」
//   ★「埋めない。12問で出して、足りないと画面に出す」
//   ★「（未クリアも復習も0問の日は）「問題がありません」でいい」
//   依頼書 = 司令塔\回答\対戦_合計を決めて足りない分を復習で埋める_依頼_2026-09-26.md
//
// ■ ★文字列を探すのではなく、実際に出題させて出た id を数える（確認ポイント 4-6c 末尾）
//   本物の Chrome（390px）で一人練習を通し、出た問題の id と単元を全部読む。
//
// ■ ★分岐を両方通す（4-6e）。未クリアが多い日・少ない日・0問の日を必ず作る
//   A 未クリアが多い日（30問）… 合計20 → メインだけで20。復習は入らない
//   B 未クリアが少ない日（12問）… 合計20 → メイン12＋復習8。★重複なし
//   C 未クリアが0問の日        … 合計20 → ぜんぶ復習20
//   D ★「全部」＋未クリア0問   … 最低15 → 15問。★選んだ単元の全問（121問）が出ないこと
//   E ★復習の候補が0問        … 合計20・メイン12 → 12問で出し、★足りないと画面に出す
//   F ★メインも復習も0問       … ★「問題がありません」でボタンが押せない
//   G 並び（正解した日が古い順）が保たれているか
//   H ★最優先（★印）の扱いが変わっていないか（依頼書の失敗6）
//   I ★画面の文言が、変えたあとの動きと食いちがっていないか（失敗10・4-3c）
//
// ■ ★入口の自己テスト（4-6）。本番の前に必ず走り、外れたら本番の数字を出さずに終わる
//   (a) 復習で埋めない偽の実装                     … ★鳴るのが正しい
//   (b) 埋める側を重複ありで作る偽の実装           … ★鳴るのが正しい（失敗2）
//   (c) 「全部」の崖を直さない偽の実装             … ★鳴るのが正しい（失敗3）
//   (d) ★復習の候補が0問のとき、黙って選んだ単元の残りで埋める偽の実装 … ★鳴るのが正しい（失敗4・12）
//   (e) 対照 BASE_COMMIT（直す前）                 … ★鳴るのが正しい（4-6c。HEAD で表さない）
//   そして本番 (f) いまの index.html               … ★鳴らないのが正しい（4-3 網を広げすぎていない側）
//   ★偽の実装は**出荷される index.html から組み立てる**（写しを持たない・4-6d）。
//     置換できなかったら例外で止める（＝壊し損ねを「異常なし」に化けさせない・4-1）
//
// ■ ★見ていないもの（4-2）
//   - 二人対戦の通信。★ホストが出題を組み立てて id を送るので、ホストとゲストで
//     ずれる作りになっていない（依頼書の失敗8）。ここは一人練習で組み立てだけを見る
//   - 「チェックのみ（採点・記録なし）」で stats が動かないこと（失敗5）。
//     ★今回 reviewMode の枝は1行も触っていないため、ここでは見ていない
//   - 間隔反復（nextDue）。依頼書で「今回さわらないこと」とされている
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_totalfill");
fs.mkdirSync(SHOTS, { recursive: true });

// ★対照はコミットで固定する（4-6c）。HEAD にすると、直したものを commit した瞬間に対照でなくなる
const BASE_COMMIT = "e1d1167";

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();

const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// ---- 偽の実装（★出荷される index.html から組み立てる。写しを持たない・4-6d）----
function cut(src, needle, replacement, what) {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error("偽の実装を作れません（" + what + " が " + n + " 件。1件でないと壊し損ねます）");
  return src.replace(needle, replacement);
}
const FILL_BLOCK =
  "  const want = Math.max(0, target - main.length);\n" +
  "  let review = [];\n" +
  "  if(want > 0){\n" +
  "    const has = new Set(main);\n" +
  "    review = orderReviewCandidatesByWeakness(buildReviewPool()).filter(i => !has.has(i)).slice(0, want);\n" +
  "  }\n";
// (a) 復習で埋めない
const fakeNoFill = src => cut(src, FILL_BLOCK,
  "  const want = Math.max(0, target - main.length);\n  let review = [];   /* ★偽の実装: わざと埋めない */\n",
  "埋める枝");
// (b) 埋める側を重複ありで作る（同じ問題が2回出る）
const fakeDuplicate = src => cut(src, FILL_BLOCK,
  "  const want = Math.max(0, target - main.length);\n  let review = [];\n  if(want > 0){\n" +
  "    /* ★偽の実装: 復習プールではなくメインのプールから、重複も外さずに取る */\n" +
  "    review = orderReviewCandidatesByWeakness(buildPool()).slice(0, want);\n  }\n",
  "埋める枝");
// (c) 「全部」の崖を直さない（未クリア0問のとき、選んだ単元の全問を出す）
const ALL_SLICE = '  if(questionCount !== "all") main = main.slice(0, questionCount);\n';
const fakeCliff = src => cut(src, ALL_SLICE,
  ALL_SLICE +
  '  /* ★偽の実装: 「全部」で0問のとき、選んだ単元の全問を出す（直す前の動き） */\n' +
  '  if(questionCount === "all" && main.length === 0) main = orderByTiers(buildPool(true));\n',
  "「全部」の切り出し");
// (d) ★復習の候補が0問のとき、黙って選んだ単元の残りで埋める（＝廃止した fillFromRest を戻す）
const CONCAT = "  let pool = main.concat(review);\n";
const fakeSilentRest = src => cut(src, CONCAT,
  "  if(main.length + review.length < target){\n" +
  "    /* ★偽の実装: 足りない分を、黙って選んだ単元の残りから埋める（依頼書の失敗4・12） */\n" +
  "    const has2 = new Set(main.concat(review));\n" +
  "    review = review.concat(orderByTiers(buildPool(true).filter(i => !has2.has(i)))\n" +
  "      .slice(0, target - main.length - review.length));\n" +
  "  }\n" + CONCAT,
  "つなぐところ");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
let SERVED = CURRENT;
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") {
    res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" });
    res.end(Buffer.from(SERVED, "utf8"));
    return;
  }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => {
    if (e) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
    res.end(b);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });

// ★単元は名指ししない。条件で選ぶ（4-6b）:「社会で、図の無い問題が いちばん多い単元」をメインに、
//   次に多い2つを復習の単元にする。どの回・どの科目に当てても成り立つ選び方
async function pickUnits() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(PAGE_URL); await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const by = {};
    QA_DATA.forEach(q => { if (q.subj === "社会" && q.kind !== "calc") (by[q.u] = by[q.u] || []).push(q.id); });
    const sorted = Object.keys(by).sort((a, b) => by[b].length - by[a].length);
    return { main: sorted[0], mainIds: by[sorted[0]], review: sorted.slice(1, 3), reviewIds: by[sorted[1]].concat(by[sorted[2]]),
             allUnits: Object.keys(by) };
  });
  await ctx.close();
  return r;
}
const U = await pickUnits();
if (U.mainIds.length < 40) throw new Error("メインの単元の問題が少なすぎます（" + U.mainIds.length + "問）");

async function run(label, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => { out.push({ name: name, ok: !!ok, extra: extra == null ? "" : String(extra) }); };

  // opt: { unmastered:N, count, min, reviewOn:bool, mainAll:bool, stars:[] }
  const open = async (opt) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e)));
    await page.goto(PAGE_URL); await page.waitForTimeout(400);
    const info = await page.evaluate((a) => {
      const st = {}, now = Date.now(), day = 86400000;
      // ★★まず「社会の全問」をクリアずみにする。
      //   ★これをしないと、記録のない単元が全部「未クリア」になり、
      //   単元を全部メインに選んだ日（E・F）のメインが 12 問でなくなります。
      //   ★最初に書いたときここを落として、**E・F が偽の不具合を出しました**（確認ポイント 4-1b）。
      //   実装は正しく、仕込み方が間違っていました。期待値でなく仕込みを直しています
      QA_DATA.forEach(q => {
        if (q.subj === "社会" && q.kind !== "calc") {
          st[q.id] = { correct: 3, wrong: 0, box: 3, lastCorrectAt: now - day, lastAnswered: now - day };
        }
      });
      // 復習の単元: 全部クリアずみ。★正解した日を問ごとにずらす（古い順が測れるように）
      a.reviewIds.forEach((id, i) => {
        st[id] = { correct: 3, wrong: 0, box: 3,
                   lastCorrectAt: now - (a.reviewIds.length - i) * day, lastAnswered: now - day };
      });
      // メインの単元: 先頭 a.unmastered 問だけ「未クリア（box 0）」に戻す
      a.mainIds.forEach((id, i) => {
        if (i < a.unmastered) st[id] = { correct: 0, wrong: 1, box: 0, lastAnswered: now - day };
      });
      localStorage.clear();
      localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
      localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
      localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
        subject: "社会",
        // ★mainAll のときは全単元をメインに選ぶ（＝復習の候補が0問になる日）
        unitsBySubject: { "社会": a.mainAll ? a.allUnits : [a.main] },
        units: a.mainAll ? a.allUnits : [a.main],
        count: a.count, shuffle: false,
        filterUnmastered: true, filterWeak: false,
        minTotalCount: a.min,
        // ★復習の対象単元。reviewUnitsKnown に全単元を入れて「知らない単元が自動でON」を止める
        reviewSelectedUnits: a.reviewOn ? a.review : [],
        reviewUnitsKnown: a.allUnits,
        reviewPriority: "all", reviewLevel: "all", reviewType: "all",
        type: "all", priority: "all", level: "all"
      }));
      if (a.stars && a.stars.length) localStorage.setItem("kq_battle_priority_v1", JSON.stringify(a.stars));
      // ★期待値はアプリと別に作る: 復習の単元を「正解した日が古い順」に
      const oldest = a.reviewIds.slice().sort((x, y) => st[x].lastCorrectAt - st[y].lastCorrectAt);
      return { oldest: oldest, unmasteredIds: a.mainIds.slice(0, a.unmastered) };
    }, Object.assign({ main: U.main, mainIds: U.mainIds, review: U.review, reviewIds: U.reviewIds, allUnits: U.allUnits,
                       reviewOn: true, mainAll: false, stars: [] }, opt));
    await page.reload(); await page.waitForTimeout(900);
    return { ctx: ctx, page: page, errs: errs, oldest: info.oldest, unmasteredIds: info.unmasteredIds };
  };
  const labelOf = page => page.$eval("#pool-count-label", e => e.textContent);
  const startable = page => page.$eval("#solo-start-btn", e => !e.disabled);
  // ★実際に始めて、結果の画面になるまで出た id を全部読む（打ち切りではなく、終わりまで）
  const playAll = async (page, cap) => {
    await page.click("#solo-start-btn"); await page.waitForTimeout(700);
    const ids = [];
    for (let i = 0; i < (cap || 200); i++) {
      const done = await page.evaluate(() => document.getElementById("screen-solo-result").classList.contains("active"));
      if (done) break;
      ids.push((await page.$eval("#solo-q-id", e => e.textContent)).replace(/^\s*No\.?/, "").trim());
      await page.click("#solo-reveal-btn"); await page.waitForTimeout(90);
      await page.click("#solo-judge-ok"); await page.waitForTimeout(180);
    }
    return ids;
  };
  const unitOf = (page, ids) => page.evaluate(ids => ids.map(id => (QA_DATA.find(q => q.id === id) || {}).u), ids);
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  // 予告の先頭に出ている「N問」を数字で取る。★実際に出た数と突き合わせる（失敗9）
  const previewN = s => { const m = /^(\d+)問/.exec(s.trim()); return m ? parseInt(m[1], 10) : null; };

  try {
    // ============ A 未クリアが多い日（30問）／合計20 ============
    {
      const t = await open({ unmastered: 30, count: 20, min: 0 });
      const lab = await labelOf(t.page);
      const ids = await playAll(t.page, 40);
      const us = await unitOf(t.page, ids);
      check("A 未クリア30問・合計20 → 20問出る", ids.length === 20, ids.length + "問 / 予告 " + lab);
      check("A 復習は入らない（メインだけで足りている）",
        us.every(u => u === U.main), Array.from(new Set(us)).join(" , "));
      check("A ★予告の数と実際に出た数が同じ（失敗9）", previewN(lab) === ids.length, "予告 " + previewN(lab) + " / 実際 " + ids.length);
      await t.ctx.close();
    }
    // ============ B 未クリアが少ない日（12問）／合計20 → 12＋復習8 ============
    {
      const t = await open({ unmastered: 12, count: 20, min: 0 });
      const lab = await labelOf(t.page);
      const ids = await playAll(t.page, 40);
      const us = await unitOf(t.page, ids);
      const mainN = us.filter(u => u === U.main).length;
      const revN = us.filter(u => U.review.indexOf(u) >= 0).length;
      await shot(t.page, "B_result");
      check("★B 未クリア12問・合計20 → 合計20問になる", ids.length === 20, ids.length + "問 / 予告 " + lab);
      check("★B 内わけは メイン12＋復習8", mainN === 12 && revN === 8, "メイン " + mainN + " / 復習 " + revN);
      check("★B 同じ問題が2回出ていない（失敗2）",
        new Set(ids).size === ids.length, ids.length + "問中 ちがう問題 " + new Set(ids).size + "問");
      check("★B 復習で入るのは「正解した日が古い順」の8問（失敗7）",
        JSON.stringify(ids.filter((id, k) => U.review.indexOf(us[k]) >= 0).slice().sort())
          === JSON.stringify(t.oldest.slice(0, 8).slice().sort()),
        "出た " + ids.filter((id, k) => U.review.indexOf(us[k]) >= 0).slice(0, 3).join(",")
          + "… / 期待 " + t.oldest.slice(0, 3).join(",") + "…");
      check("B ★予告の数と実際に出た数が同じ（失敗9）", previewN(lab) === ids.length, "予告 " + previewN(lab) + " / 実際 " + ids.length);
      check("B 予告に「復習8問こみ」と出ている", /復習8問こみ/.test(lab), lab);
      check("B 足りない知らせは出ていない", !/足りません/.test(lab) , lab);
      check("B エラー 0", t.errs.length === 0, t.errs.join(" | "));
      await t.ctx.close();
    }
    // ============ C 未クリアが0問の日／合計20 → ぜんぶ復習 ============
    {
      const t = await open({ unmastered: 0, count: 20, min: 0 });
      const lab = await labelOf(t.page);
      const ids = await playAll(t.page, 40);
      const us = await unitOf(t.page, ids);
      check("★C 未クリア0問・合計20 → 20問出る", ids.length === 20, ids.length + "問 / 予告 " + lab);
      check("★C 20問ぜんぶ復習の単元から来ている",
        us.length > 0 && us.every(u => U.review.indexOf(u) >= 0), Array.from(new Set(us)).join(" , "));
      check("C ★予告の数と実際に出た数が同じ（失敗9）", previewN(lab) === ids.length, "予告 " + previewN(lab) + " / 実際 " + ids.length);
      await t.ctx.close();
    }
    // ============ D ★「全部」＋未クリア0問／最低15 ============
    {
      const t = await open({ unmastered: 0, count: "all", min: 15 });
      const lab = await labelOf(t.page);
      const ids = await playAll(t.page, 200);
      const us = await unitOf(t.page, ids);
      await shot(t.page, "D_result");
      check("★★D 「全部」＋未クリア0問 → 最低15問だけ出る（選んだ単元の全問が出ない・失敗3）",
        ids.length === 15, ids.length + "問（メインの単元は " + U.mainIds.length + "問ある）/ 予告 " + lab);
      check("★D 15問ぜんぶ復習の単元から来ている",
        us.length > 0 && us.every(u => U.review.indexOf(u) >= 0), Array.from(new Set(us)).join(" , "));
      check("D ★予告の数と実際に出た数が同じ（失敗9）", previewN(lab) === ids.length, "予告 " + previewN(lab) + " / 実際 " + ids.length);
      await t.ctx.close();
    }
    // ============ D2 「全部」＋未クリアが最低より多い日 → メイン全部が出る ============
    {
      const t = await open({ unmastered: 30, count: "all", min: 15 });
      const lab = await labelOf(t.page);
      const ids = await playAll(t.page, 60);
      const us = await unitOf(t.page, ids);
      check("D2 「全部」＋未クリア30問・最低15 → メインの30問が全部出る（最低で切らない）",
        ids.length === 30 && us.every(u => u === U.main), ids.length + "問 / 予告 " + lab);
      await t.ctx.close();
    }
    // ============ E ★復習の候補が0問（単元を全部メインに選んでいる日）============
    {
      const t = await open({ unmastered: 12, count: 20, min: 0, mainAll: true, reviewOn: false });
      const lab = await labelOf(t.page);
      const short = await t.page.$eval("#pool-count-bar", e => e.classList.contains("short"));
      const ids = await playAll(t.page, 40);
      const us = await unitOf(t.page, ids);
      await shot(t.page, "E_home");
      check("★★E 復習の候補が0問・合計20・未クリア12 → ★12問で出る（黙って残りで埋めない・失敗4/12）",
        ids.length === 12, ids.length + "問 / 予告 " + lab);
      check("★★E 何問足りないかが画面に出ている（失敗4）",
        /8問足りません/.test(lab), lab);
      check("★E 足りない日は、その行が目立つ色になる", short === true, "short=" + short);
      check("★E 出た12問は全部「未クリア」の問題（クリアずみを混ぜていない・失敗11）",
        ids.length > 0 && ids.every(id => t.unmasteredIds.indexOf(id) >= 0),
        "未クリア以外 " + ids.filter(id => t.unmasteredIds.indexOf(id) < 0).length + "問");
      check("E ★予告の数と実際に出た数が同じ（失敗9）", previewN(lab) === ids.length, "予告 " + previewN(lab) + " / 実際 " + ids.length);
      await t.ctx.close();
    }
    // ============ F ★メインも復習も0問 → 「問題がありません」 ============
    {
      const t = await open({ unmastered: 0, count: 20, min: 0, mainAll: true, reviewOn: false });
      const lab = await labelOf(t.page);
      const can = await startable(t.page);
      const soloTxt = await t.page.$eval("#solo-start-btn", e => e.textContent.trim());
      const battleTxt = await t.page.$eval("#create-btn", e => e.textContent.trim());
      await shot(t.page, "F_home");
      check("★★F メインも復習も0問 → ボタンが押せない（2026-09-26 ユーザー「問題がありません」でいい）",
        can === false, "押せる=" + can);
      check("★F 一人で始めるボタンが「問題がありません」", soloTxt === "問題がありません", soloTxt);
      check("★F 二人で始めるボタンが「問題がありません」", battleTxt === "問題がありません", battleTxt);
      check("F 予告は 0問", previewN(lab) === 0, lab);
      await t.ctx.close();
    }
    // ============ H ★最優先（★印）の扱いが変わっていないか（失敗6）============
    {
      // 未クリアの中の「うしろのほう」に★を付ける → 未クリアを含むときは★がいちばん上に来るのが今の動き
      const t0 = await open({ unmastered: 12, count: 20, min: 0 });
      const starIds = t0.unmasteredIds.slice(-2);
      await t0.ctx.close();
      const t = await open({ unmastered: 12, count: 20, min: 0, stars: starIds });
      const lab = await labelOf(t.page);
      const ids = await playAll(t.page, 40);
      check("★H 未クリアを含むとき、★最優先の2問がいちばん上に来る（失敗6）",
        JSON.stringify(ids.slice(0, 2).slice().sort()) === JSON.stringify(starIds.slice().sort()),
        "先頭2問 " + ids.slice(0, 2).join(",") + " / ★ " + starIds.join(","));
      check("H 合計は 20問のまま", ids.length === 20, ids.length + "問");
      check("H 予告に★最優先の数が出ている", /★最優先 2問が先に出ます/.test(lab), lab);
      await t.ctx.close();
    }
    // ============ I ★画面の文言（失敗10・4-3c: 古い説明が残っていないか）============
    {
      const t = await open({ unmastered: 12, count: 20, min: 0 });
      // ★ソースの grep ではなく、画面に出ている文字（textContent）で見る（4-3c）
      const shown = await t.page.evaluate(() => document.getElementById("screen-home").innerText);
      check("★I 古い見出し「復習ミックスの問題数」が画面に残っていない（失敗10）",
        shown.indexOf("復習ミックスの問題数") < 0, shown.indexOf("復習ミックスの問題数") >= 0 ? "残っています" : "");
      check("★I 「追加」という古い言い方が復習ミックスの見出しに残っていない",
        shown.indexOf("苦手な問題を優先して追加") < 0, "");
      check("★I 問題数が「合計」だと画面に書いてある", shown.indexOf("「合計」") >= 0, "");
      check("★I 「全部」のときの最低出題数だと画面に書いてある", shown.indexOf("最低出題数") >= 0, "");
      check("★I 復習の候補が「メインで選んでいない単元」だけだと画面に書いてある",
        shown.indexOf("メインで選んでいない単元") >= 0, "");
      await t.ctx.close();
    }
  } catch (e) {
    check("通しが最後まで走った", false, String((e && e.message) || e));
  }
  return out;
}

function report(title, out) {
  console.log("\n── " + title + " ──");
  let ng = 0;
  for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.name + (c.extra ? " … " + c.extra : "")); if (!c.ok) ng++; }
  return ng;
}
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };

console.log("■ 使う単元（★名指しせず、問題数のいちばん多い単元を条件で選んだ・4-6b）");
console.log("  メイン: " + U.main + "（" + U.mainIds.length + "問） ／ 復習: " + U.review.join(" , ") + "（" + U.reviewIds.length + "問）");

// ================= 入口の自己テスト（本番の前に必ず走る・4-6）=================
console.log("\n■ 入口の自己テスト（この検査そのものが効いているか）");
let selfNg = 0;
const selfTests = [
  ["(a) 偽の実装: 復習で埋めない", () => fakeNoFill(CURRENT)],
  ["(b) 偽の実装: 埋める側を重複ありで作る", () => fakeDuplicate(CURRENT)],
  ["(c) 偽の実装: 「全部」の崖を直さない", () => fakeCliff(CURRENT)],
  ["(d) ★偽の実装: 復習が0問のとき黙って選んだ単元の残りで埋める", () => fakeSilentRest(CURRENT)],
  ["(e) 対照 " + BASE_COMMIT + "（直す前）", () => BASELINE]
];
for (let i = 0; i < selfTests.length; i++) {
  const [title, make] = selfTests[i];
  let src;
  try { src = make(); }
  catch (e) { console.log("\n── " + title + " ──\n  ✘ " + e.message); selfNg++; continue; }
  const ng = report(title + " … ★鳴るのが正しい", await run("self" + i, src));
  console.log(ng > 0 ? "  → ✔ 自己テスト合格（" + ng + " 件で鳴った）"
                     : "  → ✘ 自己テスト不合格（鳴るべきなのに鳴らない＝検査が効いていない）");
  if (ng === 0) selfNg++;
}
if (selfNg > 0) {
  console.log("\n★入口の自己テストが " + selfNg + " 件通らないので、本番の結果は出しません（数字を信じられないため）。");
  await done(3);
}

// ================= 本番 =================
console.log("\n■ (f) いまの index.html … ★鳴らないのが正しい");
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng === 0 ? 0 : 1);
