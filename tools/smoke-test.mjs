// index.html の主要な機能を、ヘッドレスChromeで自動確認する。
//
// 使い方:
//   node tools/smoke-test.mjs            全部ためす
//   node tools/smoke-test.mjs 単元 CSV   名前に「単元」か「CSV」を含むものだけ
//
// 必要なもの: playwright（`npm i playwright` で入る。ブラウザは
//   `npx playwright install chromium`。PLAYWRIGHT_BROWSERS_PATH が
//   設定ずみの環境ではそのまま動く）
//
// 注意:
// - 対戦（WebRTC）は https://esm.run/trystero を読みこむが、これは
//   ネットワークが無くても動くようスタブに差し替えている。したがって
//   対戦そのものはこのテストでは確認できない（実機で確認すること）。
// - 問題数や単元名はデータが増えるたび変わるので、値を決め打ちせず
//   その場のQA_DATAから取り出して使っている。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// playwright は、このリポジトリのnode_modules・NODE_PATH・グローバル
// インストールのどこにあっても拾えるようにする
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  try {
    const { createRequire } = await import("node:module");
    return createRequire(import.meta.url)("playwright");
  } catch {}
  try {
    const { execSync } = await import("node:child_process");
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
  } catch {}
  return null;
}
const pw = await loadPlaywright();
if (!pw) {
  console.error("playwright が見つかりません。`npm i playwright` を実行してください。");
  console.error("ブラウザ本体が未取得なら `npx playwright install chromium` も必要です。");
  process.exit(2);
}
const chromium = pw.chromium;

// ---- テスト対象を配信する小さなサーバー（外部ツールに依存しないため自前で持つ）----
const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json", ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg", ".png":"image/png", ".txt":"text/plain; charset=utf-8"};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  // ルート配下から出るリクエストは拒否する
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, "index.html")) {
    res.writeHead(403).end(); return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {"content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream"});
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = process.env.KQ_URL || ("http://127.0.0.1:" + server.address().port + "/index.html");

// 対戦(WebRTC)のライブラリはネットワークに出るので、読み込みだけ通るスタブに差し替える
const TRYSTERO_STUB = "export function joinRoom(){ return {makeAction:()=>[()=>{},()=>{}],"
  + " onPeerJoin:()=>{}, onPeerLeave:()=>{}, leave:()=>{}}; }";

// ブラウザ本体のダウンロードが通らないPCでは、入っている Chrome をそのまま使う。
// （2026-09-12: この環境では `npx playwright install` がタイムアウトで落ちる）
async function launchBrowser(bt) {
  try { return await bt.launch(); }
  catch (e) {
    console.error("playwright のブラウザが無いので、PCの Chrome を使います: " + String(e.message).slice(0, 120));
    return await bt.launch({ channel: "chrome" });
  }
}
const browser = await launchBrowser(chromium);
const results = [];
const only = process.argv.slice(2);

async function test(name, fn) {
  if (only.length && !only.some(k => name.includes(k))) return;
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.route("https://esm.run/trystero", r =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: TRYSTERO_STUB }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("JSエラー: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("consoleエラー: " + m.text()); });
  page.on("dialog", d => d.accept());
  const checks = [];
  const t = {
    page,
    // 期待どおりかを1つ記録する
    is(label, actual, expected) {
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      checks.push({ label, ok, actual, expected });
    },
    ok(label, cond, detail) { checks.push({ label, ok: !!cond, actual: detail }); },
    async open() { await page.goto(BASE); await page.waitForTimeout(700); },
    async reload() { await page.reload(); await page.waitForTimeout(800); },
    // 画面に出ている単元チップ（「全単元」を除く）
    units: () => page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice")]
      .filter(e => e.dataset.unit !== "ALL")
      .map(e => ({ u: e.dataset.unit, on: e.classList.contains("selected") }))),
    selected: async () => (await t.units()).filter(u => u.on).map(u => u.u),
    stats: () => page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}")),
    // 社会の歴史グループを開く（閉じているとクリックできない）
    async openHistory() {
      const h = await page.$('.unit-group-header[data-group="history"]');
      if (h) await h.click();
      await page.waitForTimeout(150);
    },
    async clickUnit(u) { await page.click(`#unit-choices .choice[data-unit="${u}"]`); await page.waitForTimeout(200); },
    screen: () => page.evaluate(() => {
      const s = [...document.querySelectorAll(".screen")].find(e => getComputedStyle(e).display !== "none");
      return s ? s.id : "?";
    })
  };
  let thrown = null;
  try { await fn(t); } catch (e) { thrown = e; }
  await ctx.close();
  results.push({ name, checks, errors, thrown });
}

// データから単元名を取り出すヘルパ（単元名を決め打ちしないため）
const pickUnits = page => page.evaluate(() => {
  const social = [...new Set(QA_DATA.filter(q => q.subj === "社会").map(q => q.u))];
  const science = [...new Set(QA_DATA.filter(q => q.subj === "理科").map(q => q.u))];
  return { history: social.find(u => u.startsWith("第")), social, science };
});

// ---------------------------------------------------------------- テスト本体

// ---- 日付をアプリと同じ「ローカル日付」で文字列にする。
//      アプリは日付をローカル時刻で保存し（new Date("2026-09-03T00:00:00")）、
//      ローカル時刻で読み出す（dateToYMD）。ここを toISOString()（＝UTC）で比べると、
//      日本（UTC+9）ではローカル0時がUTCの前日15時になるため、必ず1日ずれて落ちる。
//      作者のcloud環境がUTCだったため気づかれなかったもので、アプリ側は正しい ----
const ymd = ts => { const d = new Date(ts);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };

await test("単元選択が科目ごとに保存される", async t => {
  await t.open();
  await t.page.evaluate(() => localStorage.clear());
  await t.reload();
  const { history } = await pickUnits(t.page);

  await t.clickUnit("ALL");        // いったん全部はずす
  await t.openHistory();
  await t.clickUnit(history);      // 歴史の1単元だけ選ぶ
  t.is("社会で1単元だけ選べる", await t.selected(), [history]);

  await t.page.click("#subject-science"); await t.page.waitForTimeout(300);
  const sci = await t.selected();
  t.ok("理科は初期状態で全単元が選ばれる", sci.length > 0, sci.length + "単元");
  await t.clickUnit(sci[0]);       // 理科で1つはずす
  const sciAfter = await t.selected();

  await t.page.click("#subject-social"); await t.page.waitForTimeout(300);
  await t.openHistory();
  t.is("社会にもどしても選択が残る", await t.selected(), [history]);

  await t.page.click("#subject-science"); await t.page.waitForTimeout(300);
  t.is("理科にもどしても選択が残る", await t.selected(), sciAfter);

  await t.reload();
  t.is("リロードしても理科の選択が残る", await t.selected(), sciAfter);
  await t.page.click("#subject-social"); await t.page.waitForTimeout(300);
  await t.openHistory();
  t.is("リロードしても社会の選択が残る", await t.selected(), [history]);
});

