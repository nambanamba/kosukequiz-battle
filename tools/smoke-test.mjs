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
const BASE = "http://127.0.0.1:" + server.address().port + "/index.html";

// 対戦(WebRTC)のライブラリはネットワークに出るので、読み込みだけ通るスタブに差し替える
const TRYSTERO_STUB = "export function joinRoom(){ return {makeAction:()=>[()=>{},()=>{}],"
  + " onPeerJoin:()=>{}, onPeerLeave:()=>{}, leave:()=>{}}; }";

const browser = await chromium.launch();
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
  // KAKI_STATS_MIGRATION はモジュール内の定数でページからは読めないので、
  // index.html から直接その表を取り出して使う
  const mig = JSON.parse(fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .match(/const KAKI_STATS_MIGRATION = \{([\s\S]*?)\n\};/)[1]
    .replace(/^/, "{").replace(/$/, "}"));
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
  const backup = await t.page.evaluate(() => localStorage.getItem("kq_battle_stats_backup_kaki_v1"));
  t.ok("移行前の記録が退避されている", !!backup, backup ? "あり" : "なし");
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

await test("一覧の2つの日付を表示・編集できる", async t => {
  await t.open();
  const id = await t.page.evaluate(() => QA_DATA[0].id);
  const c = new Date(2026, 7, 15).getTime(), a = new Date(2026, 7, 20).getTime();
  await t.page.evaluate(([i, cc, aa]) => {
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify({ [i]: { correct: 2, wrong: 1, box: 1, lastCorrectAt: cc, lastAnswered: aa } }));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "lastcorrect-backfill": 1 }));
  }, [id, c, a]);
  await t.reload();
  await t.page.click("#list-btn"); await t.page.waitForTimeout(700);
  const find = () => t.page.evaluate(() => {
    const items = [...document.querySelectorAll(".list-item")];
    for (const it of items) {
      const cc = it.querySelector('[data-date-field="lastCorrectAt"]');
      const aa = it.querySelector('[data-date-field="lastAnswered"]');
      if (cc && cc.value) return { i: items.indexOf(it), correct: cc.value, answered: aa ? aa.value : null };
    }
    return null;
  });
  const row = await find();
  t.is("最後に正解した日が出る", row && row.correct, "2026-08-15");
  t.is("最後に解いた日も出る", row && row.answered, "2026-08-20");
  await t.page.evaluate(i => {
    const it = [...document.querySelectorAll(".list-item")][i];
    const inp = it.querySelector('[data-date-field="lastCorrectAt"]');
    inp.value = "2026-09-03"; inp.dispatchEvent(new Event("change", { bubbles: true }));
  }, row.i);
  await t.page.waitForTimeout(400);
  const st = await t.stats();
  const rec = Object.values(st).find(v => v.correct === 2 && v.wrong === 1);
  t.is("直した日付が記録に入る", new Date(rec.lastCorrectAt).toISOString().slice(0, 10), "2026-09-03");
  t.is("正誤の回数は変わらない", [rec.correct, rec.wrong], [2, 1]);
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
  const csvPath = path.join(await fs.promises.mkdtemp("/tmp/kq-"), "export.csv");
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
    [new Date(back.lastCorrectAt).toISOString().slice(0, 10), new Date(back.lastAnswered).toISOString().slice(0, 10)],
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
