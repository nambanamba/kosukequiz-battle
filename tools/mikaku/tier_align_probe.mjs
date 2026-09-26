// ★★言葉・数字・フィルタが、出題の3段に揃っているかを見る。
//
// 使い方: node tools/mikaku/tier_align_probe.mjs
//
// ■ なぜ要るか（2026-09-26 ユーザー依頼）
//   ユーザー「言葉をフィルターと出す数字を合わせませんか？」
//           「4ついりますか? いまステージが3つ? あると思ってますが合ってます?
//             その数を出しませんか？ フィルタも一緒でしたっけ？」
//   → 調べたら、切り口が**5つ**あった（作業メモの A〜G の表）。全部 tierOf の3段に寄せた。
//   依頼書 = 司令塔\回答\対戦_言葉と数字とフィルタを3段に揃える_依頼_2026-09-26.md
//
// ■ ★この検査の核は2つ（依頼書の失敗1・2）
//   ① 3つの数字を足すと、必ず「全問題数」になる
//   ② ★その数字と、そのフィルタをONにして**実際に出る問題数**が一致する
//   ★②は「文字を読む」のではなく、**本当に出題させて数えて**います（4-6c 末尾）。
//
// ■ ★保存の移行（いちばん怖いところ）も見る
//   旧「未クリア／よく間違える」の4通りが、正しい段に移ること。
//   ★**2回目には走らないこと**——ここが大事。2回走ると
//   **親が自分で外した復習単元を、開くたび勝手に戻します**（確認ポイント 3-6b）。
//   ★作っている途中に実際にこの穴を作り込み、自分で見つけて直した箇所です。
//
// ■ ★入口の自己テスト（4-6）。本番の前に必ず走り、外れたら本番の数字を出さずに終わる
//   (a) 単元ごとの数え方をホームと揃えない偽の実装   … ★鳴る（失敗16・17）
//   (b) 数字とフィルタの結果をずらす偽の実装         … ★鳴る（失敗2）
//   (c) ★移行を黙って落とす偽の実装（設定が初期値に） … ★鳴る（失敗4）
//   (d) ★移行の印を保存しない偽の実装（2回目が走る） … ★鳴る（親の選択が戻る）
//   (e) 対照 BASE_COMMIT（直す前）                   … ★鳴る（4-6c）
//       ⚠★(e) の「鳴り方」は粗い。対照には stat-stage1 などの要素が無いので、
//       最初の場面で例外になって止まる。**鳴ることは鳴るが、「どこがちがうか」は出ない。**
//       ★対照が**構造ごと違う**ときの限界。これを「対照を通すために検査を緩める」方向に
//       直さないこと。緩めると、本番でも見なくなる（4-1）。
//   そして本番 (f) いまの index.html                 … ★鳴らない（4-3）
//   ★偽の実装は**出荷される index.html から組み立てる**（写しを持たない・4-6d）。
//
// ■ ★見ていないもの（4-2）
//   - 二人対戦の通信（①とBの検査が別にある）
//   - 実機。390px の見え方は目で見る（B-12）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_tieralign");
fs.mkdirSync(SHOTS, { recursive: true });

// ★対照はコミットで固定（4-6c）。①②B を入れたあとの版
const BASE_COMMIT = "0518ef3";

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();

const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// ---- 偽の実装（★出荷される index.html から組み立てる・4-6d）----
function cut(src, needle, replacement, what) {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error("偽の実装を作れません（" + what + " が " + n + " 件。1件でないと壊し損ねます）");
  return src.replace(needle, replacement);
}
// (a) 単元ごとの数え方を、ホームと揃えない（絞りこみをかけずに数える）
const UNIT_COUNT = "  applyPoolFilters(all, true).forEach(i=>{\n";
const fakeUnitBasis = src => cut(src, UNIT_COUNT,
  "  all.forEach(i=>{   /* ★偽の実装: 絞りこみをかけずに数える */\n", "単元ごとの数え方");