await test("全単元を外した状態も復元される", async t => {
  await t.open();
  await t.page.evaluate(() => localStorage.clear());
  await t.reload();
  await t.clickUnit("ALL");
  t.is("全部はずせる", await t.selected(), []);
  await t.reload();
  t.is("リロードしても0のまま（全選択に戻らない）", await t.selected(), []);
});

await test("復習ミックスの単元が科目またぎで保持される", async t => {
  await t.open();
  await t.page.evaluate(() => localStorage.clear());
  await t.reload();
  await t.page.click("#subject-science"); await t.page.waitForTimeout(300);
  const sci = (await t.units()).map(u => u.u);
  await t.clickUnit(sci[0]);        // メインからはずす＝復習候補になる
  const rev = () => t.page.evaluate(() => [...document.querySelectorAll("#review-unit-choices .choice")]
    .map(e => ({ u: e.dataset.unit, on: e.classList.contains("selected") })));
  t.ok("はずした単元が復習候補に出る", (await rev()).some(r => r.u === sci[0]), await rev());
  await t.page.click(`#review-unit-choices .choice[data-unit="${sci[0]}"]`); await t.page.waitForTimeout(250);
  t.is("復習候補をOFFにできる", (await rev()).find(r => r.u === sci[0]).on, false);
  await t.page.click("#subject-social"); await t.page.waitForTimeout(300);
  await t.page.click("#subject-science"); await t.page.waitForTimeout(300);
  t.is("科目を往復してもOFFのまま", (await rev()).find(r => r.u === sci[0]).on, false);
});

await test("旧形式の設定からの移行", async t => {
  await t.open();
  const { history, science } = await pickUnits(t.page);
  // 旧バージョン（科目ごとに覚えていなかったころ）の保存データ
  await t.page.evaluate(([h, s]) => {
    localStorage.clear();
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
      subject: "理科", units: [s], socialUnits: [h]
    }));
  }, [history, science[0]]);
  await t.reload();
  t.is("保存時の科目の選択が復元される", await t.selected(), [science[0]]);
  await t.page.click("#subject-social"); await t.page.waitForTimeout(300);
  await t.openHistory();
  t.is("socialUnitsから社会の選択が復元される", await t.selected(), [history]);

  await t.page.evaluate(() => localStorage.setItem("kq_battle_settings_v1", "{こわれたJSON"));
  await t.reload();
  const all = await t.units();
  t.ok("こわれた保存データでも既定値で起動する", all.length > 0 && all.every(u => u.on), all.length + "単元すべて選択");
});

await test("復習編への正誤記録の引きつぎ", async t => {
  await t.open();
  // 移行の一覧はモジュール内の定数でページからは読めないので、
  // index.html から直接取り出して使う。**未実施の移行が複数ありうる**ので、
  // 一覧になっている（KAKI_MIGRATIONS）。ここでは全部の表をまとめて見る
  const migs = JSON.parse(fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .match(/const KAKI_MIGRATIONS = (\[[\s\S]*?\n\]);/)[1]
    .split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n")
    .replace(/(\n\s*)(id|renames|stats):/g, '$1"$2":'));
  const mig = Object.assign({}, ...migs.map(m => m.stats));
  const liveSet = new Set(await t.page.evaluate(() => QA_DATA.map(q => q.id)));
  const missing = [...new Set(Object.values(mig).flat())].filter(id => !liveSet.has(id));
  t.is("引きつぎ先の問題がすべて data.js にある", missing, []);

  const oldId = Object.keys(mig).find(k => mig[k].some(id => liveSet.has(id)));
  const newIds = mig[oldId].filter(id => liveSet.has(id));
  await t.page.evaluate(o => {
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify({ [o]: { correct: 3, wrong: 1, box: 1, lastAnswered: 1000, lastCorrectAt: 1000 } }));
  }, oldId);
  await t.reload();
  const st = await t.stats();
  t.is("旧問題の記録は消える", st[oldId], undefined);
  t.ok("新問題に記録が移っている", newIds.every(id => st[id] && st[id].correct === 3), newIds.map(id => st[id]));
  const before = JSON.stringify(await t.stats());
  await t.reload();
  t.is("2回目の起動で二重に加算されない", JSON.stringify(await t.stats()), before);
  // 退避の鍵は移行ごとに変わる（..._kaki5-8）。以前は1つの鍵に「まだ無ければ書く」形で、
  // 2回目以降の移行では前回の退避が残っているせいで今回ぶんが退避されなかった
  const backup = await t.page.evaluate(() =>
    Object.keys(localStorage).filter(k => k.startsWith("kq_battle_stats_backup_kaki_v1")));
  t.ok("移行前の記録が退避されている", backup.length > 0, backup);
});

await test("正解日のない古い記録を補う", async t => {
  await t.open();
  const id = await t.page.evaluate(() => QA_DATA[0].id);
  const day = new Date(2026, 7, 20).getTime();
  await t.page.evaluate(([i, d]) => {
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify({ [i]: { correct: 2, wrong: 0, lastAnswered: d } }));
  }, [id, day]);
  await t.reload();
  const st = await t.stats();
  t.is("正解ありで正解日がない記録は、解いた日で補われる", st[id].lastCorrectAt, day);
});

await test("やり直しラウンドで正解しても苦手のまま", async t => {
  await t.open();
  const id = await t.page.evaluate(() => QA_DATA[0].id);
  await t.page.evaluate(i => {
    localStorage.clear();
    localStorage.setItem("kq_battle_last_miss_v1", JSON.stringify([i]));
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify({ [i]: { correct: 0, wrong: 1, box: 0, lastAnswered: Date.now() } }));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "lastcorrect-backfill": 1 }));
  }, id);
  await t.reload();
  await t.page.click("#retry-last-miss-btn"); await t.page.waitForTimeout(500);
  t.ok("やり直し中の注意書きが出る", await t.page.isVisible("#solo-retry-note"));
  await t.page.click("#solo-reveal-btn"); await t.page.waitForTimeout(150);
  await t.page.click("#solo-judge-ok"); await t.page.waitForTimeout(400);
  const s = (await t.stats())[id];
  t.is("正解数は増えない", s.correct || 0, 0);
  t.is("誤答として記録される", s.wrong, 2);
  t.is("正解日は入らない", s.lastCorrectAt, undefined);
});

