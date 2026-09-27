// ★★大問の数え方と記録（2026-09-27）を、実機（本物の Chrome・390px）で見る。1つの画面で済むもの。
// 依頼書 = 司令塔\回答\対戦_大問の入り口を一問一答と同じにする_依頼_2026-09-27.md（＋司令塔経由のユーザー承認）
//   ユーザー原文「問題数は6問でいいと思います。もちろん正解済みはかぞえません」
//              「15問指定で17問になっちゃうとかの時は、普通の一問一答でうめてください」
//              「一問一答が先に無くなってしまったら、そのようなエラーメッセージを出してください」
//
// ■ 見ること（★大問・小問の数は決め打ちしない。DAIMON_DATA と QA_DATA から数える・4-6p）
//   K1 社会のホームの数字は、直す前（対照）と同じ
//   K2 ★理科: ホームの総数 ＝ 3段の合計 ＝「◯問」＝ 単元の行の合計 ＝ 一覧（全単元）の「◯問」＝ 一問一答の数 ＋ 答える小問の数
//   K3 ★答える小問＝前回○でない小問。前回○の小問は数えない。全部○の大問は0問で、候補に入らない
//   K4 ★問題数を指定すると、合計はちょうどその数。入れるとこえる大問は飛ばして一問一答で埋める
//   K5 ★一問一答が足りずに指定の数にできないときは「一問一答が足りないため…」と出る（黙って減らさない）
//   K6 ★朝の別の入れ物の記録が stats に写る。★すでにある記録は上書きしない・一問一答の記録は1文字も変わらない・古い入れ物は残る
//   K7 ★社会の移行（cleanupAfterMigrations）が走っても、小問の記録が消えない
//   K8 CSV の書き出しに小問が1行ずつ入り、大問の行は入らない
//   K9 画面のエラー0・横のはみ出し0
//
// ■ 入口の自己テスト（★鳴るのが正しい。偽の実装は出荷される index.html から作る・4-6d）
//   (a) 大問を1問と数える ／(b) 移行の片づけで小問の記録を生かさない ／(c) 写すときに上書きする ／
//   (d) こえる大問を飛ばさずに切る（数だけ合わせる）／(e) 足りない知らせを出さない ／(f) 対照 b68eb5d
// 使い方: node tools/mikaku/daimon_count_probe.mjs [--only a|b|c|d|e|f|now]
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "b68eb5d";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const lf = s => s.replace(/\r\n/g, "\n");
const CURRENT = lf(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"));
const BASELINE = lf(execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }));
const cut = (src, needle, rep, what) => {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error("偽の実装を作れません（" + what + " が " + n + " 件）");
  return src.replace(needle, rep);
};
const FAKES = {
  a: ["大問を1問と数える", s => cut(s, "  return isDaimonEntry(d) ? answerItemIds(d).length : 1;", "  return isDaimonEntry(d) ? (answerItemIds(d).length ? 1 : 0) : 1;  /* ★偽の実装 */", "weightOf")],
  b: ["移行の片づけで小問の記録を生かさない", s => cut(s, "  DAIMON_ITEM.forEach((v, id) => liveIds.add(id));\n", "  /* ★偽の実装 */\n", "liveIds")],
  c: ["写すときに上書きする", s => cut(s, "        if(!DAIMON_ITEM.has(id) || stats[id] || !raw[id]", "        if(!DAIMON_ITEM.has(id) || !raw[id] /* ★偽の実装 */", "写しの条件")],
  d: ["こえる大問を飛ばさずに切る", s => cut(s, "    if(total + w > cap){ if(isDaimonEntry(QA_DATA[i])) skippedDaimon = true; continue; }",
      "    if(total + w > cap){ out.push(i); total += w; break; }  /* ★偽の実装 */", "takeByWeight")],
  e: ["足りない知らせを出さない", s => cut(s, "  if(plan.shortfall > 0 && plan.skippedDaimon){", "  if(false){  /* ★偽の実装 */", "知らせ")],
  f: ["対照 " + BASE_COMMIT, () => BASELINE]
};

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
const MIG_DONE = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };

// 記録の仕込み（★ページの中で条件から作る）
//   一問一答: 3つに1つ「苦手」、3つに1つ「定着」、残り記録なし
//   大問: 1つめの大問（小問2つ以上）は1つめの小問だけ前回○、最後の大問は全部前回○、2つめの大問は1つめの小問が✕（苦手）
const SEED = (opts) => {
  const now = Date.now(), st = {};
  let k = 0;
  QA_DATA.forEach(q => { if (q.kind === "daimon") return; k++;
    if (k % 3 === 0) st[q.id] = { correct: 1, wrong: 1, box: 0, lastCorrectAt: now - 5e8, lastAnswered: now - 1e8 };
    else if (k % 3 === 1) st[q.id] = { correct: 3, wrong: 0, box: 3, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }; });
  const G = DAIMON_DATA.filter(g => g.items.length >= 2);
  const known = () => ({ correct: 1, wrong: 0, box: 1, lastCorrectAt: now - 4e8, lastAnswered: now - 4e8 });
  const g0 = G[0], gw = G[1], gl = DAIMON_DATA[DAIMON_DATA.length - 1];
  st[g0.items[0].id] = known();
  gl.items.forEach(it => { st[it.id] = known(); });
  st[gw.items[0].id] = { correct: 1, wrong: 1, box: 0, lastCorrectAt: now - 6e8, lastAnswered: now - 2e8 };
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(opts.mig));
  if (opts.old) localStorage.setItem("kq_battle_daimon_stats_v1", JSON.stringify(opts.old(DAIMON_DATA, st, now)));
  return { g0: g0.key, gl: gl.key, gw: gw.key };
};