// (b) 数字とフィルタの結果をずらす（古い切り口をフィルタ側に混ぜ戻す）
const TIER_FILTER = "  if(!skipModes) pool = pool.filter(i => selectedTiers.has(tierOf(i)));\n";
const fakeFilterSkew = src => cut(src, TIER_FILTER,
  "  if(!skipModes) pool = pool.filter(i => selectedTiers.has(tierOf(i)) || !isMastered(QA_DATA[i].id));"
  + "   /* ★偽の実装: 古い「未クリア」を混ぜ戻す */\n", "段の絞りこみ");
// (c) ★移行を黙って落とす（旧設定を見ずに、いつも全部にする）
const MIG = '  const un = s.filterUnmastered === true, wk = s.filterWeak === true;\n';
const fakeNoMigration = src => cut(src, MIG,
  '  const un = false, wk = false;   /* ★偽の実装: 旧設定を見ない＝黙って初期値に戻す */\n', "移行の読み取り");
// (d) ★移行の印を保存しない（＝2回目が走り、親が外した復習単元が戻る）
const MARK = "      reviewAllUnits: 1,   // ★復習単元の移行は済んだ（2026-09-26）\n";
const fakeNoMark = src => cut(src, MARK,
  "      /* ★偽の実装: 移行の印を保存しない（メモリ上の印だけ） */\n", "移行の印");

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

