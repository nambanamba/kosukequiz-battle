// 旧単元の記録の引きつぎ（migrateKakiStats）を、実ブラウザで確かめる。
//
// この移行は **一度きり実行で、配信後は取り消せない**。
// とくに次の3つは、失敗しても気づきにくいので機械で確かめる。
//   1. 移行前の記録が退避されること（これが無いと手で戻す道も消える）
//   2. 引きつぎ表どおりに記録が移ること
//   3. 対応のつかなかった旧問題の記録が消えること（残ると幽霊レコードになる）
//
// 使い方:
//   node tools/test_migration.mjs
//
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function loadPlaywright(){
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const pw = await loadPlaywright();

const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".jpg":"image/jpeg", ".png":"image/png"};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {"content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream"});
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/";

// index.html から、移行の一覧をそのまま読む（テスト側で書き写さない）
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const MIGS = (() => {
  const body = html.match(/const KAKI_MIGRATIONS = (\[[\s\S]*?\n\]);/)[1];
  // コメント行を落としてから JSON にする
  const cleaned = body.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n")
    .replace(/(\n\s*)(id|renames|stats):/g, '$1"$2":');
  return JSON.parse(cleaned);
})();
const LAST = MIGS[MIGS.length - 1];
const MIG_ID = LAST.id;
const TABLE = LAST.stats;
const RENAMES = LAST.renames;

let pass = 0, fail = 0;
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "  ✅ " : "  ❌ ") + name + "  got=" + JSON.stringify(got) + (ok ? "" : " want=" + JSON.stringify(want)));
  ok ? pass++ : fail++;
}

const browser = await pw.chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(BASE + "index.html", { waitUntil: "load" });

// 移行前の状態を作る: 引きつぎ元3件と、対応のつかない旧問題1件に記録を入れておく
const srcIds = Object.keys(TABLE).slice(0, 3);
const ghostId = "t5-99";  // 引きつぎ表にも data.js にも無い旧問題
const seeded = await page.evaluate(([ids, ghost, migId]) => {
  const stats = {};
  ids.forEach((id, i) => { stats[id] = { correct: i + 1, wrong: 1, box: 2, lastAnswered: Date.now() }; });
  stats[ghost] = { correct: 9, wrong: 9 };
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(stats));
  // この移行だけ「まだ実行していない」状態にする
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "lastcorrect-backfill": 1 }));
  // 単元の選択に、消える旧単元を入れておく（置きかわるかを見る）
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
    subject: "社会", unitsBySubject: { "社会": ["5.近畿地方", "6.中部地方"] }
  }));
  return { migId, n: Object.keys(stats).length };
}, [srcIds, ghostId, MIG_ID]);

await page.reload({ waitUntil: "load" });
await page.waitForTimeout(600);

const after = await page.evaluate(() => ({
  stats: JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"),
  done: JSON.parse(localStorage.getItem("kq_battle_migrations_v1") || "{}"),
  keys: Object.keys(localStorage),
  settings: JSON.parse(localStorage.getItem("kq_battle_settings_v1") || "{}"),
}));

console.log("\n【1】★移行前の記録が退避されているか（これが無いと手で戻せない）");
{
  const bkKeys = after.keys.filter(k => k.startsWith("kq_battle_stats_backup_kaki_v1"));
  check("退避の鍵がある", bkKeys.length > 0, true);
  check("★この移行ID専用の鍵になっている（前回の退避を上書きしない）",
    bkKeys.some(k => k.endsWith("_" + MIG_ID)), true);
  const bk = await page.evaluate(k => JSON.parse(localStorage.getItem(k)),
    "kq_battle_stats_backup_kaki_v1_" + MIG_ID);
  check("退避の中に、移行前の記録が入っている",
    srcIds.every(id => bk && bk.stats && bk.stats[id]), true);
  check("退避にどの移行のものか書いてある", bk && bk.migration, MIG_ID);
}

console.log("\n【2】引きつぎ表どおりに記録が移ったか");
{
  check("引きつぎ元の記録は消えている", srcIds.some(id => after.stats[id]), false);
  const dst = srcIds.flatMap(id => TABLE[id]);
  check("引きつぎ先に記録が入っている", dst.every(id => after.stats[id]), true);
  const first = TABLE[srcIds[0]][0];
  check("正解数が引きつがれている", after.stats[first] && after.stats[first].correct >= 1, true);
}

console.log("\n【3】対応のつかなかった旧問題の記録が消えているか");
{
  check("data.js に無い旧問題の記録は消える（幽霊レコードを残さない）", after.stats[ghostId], undefined);
  check("残った記録がすべて実在の問題のものか",
    await page.evaluate(s => { const live = new Set(QA_DATA.map(d => d.id));
      return Object.keys(s).filter(id => !live.has(id)); }, after.stats), []);
}

console.log("\n【4】単元の選択が新しい名前に置きかわったか");
{
  const units = (after.settings.unitsBySubject || {})["社会"] || [];
  check("旧単元名が残っていない", units.filter(u => Object.keys(RENAMES).includes(u)), []);
  check("新単元名に置きかわっている",
    units.includes(RENAMES["5.近畿地方"]) && units.includes(RENAMES["6.中部地方"]), true);
}