await test("一覧で、正解数（連続）・誤答数・2つの日付を行の上で直せる", async t => {
  // 2026-09-13 ユーザー原文「一覧画面で、正答数、誤答数の修正、正答日、実施日の修正がしたいです」。
  // いちど「記録を直す」の画面にしたが意図と違ったので、行の上の＋−と日付の欄に戻した（正解数は連続正解数）
  await t.open();
  const { id, unit } = await t.page.evaluate(() => ({ id: QA_DATA[0].id, unit: QA_DATA[0].u }));
  const c = new Date(2026, 7, 15).getTime(), a = new Date(2026, 7, 20).getTime();
  await t.page.evaluate(([i, cc, aa]) => {
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify({ [i]: { correct: 2, wrong: 1, box: 1, lastCorrectAt: cc, lastAnswered: aa } }));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "lastcorrect-backfill": 1 }));
  }, [id, c, a]);
  await t.reload();
  await t.page.click("#list-btn"); await t.page.waitForTimeout(400);
  await t.page.selectOption("#list-unit-select", unit);
  const row = `#list-items .list-item[data-qid="${id}"]`;
  await t.page.waitForSelector(row);
  const read = () => t.page.$eval(row, e => ({
    correctAt: e.querySelector('[data-date-field="lastCorrectAt"]').value,
    answered: e.querySelector('[data-date-field="lastAnswered"]').value,
    nums: [...e.querySelectorAll(".count-num")].map(n => n.textContent)
  }));
  let v = await read();
  t.is("最後に正解した日が出る", v.correctAt, "2026-08-15");
  t.is("最後に解いた日も出る", v.answered, "2026-08-20");
  t.is("正解数（連続）と誤答数が行に出る", v.nums, ["1", "1"]);
  t.ok("〇✕ボタンも残っている", !!(await t.page.$(row + ' .status-btn[data-status="mastered"]')));

  // 日付を直す → その場で記録に入り、正誤の数は変わらない
  await t.page.$eval(row + ' [data-date-field="lastCorrectAt"]', e => {
    e.value = "2026-09-03"; e.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await t.page.waitForTimeout(300);
  let rec = (await t.stats())[id];
  t.is("直した日付が記録に入る", ymd(rec.lastCorrectAt), "2026-09-03");
  t.is("正解数（連続）・誤答数は変わらない", [rec.box, rec.wrong], [1, 1]);

  // ＋− → 正解数は連続正解数（box）
  await t.page.$eval(row + ' .count-btn[data-field="correct"][data-delta="1"]', e => e.click());
  rec = (await t.stats())[id];
  t.is("★正解数（連続）の＋で連続が1つ上がる", rec.box, 2);
  await t.page.$eval(row + ' .count-btn[data-field="wrong"][data-delta="1"]', e => e.click());
  rec = (await t.stats())[id];
  t.is("★誤答数を＋すると連続が0に切れる", [rec.box, rec.wrong], [0, 2]);
  v = await read();
  t.is("行の数字も変わる", v.nums, ["0", "2"]);
});

await test("CSVの書き出しと読み込みで記録が失われない", async t => {
  await t.open();
  const id = await t.page.evaluate(() => QA_DATA[0].id);
  const seed = { correct: 3, wrong: 1, box: 2, nextDue: new Date(2026, 8, 10).getTime(),
    lastCorrectAt: new Date(2026, 7, 15).getTime(), lastAnswered: new Date(2026, 7, 20).getTime() };
  await t.page.evaluate(([i, s]) => {
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify({ [i]: s }));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "lastcorrect-backfill": 1 }));
  }, [id, seed]);
  await t.reload();
  const [dl] = await Promise.all([t.page.waitForEvent("download"), t.page.click("#export-link")]);
  // /tmp は Windows に無いので、OSごとの一時フォルダを使う
  const csvPath = path.join(await fs.promises.mkdtemp(path.join(os.tmpdir(), "kq-")), "export.csv");
  await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "");
  t.ok("最終正答日の列がある", csv.split("\r\n")[0].includes("最終正答日"), csv.split("\r\n")[0]);
  t.ok("最終回答日の列がある", csv.split("\r\n")[0].includes("最終回答日"), csv.split("\r\n")[0]);

  // まっさらな状態に読みこむ → 復元されるか
  await t.page.evaluate(() => localStorage.setItem("kq_battle_stats_v1", "{}"));
  await t.reload();
  await t.page.setInputFiles("#import-file", csvPath); await t.page.waitForTimeout(1200);
  const back = (await t.stats())[id];
  t.is("正解・誤答の回数が復元される", [back.correct, back.wrong], [3, 1]);
  t.is("2つの日付が復元される",
    [ymd(back.lastCorrectAt), ymd(back.lastAnswered)],
    ["2026-08-15", "2026-08-20"]);

  // すでに記録がある状態に読みこむ → box/nextDue が壊れないか
  await t.page.evaluate(([i, s]) => localStorage.setItem("kq_battle_stats_v1", JSON.stringify({ [i]: s })), [id, seed]);
  await t.reload();
  await t.page.setInputFiles("#import-file", csvPath); await t.page.waitForTimeout(1200);
  const after = (await t.stats())[id];
  t.is("間隔反復のbox/nextDueが保たれる", [after.box, after.nextDue], [seed.box, seed.nextDue]);
});

await test("復習ミックスの優先順位", async t => {
  await t.open();
  const { history } = await pickUnits(t.page);
  // 復習候補になる単元をひとつ選び、その中で4種類の状態を作る
  const target = await t.page.evaluate(h => {
    const other = [...new Set(QA_DATA.filter(q => q.subj === "社会" && q.u !== h).map(q => q.u))][0];
    return { unit: other, ids: QA_DATA.filter(q => q.u === other).slice(0, 4).map(q => q.id) };
  }, history);
  const old = new Date(2026, 7, 1).getTime(), recent = new Date(2026, 8, 6).getTime();
  await t.page.evaluate(([tg, o, r]) => {
    localStorage.clear();
    const st = {};
    // 対象単元の他の問題は「定着ずみ・直近に正解」にして後ろに回す
    QA_DATA.filter(q => q.u === tg.unit).forEach(q => { st[q.id] = { correct: 5, wrong: 0, box: 5, lastCorrectAt: r, lastAnswered: r }; });
    st[tg.ids[0]] = { correct: 3, wrong: 5, box: 2, lastCorrectAt: o, lastAnswered: o };  // A 立ち直り中
    st[tg.ids[1]] = { correct: 3, wrong: 5, box: 0, lastCorrectAt: o, lastAnswered: o };  // B いま苦手
    st[tg.ids[2]] = { correct: 10, wrong: 1, box: 4, lastCorrectAt: o, lastAnswered: o }; // C 定着ずみ
    st[tg.ids[3]] = { correct: 0, wrong: 2, box: 0, lastAnswered: o };                    // D 未正解
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "lastcorrect-backfill": 1 }));
  }, [target, old, recent]);
  await t.reload();

  await t.clickUnit("ALL");
  await t.openHistory();
  await t.clickUnit(history);                 // メインは歴史の1単元だけ
  await t.page.click("#order-toggle"); await t.page.waitForTimeout(150); // 出題順どおり
  await t.page.evaluate(u => {                // 復習単元は対象の1つだけ
    document.querySelectorAll("#review-unit-choices .choice").forEach(el => {
      if (el.classList.contains("selected") !== (el.dataset.unit === u)) el.click();
    });
  }, target.unit);
  await t.page.waitForTimeout(400);
  await t.page.fill("#review-mix-input", "4");
  await t.page.dispatchEvent("#review-mix-input", "change"); await t.page.waitForTimeout(400);
  await t.page.click("#solo-start-btn"); await t.page.waitForTimeout(600);
  const picked = await t.page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("kq_battle_solo_session_v1"));
    // 中断中のセッションは問題idで保存される（古い版はQA_DATAの添字だった）
    return s.quizIds || s.quizQueue.map(i => QA_DATA[i].id);
  });
  const rev = picked.slice(-4);
  t.is("①未正解が最初", rev[0], target.ids[3]);
  t.is("②いま苦手が次", rev[1], target.ids[1]);
  t.ok("③立ち直り中と定着ずみは後ろ", rev.slice(2).includes(target.ids[0]) && rev.slice(2).includes(target.ids[2]), rev);
});

