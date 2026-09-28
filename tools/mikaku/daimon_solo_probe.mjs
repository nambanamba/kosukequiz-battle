// ★★理科の大問を「ひとりで解く」にも混ぜたとき（2026-09-28）を、本物の Chrome で見る。
// 依頼: 司令塔から「大問を一人でやるときも二人でやる時も同じように出してください」
// 対照 = 0fb6d11（この作業を始める前の公開版。ひとりは大問を除いていた）
//
// ■ 見ること
//   S1 ★ホームの「一人で始める」の数に大問がふくまれる（二人の「n」と同じ数え方＝答える小問の数）
//   S2 ★ひとりの出題に、大問の小問が続けて・順番どおりに混ざる（前回○の小問は手にならない）
//   S3 「こたえを見る」の前に、同じ大問のうしろの小問は画面に無い
//   S4 前の小問（前回○をふくむ）は答えつきで上に出ている
//   S5 ★答えの図（aFile）は「こたえを見る」の前は画面に無く、あとに出る
//   S6 記録: 小問の記録が stats に小問の id で入り、★ほかの一問一答の記録は1文字も変わらない
//   S7 ★「ひとつ前の判定をやり直す」は、直前が大問の小問のときは出ない
//   S8 ★大問の途中でやめて再開すると、その大問の(1)からやり直しになる
//   S9 画面のエラー0・横のはみ出し0（390px）
//
// ■ 入口の自己テスト（★鳴るのが正しい。偽の実装は出荷される index.html から作る・4-6d）
//   (a) ひとりでは大問を混ぜない（前のまま） ／ (b) うしろの小問まで出す ／
//   (c) 答えの図を先に出す ／ (d) 記録を古い別の入れ物に書く ／
//   (e) 直前が大問でも「一個前を直す」を出す ／ (f) 対照 0fb6d11（この作業の前）
// 使い方: node tools/mikaku/daimon_solo_probe.mjs            （全部）
//         node tools/mikaku/daimon_solo_probe.mjs --only a  （a〜f ＝ 自己テスト、now ＝ 本物）
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_daimon_solo");
fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "0fb6d11";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const lf = s => s.replace(/\r\n/g, "\n");
const CURRENT = lf(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"));
const BASELINE = lf(execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }));