async function run(label, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(String(e)));
  p.on("dialog", d => d.accept().catch(() => {}));
  const home = async () => p.evaluate(() => ["stat-total", "stat-stage1", "stat-stage2", "stat-stage3", "pool-count-label"].map(id => document.getElementById(id).textContent));
  try {
    await p.goto(URL0); await p.waitForTimeout(400);
    // ================= K6: 朝の入れ物からの写し =================
    //   古い入れ物: 小問A（stats に無い）→ 写る ／ 小問B（stats に別の記録あり）→ ★上書きしない ／ 一問一答の id → 写さない
    const seedInfo = await p.evaluate(SEED, { mig: MIG_DONE });
    await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1"));
      const items = DAIMON_DATA.flatMap(g => g.items.map(it => it.id)).filter(id => !st[id]);
      const B = DAIMON_DATA.flatMap(g => g.items.map(it => it.id)).find(id => st[id]);
      const qa = QA_DATA.find(d => d.kind !== "daimon" && st[d.id]).id;
      const old = {};
      old[items[0]] = { correct: 2, wrong: 1, box: 1, lastCorrectAt: 111, lastAnswered: 222, mark: "A" };
      old[B] = { correct: 9, wrong: 9, box: 0, mark: "B" };
      old[qa] = { correct: 99, wrong: 99, box: 0, mark: "QA" };
      localStorage.setItem("kq_battle_daimon_stats_v1", JSON.stringify(old));
      localStorage.removeItem("kq_battle_daimon_merged_v1");
      window.__k6 = { A: items[0], B: B, qa: qa, before: localStorage.getItem("kq_battle_stats_v1"), old: localStorage.getItem("kq_battle_daimon_stats_v1") };
      sessionStorage.setItem("k6", JSON.stringify(window.__k6));
    });
    await p.reload(); await p.waitForTimeout(900);
    const k6 = await p.evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem("k6")), before = JSON.parse(s.before), after = JSON.parse(localStorage.getItem("kq_battle_stats_v1"));
      const changed = Object.keys(Object.assign({}, before, after)).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      return { s: s, changed: changed, A: after[s.A], B: after[s.B], Bb: before[s.B], qa: after[s.qa], qab: before[s.qa],
               oldLeft: localStorage.getItem("kq_battle_daimon_stats_v1") === s.old };
    });
    check("★K6 stats に無かった小問の記録が写る", k6.A && k6.A.mark === "A", JSON.stringify(k6.A));
    check("★K6 すでにある小問の記録は上書きしない", JSON.stringify(k6.B) === JSON.stringify(k6.Bb), JSON.stringify(k6.B));
    check("★K6 一問一答の記録は1文字も変わらない（変わったのは写した小問1つだけ）", k6.changed.length === 1 && k6.changed[0] === k6.s.A, k6.changed.join(","));
    check("K6 古い入れ物は消さずに残っている", k6.oldLeft);

    // ================= K7: 移行の片づけが走っても小問の記録が消えない =================
    await p.evaluate(SEED, { mig: { "kaki1-4": 1, "lastcorrect-backfill": 1 } });   // kaki5-8 を未実施にして片づけを走らせる
    const itemRecBefore = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1")); return DAIMON_DATA.flatMap(g => g.items.map(i => i.id)).filter(id => st[id]).length; });
    await p.reload(); await p.waitForTimeout(900);
    const k7 = await p.evaluate(() => ({ ran: !!JSON.parse(localStorage.getItem("kq_battle_migrations_v1"))["kaki5-8"],
      n: (() => { const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1")); return DAIMON_DATA.flatMap(g => g.items.map(i => i.id)).filter(id => st[id]).length; })() }));
    check("【下じき】K7 移行の片づけが、この読み込みで実際に走った", k7.ran);
    check("★K7 移行の片づけのあとも、小問の記録が全部残っている", itemRecBefore > 0 && k7.n === itemRecBefore, k7.n + " / " + itemRecBefore);

    // ================= K1〜K3: 数 =================
    const info = await p.evaluate(SEED, { mig: MIG_DONE });
    await p.evaluate(() => localStorage.setItem("kq_battle_daimon_merged_v1", "1"));
    await p.reload(); await p.waitForTimeout(900);
    await p.click("#subject-social"); await p.waitForTimeout(300);
    const social = (await home()).join(" | ");
    await p.click("#subject-science"); await p.waitForTimeout(300);
    const sci = await home();
    const expect = await p.evaluate(inf => {
      const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1"));
      const qa = QA_DATA.filter(d => d.subj === "理科" && d.kind !== "daimon" && d.kind !== "calc").length;
      const ans = g => g.items.filter(it => !((st[it.id] && st[it.id].box || 0) > 0)).length;
      const items = DAIMON_DATA.reduce((a, g) => a + ans(g), 0);
      const G = k => DAIMON_DATA.find(g => g.key === k);
      return { qa, items, total: qa + items, g0: ans(G(inf.g0)), g0n: G(inf.g0).items.length, gl: ans(G(inf.gl)) };
    }, info);
    const num = t => parseInt(t, 10);
    const unitSum = await p.evaluate(() => [...document.querySelectorAll("#unit-choices .choice")].filter(e => e.dataset.unit !== "ALL")
      .reduce((a, e) => a + parseInt((e.querySelector(".count") || { textContent: "0" }).textContent, 10), 0));
    check("★K2 理科のホームの総数 ＝ 一問一答 " + expect.qa + " ＋ 答える小問 " + expect.items, num(sci[0]) === expect.total, sci.join(" | "));
    check("★K2 3段の合計 ＝ 総数", num(sci[1]) + num(sci[2]) + num(sci[3]) === num(sci[0]), sci.join(" | "));
    check("★K2 「◯問」＝ 総数（全部・全単元）", num(sci[4]) === num(sci[0]), sci[4]);
    check("★K2 単元の行の合計 ＝ 総数", unitSum === num(sci[0]), unitSum);
    // 一覧（全単元・絞りこみなし）
    await p.evaluate(() => document.getElementById("list-btn").click()); await p.waitForTimeout(400);
    await p.selectOption("#list-unit-select", "ALL").catch(() => {}); await p.evaluate(() => document.getElementById("list-unit-select").dispatchEvent(new Event("change"))); await p.waitForTimeout(600);
    // ★「全単元」だけでは一覧は何も描かない作り（listHasCondition）。3段を全部選ぶ ＝ 絞りこみなしと同じ
    for (const t of [0, 1, 2]) { await p.click('#list-status-filters .list-filter-toggle[data-tier="' + t + '"]'); await p.waitForTimeout(150); }
    await p.waitForSelector('.daimon-list-item[data-daimon-key="' + info.gl + '"]', { timeout: 8000 }).catch(() => {});
    const listCount = await p.evaluate(() => document.getElementById("list-count").textContent);
    const drow = await p.evaluate(k => { const r = document.querySelector('.daimon-list-item[data-daimon-key="' + k + '"]'); return r ? r.textContent : null; }, info.g0);
    const lrow = await p.evaluate(k => { const r = document.querySelector('.daimon-list-item[data-daimon-key="' + k + '"]'); return r ? r.textContent : null; }, info.gl);
    check("★K2 一覧（全単元）の「◯問」＝ 総数", num(listCount) === num(sci[0]), listCount);
    check("★K3 一覧の大問の行: 前回○の小問は数えない（答える小問 " + expect.g0 + "問・前回○ " + (expect.g0n - expect.g0) + "問）",
      !!drow && drow.includes("答える小問 " + expect.g0 + "問") && expect.g0 === expect.g0n - 1, drow);
    check("★K3 全部○の大問は 0問", !!lrow && lrow.includes("0問") && expect.gl === 0, lrow);
    await p.evaluate(() => document.querySelector("#screen-list .back, #list-back") && document.querySelector("#screen-list .back, #list-back").click());
    await p.waitForTimeout(300);

    // ================= K4: 指定の数ちょうど。こえる大問は飛ばして一問一答で埋める =================
    //   理科・第3回だけ・出題順どおり。一問一答をぜんぶ「定着」、第3回の大問だけ答える小問ありにし、
    //   「まだ」だけを選ぶ ＝ 候補は大問だけ。★指定の数 = 1つめの大問の答える小問＋1（2つめの大問は入らない数にする）
    const k4 = await p.evaluate(() => {
      const now = Date.now(), st = {};
      QA_DATA.forEach(d => { if (d.kind !== "daimon") st[d.id] = { correct: 3, wrong: 0, box: 3, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }; });
      const u3 = QA_DATA.find(d => d.subj === "理科" && /^第3回\./.test(d.u) && d.kind !== "daimon").u;
      const G = DAIMON_DATA.filter(g => g.kai === 3);
      // 2つめの大問が2問以上になる並びを探す（こえさせるため）
      const i = G.findIndex((g, k) => k + 1 < G.length && G[k + 1].items.length >= 2);
      if (i < 0) return { err: "条件に合う大問がありません" };
      const n = G.slice(0, i + 1).reduce((a, g) => a + g.items.length, 0) + 1;
      localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
      localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "理科", unitsBySubject: { "理科": [u3] }, units: [u3], count: n, shuffle: false, tiers: [0], reviewAllUnits: true }));
      return { n: n, u3: u3 };
    });
    if (k4.err) throw new Error(k4.err);
    await p.reload(); await p.waitForTimeout(900);
    const lab4 = await p.evaluate(() => [document.getElementById("pool-count-label").textContent, document.getElementById("create-btn").textContent]);
    check("★K4 「まだ」だけ・" + k4.n + "問指定: 合計がちょうど " + k4.n + "問（こえる大問は飛ばして、次の問題で埋める）",
      num(lab4[0]) === k4.n && !lab4[0].includes("足りない"), lab4.join(" ／ "));
    // ================= K5: 一問一答も尽きたら知らせる =================
    //   同じ仕込みで、理科の一問一答を全部「答える小問が0の大問」と同じくらい使い切る ＝ 指定の数を総数＋1 にする
    const k5 = await p.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("kq_battle_settings_v1"));
      s.tiers = [0, 1, 2]; s.units = s.unitsBySubject["理科"] = [...new Set(QA_DATA.filter(d => d.subj === "理科").map(d => d.u))];
      localStorage.setItem("kq_battle_settings_v1", JSON.stringify(s));
      // 全部の単元・全部の段。最後の大問を「答える小問2」にし、指定を「総数−1」にする ＝ 最後の大問が入らず、埋める問題も無い
      const now = Date.now(), st = JSON.parse(localStorage.getItem("kq_battle_stats_v1"));
      // ★小問が2つ以上ある最後の大問を gl にし、それよりうしろの大問は全部前回○（0問）にする
      let li = -1; DAIMON_DATA.forEach((g, k) => { if (g.items.length >= 2) li = k; });
      if (li < 0) return { err: "小問が2つ以上の大問がありません" };
      const gl = DAIMON_DATA[li];
      const ok = () => ({ correct: 1, wrong: 0, box: 1, lastCorrectAt: now, lastAnswered: now });
      DAIMON_DATA.forEach(g => g.items.forEach(it => { delete st[it.id]; }));
      DAIMON_DATA.slice(li + 1).forEach(g => g.items.forEach(it => { st[it.id] = ok(); }));
      gl.items.slice(2).forEach(it => { st[it.id] = ok(); });
      localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
      const qa = QA_DATA.filter(d => d.subj === "理科" && d.kind !== "daimon" && d.kind !== "calc").length;
      const items = DAIMON_DATA.slice(0, li).reduce((a, g) => a + g.items.length, 0) + 2;
      s.count = qa + items - 1;
      localStorage.setItem("kq_battle_settings_v1", JSON.stringify(s));
      return { n: s.count };
    });
    if (k5.err) throw new Error(k5.err);
    await p.reload(); await p.waitForTimeout(900);
    const lab5 = await p.evaluate(() => document.getElementById("pool-count-label").textContent);
    check("★K5 一問一答が足りずに指定の " + k5.n + "問にできないとき、「一問一答が足りないため」と出る",
      lab5.includes("一問一答が足りないため") && lab5.includes("指定の" + k5.n + "問"), lab5);
    check("★K5 数は黙って減らさない（出る数は指定より少ないと書いてある）", num(lab5) < k5.n, lab5);

    // ================= K8: CSV =================
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.evaluate(() => document.getElementById("export-link").click())]);
    const csv = fs.readFileSync(await dl.path(), "utf8");
    const ids = new Set(csv.split(/\r\n/).slice(1).map(l => l.split(",")[0].replace(/^"|"$/g, "")));
    const k8 = await p.evaluate(() => ({ items: DAIMON_DATA.flatMap(g => g.items.map(i => i.id)), keys: DAIMON_DATA.map(g => g.key) }));
    const miss = k8.items.filter(id => !ids.has(id));
    check("K8 CSV に小問が全部 1行ずつ入る（" + k8.items.length + "行）", miss.length === 0, miss.slice(0, 3).join(","));
    check("K8 CSV に大問の行は入らない", k8.keys.every(k => !ids.has(k)));

    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check("K9 横のはみ出し 0", ov <= 0, ov);
    // K1 は最後（対照との比較）
    out.social = social;
  } catch (e) { check("例外なく走りきる", false, String(e.message || e).split("\n")[0]); }
  check("K9 画面のエラー 0", errs.length === 0, errs.slice(0, 2).join(" / "));
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
const only = process.argv.indexOf("--only") >= 0 ? process.argv[process.argv.indexOf("--only") + 1] : null;
let selfNg = 0;
for (const k of Object.keys(FAKES)) {
  if (only && only !== k) continue;
  const [title, make] = FAKES[k];
  let src; try { src = make(CURRENT); } catch (e) { console.log("\n── (" + k + ") " + title + " ──\n  ✘ " + e.message); selfNg++; continue; }
  const ng = report("(" + k + ") 偽の実装: " + title + " … ★鳴るのが正しい", await run("self_" + k, src));
  console.log(ng > 0 ? "  → ✔ 自己テスト合格（" + ng + " 件で鳴った）" : "  → ✘ 自己テスト不合格（鳴るべきなのに鳴らない）");
  if (ng === 0) selfNg++;
}
if (only && only !== "now") await done(selfNg ? 3 : 0);
if (selfNg > 0) { console.log("\n★自己テストが " + selfNg + " 件通らないので、本番の結果は出しません。"); await done(3); }
const base = await run("base", BASELINE);
const now = await run("now", CURRENT);
now.push({ name: "K1 社会のホームの数字が対照 " + BASE_COMMIT + " と同じ", ok: !!now.social && now.social === base.social, extra: now.social + " ／ 対照 " + base.social });
const ng = report("(now) いまの index.html … ★鳴らないのが正しい", now);
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng === 0 ? 0 : 1);