async function run(label, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => { out.push({ name: name, ok: !!ok, extra: extra == null ? "" : String(extra) }); };

  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e)));
    await page.goto(PAGE_URL); await page.waitForTimeout(500);
    return { ctx, page, errs };
  };
  // ★1つの単元に3段が混ざる仕込み。★単元は名指しせず、問題数のいちばん多い単元を条件で選ぶ（4-6b）
  const seed = (page, extra) => page.evaluate((ex) => {
    const by = {};
    QA_DATA.forEach(q => { if (q.subj === "社会" && q.kind !== "calc") (by[q.u] = by[q.u] || []).push(q.id); });
    const units = Object.keys(by).sort((a, b) => by[b].length - by[a].length);
    const main = units[0], ids = by[main];
    const st = {}, now = Date.now(), d = 86400000;
    ids.forEach((id, i) => {
      if (i < 10) return;                                                                  // 1段目: 記録なし 10問
      if (i < 25) st[id] = { correct: 2, wrong: 1, box: 0, lastCorrectAt: now - d, lastAnswered: now - d };   // 2段目 15問
      else        st[id] = { correct: 3, wrong: 0, box: 3, lastCorrectAt: now - d, lastAnswered: now - d };   // 3段目
    });
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify(Object.assign({
      subject: "社会", unitsBySubject: { "社会": [main] }, units: [main],
      count: "all", shuffle: false,
      reviewSelectedUnits: [], reviewUnitsKnown: units, reviewAllUnits: 1,
      reviewPriority: "all", reviewLevel: "all", reviewType: "all",
      type: "all", priority: "all", level: "all"
    }, ex || {})));
    return { main: main, total: ids.length, allUnits: units };
  }, extra);
  const home = page => page.evaluate(() => ({
    total: +document.getElementById("stat-total").textContent,
    s: [0, 1, 2].map(k => +document.getElementById("stat-stage" + (k + 1)).textContent)
  }));
  const setTiers = (page, tiers) => page.evaluate(ts => {
    document.querySelectorAll(".mode-filter").forEach(e => {
      if (e.classList.contains("on") !== ts.includes(+e.dataset.tier)) e.click();
    });
  }, tiers);
  const playCount = async page => {
    await page.click("#solo-start-btn"); await page.waitForTimeout(600);
    const n = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("kq_battle_solo_session_v1") || "{}");
      return (s.quizIds || s.quizQueue || []).length;
    });
    await page.click("#solo-back"); await page.waitForTimeout(350);
    return n;
  };

  try {
    // ================= ①②③ 数字とフィルタ =================
    {
      const t = await open();
      const info = await seed(t.page);
      await t.page.reload(); await t.page.waitForTimeout(900);
      const h = await home(t.page);
      check("★①3つを足すと「全問題数」になる（失敗1）",
        h.s[0] + h.s[1] + h.s[2] === h.total, JSON.stringify(h));
      check("①-2 仕込みどおりの内わけ（まだ10・苦手15・残り定着）",
        h.s[0] === 10 && h.s[1] === 15 && h.s[2] === info.total - 25, JSON.stringify(h));
      // ★②数字 ＝ そのフィルタをONにして実際に出る数
      for (let k = 0; k < 3; k++) {
        await setTiers(t.page, [k]); await t.page.waitForTimeout(350);
        const got = await playCount(t.page);
        check("★★②段" + (k + 1) + "だけONのとき、画面の数字と実際に出た数が同じ（失敗2）",
          got === h.s[k], "画面 " + h.s[k] + " / ★実際 " + got);
      }
      // ★③単元ごとの数字。3つを足すと行の「◯問」になる／ホームと数え方が同じ
      await setTiers(t.page, [0, 1, 2]); await t.page.waitForTimeout(350);
      const rows = await t.page.evaluate(() => Array.from(document.querySelectorAll("#unit-choices .choice")).map(e => ({
        unit: e.dataset.unit,
        count: parseInt((e.querySelector(".count") || {}).textContent || "", 10),
        tiers: ((e.querySelector(".unit-tiers") || {}).textContent || "").match(/\d+/g) || []
      })));
      const bad = rows.filter(r => r.tiers.length !== 3 || r.tiers.reduce((a, b) => a + (+b), 0) !== r.count);
      check("★③どの単元の行も、3つを足すと行の「◯問」になる（失敗16）",
        rows.length > 0 && bad.length === 0, bad.length + "行がずれ" + (bad[0] ? "（例 " + bad[0].unit + "）" : ""));
      const mainRow = rows.find(r => r.unit === info.main);
      check("★③単元の行とホームで、数え方が同じ（失敗17）",
        !!mainRow && mainRow.tiers.map(Number).join(",") === h.s.join(","),
        mainRow ? mainRow.tiers.join(",") + " / ホーム " + h.s.join(",") : "行なし");
      // ★絞りこみをかけても崩れないこと（4-6e: 分岐を両方通す）
      await t.page.evaluate(() => {
        const o = document.getElementById("setup-filter-open"); if (o) o.click();
        const b = document.querySelector('[data-level="基礎"]'); if (b) b.click();
      });
      await t.page.waitForTimeout(500);
      const h2 = await home(t.page);
      const rows2 = await t.page.evaluate(() => Array.from(document.querySelectorAll("#unit-choices .choice")).map(e => ({
        unit: e.dataset.unit,
        count: parseInt((e.querySelector(".count") || {}).textContent || "", 10),
        tiers: ((e.querySelector(".unit-tiers") || {}).textContent || "").match(/\d+/g) || []
      })));
      const mainRow2 = rows2.find(r => r.unit === info.main);
      check("★③絞りこみ（難易度）をかけても、3つを足すと全問題数（失敗9・1）",
        h2.s[0] + h2.s[1] + h2.s[2] === h2.total && h2.total !== h.total, JSON.stringify(h2) + " / 絞りこみ前 " + h.total);
      check("★③絞りこみをかけても、単元の行とホームの数え方が同じ（失敗17）",
        !!mainRow2 && mainRow2.tiers.map(Number).join(",") === h2.s.join(","),
        mainRow2 ? mainRow2.tiers.join(",") + " / ホーム " + h2.s.join(",") : "行なし");
      check("画面のエラーが 0", t.errs.length === 0, t.errs.join(" | "));
      await t.ctx.close();
    }

    // ================= ④ 保存されている設定の移行 =================
    const MIG = [
      ["旧「未クリア」だけON", { filterUnmastered: true, filterWeak: false }, [true, true, false], true],
      ["旧「よく間違える」だけON", { filterUnmastered: false, filterWeak: true }, [false, true, false], true],
      ["旧「両方ON」", { filterUnmastered: true, filterWeak: true }, [true, true, false], true],
      ["旧「両方OFF」", { filterUnmastered: false, filterWeak: false }, [true, true, true], false]
    ];
    for (const [name, legacy, want, wantNote] of MIG) {
      const t = await open();
      await seed(t.page, legacy);
      await t.page.reload(); await t.page.waitForTimeout(900);
      const r = await t.page.evaluate(() => ({
        on: Array.from(document.querySelectorAll(".mode-filter")).map(e => e.classList.contains("on")),
        note: getComputedStyle(document.getElementById("migration-note")).display !== "none",
        text: (document.getElementById("migration-note-body").textContent || "")
      }));
      check("★④" + name + " → 段の選択が正しい", JSON.stringify(r.on) === JSON.stringify(want),
        JSON.stringify(r.on) + " / 期待 " + JSON.stringify(want));
      check("★④" + name + " → 知らせが" + (wantNote ? "出る" : "出ない") + "（失敗4・13）",
        r.note === wantNote, "出た=" + r.note);
      if (name.indexOf("よく間違える") >= 0) {
        // ★B（✕つきで未正解）が落ちることを、名指しで伝えているか（失敗13）
        check("★★④「よく間違える」だけONの人に、✕つき未正解が移ったことを名指しで伝えている",
          /✕がついてまだ正解していない問題は/.test(r.text), r.text.slice(0, 80));
      }
      await t.ctx.close();
    }

    // ================= ⑤ ★移行が2回目に走らない（親の選択を戻さない）=================
    {
      const t = await open();
      const info = await seed(t.page, { reviewSelectedUnits: [], reviewUnitsKnown: [], reviewAllUnits: undefined });
      await t.page.reload(); await t.page.waitForTimeout(900);
      const after1 = await t.page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_settings_v1") || "{}").reviewSelectedUnits || []);
      // ⚠★ reviewSelectedUnits は**科目をまたいだ1つの集合**（社会も理科も入る）。
      //   ★最初この検査を「社会の単元数」と比べていて、実装は正しいのに落ちました。
      //   ★**期待値を緩めず、比べる相手を直しています**（確認ポイント 4-1b）。
      const allUnitsEverywhere = await t.page.evaluate(() => Array.from(new Set(QA_DATA.map(d => d.u))).length);
      check("⑤-1 移行が走って、復習の対象が全単元（科目をまたぐ）になった",
        after1.length === allUnitsEverywhere, after1.length + " / 全 " + allUnitsEverywhere);
      // ★親が2つ外す
      const dropped = info.allUnits.slice(0, 2);
      await t.page.evaluate(d => {
        const s = JSON.parse(localStorage.getItem("kq_battle_settings_v1") || "{}");
        s.reviewSelectedUnits = (s.reviewSelectedUnits || []).filter(u => d.indexOf(u) < 0);
        localStorage.setItem("kq_battle_settings_v1", JSON.stringify(s));
      }, dropped);
      await t.page.reload(); await t.page.waitForTimeout(900);
      const after2 = await t.page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_settings_v1") || "{}").reviewSelectedUnits || []);
      const backAgain = dropped.filter(u => after2.indexOf(u) >= 0);
      check("★★⑤親が外した復習単元が、開き直しても戻らない（移行が2回目に走らない）",
        backAgain.length === 0, "戻った " + backAgain.length + "単元");
      await t.ctx.close();
    }

    // ================= ⑥⑦ 問題一覧と文言 =================
    {
      const t = await open();
      const info = await seed(t.page);
      await t.page.reload(); await t.page.waitForTimeout(900);
      const shown = await t.page.evaluate(() => document.getElementById("screen-home").innerText);
      for (const w of ["未クリア", "よく間違える", "正解ずみ", "正解済み"]) {
        // ★移行の知らせは、旧い名前をわざと出す（何が変わったか伝えるため）ので、出ていないときだけ見る
        const noteShown = await t.page.evaluate(() => getComputedStyle(document.getElementById("migration-note")).display !== "none");
        if (noteShown) continue;
        check("★⑦ホームに古い語「" + w + "」が残っていない（失敗3）", shown.indexOf(w) < 0, "");
      }
      check("★⑦ホームに3つの言葉がそろっている",
        ["まだ正解していない", "苦手な問題", "定着した"].every(w => shown.indexOf(w) >= 0), "");
      await t.page.click("#list-btn"); await t.page.waitForTimeout(700);
      const chips = await t.page.evaluate(() => ({
        tier: Array.from(document.querySelectorAll("#list-status-filters .toggle")).map(e => e.textContent.trim()),
        star: Array.from(document.querySelectorAll("#list-star-filter .toggle")).map(e => e.textContent.trim())
      }));
      check("★⑥一覧の段のチップは3つ（失敗15。★最優先は別の行）",
        chips.tier.length === 3 && chips.star.length === 1, JSON.stringify(chips));
      check("★⑥一覧のチップが3つの言葉になっている",
        chips.tier.join(",") === "まだ正解していない,苦手な問題,定着した", JSON.stringify(chips.tier));
      await t.page.selectOption("#list-unit-select", info.main); await t.page.waitForTimeout(800);
      const btns = await t.page.evaluate(() => {
        const e = document.querySelector(".list-item .status-toggle");
        return e ? Array.from(e.querySelectorAll(".status-btn")).map(b => b.textContent.trim()) : [];
      });
      check("★★⑥状態を手で直すボタンは2つだけ（「苦手な問題」は置かない・失敗14）",
        btns.length === 2 && btns.indexOf("苦手な問題") < 0, JSON.stringify(btns));
      await t.page.screenshot({ path: path.join(SHOTS, label + "_list.png"), fullPage: false }).catch(() => {});
      check("一覧で画面のエラーが 0", t.errs.length === 0, t.errs.join(" | "));
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

console.log("■ 入口の自己テスト（この検査そのものが効いているか）");
let selfNg = 0;
// ★★ (a)〜(d) と (e) は、意味が違います（確認ポイント 4-6j）。
//   (a)〜(d) は**実装をすり替えて、狙った項目が鳴るか**を見ています。仕事をしているのはこちら。
//   (e) は対照に当てるだけで、★**対照には stat-stage1 などの要素が無いので、
//   最初の場面で例外になって止まります**。鳴りはしますが、「どこがちがうか」は出ません。
//   ★**同じ列に並べて「自己テスト5つ合格」と書かないこと。**
//   中身のある4つと、何も見ていない1つが、同じ重みに見えます。
const selfTests = [
  ["(a) 偽の実装: 単元ごとの数え方をホームと揃えない", () => fakeUnitBasis(CURRENT), true],
  ["(b) 偽の実装: 数字とフィルタの結果をずらす", () => fakeFilterSkew(CURRENT), true],
  ["(c) ★偽の実装: 移行を黙って落とす", () => fakeNoMigration(CURRENT), true],
  ["(d) ★偽の実装: 移行の印を保存しない（2回目が走る）", () => fakeNoMark(CURRENT), true],
  ["(e) 対照 " + BASE_COMMIT + "（直す前）★これだけ別あつかい", () => BASELINE, false]
];
for (let i = 0; i < selfTests.length; i++) {
  const [title, make, isFake] = selfTests[i];
  let src;
  try { src = make(); }
  catch (e) { console.log("\n── " + title + " ──\n  ✘ " + e.message); selfNg++; continue; }
  const ng = report(title + " … ★鳴るのが正しい", await run("self" + i, src));
  if (isFake) {
    console.log(ng > 0 ? "  → ✔ 自己テスト合格（" + ng + " 件で鳴った）"
                       : "  → ✘ 自己テスト不合格（鳴るべきなのに鳴らない＝検査が効いていない）");
  } else {
    console.log(ng > 0 ? "  → △ 対照で差が出た（" + ng + " 件）。★これは「差がある」だけで、中身は見ていません"
                       : "  → ✘ 対照なのに差が出ない（対照の固定が外れていないか・4-6c）");
  }
  if (ng === 0) selfNg++;
}
if (selfNg > 0) {
  console.log("\n★入口の自己テストが " + selfNg + " 件通らないので、本番の結果は出しません。");
  await done(3);
}

console.log("\n■ (f) いまの index.html … ★鳴らないのが正しい");
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng === 0 ? 0 : 1);