await test("未クリア優先（両方ONのとき未クリアが先）", async t => {
  await t.open();
  const { history } = await pickUnits(t.page);
  // 対象単元の中に「未クリア6問」と「正解ずみだが苦手6問」を作る。
  // 10問選んだとき、未クリア6問が全部入り、残り4問が苦手から来るのが期待。
  const target = await t.page.evaluate(u => {
    const ids = QA_DATA.filter(q => q.u === u).map(q => q.id);
    // ★苦手を未クリアより多めに作る。同数だと、直っていないコードでも
    //   たまたま 6:4 に割れて通ってしまう（実測でそうなった）。
    //   未クリア6・苦手10 なら、直っていなければ未クリアは平均3.75問しか入らない。
    return { unmastered: ids.slice(0, 6), weak: ids.slice(6, 16), rest: ids.slice(16) };
  }, history);
  const old = new Date(2026, 7, 1).getTime();
  await t.page.evaluate(([tg, o]) => {
    localStorage.clear();
    const st = {};
    // 未クリア: 一度も正解していない（isMastered=false）
    tg.unmastered.forEach(id => { st[id] = { correct: 0, wrong: 2, box: 0, lastAnswered: o }; });
    // 正解ずみだが苦手: 正解はあるが直近で間違えている（isMastered=true, isWeak=true）
    tg.weak.forEach(id => { st[id] = { correct: 3, wrong: 5, box: 0, lastCorrectAt: o, lastAnswered: o }; });
    // 残りは定着ずみ（どちらのフィルタにも入らない＝プールから消える）
    tg.rest.forEach(id => { st[id] = { correct: 5, wrong: 0, box: 5, lastCorrectAt: o, lastAnswered: o }; });
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "lastcorrect-backfill": 1 }));
  }, [target, old]);
  await t.reload();

  await t.clickUnit("ALL");
  await t.openHistory();
  await t.clickUnit(history);
  await t.page.click("#mode-unmastered"); await t.page.waitForTimeout(150);
  await t.page.click("#mode-weak"); await t.page.waitForTimeout(150);
  t.is("両方ONになっている", await t.page.evaluate(() =>
    ["mode-unmastered", "mode-weak"].map(i => document.getElementById(i).classList.contains("on"))), [true, true]);
  // 10問にする
  await t.page.evaluate(() => {
    const c = [...document.querySelectorAll(".count-choice")].find(e => e.dataset.count === "10");
    if (c && !c.classList.contains("on")) c.click();
  });
  await t.page.waitForTimeout(200);
  await t.page.click("#solo-start-btn"); await t.page.waitForTimeout(700);
  const picked = await t.page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("kq_battle_solo_session_v1"));
    return s.quizIds || s.quizQueue.map(i => QA_DATA[i].id);
  });
  t.is("合計は10問のまま", picked.length, 10);
  const nUn = picked.filter(id => target.unmastered.includes(id)).length;
  const nWk = picked.filter(id => target.weak.includes(id)).length;
  t.is("★未クリア6問が全部入る", nUn, 6);
  t.is("★残り4問は苦手から", nWk, 4);
  t.ok("★未クリアが先に並ぶ",
    picked.slice(0, 6).every(id => target.unmastered.includes(id)), picked);
  t.is("定着ずみは混ざらない", picked.filter(id => target.rest.includes(id)).length, 0);
});

