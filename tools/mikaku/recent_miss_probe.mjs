// ★ランダム順でも「最近まちがえた問題」が必ず入るか（2026-09-27）を、実機（本物のChrome・390px）で見る。
// 依頼書: 司令塔\回答\対戦_ランダムでも前日まちがえたものを出す_依頼_2026-09-27.md
//
// 見ること（依頼書の失敗条件の番号）
//   A ふだん（段は3つとも）＋ランダム … 昨日まちがえた5問が、10回とも全部入る（失敗1）。並びは毎回同じではない
//   B まちがえた問題が問題数より多い日 … 半分（5問）は必ず入り、★まちがえた問題だけにはならない（失敗3）
//   C 段を絞る（まだ／苦手）＋ランダム … 昨日まちがえた問題が入り、並びが混ざる（失敗1・2）
//   D 段を絞る＋出題順どおり … ★3段の並び（正解日が古い順）がそのまま（失敗4）
//   どれも、ホームの予告の数＝実際に出た数（失敗5）／画面のエラー0
//   ★10日前にまちがえた問題は「最近」に入らない（入れすぎない）
//
// 入口の自己テスト（★鳴るのが正しい）
//   (a) まちがえた問題を入れない偽の実装 ／ (b) 段で絞るとランダムが消える偽の実装 ／
//   (c) 出題順どおりでも混ぜてしまう偽の実装（3段が壊れる）／ (e) 半分で止めない偽の実装 ／
//   (d) 対照 = 52c3dbd（直す前）
//   ★偽の実装は出荷される index.html から組み立てる（写しを持たない・4-6d）
//
//   E 段を絞る（1段目を含む）＋ランダム＋★ … ★はいままでどおり頭に来る（2026-09-22 の決まり）
// 使い方: node tools/mikaku/recent_miss_probe.mjs
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url"; import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_recent_miss");
fs.mkdirSync(SHOTS, { recursive: true });
const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(gRoot, "playwright", "index.mjs")).href);

const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
// ★対照は「直す前」のコミットに固定する。HEAD にすると、この変更をコミットした時点で対照が直したあとの版になり、鳴らなくなる（実際に踏んだ）
const BASE_COMMIT = "52c3dbd";
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });

const cut = (src, needle, replacement, what) => {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error("偽の実装を作れません（" + what + " が " + n + " 件。1件でないと壊し損ねます）");
  return src.replace(needle, replacement);
};
const MISS = "const miss = ordered.filter(i => !used.has(i) && isRecentMiss(i)).slice(0, cap);";
const fakeNoMiss = s => cut(s, MISS, "const miss = [];  /* ★偽の実装 */", "まちがえた問題を選ぶ行");
const fakeNarrowNoRandom = s => cut(s, "  if(random){\n", "  if(random && !narrowing){  /* ★偽の実装 */\n", "if(random)");
const fakeAlwaysRandom = s => cut(s, "const random = currentShuffle;", "const random = true;  /* ★偽の実装 */", "random の決め方");
const fakeNoCap = s => cut(s, "const cap = Math.ceil(questionCount / 2);", "const cap = questionCount;  /* ★偽の実装 */", "cap");
// ★index.html は CRLF のことがある。偽の実装の needle は LF で書いてあるので、そろえてから作る
const lf = s => s.replace(/\r\n/g, "\n");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
let SERVED = CURRENT;
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(SERVED, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });

// ★単元は名指ししない。「社会で、問題がいちばん多い単元」を条件で選ぶ（4-6b）
async function pickUnit() {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(PAGE_URL); await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const by = {};
    QA_DATA.forEach(q => { if (q.subj === "社会" && q.kind !== "calc") (by[q.u] = by[q.u] || []).push(q.id); });
    const u = Object.keys(by).sort((a, b) => by[b].length - by[a].length)[0];
    return { u: u, ids: by[u], all: QA_DATA.filter(q => q.subj === "社会" && q.kind !== "calc").map(q => q.id), units: Object.keys(by) };
  });
  await ctx.close(); return r;
}
const U = await pickUnit();
if (U.ids.length < 45) throw new Error("単元の問題が少なすぎます（" + U.ids.length + "問）");

