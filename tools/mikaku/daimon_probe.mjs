// ★理科の「大問」（テスト形式・2026-09-27）を、実機（本物のChrome・390px）で見る。
// 依頼書: 司令塔\回答\対戦_大問を丸ごと出す_依頼_2026-09-27.md
//
// 見ること
//   ① 小問が単独で出ない: 一覧で選べるのは大問だけ。どの大問も (1) から始まり、全部の小問を順に通る（失敗1）
//   ② 「こたえを見る」を押す前に、次の小問は画面に無い（司令塔の条件）
//   ③ どの小問を解いているときも、リード文・図に届く（上に残っている＋「リード文・図を見る」で開ける・失敗2）
//   ④ 〇✕が小問ごとに記録される（大問の入れ物に。★一問一答の記録は1文字も変わらない・失敗3）
//   ⑤ 答え側の図（aFile）は「こたえを見る」の前には画面に無く、押したあとに出る
//   ⑥ ホームの数字（全問題数・3段）と出題される問題数が、社会・理科とも直す前と同じ（失敗4・6）
//   ⑦ 「記録をぜんぶクリア」で大問の記録も消える（どこからも消せない記録を残さない）
//   ⑧ 横のはみ出し 0 ／ 画面のエラー 0
//
// 入口の自己テスト（★鳴るのが正しい）… 偽の実装は出荷される index.html から組み立てる（4-6d）
//   (a) 小問を最初から全部出す ／ (b) 答えの図を問題と一緒に出す ／ (c) 2問目からリード文を消す ／
//   (d) 記録を一問一答の入れ物に書く ／ (e) 対照 = 直す前のコミット（★HEAD にしない。コミットした時点で対照が変わるため）
// 使い方: node tools/mikaku/daimon_probe.mjs            （全部）
//         node tools/mikaku/daimon_probe.mjs --only a  （1回だけ。a b c d e ＝ 自己テスト、now ＝ 本物）
//   ★メモリの少ない日は --only で1回ずつ手前で回す（2026-09-27、まとめて回すと2回とも途中で止められた）
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url"; import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_daimon");
fs.mkdirSync(SHOTS, { recursive: true });
const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(gRoot, "playwright", "index.mjs")).href);

const BASE_COMMIT = "79533e7";
const lf = s => s.replace(/\r\n/g, "\n");
const CURRENT = lf(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"));
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
const cut = (src, needle, rep, what) => {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error("偽の実装を作れません（" + what + " が " + n + " 件）");
  return src.replace(needle, rep);
};
const fakeAllAtOnce = s => cut(s, "  showScreen(\"screen-daimon\");\n  showDaimonItem();\n",
  "  showScreen(\"screen-daimon\");\n  showDaimonItem();\n  /* ★偽の実装 */ for(let k=1;k<g.items.length;k++){ daimonCur.pos=k; showDaimonItem(); } daimonCur.pos=0;\n", "startDaimon の最後");
const fakeAnsFigEarly = s => cut(s, "  if(it.file) card.appendChild(daimonImg(it.file));\n",
  "  if(it.file) card.appendChild(daimonImg(it.file));\n  if(it.aFile) card.appendChild(daimonImg(it.aFile));  /* ★偽の実装 */\n", "小問の図");
const fakeDropLead = s => cut(s, "  c.revealed = false;\n  c.pos++;\n",
  "  c.revealed = false;\n  c.pos++;\n  els[\"daimon-lead-card\"].innerHTML = \"\"; els[\"daimon-lead-btn\"].style.display = \"none\";  /* ★偽の実装 */\n", "judge の pos++");
const fakeWrongStore = s => cut(s, "  recordDaimonResult(it.id, correct);\n",
  "  recordResult(it.id, correct);  /* ★偽の実装 */\n", "記録の行");

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
const URL0 = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });

// ★ホームの数字を、社会・理科の両方で読む（同じ記録を仕込んで、直す前と比べる）
const SEED = () => {
  const st = {}; let k = 0;
  QA_DATA.forEach(q => { k++; if (k % 3 === 0) st[q.id] = { correct: 1, wrong: 1, box: 0, lastCorrectAt: Date.now() - 5e8, lastAnswered: Date.now() - 1e8 };
                          else if (k % 3 === 1) st[q.id] = { correct: 3, wrong: 0, box: 3, lastCorrectAt: Date.now() - 9e8, lastAnswered: Date.now() - 9e8 }; });
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
};
async function homeNumbers(src) {
  SERVED = src;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await p.goto(URL0); await p.waitForTimeout(300); await p.evaluate(SEED); await p.reload(); await p.waitForTimeout(800);
  const out = {};
  for (const [subj, sel] of [["社会", "#subject-social"], ["理科", "#subject-science"]]) {
    await p.click(sel); await p.waitForTimeout(300);
    out[subj] = await p.evaluate(() => ["stat-total", "stat-stage1", "stat-stage2", "stat-stage3", "pool-count-label"]
      .map(id => document.getElementById(id).textContent.replace(/（最近まちがえた\d+問こみ）/, "")).join(" | "));
  }
  await ctx.close(); return out;
}
const HOME_BEFORE = await homeNumbers(BASELINE);