await test("よく間違える: 最後に正解した日が古い順／まちがえた問題は翌日も出る", async t => {
  await t.open();
  const { history } = await pickUnits(t.page);
  // 苦手な問題を12問つくる。★4問は「正解日なし」（古い記録・一度も正解していない扱い）
  const target = await t.page.evaluate(u => QA_DATA.filter(q => q.u === u).slice(0, 16).map(q => q.id), history);
  const day = 86400000, base = new Date(2026, 8, 12).getTime();
  await t.page.evaluate(([ids, base, day]) => {
    localStorage.clear();
    const st = {};
    ids.forEach((id, i) => {
      // isWeak = まちがい1回以上 かつ box<=1
      st[id] = i < 4 ? { correct: 1, wrong: 2, box: 0, lastAnswered: base }
                     : { correct: 2, wrong: 1, box: 1, lastCorrectAt: base - (16 - i) * day, lastAnswered: base };
    });
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "lastcorrect-backfill": 1 }));
  }, [target, base, day]);
  await t.reload();

  await t.clickUnit("ALL");
  await t.openHistory();
  await t.clickUnit(history);
  // ★トグルと出題数は科目別に保存される。リロード後に押すと OFF になるので、
  //   「押す」のではなく「ONにする」形で書く（ここで一度ハマった）
  const setWeakOn = () => t.page.evaluate(() => {
    const w = document.getElementById("mode-weak");
    if (!w.classList.contains("on")) w.click();
    const u = document.getElementById("mode-unmastered");
    if (u.classList.contains("on")) u.click();
    const c = [...document.querySelectorAll(".count-choice")].find(e => e.dataset.count === "10");
    if (c && !c.classList.contains("on")) c.click();
  });
  await setWeakOn(); await t.page.waitForTimeout(250);
  const picked = () => t.page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("kq_battle_solo_session_v1"));
    return s.quizIds || s.quizQueue.map(i => QA_DATA[i].id);
  });

  // ---- 1日目 ----
  await t.page.click("#solo-start-btn"); await t.page.waitForTimeout(700);
  const day1 = await picked();
  t.is("10問選ばれる", day1.length, 10);
  // ★正解日なしの4問が先頭（0 扱い＝いちばん古い）
  t.ok("★正解日なしが先頭に来る", day1.slice(0, 4).every(id => target.slice(0, 4).includes(id)), day1);
  // ★ランダムではない: 同じ条件でもう一度組み立てて、同じ並びになる
  await t.page.click("#solo-back"); await t.page.waitForTimeout(400);
  await t.page.click("#solo-start-btn"); await t.page.waitForTimeout(700);
  t.is("★毎回同じ並び（ランダムでない）", await picked(), day1);

  // ---- 2日目 ----
  // ★リロードを挟まない。トグルと出題数は科目別に保存されるので、
  //   リロードして押し直すと設定が入れかわり、何を測っているか分からなくなる
  //   （ここで一度ハマった）。設定はそのまま、記録だけ翌日の状態にする。
  const ok = day1.filter((_, i) => i % 2 === 0), ng = day1.filter((_, i) => i % 2 === 1);
  await t.page.click("#solo-back"); await t.page.waitForTimeout(400);
  await t.page.evaluate(([ok, ng, tomorrow]) => {
    const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1"));
    // 正解 … lastCorrectAt が新しくなり、box が上がる
    ok.forEach(id => { st[id].correct++; st[id].lastCorrectAt = tomorrow; st[id].box = Math.min((st[id].box||0)+1, 7); st[id].lastAnswered = tomorrow; });
    // ★まちがい … lastCorrectAt は触らない（ここが「順位が動かない」の要）
    ng.forEach(id => { st[id].wrong++; st[id].box = 0; st[id].lastAnswered = tomorrow; });
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.removeItem("kq_battle_solo_session_v1");
  }, [ok, ng, base + day]);
  // ★記録を読み直させるためリロードする。ただし★トグルには触らない
  //   （科目別に保存されているので、そのまま復元される）。
  await t.reload();
  await t.page.click("#solo-start-btn"); await t.page.waitForTimeout(700);
  const day2 = await picked();
  t.is("★まちがえた問題は翌日も全部出る", ng.filter(id => day2.includes(id)).length, ng.length);
  t.is("★正解した問題は沈んで出ない", ok.filter(id => day2.includes(id)).length, 0);
  t.ok("★まちがえた問題が先頭に並ぶ", day2.slice(0, ng.length).every(id => ng.includes(id)), day2);
});

// ============================================================
// ★出題順の3段（2026-09-13 ユーザー確定仕様）
//   1段目 未実施（記録が1件も無い） / 2段目 苦手（wrong>0 かつ box<=1）
//   3段目 それ以外。★各段の中は「最後に正解した日」の古い順
// ⚠️ **3段すべてが並ぶのは復習ミックス側だけ**です。メイン側はトグルが先に
//    絞りこむので、3段目が対象に残りません（index.html の buildFinalPool 参照）。
//    そのため「全3段」は復習ミックスで固定し、「両経路で同じ並び」は
//    ★3段目を含まない単元を使って**同じ集合**をぶつけて固定します。
// ⚠️ **トグルと出題数は科目別に保存されます。**リロード後に「クリックする」と
//    ONではなくOFFになります。**必ず「この状態にする」と書くこと**（実際に踏みました）
// ============================================================
const TIER_UNIT  = "公民2.選挙";              // 3段を仕込む単元（16問）
const TIER_MAIN  = "公民1.きまりと国会";       // 復習ミックスの「メイン側」に使う別単元
const DAY = 86400000, T0 = new Date(2026, 8, 13).getTime();

// TIER_UNIT に記録を仕込む。withRest=false なら3段目を作らない
// ⚠️ ★**段を data.js の並び順どおりに仕込んではいけません。**
//    先頭5問=1段目、次の5問=2段目…のように仕込むと、**並べ替えを丸ごと壊しても
//    テストが通ってしまいます**（元の並びが正解と同じになるため）。
//    そこで**とびとびに**割りあて、さらに**各段の中の「最後に正解した日」を
//    data.js の並びと逆**にして、期待する並びが元の並びと一致しないようにします。
//    ★実際に、この仕込みにしたあとで壊して初めてテストが鳴りました
async function seedTiers(t, withRest) {
  const g = await t.page.evaluate(u => {
    const ids = QA_DATA.filter(q => q.u === u).map(q => q.id);
    const at = arr => arr.map(i => ids[i]);
    return {
      all: ids,
      unseen: at([3, 7, 11, 15]),                    // 1段目（記録なし）
      weak:   at([1, 5, 9, 13]),                     // 2段目（苦手）
      rest:   at([0, 2, 4, 6, 8, 10, 12, 14]),       // 3段目
    };
  }, TIER_UNIT);
  // 期待する並び: 各段の中は「最後に正解した日の古い順」。
  // 下の仕込みで日付を**逆順**に入れるので、期待は配列の逆になる
  g.weakExp = g.weak.slice().reverse();
  g.restExp = g.rest.slice().reverse();
  await t.page.evaluate(([g, T0, DAY, withRest]) => {
    localStorage.clear();
    const st = {};
    // 2段目: wrong>0 かつ box<=1。★日付は配列の**後ろほど古い**
    g.weak.forEach((id, i) => { st[id] = { correct: 2, wrong: 1, box: 0,
      lastCorrectAt: T0 - (10 + i * 5) * DAY, lastAnswered: T0 }; });
    if (withRest) {
      // 3段目: 2連続正解ずみ（box>=2）。こちらも後ろほど古い。
      // ★**半分は「一度間違えたが、2連続正解して卒業した」問にします。**
      //   wrong>0 かつ box>=2 という、まさに `box<=1` の境目にいる組みあわせです。
      //   ⚠️ ここを全部 wrong:0 で作ると、**苦手判定から box の条件を外しても
      //   テストが鳴りません**（wrong が0なので段が動かない）。実際に鳴らず、
      //   壊して確かめたおかげで気づきました
      g.rest.forEach((id, i) => { st[id] = { correct: 3, wrong: (i % 2 ? 2 : 0), box: 2,
        lastCorrectAt: T0 - (100 + i * 5) * DAY, lastAnswered: T0 }; });
    } else {
      // ★3段目を作らない版: box を上げず、間違えた記録にして2段目に寄せる
      g.rest.forEach((id, i) => { st[id] = { correct: 1, wrong: 1, box: 0,
        lastCorrectAt: T0 - (100 + i * 5) * DAY, lastAnswered: T0 }; });
    }
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1",
      JSON.stringify({ "kaki1-4": 1, "lastcorrect-backfill": 1 }));
  }, [g, T0, DAY, withRest]);
  await t.reload();
  return g;
}
const openGroup = async (t, key) => {
  const h = await t.page.$(`#unit-choices .unit-group-header[data-group="${key}"]`);
  if (h && !(await h.evaluate(e => e.classList.contains("open")))) await h.click();
  await t.page.waitForTimeout(150);
};
// 単元をこれだけにする
async function onlyUnit(t, u) {
  await t.clickUnit("ALL");          // いったん全部はずす
  const sel = await t.selected();
  if (sel.length) await t.clickUnit("ALL");   // 全部ONになっていたらもう一度
  await openGroup(t, "civics");
  await t.clickUnit(u);
}
// ★「押す」ではなく「この状態にする」。リロード後に押すと逆になる
const setModes = (t, weak, unmastered) => t.page.evaluate(([w, u]) => {
  const W = document.getElementById("mode-weak"), U = document.getElementById("mode-unmastered");
  if (W.classList.contains("on") !== w) W.click();
  if (U.classList.contains("on") !== u) U.click();
}, [weak, unmastered]);
const setOrdered = t => t.page.evaluate(() => {     // ランダム順ではなく出題順どおりに
  const o = document.getElementById("order-toggle");
  if (!o.classList.contains("on")) o.click();
});
const setCount = (t, c) => t.page.evaluate(c => {
  const b = [...document.querySelectorAll(".count-choice")].find(e => e.dataset.count === c);
  if (b && !b.classList.contains("on")) b.click();
}, c);
const setReviewMix = async (t, n, unit) => {
  await t.page.click("#review-unit-clear-link");    // 復習の対象単元をいったん空に
  // ★復習側のアコーディオンは data-review-group。メイン側の data-group とは別属性
  //   （名前空間を分けて querySelector の取り違えを防ぐ作りになっている）。
  //   ここを data-group で書いて、開かないまま「見えない」で落ちました
  const h = await t.page.$(`#review-unit-choices .unit-group-header[data-review-group="civics"]`);
  if (h && !(await h.evaluate(e => e.classList.contains("open")))) await h.click();
  await t.page.waitForTimeout(150);
  await t.page.click(`#review-unit-choices .choice[data-unit="${unit}"]`);
  await t.page.fill("#review-mix-input", String(n));
  await t.page.dispatchEvent("#review-mix-input", "change");
  await t.page.waitForTimeout(200);
};
// 出題された id を、始めた順に取り出す
const startAndPick = async t => {
  await t.page.click("#solo-start-btn"); await t.page.waitForTimeout(900);
  return t.page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("kq_battle_solo_session_v1") || "{}");
    return (s.quizIds || (s.quizQueue || []).map(i => QA_DATA[i].id));
  });
};