// 仕込み: 社会は全部「定着」。単元の中だけ、場面ごとに作る
//   recent … 昨日まちがえた（一度は正解・box 0）  old … 10日前にまちがえた（同じ形）  fresh … 記録なし（1段目）
async function open(sc) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(PAGE_URL); await page.waitForTimeout(300);
  await page.evaluate(a => {
    const st = {}, now = Date.now(), day = 86400000;
    const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(12, 0, 0, 0);
    a.all.forEach((id, i) => { st[id] = { correct: 3, wrong: 0, box: 3, lastCorrectAt: now - (30 + i % 7) * day, lastAnswered: now - 20 * day }; });
    a.recent.forEach((id, i) => { st[id] = { correct: 1, wrong: 1, box: 0, lastCorrectAt: now - (5 + i) * day, lastAnswered: y.getTime() }; });
    a.old.forEach((id, i) => { st[id] = { correct: 1, wrong: 1, box: 0, lastCorrectAt: now - (15 + i) * day, lastAnswered: now - 10 * day }; });
    a.fresh.forEach(id => { delete st[id]; });
    localStorage.clear();
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
      subject: "社会", unitsBySubject: { "社会": [a.u] }, units: [a.u],
      count: a.count, shuffle: a.shuffle, tiers: a.tiers,
      reviewAllUnits: 1, reviewSelectedUnits: [], reviewUnitsKnown: a.units,
      reviewPriority: "all", reviewLevel: "all", reviewType: "all", type: "all", priority: "all", level: "all"
    }));
    if (a.stars) localStorage.setItem("kq_battle_priority_v1", JSON.stringify(a.stars));
  }, Object.assign({ all: U.all, u: U.u, units: U.units }, sc));
  await page.reload(); await page.waitForTimeout(800);
  return { ctx, page, errs };
}
async function playAll(page) {
  await page.click("#solo-start-btn"); await page.waitForTimeout(500);
  const ids = [];
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => document.getElementById("screen-solo-result").classList.contains("active"))) break;
    ids.push((await page.$eval("#solo-q-id", e => e.textContent)).replace(/^\s*No\.?/, "").trim());
    await page.click("#solo-reveal-btn"); await page.waitForTimeout(40);
    await page.click("#solo-judge-ok"); await page.waitForTimeout(90);
  }
  return ids;
}
const previewN = s => { const m = /^(\d+)問/.exec(s.trim()); return m ? parseInt(m[1], 10) : null; };

async function run(tag, src, RUNS) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
  const ids = U.ids;
  // 場面を回して、出た並びを RUNS 回ぶん集める
  const collect = async (sc, n, shotName) => {
    const seqs = []; let lab = ""; let errs = 0; let previewOk = true;
    for (let r = 0; r < n; r++) {
      const t = await open(sc);
      lab = await t.page.$eval("#pool-count-label", e => e.textContent);
      if (r === 0 && shotName) await t.page.screenshot({ path: path.join(SHOTS, tag + "_" + shotName + ".png"), fullPage: true }).catch(() => {});
      const seq = await playAll(t.page);
      if (previewN(lab) !== seq.length) previewOk = false;
      errs += t.errs.length; seqs.push(seq); await t.ctx.close();
    }
    return { seqs, lab, errs, previewOk };
  };
  try {
    // ---- A ふだん＋ランダム。昨日まちがえた5問（単元の後ろのほう）＋10日前の3問 ----
    {
      const recent = ids.slice(-5), old = ids.slice(-8, -5);
      const r = await collect({ recent, old, fresh: [], count: 10, shuffle: true, tiers: [0, 1, 2] }, RUNS, "A");
      const every = r.seqs.every(s => recent.every(id => s.includes(id)));
      check("A ★昨日まちがえた5問が、" + RUNS + "回とも全部入る（失敗1）", every, r.seqs.map(s => s.filter(id => recent.includes(id)).length).join(","));
      check("A 1回10問", r.seqs.every(s => s.length === 10), r.seqs.map(s => s.length).join(","));
      check("A 並びが毎回同じではない（ランダムが効いている）", new Set(r.seqs.map(s => s.join())).size > 1);
      check("A まちがえた問題が先頭に固まらない（混ざっている）", r.seqs.some(s => !recent.includes(s[0]) || !recent.includes(s[4])));
      check("A ★10日前にまちがえた問題は、毎回は入らない（「最近」に入れすぎない）", !r.seqs.every(s => old.every(id => s.includes(id))));
      check("A ホームに「最近まちがえた5問こみ」と出る", /最近まちがえた5問こみ/.test(r.lab), r.lab);
      check("A 予告の数＝実際に出た数（失敗5）", r.previewOk, r.lab);
      check("A 画面のエラー 0", r.errs === 0, r.errs);
    }
    // ---- B まちがえた問題が問題数より多い日（14問・問題数10）----
    {
      const recent = ids.slice(-14);
      const r = await collect({ recent, old: [], fresh: [], count: 10, shuffle: true, tiers: [0, 1, 2] }, RUNS);
      const n = r.seqs.map(s => s.filter(id => recent.includes(id)).length);
      check("B 最近まちがえた問題が毎回5問以上入る", n.every(x => x >= 5), n.join(","));
      check("B ★毎回、まちがえた問題だけにはならない（効きすぎない・失敗3）", n.every(x => x < 10), n.join(","));
      check("B 予告の数＝実際に出た数", r.previewOk, r.lab);
    }
    // ---- C 段を絞る（まだ正解していない＋苦手）＋ランダム。記録のない問20問が1段目で先に来る日 ----
    {
      const recent = ids.slice(-5), fresh = ids.slice(0, 20);
      const r = await collect({ recent, old: [], fresh, count: 10, shuffle: true, tiers: [0, 1] }, RUNS, "C");
      check("C ★段を絞っても、昨日まちがえた5問が毎回入る（失敗1・2）", r.seqs.every(s => recent.every(id => s.includes(id))),
            r.seqs.map(s => s.filter(id => recent.includes(id)).length).join(","));
      check("C ★段を絞っても並びが混ざる（ランダムが選べる・失敗2）", new Set(r.seqs.map(s => s.join())).size > 1);
      check("C 出るのは選んだ段の問題だけ", r.seqs.every(s => s.every(id => recent.includes(id) || fresh.includes(id))));
      check("C 予告の数＝実際に出た数", r.previewOk, r.lab);
      check("C 画面のエラー 0", r.errs === 0, r.errs);
    }
    // ---- D 段を絞る＋出題順どおり … 3段の並び（1段目は data.js の順、次に2段目を正解日が古い順）----
    {
      const recent = ids.slice(-5), fresh = ids.slice(0, 6);
      // ★期待値はアプリと別に作る: 1段目 = fresh（data.js の順）、2段目 = recent を正解日が古い順
      //   仕込みで recent[i] の正解日は now-(5+i)日 → 古い順は i の大きい順
      const expect = fresh.concat(recent.slice().reverse()).slice(0, 10);
      const r = await collect({ recent, old: [], fresh, count: 10, shuffle: false, tiers: [0, 1] }, 2, "D");
      check("D ★出題順どおりなら3段の並びのまま（失敗4）", r.seqs.every(s => s.join() === expect.join()),
            "期待 " + expect.join(" ") + " ／ 実際 " + r.seqs[0].join(" "));
      check("D 出題順どおりでは「最近まちがえた」を出さない", !/最近まちがえた/.test(r.lab), r.lab);
      check("D 予告の数＝実際に出た数", r.previewOk, r.lab);
    }
    // ---- E 段を絞る（1段目を含む）＋ランダム＋★ … ★はいままでどおり頭（2026-09-22 の決まり）----
    {
      const recent = ids.slice(-5), fresh = ids.slice(0, 20), stars = [ids[12], ids[15]];
      const r = await collect({ recent, old: [], fresh, stars, count: 10, shuffle: true, tiers: [0, 1] }, Math.min(RUNS, 5));
      check("E ★1段目を選んでいれば、ランダムでも★2問が頭に来る", r.seqs.every(s => stars.every(id => s.slice(0, 2).includes(id))),
            r.seqs.map(s => s.slice(0, 2).join("+")).join(" , "));
      check("E ★があっても、昨日まちがえた5問は入る", r.seqs.every(s => recent.every(id => s.includes(id))));
    }
  } catch (e) { check("例外なく走りきる", false, e.message); }
  return out;
}
function report(title, out) {
  console.log("\n── " + title + " ──");
  let ng = 0;
  for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.name + (c.extra ? " … " + c.extra : "")); if (!c.ok) ng++; }
  return ng;
}
const done = async code => { await browser.close(); server.close(); process.exit(code); };