console.log("\n【4b】★引きつぎ先にすでに記録があるとき、それが消えないか");
{
  // これが実機の状態そのもの。お子さんは復習編5〜8をすでに解いているので、
  // 引きつぎ先の多くにすでに記録がある。上書きする作りだったら、
  // **新しい問題で積み上げた記録が消える**
  const src = Object.keys(TABLE)[0];
  const dst = TABLE[src][0];
  const ctx3 = await browser.newContext();
  const p3 = await ctx3.newPage();
  await p3.goto(BASE + "index.html", { waitUntil: "load" });
  await p3.evaluate(([s, d]) => {
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify({
      [s]: { correct: 3, wrong: 1, box: 2 },          // 引きつぎ元
      [d]: { correct: 5, wrong: 2, box: 4 },          // 引きつぎ先に**すでにある**記録
    }));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "lastcorrect-backfill": 1 }));
  }, [src, dst]);
  await p3.reload({ waitUntil: "load" });
  await p3.waitForTimeout(700);
  const st = await p3.evaluate(d => JSON.parse(localStorage.getItem("kq_battle_stats_v1"))[d], dst);
  check("★既存の記録が消えず、合算されている（3+5）", st && st.correct, 8);
  check("誤答も合算されている（1+2）", st && st.wrong, 3);
  check("★box は小さいほう（復習が早く回る安全側）", st && st.box, 2);
  await ctx3.close();
}

console.log("\n【5】★前回の移行を済ませた端末でも、今回ぶんが退避されるか");
{
  // 実際にお子さんの端末はこの状態にある（前回 kaki1-4 の移行が済んでいる）。
  // 以前は1つの鍵に「まだ無ければ書く」形だったので、**前回の退避が残っているせいで
  // 今回ぶんが退避されなかった**。一度きりで取り消せない移行なのに戻す手段が無い状態。
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + "index.html", { waitUntil: "load" });
  await p2.evaluate(() => {
    localStorage.clear();
    // 前回の移行を済ませた端末を再現する
    localStorage.setItem("kq_battle_stats_backup_kaki_v1", JSON.stringify({ at: 1, stats: { "t1": { correct: 5, wrong: 0 } } }));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "lastcorrect-backfill": 1 }));
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify({ "t5-1": { correct: 3, wrong: 1 } }));
  });
  await p2.reload({ waitUntil: "load" });
  await p2.waitForTimeout(700);
  const r = await p2.evaluate(id => ({
    old: JSON.parse(localStorage.getItem("kq_battle_stats_backup_kaki_v1") || "null"),
    now: JSON.parse(localStorage.getItem("kq_battle_stats_backup_kaki_v1_" + id) || "null"),
  }), MIG_ID);
  check("★前回の退避が消えていない", !!(r.old && r.old.stats && r.old.stats["t1"]), true);
  check("★今回ぶんの退避が新しく作られている", !!(r.now && r.now.stats && r.now.stats["t5-1"]), true);
  await ctx2.close();
}

console.log("\n【5b】★移行を2つとも済ませていない端末で、両方が正しく走るか");
{
  // しばらくアプリを開いていなかった端末（別のブラウザなど）はこの状態になる。
  // ★片付け（data.js に無い記録の削除）を各移行の中でやっていると、
  //   先に走る kaki1-4 の片付けが、次に走る kaki5-8 の引きつぎ元を消してしまう。
  //   だから片付けは全部の移行が終わってから1回だけ、にしてある
  const first = MIGS[0], last = MIGS[MIGS.length - 1];
  const src1 = Object.keys(first.stats)[0], dst1 = first.stats[Object.keys(first.stats)[0]][0];
  const src2 = Object.keys(last.stats)[0], dst2 = last.stats[Object.keys(last.stats)[0]][0];
  const ctx4 = await browser.newContext();
  const p4 = await ctx4.newPage();
  await p4.goto(BASE + "index.html", { waitUntil: "load" });
  await p4.evaluate(([a, b]) => {
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify({
      [a]: { correct: 4, wrong: 0 },   // 旧1〜4 の記録
      [b]: { correct: 7, wrong: 0 },   // 旧5〜8 の記録
    }));
    // どちらの移行も済ませていない状態
    localStorage.setItem("kq_battle_migrations_v1", "{}");
  }, [src1, src2]);
  await p4.reload({ waitUntil: "load" });
  await p4.waitForTimeout(900);
  const r = await p4.evaluate(([d1, d2]) => {
    const s = JSON.parse(localStorage.getItem("kq_battle_stats_v1"));
    return { done: JSON.parse(localStorage.getItem("kq_battle_migrations_v1")),
             one: s[d1] && s[d1].correct, two: s[d2] && s[d2].correct,
             backups: Object.keys(localStorage).filter(k => k.startsWith("kq_battle_stats_backup_kaki_v1")) };
  }, [dst1, dst2]);
  check("両方の移行が実行ずみになる", [!!r.done[first.id], !!r.done[last.id]], [true, true]);
  check("★古いほうの記録が引きつがれた", r.one, 4);
  check("★★新しいほうの記録も引きつがれた（先の片付けで消えていない）", r.two, 7);
  check("退避が移行ごとに2つ作られる", r.backups.length, 2);
  await ctx4.close();
}

console.log("\n【6】移行が一度きりであること");
{
  check("実行ずみの印が付いている", !!after.done[MIG_ID], true);
  const before = JSON.stringify(after.stats);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(600);
  const again = await page.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
  check("★もう一度開いても二重に加算されない", again, before);
}

await browser.close();
server.close();
console.log("\n===== 合計: " + pass + " 件成功 / " + fail + " 件失敗 =====");
console.log("移行ID: " + MIG_ID + " / 引きつぎ表: " + Object.keys(TABLE).length + "件");
process.exit(fail ? 1 : 0);