await test("出題順の3段（復習ミックス経路・全3段が順に出る）", async t => {
  await t.open();
  const g = await seedTiers(t, true);
  await onlyUnit(t, TIER_MAIN);
  await setModes(t, false, false);
  await setOrdered(t);
  await setCount(t, "10");
  await setReviewMix(t, g.all.length, TIER_UNIT);   // 16問ぜんぶ
  const picked = await startAndPick(t);
  const rev = picked.slice(10);                     // 後ろが復習ミックスの分
  t.is("復習ミックスが16問つく", rev.length, g.all.length);
  // 1段目は lastCorrectAt が全員 0（記録なし）で同点。並べ替えは安定なので元の並びが残る
  t.is("★1段目（未実施）が先頭のかたまり", rev.slice(0, 4), g.unseen);
  t.is("★2段目の中が最後に正解した日の古い順", rev.slice(4, 8),  g.weakExp);
  t.is("★3段目の中が最後に正解した日の古い順", rev.slice(8),     g.restExp);
  t.ok("★段をまたいで混ざらない",
    rev.slice(0, 4).every(id => g.unseen.includes(id)) &&
    rev.slice(4, 8).every(id => g.weak.includes(id)) &&
    rev.slice(8).every(id => g.rest.includes(id)), rev);

  // ★尽きたら次の段へ行く: 7問だけ求めると 1段目5問 → 2段目の古い2問
  await t.page.click("#solo-back"); await t.page.waitForTimeout(400);
  await setReviewMix(t, 6, TIER_UNIT);
  const p2 = (await startAndPick(t)).slice(10);
  t.is("★1段目が尽きたら2段目へ行く（4問+2問）", p2, g.unseen.concat(g.weakExp.slice(0, 2)));
});

await test("出題順の3段（よく間違える と 復習ミックス で同じ並びになる）", async t => {
  // ★3段目を作らない仕込みにして、メイン側のトグルで1問も落ちない状態にする。
  //   そうすると「よく間違える＋未クリア」の対象と復習ミックスの対象が**同じ集合**になり、
  //   並びを直接くらべられる（ふだんはトグルが先に絞るので集合が違ってしまう）
  await t.open();
  const g = await seedTiers(t, false);

  // 経路1: メイン側（よく間違える＋未クリア）
  await onlyUnit(t, TIER_UNIT);
  await setModes(t, true, true);
  await setOrdered(t);
  await setCount(t, "all");
  await setReviewMix(t, 0, TIER_MAIN);
  const viaMain = await startAndPick(t);
  t.is("メイン側で単元の16問すべてが対象になる", viaMain.length, g.all.length);

  // 経路2: 復習ミックス側（同じ単元を、別単元のメインに足す）
  await t.page.click("#solo-back"); await t.page.waitForTimeout(400);
  await onlyUnit(t, TIER_MAIN);
  await setModes(t, false, false);
  await setCount(t, "10");
  await setReviewMix(t, g.all.length, TIER_UNIT);
  const viaReview = (await startAndPick(t)).slice(10);

  t.is("★同じ集合なら、両経路で並びが完全に一致する", viaReview, viaMain);
});

await test("補う: トグルの問題が足りないとき、残りから段の順で補う", async t => {
  // 2026-09-13 ユーザー判断。★トグルの問題が必ず先、補う分は後ろ（未実施→苦手→それ以外・各段は古い順）
  await t.open();
  const g = await seedTiers(t, true);              // 1段目4・2段目4・3段目8
  await onlyUnit(t, TIER_UNIT);
  await setModes(t, true, false);                  // よく間違えるだけ → 対象は2段目の4問
  await setOrdered(t);
  await setReviewMix(t, 0, TIER_MAIN);
  await setCount(t, "10");
  const p = await startAndPick(t);
  t.is("★10問: 苦手4問（古い順）→ 未実施4問 → それ以外の古い2問",
    p, g.weakExp.concat(g.unseen, g.restExp.slice(0, 2)));

  // 「全部」のとき: トグルの問題があれば、それだけ
  await t.page.click("#solo-back"); await t.page.waitForTimeout(400);
  await setCount(t, "all");
  t.is("★「全部」で苦手が4問あるときは、その4問だけ", await startAndPick(t), g.weakExp);
});