async function run(tag, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  p.on("dialog", d => d.accept());
  try {
    // ⑥ ホームの数字
    const home = await homeNumbers(src);
    SERVED = src;
    check("⑥ ホームの数字と問題数が直す前と同じ（社会）", home["社会"] === HOME_BEFORE["社会"], home["社会"] + " ／ 前 " + HOME_BEFORE["社会"]);
    check("⑥ ホームの数字と問題数が直す前と同じ（理科）", home["理科"] === HOME_BEFORE["理科"], home["理科"] + " ／ 前 " + HOME_BEFORE["理科"]);

    await p.goto(URL0); await p.waitForTimeout(300); await p.evaluate(SEED); await p.reload(); await p.waitForTimeout(800);
    const qaBefore = await p.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
    await p.click("#subject-social"); await p.waitForTimeout(200);
    const btnSocial = await p.evaluate(() => { const b = document.getElementById("daimon-open-btn"); return !!(b && b.offsetParent); });
    await p.click("#subject-science"); await p.waitForTimeout(200);
    const btnSci = await p.evaluate(() => { const b = document.getElementById("daimon-open-btn"); return !!(b && b.offsetParent); });
    check("入口: 理科のときだけ「テスト形式（大問）」が出る", btnSci && !btnSocial, "理科 " + btnSci + " / 社会 " + btnSocial);
    if (!btnSci) throw new Error("入口がありません");
    await p.screenshot({ path: path.join(SHOTS, tag + "_home.png"), fullPage: true });
    await p.click("#daimon-open-btn"); await p.waitForTimeout(300);
    const D = await p.evaluate(() => DAIMON_DATA.map(g => ({ key: g.key, n: g.items.length, ids: g.items.map(i => i.id), lead: !!(g.lead || g.file), aFile: g.items.map(i => i.aFile || "") })));
    const rows = await p.$$eval(".daimon-row", rs => rs.map(r => r.dataset.key));
    check("① 一覧に並ぶのは大問だけ（行の数＝大問の数）", rows.length === D.length && rows.every((k, i) => k === D[i].key), rows.length + " / " + D.length);
    await p.screenshot({ path: path.join(SHOTS, tag + "_list.png"), fullPage: true });

    // ★全部の大問を最後まで解く。小問ごとに ②③⑤ を見る。〇✕は交互
    let orderOk = true, hiddenNext = true, leadOk = true, overlayOk = true, ansFigOk = true, ansFigSeen = 0, recOk = true, overflow = 0;
    const bad = [];
    for (let gi = 0; gi < D.length; gi++) {
      const g = D[gi];
      await p.click(`.daimon-row[data-key="${g.key}"]`); await p.waitForTimeout(150);
      for (let k = 0; k < g.n; k++) {
        const st = await p.evaluate(() => ({
          cards: [...document.querySelectorAll("#daimon-items .daimon-item")].map(c => c.dataset.id),
          leadShown: (() => { const l = document.getElementById("daimon-lead-card"); return l.style.display !== "none" && l.textContent.length + l.querySelectorAll("img").length > 0; })(),
          // ★このボタンは position:fixed なので offsetParent はいつも null。見えているかは計算後の display で見る
          btn: (() => { const b = document.getElementById("daimon-lead-btn"); return !!(b && getComputedStyle(b).display !== "none"); })(),
          imgs: [...document.querySelectorAll("#screen-daimon img")].map(i => i.getAttribute("src"))
        }));
        if (st.cards.length !== k + 1 || st.cards[k] !== g.ids[k]) { orderOk = false; bad.push(g.key + " 小問" + (k + 1) + " cards=" + st.cards.join(",")); }
        if (st.cards.some((id, j) => j > k)) hiddenNext = false;
        if (g.lead && (!st.leadShown || !st.btn)) { leadOk = false; bad.push(g.key + " 小問" + (k + 1) + " リード文なし"); }
        if (g.aFile[k] && st.imgs.some(s => s.endsWith(g.aFile[k]))) { ansFigOk = false; bad.push(g.key + " 答えの図が先に出ている"); }
        if (g.lead && k === g.n - 1) {
          // ★ボタンが消えていたら押せない（押そうとして30秒待たない）。消えていること自体が失敗
          if (!st.btn) { overlayOk = false; } else {
          await p.click("#daimon-lead-btn"); await p.waitForTimeout(100);
          const ov = await p.evaluate(() => { const o = document.getElementById("daimon-lead-overlay"); return o.style.display !== "none" && document.getElementById("daimon-lead-overlay-body").textContent.length + document.querySelectorAll("#daimon-lead-overlay-body img").length > 0; });
          if (!ov) overlayOk = false;
          await p.click("#daimon-lead-close"); await p.waitForTimeout(80);
          }
        }
        await p.click("#daimon-reveal-btn"); await p.waitForTimeout(60);
        if (g.aFile[k]) {
          const seen = await p.evaluate(f => [...document.querySelectorAll("#daimon-items img")].some(i => i.getAttribute("src").endsWith(f)), g.aFile[k]);
          if (seen) ansFigSeen++; else { ansFigOk = false; bad.push(g.key + " 答えの図が出ない"); }
          await p.screenshot({ path: path.join(SHOTS, tag + "_aFile.png"), fullPage: true });
        }
        const next = await p.evaluate(() => document.querySelectorAll("#daimon-items .daimon-item").length);
        if (next !== k + 1) hiddenNext = false;
        overflow = Math.max(overflow, await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
        await p.click(k % 2 === 0 ? "#daimon-judge-ok" : "#daimon-judge-ng"); await p.waitForTimeout(60);
      }
      if (gi === 0 || g.key.includes("基本問題_1")) await p.screenshot({ path: path.join(SHOTS, tag + "_" + gi + "_done.png"), fullPage: true });
      await p.click("#daimon-finish-btn"); await p.waitForTimeout(100);
    }
    const ds = await p.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_daimon_stats_v1") || "{}"));
    for (const g of D) g.ids.forEach((id, k) => {
      const s = ds[id]; const want = k % 2 === 0;
      if (!s || (want ? s.correct !== 1 || s.wrong !== 0 : s.correct !== 0 || s.wrong !== 1)) { recOk = false; }
    });
    const nIds = D.reduce((a, g) => a + g.n, 0);
    check("① どの大問も (1) から順に、全部の小問を通る", orderOk, bad.slice(0, 3).join(" ／ "));
    check("② 「こたえを見る」の前に、次の小問は画面に無い", hiddenNext);
    check("③ どの小問を解いているときも、リード文・図が上に残り、ボタンもある", leadOk, bad.filter(b => b.includes("リード")).slice(0, 2).join(" ／ "));
    check("③ 「リード文・図を見る」で開ける", overlayOk);
    check("⑤ 答えの図は「こたえを見る」の前には無く、押すと出る", ansFigOk && ansFigSeen > 0, "出た " + ansFigSeen + "枚");
    check("④ 〇✕が小問ごとに、大問の入れ物に記録される（" + nIds + "問）", recOk && Object.keys(ds).length === nIds, Object.keys(ds).length);
    const qaAfter = await p.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
    check("④ ★一問一答の記録は1文字も変わらない", qaAfter === qaBefore);
    check("⑧ 横のはみ出し 0", overflow <= 0, overflow);
    // ⑦ ぜんぶクリア
    await p.click("#daimon-list-back"); await p.waitForTimeout(200);
    await p.evaluate(() => document.getElementById("stat-clear-link").click()); await p.waitForTimeout(200);
    const after = await p.evaluate(() => localStorage.getItem("kq_battle_daimon_stats_v1"));
    check("⑦ 「記録をぜんぶクリア」で大問の記録も消える", after === "{}" || after === null, after && after.slice(0, 40));
  } catch (e) { check("例外なく走りきる", false, e.message.split("\n")[0]); }
  check("⑧ 画面のエラー 0", errs.length === 0, errs.slice(0, 2).join(" / "));
  await ctx.close();
  return out;
}
function report(title, out) {
  console.log("\n── " + title + " ──");
  let ng = 0;
  for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.name + (c.extra ? " … " + c.extra : "")); if (!c.ok) ng++; }
  return ng;
}
const done = async code => { await browser.close(); server.close(); process.exit(code); };