// ★2026-09-28: aFile（答えの図）を持つ大問は「紙で出す」に回りやすく、実測では非紙の中に
//   1つも残らなかった（唯一の aFile 例が paper:true だった）。S5（aFile の表示タイミング）を
//   実際に踏むため、写しに合成の aFile を1つだけ足して配る。★本物の daimon_data.js は書かない
const DAIMON_SRC = fs.readFileSync(path.join(ROOT, "daimon_data.js"), "utf8");
function parseDaimonSrc(src) {
  const m = src.match(/const DAIMON_DATA = (\[[\s\S]*?\]);\r?\nconst DAIMON_IMG_SIZES = (\{[\s\S]*?\});/);
  if (!m) throw new Error("daimon_data.js の形が読めません");
  return { data: JSON.parse(m[1]), sizes: JSON.parse(m[2]) };
}
const { data: daimonData, sizes: daimonSizes } = parseDaimonSrc(DAIMON_SRC);
const SYN_AFILE = Object.keys(daimonSizes)[0];   // 実在する画像を流用（寸法が既に登録ずみ）
const afileTarget = daimonData.find(g => !g.paper && g.items.length >= 2 && g.items.length <= 4 && !g.items.some(it => it.aFile));
if (!afileTarget) throw new Error("合成の aFile を足す先の大問（紙でない・aFile が無い・小問2つ以上）が見つかりません");
const patchedDaimonData = daimonData.map(g => g !== afileTarget ? g : Object.assign({}, g, {
  items: g.items.map((it, k) => k !== g.items.length - 1 ? it : Object.assign({}, it, { aFile: SYN_AFILE }))
}));
const PATCHED_DAIMON = "const DAIMON_DATA = " + JSON.stringify(patchedDaimonData) + ";\nconst DAIMON_IMG_SIZES = " + JSON.stringify(daimonSizes) + ";\n";
console.log("（合成の aFile を " + afileTarget.key + " の最後の小問に足して検査します。本物の daimon_data.js は書きません）");
const cut = (src, needle, rep, what) => {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error("偽の実装を作れません（" + what + " が " + n + " 件、期待1件）");
  return src.replace(needle, rep);
};
const FAKES = {
  a: ["ひとりでは大問を混ぜない（前のまま）", s => cut(s,
      "  quizQueue = expandDaimonIds(pool.map(i => QA_DATA[i].id));",
      "  quizQueue = pool.filter(i => !isDaimonEntry(QA_DATA[i])).map(i => QA_DATA[i].id);  /* ★偽の実装 */", "solo-start-btn の並び")],
  b: ["うしろの小問まで出す", s => cut(s,
      "  g.items.slice(0, dm.pos).forEach((it, k) => addDaimonAnswered(box, it, k));",
      "  g.items.forEach((it, k) => { if(k !== dm.pos) addDaimonAnswered(box, it, k); });  /* ★偽の実装 */", "前の小問")],
  c: ["答えの図を先に出す", s => cut(s,
      "  if(dm.it.file) els[prefix+\"-daimon-fig\"].appendChild(daimonImg(dm.it.file));",
      "  if(dm.it.file) els[prefix+\"-daimon-fig\"].appendChild(daimonImg(dm.it.file));\n  if(dm.it.aFile) els[prefix+\"-daimon-fig\"].appendChild(daimonImg(dm.it.aFile));  /* ★偽の実装 */", "小問の図")],
  d: ["記録を古い別の入れ物に書く", s => cut(s,
      "  recordResult(qid, recorded);",
      "  { const o = daimonStats[qid] || {correct:0, wrong:0}; if(recorded) o.correct++; else o.wrong++; daimonStats[qid] = o; saveDaimonStats(); }  /* ★偽の実装 */", "judgeSolo の記録の行")],
  e: ["直前が大問でも「一個前を直す」を出す", s => cut(s,
      "  const prevWasDaimonItem = !reviewMode && quizPos > 0 && isDaimonItemId(quizQueue[quizPos - 1]);",
      "  const prevWasDaimonItem = false;  /* ★偽の実装 */", "solo-undo-row の表示")],
  f: ["対照 " + BASE_COMMIT + "（この作業の前）", () => BASELINE]
};

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
let SERVED = CURRENT;
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(SERVED, "utf8")); return; }
  if (rel === "daimon_data.js") { res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-store" }); res.end(Buffer.from(PATCHED_DAIMON, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });

// ★仕込みは条件で選ぶ（番号の決め打ちをしない）。選べなければ理由を返す
const SEED = () => {
  const now = Date.now();
  const u3 = QA_DATA.find(d => d.subj === "理科" && /^第3回\./.test(d.u) && d.kind !== "daimon").u;
  const qa3 = QA_DATA.filter(d => d.u === u3 && d.kind !== "daimon" && d.kind !== "calc");
  // ★2026-09-28: paper:true の大問は QA_DATA/DAIMON_ITEM に入らない（紙で出す・出題から除く）。
  //   候補から外さないと、仕込みが実際には出題されない大問を選んでしまう
  const G = DAIMON_DATA.filter(g => g.kai === 3 && !g.paper);
  // ★2026-09-28: 小問の q が重複する大問（同じ設問文を複数の空欄で共有する形。実データにある）は
  //   「うしろの小問が画面に無い」を文字列一致で見る自己テストと相性が悪い（q が同じなら必ず一致してしまう）。
  //   g1・g5 とも、小問の q が全部ちがう大問だけを候補にする
  const uniqueQ = g => new Set(g.items.map(it => it.q)).size === g.items.length;
  const g1 = G.find(g => g.items.length >= 3 && g.items.length <= 6 && uniqueQ(g) && !g.items.some(it => it.aFile));
  // ★2026-09-28: aFile を持つ大問は「紙で出す」に回りやすく、非紙の中に1つも残らないことがある
  //   （実測: この日の本物データでは aFile 付き大問は1つだけで、それが paper:true だった）。
  //   その場合は aFile 無しの別の大問で代用し、S5（aFile の表示タイミング）だけ省略する
  let g5 = G.find(g => g !== g1 && g.items.some((it, k) => it.aFile && k >= 1));
  if (!g5) g5 = G.find(g => g !== g1 && g.items.length >= 2 && uniqueQ(g));
  if (!g1 || !g5) return { err: "条件に合う大問がありません" };
  let af = g5.items.findIndex((it, k) => it.aFile && k >= 1);
  if (af < 0) af = g5.items.length - 1;   // aFile が無いときは、末尾の1問だけ答えさせる位置にする
  const st = {};
  qa3.slice(1).forEach(d => { st[d.id] = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }; });
  const known = { correct: 1, wrong: 0, box: 1, lastCorrectAt: now - 5e8, lastAnswered: now - 5e8 };
  G.forEach(g => g.items.forEach(it => { st[it.id] = Object.assign({}, known); }));
  g1.items.slice(0, -1).forEach(it => delete st[it.id]);   // G1: 最後の小問だけ前回○（うしろに残る）
  g5.items.forEach((it, k) => { if (k !== af - 1) delete st[it.id]; });   // G5: aFile の1つ前だけ前回○
  QA_DATA.filter(d => d.subj === "社会").slice(0, 30).forEach((d, k) => { st[d.id] = { correct: k, wrong: 1, box: k % 3, lastCorrectAt: now - k * 1e7, lastAnswered: now - k * 1e7 }; });
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  // ★2026-09-28: G1・G5 の出る順は「大問を選んだ理由」ではなく、DAIMON_DATA（＝QA_DATA）の並び順で決まる。
  //   g1 の条件を絞ったことで、g5（要点チェック）より後ろの大問が g1 に選ばれることがあるため、
  //   実際に先に並ぶほうを先に置く（決め打ちしない）
  const g1First = G.indexOf(g1) < G.indexOf(g5);
  const g1Ids = g1.items.slice(0, -1).map(it => it.id);
  const g5Ids = g5.items.filter((it, k) => k !== af - 1).map(it => it.id);
  const plan = [qa3[0].id].concat(g1First ? g1Ids.concat(g5Ids) : g5Ids.concat(g1Ids));
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
    subject: "理科", unitsBySubject: { "理科": [u3] }, units: [u3], count: plan.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, reviewAllUnits: true
  }));
  // ★2026-09-28: S8（大問の途中でやめて再開）は S1〜S7 のあとに、同じ localStorage のまま
  //   もう一度出題させて見る。S1〜S7 の道中で judge を t%2===0 なら○・奇数なら✕と交互に付けて
  //   いくため、○が付いた小問は次の出題で「もう答えた（box>0）」として外れてしまう。
  //   ★途中でやめる位置は、plan の中で「必ず✕になる（奇数番目）」小問から選ぶ（先頭は避ける）
  let midIdx = g1Ids.findIndex((id, i) => i > 0 && plan.indexOf(id) % 2 === 1);
  if (midIdx < 0) midIdx = g1Ids.findIndex((id, i) => plan.indexOf(id) % 2 === 1);
  if (midIdx < 0) midIdx = g1Ids.length > 1 ? 1 : 0;
  return { u3, x: qa3[0].id, g1: g1.items.map(it => it.id), g5: g5.items.map(it => it.id), af,
           aFile: g5.items[af].aFile || null, plan, g1Lead: g1.lead || "",
           g1MidId: g1Ids[midIdx] };
};