await test("補う: 苦手が0問でも「全部」で始められる", async t => {
  await t.open();
  const g = await seedTiers(t, true);
  // 2段目の4問を卒業させる（box 2）→ 苦手が0問になる。★日付は3段目より新しいまま
  await t.page.evaluate(ids => {
    const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1"));
    ids.forEach(id => { st[id].box = 2; });
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  }, g.weak);
  await t.reload();
  await onlyUnit(t, TIER_UNIT);
  await setModes(t, true, false);
  await setOrdered(t);
  await setReviewMix(t, 0, TIER_MAIN);
  await setCount(t, "all");
  await t.page.waitForTimeout(200);
  const btn = await t.page.$eval("#solo-start-btn", e => ({ disabled: e.disabled, text: e.textContent }));
  t.ok("★ボタンが押せる（「問題がありません」にならない）", !btn.disabled && btn.text.includes("16問"), btn);
  t.is("★未実施4問 → それ以外12問（古い順）",
    await startAndPick(t), g.unseen.concat(g.restExp, g.weakExp));
});

await test("一覧: 押した行だけ描き直す／開いたあと全行そろう／途中の描き直しで混ざらない", async t => {
  // 2026-09-13。以前は〇✕や正解数を1つ変えるたびに一覧を全部作り直し、押した行が318pxずれていた
  await t.open();
  await t.page.evaluate(() => localStorage.clear());
  await t.reload();

  await t.page.click("#list-btn");
  await t.page.waitForTimeout(300);
  // ★2026-09-13 ユーザー原文「絞り込みを押すまで何も出さない。いまだといきなり全件読もうとするので非常に時間が掛かります」
  t.ok("★開いたときは何も描かず「単元か絞りこみを選んでください」と出す",
    await t.page.evaluate(() => document.querySelectorAll("#list-items .list-item").length === 0 &&
      document.getElementById("list-items").textContent.includes("単元か絞りこみを選んでください")));
  // ★いちばん問題の多い単元を選び、その直後に絞りこみを変える。古い「続き」が止まらないと、0件のはずの一覧に行が足される
  const bigUnit = await t.page.evaluate(() => {
    const c = {};
    QA_DATA.filter(q => q.subj === "社会" && q.kind !== "calc").forEach(q => { c[q.u] = (c[q.u] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  });
  await t.page.selectOption("#list-unit-select", bigUnit);
  await t.page.evaluate(() => document.querySelector('.list-filter-toggle[data-filter="weak"]').click());
  await t.page.waitForTimeout(1500);
  t.is("★描き直しが途中で始まっても、古い行が混ざらない（苦手0問なので0行）",
    await t.page.evaluate(() => document.querySelectorAll("#list-items .list-item").length), 0);
  await t.page.evaluate(() => document.querySelector('.list-filter-toggle[data-filter="weak"]').click());

  const total = await t.page.evaluate(() => parseInt(document.getElementById("list-count").textContent, 10));
  let all = true;
  try {
    await t.page.waitForFunction(n => document.querySelectorAll("#list-items .list-item").length === n, total, { timeout: 60000 });
  } catch { all = false; }
  t.ok("★少しずつ足して、最後は全行そろう", all,
    await t.page.evaluate(() => document.querySelectorAll("#list-items .list-item").length) + " / " + total);

  const r = await t.page.evaluate(() => {
    const rows = () => [...document.querySelectorAll("#list-items .list-item")];
    const target = rows()[5], neighbor = rows()[6], qid = target.dataset.qid;
    target.querySelector('.count-btn[data-field="correct"][data-delta="1"]').click();
    const now = document.querySelector('#list-items .list-item[data-qid="' + qid + '"]');
    const res = {
      replaced: now !== target,
      correctNum: now.querySelector(".count-stepper.ok .count-num").textContent,
      neighborSame: rows()[6] === neighbor,
      rowCount: rows().length
    };
    // 編集 → キャンセル も、その行だけ
    now.querySelector(".edit-link").click();
    const editRow = document.querySelector('#list-items .list-item[data-edit-qid="' + qid + '"]');
    res.editShown = !!editRow && !!editRow.querySelector("#edit-q-input");
    res.neighborSameAfterEdit = rows()[6] === neighbor;
    document.getElementById("edit-cancel-btn").click();
    res.backToNormal = !!document.querySelector('#list-items .list-item[data-qid="' + qid + '"]') &&
      !document.querySelector('#list-items .list-item[data-edit-qid]');
    res.neighborSameAfterCancel = rows()[6] === neighbor;
    return res;
  });
  t.is("＋を押した行の正解数（連続）が1になる", r.correctNum, "1");
  t.ok("押した行は新しく描き直される", r.replaced);
  t.ok("★となりの行は作り直されない（同じ要素のまま）", r.neighborSame);
  t.is("行の数は変わらない", r.rowCount, total);
  t.ok("「文章を直す」でその行だけ編集の形になる", r.editShown && r.neighborSameAfterEdit);
  t.ok("キャンセルでその行だけ元にもどる", r.backToNormal && r.neighborSameAfterCancel);
});

await test("メイン画面: 出題タイプ・優先度・難易度はたたんでおけて、閉じても条件が1行で出る", async t => {
  // 2026-09-13 ユーザー原文「メインの画面の難易度などのフィルタをパネルで隠してほしい件、対応されていません」
  // ★いちど一覧の絞りこみのほうをたたんでいた（取り違え）。一覧はたたまない形に戻した
  await t.open();
  await t.page.evaluate(() => localStorage.clear());
  await t.reload();
  const st = () => t.page.evaluate(() => ({
    panel: !document.getElementById("setup-filter-panel").hidden,
    btn: document.getElementById("setup-filter-open").textContent,
    summaryShown: !document.getElementById("setup-filter-summary").hidden,
    summary: document.getElementById("setup-filter-summary").textContent
  }));
  let s = await st();
  t.ok("はじめは閉じている（条件が無いので要約も出ない）", !s.panel && !s.summaryShown && s.btn === "絞りこみ ▾", s);
  t.ok("一覧の絞りこみにはたたむボタンが無い（状態・解いた日はいつも見える）",
    await t.page.evaluate(() => !document.getElementById("list-filter-open") && !!document.getElementById("list-status-filters")
      && !!document.getElementById("list-date-from")));
  await t.page.click("#setup-filter-open"); await t.page.waitForTimeout(150);
  s = await st();
  t.ok("押すと開く", s.panel && s.btn === "絞りこみ ▴", s);
  await t.page.click("#priority-high");
  await t.page.click("#level-basic");
  await t.page.waitForTimeout(300);
  s = await st();
  t.is("★ボタンにかかっている条件の数が出る", s.btn, "絞りこみ ▴（2件）");
  await t.page.click("#setup-filter-open"); await t.page.waitForTimeout(150);
  s = await st();
  t.ok("★閉じると、かかっている条件が1行で出る", !s.panel && s.summaryShown && s.summary === "優先度：高・難易度：基礎", s);
  // 開いたままにして、リロードしても開いている
  await t.page.click("#setup-filter-open");
  await t.reload();
  s = await st();
  t.ok("★開いたままにしたら、リロードしても開いている", s.panel, s);
});

await test("正解数＝連続正解数: まちがえると未クリアにもどる（保存された記録は書きかえない）", async t => {
  // 2026-09-13 ユーザー判断「正解数そのものを連続正解数にする」。
  // 以前は累計の正解数で「正解ずみ」を決めていたので、一度正解すると、まちがえても未クリアに戻らなかった
  await t.open();
  const { history } = await pickUnits(t.page);
  const ids = await t.page.evaluate(u => QA_DATA.filter(q => q.u === u && q.kind !== "calc").slice(0, 4).map(q => q.id), history);
  const T = new Date(2026, 8, 1).getTime();
  const seed = {
    [ids[0]]: { correct: 5, wrong: 2, box: 0, lastCorrectAt: T, lastAnswered: T },   // ① 累計5回正解・直近まちがえた
    [ids[1]]: { correct: 3, wrong: 0, box: 3, lastCorrectAt: T, lastAnswered: T },   // ② 3回続けて正解
    [ids[2]]: { correct: 1, wrong: 1, box: 0, lastCorrectAt: T, lastAnswered: T },   // ③ 1回正解してから、まちがえた
  };                                                                                // ④ ids[3] は記録なし
  await t.page.evaluate(s => {
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(s));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "lastcorrect-backfill": 1 }));
  }, seed);
  await t.reload();
  await t.clickUnit("ALL");
  await t.openHistory();
  await t.clickUnit(history);
  const home = await t.page.evaluate(() => ({
    total: +document.getElementById("stat-total").textContent,
    mastered: +document.getElementById("stat-mastered").textContent,
    weak: +document.getElementById("stat-weak").textContent }));
  t.is("★ホームの「正解済み数」は、連続正解がある②だけの1問（以前は累計で①②③の3問）", home.mastered, 1);
  t.is("苦手な問題は①③の2問（判定は変えていない）", home.weak, 2);
  t.ok("未クリア＝全問題数−正解済み数", home.total - home.mastered >= 3, home);

  const stored = await t.stats();
  t.is("★保存された記録は書きかわっていない", ids.slice(0, 3).map(i => stored[i]), ids.slice(0, 3).map(i => seed[i]));

  // CSV: 「正解した回数」は累計のまま、最後に「連続正解数」の列
  const [dl] = await Promise.all([t.page.waitForEvent("download"), t.page.click("#export-link")]);
  const csvPath = path.join(await fs.promises.mkdtemp(path.join(os.tmpdir(), "kq-")), "export.csv");
  await dl.saveAs(csvPath);
  const lines = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "").split("\r\n");
  t.ok("CSVの最後の列が「連続正解数」", lines[0].endsWith(",連続正解数"), lines[0]);
  const line2 = lines.find(l => l.startsWith(ids[1] + ","));
  t.ok("②の行: 正解した回数は累計3・連続正解数は3", line2 && line2.endsWith(",3") && line2.includes(",3,0,"), line2);

  // まっさらに読みこむ → 新しくできた記録は、列の値を連続正解数にする
  await t.page.evaluate(() => localStorage.setItem("kq_battle_stats_v1", "{}"));
  await t.reload();
  await t.page.setInputFiles("#import-file", csvPath); await t.page.waitForTimeout(1200);
  let st = await t.stats();
  t.is("新しくできた記録は、CSVの連続正解数を使う（①0・②3）", [st[ids[0]] && st[ids[0]].box, st[ids[1]] && st[ids[1]].box], [0, 3]);

  // すでに記録がある問題 → 連続正解数は上げない（古いファイルで苦手が消えないように）
  await t.page.evaluate(([i, T]) => localStorage.setItem("kq_battle_stats_v1",
    JSON.stringify({ [i]: { correct: 3, wrong: 1, box: 0, lastCorrectAt: T, lastAnswered: T } })), [ids[1], T]);
  await t.reload();
  await t.page.setInputFiles("#import-file", csvPath); await t.page.waitForTimeout(1200);
  st = await t.stats();
  t.is("★すでにある記録の連続正解数は、CSVを読んでも上がらない", st[ids[1]].box, 0);
});