console.log("■ 直す前（" + BASE_COMMIT + "）のホーム: 社会 " + HOME_BEFORE["社会"] + " ／ 理科 " + HOME_BEFORE["理科"]);
console.log("\n■ 入口の自己テスト（この検査そのものが効いているか）");
const selfTests = [
  ["(a) 偽の実装: 小問を最初から全部出す", () => fakeAllAtOnce(CURRENT)],
  ["(b) 偽の実装: 答えの図を問題と一緒に出す", () => fakeAnsFigEarly(CURRENT)],
  ["(c) 偽の実装: 2問目からリード文を消す", () => fakeDropLead(CURRENT)],
  ["(d) 偽の実装: 記録を一問一答の入れ物に書く", () => fakeWrongStore(CURRENT)],
  ["(e) 対照 " + BASE_COMMIT + "（直す前）", () => BASELINE]
];
const ONLY = (() => { const k = process.argv.indexOf("--only"); return k >= 0 ? process.argv[k + 1] : null; })();
const LETTERS = ["a", "b", "c", "d", "e"];
if (ONLY && !LETTERS.includes(ONLY) && ONLY !== "now") { console.log("--only は a b c d e now のどれか"); await done(2); }
let selfNg = 0;
for (let i = 0; i < selfTests.length; i++) {
  if (ONLY && ONLY !== LETTERS[i]) continue;
  const [title, make] = selfTests[i];
  let src; try { src = make(); } catch (e) { console.log("\n── " + title + " ──\n  ✘ " + e.message); selfNg++; continue; }
  const ng = report(title + " … ★鳴るのが正しい", await run("self" + i, src));
  console.log(ng > 0 ? "  → ✔ 自己テスト合格（" + ng + " 件で鳴った）" : "  → ✘ 自己テスト不合格（鳴るべきなのに鳴らない）");
  if (ng === 0) selfNg++;
}
if (selfNg > 0) { console.log("\n★入口の自己テストが " + selfNg + " 件通らないので、本番の結果は出しません。"); await done(3); }
if (ONLY && ONLY !== "now") { console.log("\n（--only " + ONLY + " なので、本物はまだ回していません）"); await done(0); }
if (ONLY === "now") console.log("\n★--only now: 自己テストは別に回した前提です。a〜e の結果を控えてから当てること");
console.log("\n■ いまの index.html … ★鳴らないのが正しい");
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng === 0 ? 0 : 1);
