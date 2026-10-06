// 理科 第6回「今回のポイント①〜⑤」（r6p01〜45）の取り込みを画面で見る（2026-10-06）。本物の Chrome・390x844。
// 使い方: node tools/mikaku/rika6point_probe.mjs   スクショは tools/mikaku/shots_r6p/（コミットしない）
// 見ること:
//   P1 理科の単元えらびに「第6回.今回のポイント①〜⑤」が ①→⑤ の順で、第6回.ヒトと動物の呼吸・循環 のあとに出る
//   P2 それぞれの問数がデータどおり（8・13・10・6・8＝45）
//   P3 それぞれ1つだけ選んで「一人で始める」→ 一問一答が始まり、出る問はその単元の r6p だけ（全問ぶん回す）
//   P4 答えると記録（kq_battle_stats_v1）にその r6p の id で入る。前からある記録（r6m01）は1字も変わらない
//   P5 画面のエラー 0
//   F1（2026-10-06 図つき）元データの file と data.js の img が45枚とも一致し、その画像が images/ にある
//   F2 図の中に答えの字がない … 図に印刷されている字を目で読んで下の PRINTED に書き写し、答えがどれにも入っていないかを見る
//      （★新しい図を足したら PRINTED にも足すこと。書いていない図は ✘ にする＝黙って通さない）
//   F3 図のある問では、一人の一問一答の画面に図が実際に出る（読み込めて幅がある・src が img と同じ）。図の無い問では出ない
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_r6p"); fs.mkdirSync(SHOTS, { recursive: true });
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
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
const UNITS = ["①ヒトの呼吸", "②心臓と血管", "③血液の循環", "④排出器官", "⑤いろいろな動物"].map(s => "第6回.今回のポイント" + s);
const WANT_N = [8, 13, 10, 6, 8];
// 図に印刷されている字（2026-10-06 に画像を開いて目で読んだもの。丸数字・記号は省く）
const PRINTED = {
  "r6p_01.jpg": ["毛細血管", "はく息", "吸う息", "血液", "赤血球", "気体の交換"],
  "r6p_02.jpg": ["ちっ素", "温度", "吸う息", "はく息", "気温", "体温", "空気と同じ", "とても多い", "吸う息とはく息の成分のちがい"],
  "r6p_03.jpg": ["はくとき", "吸うとき", "横かくまくとろっ骨の動き"],
  "r6p_04.jpg": ["弁", "血液の流れ", "血管のつくり", "のようす"],
  "r6p_05.jpg": [],
  "r6p_06.jpg": ["大静脈", "大動脈", "輸尿管", "尿道", "周辺のつくり"],
  "r6p_07.jpg": ["の出る穴", "毛細血管", "血管", "皮ふ", "のつくり"],
  "r6_03.jpg": ["血小板", "けっしょうばん", "図4"],
  "r6_04.jpg": ["気管", "血管", "肺静脈", "肺動脈", "左心房へつながっている", "右心室からつながっている", "図1"],
  "r6_06.jpg": ["図4"],
  "r6_12.jpg": ["血液の成分", "はたらき", "成分", "酸素を運ぶ（ヘモグロビンという色素をもつ）", "細菌をとらえて病気を防ぐ", "血を固めて出血を止める", "液体。養分・二酸化炭素・不要物を運ぶ"],
  "r6_13.jpg": ["図1", "血液の流れ", "全身", "肺", "心臓", "は心臓の部屋", "は血管を表しています"],
  "r6_14.jpg": ["図2", "血液の循環", "肺", "心臓", "全身", "は、血液の通り道（循環）を表しています"],
};
const OLD = { correct: 2, wrong: 1, box: 1, lastCorrectAt: 1759000000000, lastAnswered: 1759000000000 };
try {
  {
    const src = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "..", "..", "5年下", "quiz_csv_理科", "第6回_今回のポイント.json"), "utf8"));
    const qa = new Map((await (async () => { await page.goto(URL0); await page.waitForTimeout(600); return page.evaluate(() => QA_DATA.filter(q => /^r6p/.test(q.id)).map(q => [q.id, q])); })()));
    const f1 = src.filter(r => (r.file || "") !== ((qa.get(r.id) || {}).img || "") || (r.file && !fs.existsSync(path.join(ROOT, "images", r.file))));
    check("F1 元データの file と data.js の img が45枚とも一致・画像が images/ にある（図あり " + src.filter(r => r.file).length + "枚）", src.length === 45 && f1.length === 0, f1.map(r => r.id).join(" "));
    const f2 = []; const unread = new Set();
    for (const r of src) { if (!r.file) continue; const pr = PRINTED[r.file]; if (!pr) { unread.add(r.file); continue; }
      const hit = pr.filter(w => w.includes(r.a)); if (hit.length) f2.push(r.id + "(" + r.a + "→" + hit.join("/") + ")"); }
    check("F2 図の中に答えの字がない（図に印刷された字をすべて書き写して照合・未読の図 " + unread.size + "）", f2.length === 0 && unread.size === 0, f2.concat([...unread].map(f => "未読 " + f)).join(" "));
  }
  await page.goto(URL0); await page.waitForTimeout(800);
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
  const pos = UNITS.map(u => names.indexOf(u));
  const base = names.indexOf("第6回.ヒトと動物の呼吸・循環");
  check("P1 単元の一覧に ①〜⑤ が順に、第6回.ヒトと動物の呼吸・循環 のあとに出る",
    pos.every(p => p >= 0) && pos.every((p, i) => i === 0 || p === pos[i - 1] + 1) && pos[0] === base + 1, names.join(" | "));
  const dataN = await page.evaluate(us => us.map(u => QA_DATA.filter(q => q.u === u && q.subj === "理科").length), UNITS);
  check("P2 データの問数 8・13・10・6・8（計45）", JSON.stringify(dataN) === JSON.stringify(WANT_N), dataN.join("・"));
  UNITS.forEach((u, i) => { const c = chips.find(c => c.u === u); check("P2 チップの表示 " + u, c && c.t.includes(String(WANT_N[i])), c && c.t); });
  await shot("P1_science_units");

  for (let i = 0; i < UNITS.length; i++) {
    const u = UNITS[i];
    await page.reload(); await page.waitForTimeout(900);
    await tap("#subject-science"); await page.waitForTimeout(300);
    // その単元だけを選ぶ（選ばれているものを全部はずしてから）
    await page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice.selected")].filter(e => e.dataset.unit !== "ALL").forEach(e => e.click()));
    await page.waitForTimeout(200);
    await page.click(`#unit-choices .choice[data-unit="${u}"]`); await page.waitForTimeout(200);
    const sel = await page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice.selected")].map(e => e.dataset.unit).filter(x => x !== "ALL"));
    check("P3 " + u + " だけが選ばれる", sel.length === 1 && sel[0] === u, sel.join(" | "));
    await page.evaluate(() => { const b = document.querySelector(".count-choice-custom"); if (b && !b.classList.contains("on")) b.click(); });
    await page.fill("#count-custom-input", String(WANT_N[i])); await page.dispatchEvent("#count-custom-input", "change"); await page.waitForTimeout(300);
    await tap("#solo-start-btn"); await page.waitForTimeout(700);
    const scr = await page.evaluate(() => (document.querySelector(".screen.active") || {}).id);
    check("P3 " + u + " で一人の一問一答が始まる", scr === "screen-solo", scr);
    const want = await page.evaluate(u => QA_DATA.filter(q => q.u === u).map(q => q.id), u);
    const seen = []; const qs = []; const figSeen = [];
    for (let k = 0; k < WANT_N[i]; k++) {
      await page.waitForFunction(() => { const w = document.getElementById("solo-img-wrap"); const im = document.getElementById("solo-img"); return getComputedStyle(w).display === "none" || (im.complete && im.naturalWidth > 0); }, null, { timeout: 5000 }).catch(() => {});
      const fig = await page.evaluate(() => { const w = document.getElementById("solo-img-wrap"); const im = document.getElementById("solo-img"); return { shown: getComputedStyle(w).display !== "none", src: im.getAttribute("src") || "", w: im.naturalWidth, rw: im.getBoundingClientRect().width }; });
      figSeen.push(fig);
      const cur = await page.evaluate(() => ({ id: document.getElementById("solo-q-id").textContent.trim(), q: document.getElementById("solo-q").textContent.trim(), tag: document.getElementById("solo-unit-tag").textContent.trim(), scr: (document.querySelector(".screen.active") || {}).id }));
      if (cur.scr !== "screen-solo") break;
      seen.push(cur.id); qs.push(cur);
      if (k === 0) await shot("P3_" + (i + 1) + "_q1");
      await tap("#solo-reveal-btn"); await page.waitForTimeout(120);
      if (k === 0) { const a = await page.evaluate(() => document.getElementById("solo-a").textContent.trim()); const d = await page.evaluate(id => QA_DATA.find(q => q.id === id), cur.id.replace(/^.*?(r6p\d+).*$/, "$1")); check("P3 " + u + " 1問目の答えがデータどおり", d && a.includes(d.a), cur.id + " " + a); await shot("P3_" + (i + 1) + "_a1"); }
      await tap("#solo-judge-ok"); await page.waitForTimeout(250);
    }
    const ids = seen.map(s => (s.match(/r6p\d+/) || [s])[0]);
    check("P3 " + u + " 出た問は全部この単元の r6p で、" + WANT_N[i] + "問すべて1回ずつ",
      ids.length === WANT_N[i] && ids.every(x => want.includes(x)) && new Set(ids).size === want.length, ids.join(" "));
    {
      const bad = [];
      for (let k = 0; k < ids.length; k++) {
        const d = await page.evaluate(id => QA_DATA.find(q => q.id === id), ids[k]); const f = figSeen[k];
        if (d.img) { if (!(f.shown && f.src.endsWith(d.img) && f.w > 0 && f.rw > 0)) bad.push(ids[k] + ":" + JSON.stringify(f)); }
        else if (f.shown) bad.push(ids[k] + ":図が無いのに出た");
      }
      const nFig = await page.evaluate(ids => ids.filter(id => QA_DATA.find(q => q.id === id).img).length, ids);
      check("F3 " + u + " 図のある問 " + nFig + "問で図が出る（図の無い問では出ない）", bad.length === 0, bad.join(" "));
    }
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"));
    check("P4 " + u + " 記録に r6p の id で入る", want.every(id => st[id] && st[id].correct >= 1), want.filter(id => !(st[id] && st[id].correct >= 1)).join(" "));
    check("P4 前からある記録 r6m01 は変わらない", JSON.stringify(st.r6m01) === JSON.stringify(OLD), JSON.stringify(st.r6m01));
  }
  check("P5 画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました"); console.log("写真: " + SHOTS);
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