async function run(label, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  page.on("dialog", d => d.accept().catch(() => {}));
  const tap = sel => page.$eval(sel, e => e.click());
  const txt = sel => page.$eval(sel, e => (e.textContent || "").trim());
  const visible = sel => page.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const waitVisible = (sel, ms) => page.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 20000 });
  const shown = () => page.evaluate(() => (document.getElementById("solo-q-id").textContent || "").replace(/^No\./, ""));
  const screenText = () => page.evaluate(() => document.getElementById("screen-solo").innerText);
  const screenHtml = () => page.evaluate(() => document.getElementById("screen-solo").innerHTML);
  let S = null;
  try {
    await page.goto(PAGE_URL); await page.waitForTimeout(500);
    S = await page.evaluate(SEED);
    if (S.err) throw new Error(S.err);
    if (!S.aFile) console.log("  （このデータには aFile 付きの非紙の大問が無いため、S5 は省略）");
    await page.reload(); await page.waitForTimeout(800);
    const statsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1")));
    const texts = await page.evaluate(() => { const m = {}; DAIMON_DATA.forEach(g => g.items.forEach(it => { m[it.id] = { q: it.q, a: it.a, g: g.key }; })); return m; });
    const later = id => { const G = S.g1.includes(id) ? S.g1 : S.g5; return G.slice(G.indexOf(id) + 1); };
    const earlier = id => { const G = S.g1.includes(id) ? S.g1 : S.g5; return G.slice(0, G.indexOf(id)); };

    check("★S1 ホームの「一人で始める」の数に大問がふくまれる（答える小問で数え、" + S.plan.length + "問）",
      (await txt("#solo-start-btn")).includes("（" + S.plan.length + "問"), await txt("#solo-start-btn"));

    await tap("#solo-start-btn"); await page.waitForTimeout(300);
    const seq = [];
    for (let t = 0; t < S.plan.length; t++) {
      await waitVisible("#solo-reveal-btn", 15000);
      const id = await shown();
      seq.push(id);
      const isItem = !!texts[id];
      // ---- 答えが開く前 ----
      if (isItem) {
        const tx = await screenText(), html = await screenHtml();
        const leak = later(id).filter(x => tx.includes(texts[x].q));
        check("★S3 " + id + ": 答える前に、うしろの小問が画面に無い", leak.length === 0, leak.join(","));
        const prevMissing = earlier(id).filter(x => !(tx.includes(texts[x].q) && tx.includes(texts[x].a)));
        if (earlier(id).length) check("S4 " + id + ": 前の小問（前回○をふくむ）が答えつきで出ている", prevMissing.length === 0, prevMissing.join(","));
        if (S.aFile && S.g5[S.af] === id) check("★S5 答えの図は、答える前は画面に無い", !html.includes(S.aFile));
        // ★S7: 直前が大問の小問のとき、「一個前を直す」を出さない
        if (t > 0 && texts[seq[t - 1]]) check("★S7 直前が大問の小問（" + seq[t - 1] + "）のとき、undo が出ない", !(await visible("#solo-undo-row")));
      }
      await tap("#solo-reveal-btn"); await page.waitForTimeout(60);
      if (isItem) {
        const html = await screenHtml();
        if (S.aFile && S.g5[S.af] === id) check("★S5 答えを開いたら、答えの図が出る", html.includes(S.aFile));
        if (S.g1.indexOf(id) === S.g1.length - 2) {
          const tail = S.g1[S.g1.length - 1];
          const tx = await screenText();
          check("★S4 大問の最後の手の答えを開くと、うしろの前回○の小問が答えつきで出る", tx.includes(texts[tail].q) && tx.includes(texts[tail].a), tail);
          await shot(page, "after_last_g1");
        }
      }
      await tap(t % 2 === 0 ? "#solo-judge-ok" : "#solo-judge-ng"); await page.waitForTimeout(60);
    }
    check("★S2 ひとりの出題の並びが「X → G1 の答える小問 → G5 の答える小問」（前回○は手にならない）",
      JSON.stringify(seq) === JSON.stringify(S.plan), JSON.stringify(seq));
    const statsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1")));
    const changed = Object.keys(Object.assign({}, statsBefore, statsAfter)).filter(k => JSON.stringify(statsBefore[k]) !== JSON.stringify(statsAfter[k]));
    check("★S6 記録が変わったのは、このラウンドの" + S.plan.length + "手だけ（ほかの一問一答・前回○の小問は1文字も変わらない）",
      JSON.stringify(changed.sort()) === JSON.stringify(S.plan.slice().sort()), "変わった=" + changed.join(","));

    // ---- S8: 大問の途中でやめて再開すると (1) からやり直し ----
    await page.reload(); await page.waitForTimeout(600);
    await tap("#solo-start-btn"); await page.waitForTimeout(300);
    let firstItemPos = -1, firstItemId = null;
    for (let t = 0; t < S.plan.length; t++) {
      await waitVisible("#solo-reveal-btn", 15000);
      const id = await shown();
      if (id === S.g1MidId) { firstItemPos = t; firstItemId = id; break; }
      await tap("#solo-reveal-btn"); await page.waitForTimeout(40);
      await tap("#solo-judge-ok"); await page.waitForTimeout(40);
    }
    if (firstItemId) {
      // ★大問の途中（(1)ではない手）まで答えて、ホームへ「やめてもどる」
      await page.evaluate(() => window.confirm = () => true);
      await tap("#solo-back"); await page.waitForTimeout(200);
      await page.reload(); await page.waitForTimeout(600);
      await tap("#resume-solo-btn"); await page.waitForTimeout(300);
      const resumedId = await shown();
      check("★S8 大問の途中でやめて再開すると、その大問の(1)から", resumedId === S.g1[0], "再開先=" + resumedId + " 期待=" + S.g1[0]);
    } else {
      check("★S8 大問の途中でやめて再開すると、その大問の(1)から", false, "仕込みで大問の途中に届かなかった");
    }
    for (let i = 0; i < 3; i++) { await tap("#solo-reveal-btn").catch(() => {}); await tap("#solo-judge-ok").catch(() => {}); await page.waitForTimeout(40); }

    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("S9 横のはみ出し 0", ov <= 0, ov + "px");
    check("S9 画面のエラー0", errs.length === 0, errs.join(" | "));
  } catch (e) {
    check("通しが最後まで走った", false, String((e && e.message) || e).split("\n")[0]);
    await shot(page, "ERR");
  } finally { await ctx.close(); }
  return out;
}