console.log("■ 使う単元（名指しせず、社会でいちばん多い単元）: " + U.u + "（" + U.ids.length + "問）");
console.log("\n■ 入口の自己テスト（この検査そのものが効いているか）");
const C = lf(CURRENT);
const selfTests = [
  ["(a) 偽の実装: まちがえた問題を入れない", () => fakeNoMiss(C)],
  ["(b) 偽の実装: 段で絞るとランダムが消える", () => fakeNarrowNoRandom(C)],
  ["(c) 偽の実装: 出題順どおりでも混ぜる（3段が壊れる）", () => fakeAlwaysRandom(C)],
  ["(e) 偽の実装: 半分で止めない（効きすぎ）", () => fakeNoCap(C)],
  ["(d) 対照 " + BASE_COMMIT + "（直す前）", () => BASELINE]
];
let selfNg = 0;
for (let i = 0; i < selfTests.length; i++) {
  const [title, make] = selfTests[i];
  let src; try { src = make(); } catch (e) { console.log("\n── " + title + " ──\n  ✘ " + e.message); selfNg++; continue; }
  const ng = report(title + " … ★鳴るのが正しい", await run("self" + i, src, 3));
  console.log(ng > 0 ? "  → ✔ 自己テスト合格（" + ng + " 件で鳴った）" : "  → ✘ 自己テスト不合格（鳴るべきなのに鳴らない）");
  if (ng === 0) selfNg++;
}
if (selfNg > 0) { console.log("\n★入口の自己テストが " + selfNg + " 件通らないので、本番の結果は出しません。"); await done(3); }

console.log("\n■ いまの index.html … ★鳴らないのが正しい（各場面10回）");
const ng = report("いまの index.html", await run("now", CURRENT, 10));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng === 0 ? 0 : 1);
