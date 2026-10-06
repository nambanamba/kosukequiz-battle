// 理科「5年上 第13回.ふり子」（r5u13p01〜12）の取り込みを画面で見る（2026-10-06）。本物の Chrome・390x844。
// rika6point_probe.mjs と同じ形。
// 使い方: node tools/mikaku/rika5u13_furiko_probe.mjs   スクショは tools/mikaku/shots_r5u13/（コミットしない）
// 見ること:
//   P1 理科の単元えらびに「5年上 第13回.ふり子」が出る。5年下の回（第1回〜第6回…）のあとに、別の単元として並ぶ
//      ・5年上のカードは12枚とも単元「5年上 第13回.ふり子」・id r5u13p。5年下の単元（「第N回.」で始まる）に5年上のカードが混ざらない
//      ・大問（DAIMON）が「5年上 第13回.ふり子」に付かない（大問の単元さがしは「第N回.」で始まる単元だけを見る）
//   P2 問数 12（チップの表示もデータも）
//   P3 その単元だけを選んで「一人で始める」→ 一問一答が始まり、r5u13p が12枚すべて1回ずつ出る（分けて＝ ~ の付いた部分は出ない）
//   P4 記録（kq_battle_stats_v1）に r5u13p の id で入る。前からある記録（r6m01）は1字も変わらない
//   P5 画面のエラー 0
//   F1 元データの file と data.js の img が12枚とも一致し、その画像が images/ にある
//   F2 図の中に答えの字がない … 図に印刷されている字を目で読んで下の PRINTED に書き写し、答えがどれにも入っていないかを見る
//      数だけの答え（2・3）は、字の切れはし（25 の 2 など）ではなく「2」「2倍」と同じ語があるかで見る
//      （★新しい図を足したら PRINTED にも足すこと。書いていない図は ✘ にする＝黙って通さない）
//   F3 図のある問では、一人の一問一答の画面に図が実際に出る（読み込めて幅がある・src が img と同じ）
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_r5u13"); fs.mkdirSync(SHOTS, { recursive: true });
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
function findSrc() {   // worktree からでも元データを見つけられるよう、上へたどる
  let d = ROOT;
  while (true) {
    const c = path.join(path.dirname(d), "5年下", "quiz_csv_理科");
    if (fs.existsSync(c)) return c;
    const up = path.dirname(d); if (up === d) return c; d = up;
  }
}
const SRC_JSON = path.join(findSrc(), "5年上_第13回_ふり子.json");
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": rel.endsWith(".html") ? "text/html; charset=utf-8" : rel.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL0 = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage(); const errs = [];
page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
const shot = n => page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: true });
const tap = sel => page.$eval(sel, e => e.click());
const UNIT = "5年上 第13回.ふり子";
const WANT_N = 12;
// 図に印刷されている字（2026-10-06 に画像を開いて目で読んだもの。丸数字は省く）
const PRINTED = {
  "r5u13_01.jpg": ["A", "B", "C", "ふり子の動き"],
  "r5u13_02.jpg": ["A", "B", "C", "おもりの", "重心", "・"],
  "r5u13_03.jpg": ["B", "大きくふれているときの周期", "=", "小さくふれているときの周期"],
  "r5u13_04.jpg": ["A", "おもりの周期", "="],
  "r5u13_05.jpg": ["ふり子の周期", ">"],
  "r5u13_06.jpg": ["16倍", "9倍", "4倍", "ふり子の長さ（cm）", "周期（秒）", "25", "50", "75", "100", "125", "150", "175", "200", "225", "300", "400",
                   "ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ", "サ"],
  "r5u13_07.jpg": ["遠くへ飛ぶ。", "近くへ飛ぶ。"],
  "r5u13_08.jpg": ["遠くへ飛ぶ。", "近くへ飛ぶ。"],
};
const exposes = (word, ans) => /^\d+$/.test(ans) ? (word === ans || word === ans + "倍") : word.includes(ans);
const OLD = { correct: 2, wrong: 1, box: 1, lastCorrectAt: 1759000000000, lastAnswered: 1759000000000 };
try {
  {
    const src = JSON.parse(fs.readFileSync(SRC_JSON, "utf8"));
    await page.goto(URL0); await page.waitForTimeout(600);
    const qa = new Map(await page.evaluate(() => QA_DATA.filter(q => /^r5u13p/.test(q.id)).map(q => [q.id, q])));
    const f1 = src.filter(r => !qa.has(r.id) || (r.file || "") !== (qa.get(r.id).img || "") || (r.file && !fs.existsSync(path.join(ROOT, "images", r.file))));
    check("F1 元データの file と data.js の img が12枚とも一致・画像が images/ にある（図あり " + src.filter(r => r.file).length + "枚）", src.length === WANT_N && qa.size === WANT_N && f1.length === 0, f1.map(r => r.id).join(" "));
    const f2 = []; const unread = new Set();
    for (const r of src) { if (!r.file) continue; const pr = PRINTED[r.file]; if (!pr) { unread.add(r.file); continue; }
      const hit = pr.filter(w => exposes(w, r.a)); if (hit.length) f2.push(r.id + "(" + r.a + "→" + hit.join("/") + ")"); }
    check("F2 図の中に答えの字がない（図に印刷された字をすべて書き写して照合・未読の図 " + unread.size + "）", f2.length === 0 && unread.size === 0, f2.concat([...unread].map(f => "未読 " + f)).join(" "));
    // F2 の自己テスト: 答えが図にある偽の組み合わせなら鳴る
    const selfHit = exposes("16倍", "16") && exposes("ふり子の周期", "周期") && !exposes("25", "2");
    check("F2 自己テスト（16→16倍は鳴る・周期→ふり子の周期は鳴る・2→25は鳴らない）", selfHit, "");
  }
  await page.evaluate(old => {
    localStorage.clear();
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
    localStorage.setItem("kq_battle_daimon_merged_v1", "1");
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify({ r6m01: old }));
  }, OLD);
  await page.reload(); await page.waitForTimeout(900);
  await tap("#subject-science"); await page.waitForTimeout(300);
  const chips = await page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice")].filter(e => e.dataset.unit !== "ALL")
    .map(e => ({ u: e.dataset.unit, t: e.textContent.replace(/\s+/g, " ").trim() })));
  const names = chips.map(c => c.u);
  const at = names.indexOf(UNIT);
  const lastShita = Math.max(...names.map((n, i) => /^第\d+回\./.test(n) ? i : -1));
  check("P1 理科の単元に「" + UNIT + "」が出て、5年下の回のあとに並ぶ", at >= 0 && at > lastShita, names.join(" | "));
  const mix = await page.evaluate(u => ({
    jo: QA_DATA.filter(q => /^r5u13p/.test(q.id)).map(q => q.u + "|" + q.subj + "|" + q.kind),
    inUnit: QA_DATA.filter(q => q.u === u).map(q => q.id),
    joInShita: QA_DATA.filter(q => /^r5u/.test(q.id) && /^第\d+回\./.test(q.u)).map(q => q.id),
    daimonHere: QA_DATA.filter(q => q.u === u && q.kind === "daimon").map(q => q.id),
  }), UNIT);
  check("P1 5年上のカードは12枚とも単元「" + UNIT + "」の理科の一問一答・5年下の単元に混ざらない・大問が付かない",
    mix.jo.length === WANT_N && mix.jo.every(x => x === UNIT + "|理科|memo") && mix.inUnit.length === WANT_N && mix.inUnit.every(id => /^r5u13p\d+$/.test(id)) && mix.joInShita.length === 0 && mix.daimonHere.length === 0,
    JSON.stringify({ n: mix.inUnit.length, shita: mix.joInShita, daimon: mix.daimonHere }));
  const c = chips.find(c => c.u === UNIT);
  check("P2 チップの表示 12問", c && /12問/.test(c.t), c && c.t);
  await shot("P1_science_units");

  await page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice.selected")].filter(e => e.dataset.unit !== "ALL").forEach(e => e.click()));
  await page.waitForTimeout(200);
  await page.click(`#unit-choices .choice[data-unit="${UNIT}"]`); await page.waitForTimeout(200);
  const sel = await page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice.selected")].map(e => e.dataset.unit).filter(x => x !== "ALL"));
  check("P3 " + UNIT + " だけが選ばれる", sel.length === 1 && sel[0] === UNIT, sel.join(" | "));
  await page.evaluate(() => { const b = document.querySelector(".count-choice-custom"); if (b && !b.classList.contains("on")) b.click(); });
  await page.fill("#count-custom-input", String(WANT_N)); await page.dispatchEvent("#count-custom-input", "change"); await page.waitForTimeout(300);
  await tap("#solo-start-btn"); await page.waitForTimeout(700);
  const scr = await page.evaluate(() => (document.querySelector(".screen.active") || {}).id);
  check("P3 一人の一問一答が始まる", scr === "screen-solo", scr);
  const ids = []; const figBad = [];
  for (let k = 0; k < WANT_N + 3; k++) {
    if (await page.evaluate(() => (document.querySelector(".screen.active") || {}).id) !== "screen-solo") break;
    await page.waitForFunction(() => { const w = document.getElementById("solo-img-wrap"); const im = document.getElementById("solo-img"); return getComputedStyle(w).display === "none" || (im.complete && im.naturalWidth > 0); }, null, { timeout: 5000 }).catch(() => {});
    const cur = await page.evaluate(() => { const w = document.getElementById("solo-img-wrap"); const im = document.getElementById("solo-img");
      return { id: document.getElementById("solo-q-id").textContent.trim(), shown: getComputedStyle(w).display !== "none", src: im.getAttribute("src") || "", w: im.naturalWidth, rw: im.getBoundingClientRect().width }; });
    const id = (cur.id.match(/r5u13p\d+(~\d+)?/) || [cur.id])[0];
    ids.push(id);
    const d = await page.evaluate(id => QA_DATA.find(q => q.id === id.replace(/~\d+$/, "")), id);
    if (d && d.img) { if (!(cur.shown && cur.src.endsWith(d.img) && cur.w > 0 && cur.rw > 0)) figBad.push(id + ":" + JSON.stringify(cur)); }
    else if (cur.shown) figBad.push(id + ":図が無いのに出た");
    if (k === 0) await shot("P3_q1");
    await tap("#solo-reveal-btn"); await page.waitForTimeout(120);
    if (k === 0) { const a = await page.evaluate(() => document.getElementById("solo-a").textContent.trim()); check("P3 1問目の答えがデータどおり", d && a.includes(d.a), id + " " + a); await shot("P3_a1"); }
    await tap("#solo-judge-ok"); await page.waitForTimeout(250);
  }
  check("P3 出た問は r5u13p の12枚が1回ずつ（分けて＝~ の部分は出ない）",
    ids.length === WANT_N && ids.every(x => /^r5u13p\d+$/.test(x)) && new Set(ids).size === WANT_N, ids.join(" "));
  check("F3 図のある問で図が出る（12問）", figBad.length === 0, figBad.join(" "));
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"));
  const want = mix.inUnit;
  check("P4 記録に r5u13p の id で入る", want.every(id => st[id] && st[id].correct >= 1), want.filter(id => !(st[id] && st[id].correct >= 1)).join(" "));
  check("P4 前からある記録 r6m01 は変わらない", JSON.stringify(st.r6m01) === JSON.stringify(OLD), JSON.stringify(st.r6m01));
  check("P5 画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました"); console.log("写真: " + SHOTS);
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