await test("基本の通し（出題・問題一覧）", async t => {
  await t.open();
  await t.page.evaluate(() => localStorage.clear());
  await t.reload();
  const { history } = await pickUnits(t.page);
  await t.clickUnit("ALL");
  await t.openHistory();
  await t.clickUnit(history);
  await t.page.click("#solo-start-btn"); await t.page.waitForTimeout(600);
  t.is("ソロが始まる", await t.screen(), "screen-solo");
  for (let i = 0; i < 3; i++) {
    await t.page.click("#solo-reveal-btn"); await t.page.waitForTimeout(120);
    await t.page.click("#solo-judge-ok"); await t.page.waitForTimeout(250);
  }
  const st = await t.stats();
  t.is("3問ぶん記録される", Object.keys(st).length, 3);
  await t.page.click("#solo-back"); await t.page.waitForTimeout(500);
  t.is("ホームにもどれる", await t.screen(), "screen-home");
  await t.page.click("#list-btn"); await t.page.waitForTimeout(700);
  t.is("問題一覧をひらける", await t.screen(), "screen-list");
  // 2026-09-13 から一覧は単元か絞りこみを選ぶまで何も出さないので、単元を選ぶ
  await t.page.selectOption("#list-unit-select", history); await t.page.waitForTimeout(700);
  const n = await t.page.evaluate(() => document.querySelectorAll(".list-item").length);
  t.ok("一覧に問題が並ぶ", n > 0, n + "件");
});

// ---------------------------------------------------------------- 結果の表示
await browser.close();
server.close();

let failed = 0;
for (const r of results) {
  const bad = r.checks.filter(c => !c.ok).length + r.errors.length + (r.thrown ? 1 : 0);
  console.log((bad ? "✗" : "✓") + " " + r.name);
  for (const c of r.checks) {
    if (c.ok) { console.log("    ok   " + c.label); continue; }
    console.log("    NG   " + c.label);
    console.log("         期待: " + JSON.stringify(c.expected) + " / 実際: " + JSON.stringify(c.actual));
  }
  for (const e of r.errors) console.log("    NG   " + e);
  if (r.thrown) console.log("    NG   テスト中に例外: " + r.thrown.message);
  failed += bad;
}
console.log("\n" + results.length + "件のテスト、問題 " + failed + "件");
process.exit(failed ? 1 : 0);