function report(title, out) {
  console.log("\n── " + title + " ──");
  let ng = 0;
  for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.name + (c.extra ? " … " + c.extra : "")); if (!c.ok) ng++; }
  return ng;
}
const done = async code => { await browser.close(); server.close(); process.exit(code); };
const only = process.argv.indexOf("--only") >= 0 ? process.argv[process.argv.indexOf("--only") + 1] : null;
let selfNg = 0;
for (const k of Object.keys(FAKES)) {
  if (only && only !== k) continue;
  const [title, make] = FAKES[k];
  let src;
  try { src = make(CURRENT); } catch (e) { console.log("\n── (" + k + ") " + title + " ──\n  ✘ " + e.message); selfNg++; continue; }
  const ng = report("(" + k + ") 偽の実装: " + title + " … ★鳴るのが正しい", await run("self_" + k, src));
  console.log(ng > 0 ? "  → ✔ 自己テスト合格（" + ng + " 件で鳴った）" : "  → ✘ 自己テスト不合格（鳴るべきなのに鳴らない）");
  if (ng === 0) selfNg++;
}
if (only && only !== "now") await done(selfNg ? 3 : 0);
if (selfNg > 0) { console.log("\n★自己テストが " + selfNg + " 件通らないので、本番の結果は出しません。"); await done(3); }
const ng = report("(now) いまの index.html … ★鳴らないのが正しい", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng === 0 ? 0 : 1);
