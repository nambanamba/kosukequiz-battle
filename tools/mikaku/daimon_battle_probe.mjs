// ★★理科の大問を「対戦」に出したとき（2026-09-27）を、本物の Chrome 2枚＋まねごとの待ち合わせ先で見る。
// 依頼書 = 司令塔\回答\対戦_大問の入り口を一問一答と同じにする_依頼_2026-09-27.md
// 案     = 案_大問の入り口を一問一答と同じにする_20260927.md（＋司令塔経由のユーザー承認 3つ）
//
// ■ 仕込み（★対象は番号でなく条件で選ぶ・4-6p）
//   ホスト: 理科・第3回だけ・「まだ正解していない」だけ・出題順どおり・5問
//     一問一答: 第3回の1問目だけ記録なし（X）、ほかは全部「定着」
//     大問: 小問を全部「前回○」にしておき、次の2つだけ変える
//       G1 = 答えの図（aFile）が無く、小問が3つ以上の大問のうち最初のもの … 最後の小問だけ前回○（＝うしろに残る）
//       G5 = 答えの図（aFile）がある小問を持つ大問 … その aFile の小問の1つ前だけ前回○（＝まん中に挟まる）
//   → 出る手は X・G1 の答える小問・G5 の答える小問 で、ちょうど5手になるように作る（ならなければ止める）
//   ゲスト: 記録なし（★ゲストの記録は見ない・ホストで決める を見るため）
//
// ■ 見ること
//   B1 ★ホストとゲストの手の並びが同じで、大問の答える小問が続けて・順番どおりに出る。前回○の小問は手にならない。分母は5
//   B2 ★答えが開く前に（ホストは親の〇✕の前、親は問題が出た時点で）、同じ大問のうしろの小問（答える小問も前回○の小問も）は画面に無い
//   B3 前の小問・前回○の小問は、答えつきで上に出ている。★うしろに残った前回○の小問は、最後の手の答えを開いたときに出る
//   B4 ★答えの図（aFile）はホストの画面では親が〇✕を押す前は無く、あとに出る（親の画面には最初から答えが出ている）
//   B5 ★時間2倍（2026-10-10 に二人の流れが変わって見方を変えた）: ホストの考える時間の帯（#think-timer の data-sec）が、
//      基本3秒の小問だと6秒（3秒×2）。★二人では考える時間が切れても何も起きない（後ろに回らない・答えも開かない・ホストの
//      「わかった！」「こたえを見る」は無い）ので、6.8秒たっても同じ小問・答えは閉じたまま・スキップも残る、を見る
//      （答える時間でホストの答えが開く、は無くなった。開くのは親の〇✕）
//   B6 ホストの小問でもスキップが出る（★2026-09-30 bug0930 ⑤ で逆にした。2026-09-27 は「出ない」）
//   B7 ゲストの画面に、前の大問のリード文が残っていない（2026-10-10 から「準備中」の待ち画面は無く、問題は両方に同時に出る）
//   B8 ホストの記録: 小問の記録が stats に入り、★ほかの一問一答の記録は1文字も変わらない（ホストの記録は親の〇✕から。ゲストは記録が付かない）
//   ※2026-10-10 二人の流れ: 子ども（ホスト）に「わかった！」「こたえを見る」は出ず、問題は両方に同時に出る。親（ゲスト）には最初から答えと〇✕が出ていて、
//      親が〇✕を押すと子どもの答えが開く（子どもに〇✕は出ない）→ 「次へ」
//   B9 まちがえた小問だけのもう一勝負: G5 の1つめの答える小問を✕にすると、もう一勝負の手はその小問だけ
//      ★2026-10-07（#18 正解するまでぐるぐる）から: もう一勝負は無く、✕の小問は同じラウンドで G5 の残りのうしろにもう一度出る。
//        B1 の並びはそのぶん1手ふえ、B3 では「あとでもう一度出る」小問の答えは出さない（前からの決まり）
//   B10 画面のエラー0・横のはみ出し0（390px）
//
// ■ 入口の自己テスト（★鳴るのが正しい。偽の実装は出荷される index.html から作る・4-6d）
//   (a) 大問を小問に開かない ／(b) うしろの小問まで出す ／(c) 答えの図を先に出す ／
//   (d) 時間を2倍にしない ／(e) 小問でもスキップを出す ／(f) 対照 b68eb5d（大問を対戦に出す前・コミットで固定 4-6c）
// 使い方: node tools/mikaku/daimon_battle_probe.mjs            （全部）
//         node tools/mikaku/daimon_battle_probe.mjs --only a  （a〜f ＝ 自己テスト、now ＝ 本物。★メモリの少ない日は1本ずつ）
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_daimon_battle");
fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "b68eb5d";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const lf = s => s.replace(/\r\n/g, "\n");
const CURRENT = lf(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"));
const BASELINE = lf(execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }));

// ★2026-09-28: aFile（答えの図）を持つ大問は「紙で出す」に回りやすく、実測では非紙の中に
//   1つも残らなかった（唯一の aFile 例が paper:true だった）。B4（aFile の表示タイミング）を
//   実際に踏むため、写しに合成の aFile を1つだけ足して配る。★本物の daimon_data.js は書かない
const DAIMON_SRC = fs.readFileSync(path.join(ROOT, "daimon_data.js"), "utf8");
function parseDaimonSrc(src) {
  const m = src.match(/const DAIMON_DATA = (\[[\s\S]*?\]);\r?\nconst DAIMON_IMG_SIZES = (\{[\s\S]*?\});/);
  if (!m) throw new Error("daimon_data.js の形が読めません");
  return { data: JSON.parse(m[1]), sizes: JSON.parse(m[2]) };
}
const { data: daimonData, sizes: daimonSizes } = parseDaimonSrc(DAIMON_SRC);
const SYN_AFILE = Object.keys(daimonSizes)[0];
const afileTarget = daimonData.find(g => !g.paper && g.items.length >= 2 && g.items.length <= 4 && !g.items.some(it => it.aFile));
if (!afileTarget) throw new Error("合成の aFile を足す先の大問（紙でない・aFile が無い・小問2つ以上）が見つかりません");
const patchedDaimonData = daimonData.map(g => g !== afileTarget ? g : Object.assign({}, g, {
  items: g.items.map((it, k) => k !== g.items.length - 1 ? it : Object.assign({}, it, { aFile: SYN_AFILE }))
}));
const PATCHED_DAIMON = "const DAIMON_DATA = " + JSON.stringify(patchedDaimonData) + ";\nconst DAIMON_IMG_SIZES = " + JSON.stringify(daimonSizes) + ";\n";
console.log("（合成の aFile を " + afileTarget.key + " の最後の小問に足して検査します。本物の daimon_data.js は書きません）");
const cut = (src, needle, rep, what) => {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error("偽の実装を作れません（" + what + " が " + n + " 件）");
  return src.replace(needle, rep);
};
const FAKES = {
  a: ["大問を小問に開かない", s => cut(s, "  questionIds = expandDaimonIds(pool.map(i => QA_DATA[i].id));",
      "  questionIds = pool.map(i => QA_DATA[i].id);  /* ★偽の実装 */", "create-btn の並び")],
  b: ["うしろの小問まで出す", s => cut(s, "  g.items.slice(0, dm.pos).forEach((it, k) => {",
      "  g.items.forEach((it, k) => { if(k === dm.pos) return;  /* ★偽の実装: うしろの小問まで出す */", "前の小問")],
  // ★2026-09-28: b0dadd9 で renderBattleDaimon が renderDaimonBlock(prefix, ids, idx) に一般化され、
  //   "battle-daimon-fig" の決め打ちが els[prefix+"-daimon-fig"] に変わった。needle をそれに合わせる
  c: ["答えの図を先に出す", s => cut(s, "  if(dm.it.file) els[prefix+\"-daimon-fig\"].appendChild(daimonImg(dm.it.file));\n",
      "  if(dm.it.file) els[prefix+\"-daimon-fig\"].appendChild(daimonImg(dm.it.file));\n  if(dm.it.aFile) els[prefix+\"-daimon-afig\"].appendChild(daimonImg(dm.it.aFile));  /* ★偽の実装 */\n", "小問の図")],
  d: ["時間を2倍にしない", s => cut(s, "const DAIMON_TIME_FACTOR = 2;", "const DAIMON_TIME_FACTOR = 1;  /* ★偽の実装 */", "倍率")],
  // ★2026-10-10: 二人のホストのスキップは enterKidPhase で出す（showQuestion の hostPrivate の枝は通らなくなった）
  e: ["小問ではスキップを出さない（2026-09-27 の版）", s => cut(s, "    els[\"skip-btn\"].style.display = opened ? \"none\" : \"block\";",
      "    els[\"skip-btn\"].style.display = (opened || isDaimonItemId(id)) ? \"none\" : \"block\";  /* ★偽の実装 */", "スキップ")],
  f: ["対照 " + BASE_COMMIT + "（大問を対戦に出す前）", () => BASELINE]
};

const relay = await startFakeRelay({ broadcast: true, label: "daimonbattle" });
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
let SERVED = CURRENT;
function withFakeRelay(src) {
  const i0 = src.indexOf("const RELAY_URLS = [");
  const i1 = src.indexOf("];", i0);
  if (i0 < 0 || i1 < 0) throw new Error("RELAY_URLS が見つかりません");
  return src.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + src.slice(i1);
}
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(withFakeRelay(SERVED), "utf8")); return; }
  if (rel === "daimon_data.js") { res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-store" }); res.end(Buffer.from(PATCHED_DAIMON, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });

// ★仕込みはページの中で、条件で選ぶ（番号の決め打ちをしない）。選べなければ理由を返す
const SEED_HOST = () => {
  const now = Date.now();
  const u3 = QA_DATA.find(d => d.subj === "理科" && /^第3回\./.test(d.u) && d.kind !== "daimon").u;
  const qa3 = QA_DATA.filter(d => d.u === u3 && d.kind !== "daimon" && d.kind !== "calc");
  // ★2026-09-28: paper:true の大問（紙で出す）は QA_DATA/DAIMON_ITEM に入らないので候補から外す
  const G = DAIMON_DATA.filter(g => g.kai === 3 && !g.paper);
  // ★2026-09-28: 小問の q が重複する大問（同じ設問文を複数の空欄で共有する形。実データにある）は
  //   「うしろの小問が画面に無い」を文字列一致で見る自己テストと相性が悪い。q が全部ちがう大問だけを候補にする
  const uniqueQ = g => new Set(g.items.map(it => it.q)).size === g.items.length;
  const g1 = G.find(g => g.items.length >= 3 && g.items.length <= 6 && uniqueQ(g) && !g.items.some(it => it.aFile));
  // ★aFile を持つ大問が「紙で出す」に回り、非紙の中に1つも残らないことがある。
  //   その場合は代わりの大問で埋め、B4（aFile の表示タイミング）だけ省略する
  let g5 = G.find(g => g !== g1 && g.items.some((it, k) => it.aFile && k >= 1));
  if (!g5) g5 = G.find(g => g !== g1 && g.items.length >= 2 && uniqueQ(g));
  if (!g1 || !g5) return { err: "条件に合う大問がありません" };
  let af = g5.items.findIndex((it, k) => it.aFile && k >= 1);
  if (af < 0) af = g5.items.length - 1;
  const st = {};
  qa3.slice(1).forEach(d => { st[d.id] = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }; });
  const known = { correct: 1, wrong: 0, box: 1, lastCorrectAt: now - 5e8, lastAnswered: now - 5e8 };
  G.forEach(g => g.items.forEach(it => { st[it.id] = Object.assign({}, known); }));
  g1.items.slice(0, -1).forEach(it => delete st[it.id]);   // G1: 最後の小問だけ前回○
  g5.items.forEach((it, k) => { if (k !== af - 1) delete st[it.id]; });   // G5: aFile の1つ前だけ前回○
  // 他の回の記録も少し入れておく（★変わらないことを見るため）
  QA_DATA.filter(d => d.subj === "社会").slice(0, 30).forEach((d, k) => { st[d.id] = { correct: k, wrong: 1, box: k % 3, lastCorrectAt: now - k * 1e7, lastAnswered: now - k * 1e7 }; });
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  // ★2026-09-28: G1・G5 の出る順は DAIMON_DATA（＝QA_DATA）の並び順で決まる。決め打ちしない
  const g1First = G.indexOf(g1) < G.indexOf(g5);
  const g1Ids = g1.items.slice(0, -1).map(it => it.id);
  const g5Ids = g5.items.filter((it, k) => k !== af - 1).map(it => it.id);
  const plan = [qa3[0].id].concat(g1First ? g1Ids.concat(g5Ids) : g5Ids.concat(g1Ids));
  return { u3: u3, x: qa3[0].id, g1: g1.items.map(it => it.id), g5: g5.items.map(it => it.id), af: af,
           aFile: g5.items[af].aFile || null, plan: plan, g1Lead: g1.lead || "" };
};
const SETTINGS = ({ u3, n }) => {
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
    subject: "理科", unitsBySubject: { "理科": [u3] }, units: [u3], count: n, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, reviewAllUnits: true,
    headStartSec: 3, answerTimeSec: 2, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600
  }));
};

async function run(label, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    page.on("dialog", d => d.accept().catch(() => {}));
    await page.goto(PAGE_URL); await page.waitForTimeout(600);
    return { ctx, page, errs };
  };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const txt = (pg, sel) => pg.$eval(sel, e => (e.textContent || "").trim());
  const visible = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const waitVisible = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const shown = pg => pg.evaluate(() => (document.getElementById("battle-q-id").textContent || "").replace(/^No\./, ""));
  const screenText = pg => pg.evaluate(() => document.getElementById("screen-battle").textContent);
  const screenHtml = pg => pg.evaluate(() => document.getElementById("screen-battle").innerHTML);
  const aShown = pg => pg.evaluate(() => document.getElementById("battle-a-block").classList.contains("show"));
  const host = await mk(), guest = await mk();
  let S = null;
  try {
    S = await host.page.evaluate(SEED_HOST);
    if (S.err) throw new Error(S.err);
    if (!S.aFile) console.log("  （このデータには aFile 付きの非紙の大問が無いため、B4 は省略）");
    await host.page.evaluate(SETTINGS, { u3: S.u3, n: S.plan.length });
    await guest.page.evaluate(() => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 })); });
    // ★2026-10-08 答える時間はゲストの画面で測るので、ゲストも同じ秒数にする（一問一答はそれぞれの端末の秒数）
    await guest.page.evaluate(SETTINGS, { u3: S.u3, n: S.plan.length });
    await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(800); await guest.page.waitForTimeout(600);
    const statsBefore = await host.page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1")));
    // 小問のうしろにある小問（B2 で「まだ無い」を見る）: [いまの手の id] → 出てはいけない問題文
    const texts = await host.page.evaluate(() => { const m = {}; DAIMON_DATA.forEach(g => g.items.forEach(it => { m[it.id] = { q: it.q, a: it.a, g: g.key, lead: g.lead || "" }; })); return m; });
    // ★2026-10-08 choice-shuffle: 記号の小問は選択肢を入れかえて出す。問いは本文の1行目で、
    //   答え（「イ・カ」）は、元の記号が指す中身が「（新しい記号）（中身）」で画面にあるかで見る
    const choicesOf = s => { const re = /\(([ア-コ])\) ?|（([ア-コ])）|(?:^|[\s　])([ア-コ])[　 ]/g, mk = []; let m;
      while ((m = re.exec(s))) { if (/[〜~～]/.test(s.slice(m.index + m[0].length, m.index + m[0].length + 1)) || /[〜~～]/.test(s.slice(m.index - 1, m.index))) continue; mk.push({ lab: m[1] || m[2] || m[3], i: m.index + (/^[\s　]/.test(m[0]) ? 1 : 0), e: m.index + m[0].length }); }
      if (mk.length < 2 || mk.some((x, k) => x.lab !== "アイウエオカキクケコ"[k])) return null;
      return mk.map((x, k) => s.slice(x.e, k + 1 < mk.length ? mk[k + 1].i : s.length).trim()); };
    const hasQ = (tx, x) => tx.includes(texts[x].q.split("\n")[0]);
    const hasA = (tx, x) => { const a = texts[x].a; if (tx.includes(a)) return true;
      if (!/^[ア-コ](・[ア-コ])*$/.test(a)) return false;
      const ch = choicesOf(texts[x].q) || choicesOf(texts[x].lead || "");
      return !!ch && a.split("・").every(l => { const c = ch["アイウエオカキクケコ".indexOf(l)]; return c && new RegExp("[ア-コ]（" + c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "）").test(tx); }); };
    const later = id => { const G = S.g1.includes(id) ? S.g1 : S.g5; return G.slice(G.indexOf(id) + 1); };
    const earlier = id => { const G = S.g1.includes(id) ? S.g1 : S.g5; return G.slice(0, G.indexOf(id)); };
    check("【下じき】ホームの「二人で始める」が、答える小問で数えた " + S.plan.length + "問",
      (await txt(host.page, "#create-btn")).includes("（" + S.plan.length + "問"), await txt(host.page, "#create-btn"));

    // ---- 出会う ----
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await txt(host.page, "#room-code-display");
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVisible(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");

    const seqHost = [], seqGuest = [];
    // ★正解するまでぐるぐる: G5 の1つめの答える小問（✕にする）は、G5 の残りのうしろにもう一度出る
    const wrongFirst = S.plan.filter(x => S.g5.includes(x))[0];
    const expectSeq = (() => { const a = S.plan.slice(); let end = a.indexOf(wrongFirst); while (end + 1 < a.length && S.g5.includes(a[end + 1])) end++; a.splice(end + 1, 0, wrongFirst); return a; })();
    for (let t = 0; t < expectSeq.length; t++) {
      // ★2026-10-10 「わかった！」は無い。問題は両方に同時に出る → ホストの考える時間の帯が出て、答えが閉じているのを待つ
      await host.page.waitForFunction(() => { const e = document.getElementById("think-timer"); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null)
        && !document.getElementById("battle-a-block").classList.contains("show") && !document.getElementById("next-btn").classList.contains("show"); }, null, { timeout: 30000 });
      const id = await shown(host.page);
      seqHost.push(id);
      const isItem = !!texts[id];
      const skipVis = await visible(host.page, "#skip-btn");
      if (t === 0) check("B6 一問一答ではスキップが出る（下じき）", skipVis && !isItem, id);
      else if (isItem) check("★B6 小問 " + id + " でもスキップが出る", skipVis);
      // ★B7 ゲストの画面に、前の大問のリード文が残っていない（大問が変わった手だけ・リード文がある大問だけ）
      if (t > 0 && S.g1Lead && !S.g1.includes(id)) {
        const gt = await screenText(guest.page);
        check("B7 ゲストの画面に、前の大問（G1）のリード文が残っていない（手 " + (t + 1) + "）", !gt.includes(S.g1Lead.slice(0, 15)), id);
      }
      // 考える時間（★2倍）。二人では切れても何も起きない
      const thinkSec = await host.page.evaluate(() => { const e = document.getElementById("think-timer"); return e && getComputedStyle(e).display !== "none" ? +e.dataset.sec : null; });
      if (isItem && S.g1.indexOf(id) === 0) check("★B5 考える時間: 小問の帯は6秒（3秒×2）", thinkSec === 6, thinkSec);
      if (isItem && S.g1.indexOf(id) === 1) {
        await host.page.waitForTimeout(6800);
        const idle = { same: (await shown(host.page)) === id, open: await aShown(host.page), skip: await visible(host.page, "#skip-btn"), guestSame: (await shown(guest.page)) === id };
        check("★B5 考える時間が切れても（6.8秒たっても）同じ小問・ホストの答えは閉じたまま・スキップも残る（後ろに回らない）", idle.same && !idle.open && idle.skip && idle.guestSame, JSON.stringify(idle));
      }
      await guest.page.waitForFunction(i => (document.getElementById("battle-q-id").textContent || "") === "No." + i
        && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 });
      seqGuest.push(await shown(guest.page));
      // ---- 答えが開く前 ----
      if (isItem) {
        for (const pg of [host.page, guest.page]) {
          const who = pg === host.page ? "ホスト" : "ゲスト";
          const tx = await screenText(pg), html = await screenHtml(pg);
          // ★2026-10-10 親（ゲスト）には最初から答えが開いている（guestPeek＝ホストが最後の手の答えを開いたときと同じ見え方）ので、
          //   うしろの前回○の小問・出し直しで既に答えた小問は見えてよい。見えてはいけないのは「まだ出ていない、答える小問」
          const leak = later(id).filter(x => hasQ(tx, x) && (pg === host.page || (S.plan.includes(x) && !seqHost.includes(x))));
          check("★B2 " + who + " " + id + ": 答える前に、うしろの小問が画面に無い", leak.length === 0, leak.join(","));
          // ★✕で「あとでもう一度出る」小問は答えを出さない（前からの決まり）ので、ここでは見ない
          const pendingWrong = seqHost.filter(x => x === wrongFirst).length === 1 && id !== wrongFirst ? wrongFirst : null;
          const prevMissing = earlier(id).filter(x => x !== pendingWrong && !(hasQ(tx, x) && hasA(tx, x)));
          if (earlier(id).length) check("B3 " + who + " " + id + ": 前の小問（前回○をふくむ）が答えつきで出ている", prevMissing.length === 0, prevMissing.join(","));
          // ★2026-10-10 親（ゲスト）には最初から答えが見える（guestPeek）ので、答えの図が「親の判定の前に無い」のはホストだけ
          if (S.aFile && S.g5[S.af] === id && pg === host.page) check("★B4 " + who + " 答えの図は、親が判定する前は画面に無い", !html.includes(S.aFile));
        }
        if (S.g1.indexOf(id) === S.g1.length - 2) await shot(guest.page, "guest_before_last_g1");
      }
      // ---- 親（ゲスト）が〇✕を押すまで、子ども（ホスト）の答えは開かない ----
      // ★2026-10-10 から二人のときは、ゲストに最初から答えと〇✕が出ている。ホストに「こたえを見る」「〇✕」は無い
      await waitVisible(guest.page, "#judge-row", 30000);
      const hostWrong = id === wrongFirst && seqHost.filter(x => x === wrongFirst).length === 1;
      check("R ホスト " + id + ": ゲストが判定するまで答えは開かない", !(await aShown(host.page)));
      await tap(guest.page, hostWrong ? "#judge-ng" : "#judge-ok");
      await host.page.waitForFunction(() => document.getElementById("battle-a-block").classList.contains("show"), null, { timeout: 20000 });
      if (isItem) {
        const html = await screenHtml(host.page), tx = await screenText(host.page);
        if (S.aFile && S.g5[S.af] === id) check("★B4 答えを開いたら、答えの図が出る", html.includes(S.aFile));
        if (S.g1.indexOf(id) === S.g1.length - 2) {
          const tail = S.g1[S.g1.length - 1];
          check("★B3 大問の最後の手の答えを開くと、うしろの前回○の小問が答えつきで出る", hasQ(tx, tail) && hasA(tx, tail), tail);
          await shot(host.page, "host_after_last_g1");
        }
      }
      // ---- ホストには〇✕（親の判定）が出ない・そのまま「つぎへ」 ----
      await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
      check("R ホスト " + id + ": 〇✕は出ない（親が判定した）", !(await visible(host.page, "#judge-row")));
      if (t === 0) check("B1 分母は答える小問で数えた " + S.plan.length, (await txt(host.page, "#battle-counter")) === "1 / " + S.plan.length, await txt(host.page, "#battle-counter"));
      if (id === wrongFirst && seqHost.filter(x => x === wrongFirst).length === 2) check("★B9 ✕にした小問は同じラウンドでもう一度出る・分母は最初の数のまま・「もう一度」の印（" + (await txt(host.page, "#battle-counter")) + "）", (await txt(host.page, "#battle-counter")).endsWith(" / " + S.plan.length) && /もう一度/.test(await txt(host.page, "#battle-left")), await txt(host.page, "#battle-left"));
      await tap(host.page, "#next-btn");
    }
    check("★B1 ホストの手の並びが「X → G1 の答える小問 → G5 の答える小問（✕にした小問は G5 の残りのうしろにもう一度）」（前回○は手にならない）", JSON.stringify(seqHost) === JSON.stringify(expectSeq), JSON.stringify(seqHost));
    check("★B1 ゲストの手の並びがホストと同じ", JSON.stringify(seqGuest) === JSON.stringify(seqHost), JSON.stringify(seqGuest));
    // ---- B8 記録 ----
    const statsAfter = await host.page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1")));
    const changed = Object.keys(Object.assign({}, statsBefore, statsAfter)).filter(k => JSON.stringify(statsBefore[k]) !== JSON.stringify(statsAfter[k]));
    const expectChanged = S.plan.slice().sort();
    check("★B8 ホストで記録が変わったのは、この対戦の5手だけ（ほかの一問一答・前回○の小問は1文字も変わらない）",
      JSON.stringify(changed.sort()) === JSON.stringify(expectChanged), "変わった=" + changed.join(","));
    const wrongId = S.plan.filter(x => S.g5.includes(x))[0];
    check("B8 ✕にされた小問は、連続正解数0・まちがい1", statsAfter[wrongId] && statsAfter[wrongId].box === 0 && statsAfter[wrongId].wrong === 1, JSON.stringify(statsAfter[wrongId]));
    // ---- B9 もう一勝負は出ない（★#18 から。同じラウンドで正解するまで回った）----
    await host.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 20000 }).catch(() => {});
    check("★B9 結果画面に「まちがえた問題だけもう一勝負」は出ない", !(await visible(host.page, "#result-retry-battle-btn")) && wrongId === wrongFirst);
    // ---- B10 ----
    for (const [who, pg] of [["ホスト", host.page], ["ゲスト", guest.page]]) {
      const ov = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check("B10 " + who + " 横のはみ出し 0", ov <= 0, ov + "px");
    }
    check("B10 画面のエラー0（ホスト）", host.errs.length === 0, host.errs.join(" | "));
    check("B10 画面のエラー0（ゲスト）", guest.errs.length === 0, guest.errs.join(" | "));
  } catch (e) {
    check("通しが最後まで走った", false, String((e && e.message) || e).split("\n")[0]);
    await shot(host.page, "ERR_host"); await shot(guest.page, "ERR_guest");
  } finally { await host.ctx.close(); await guest.ctx.close(); }
  return out;
}

function report(title, out) {
  console.log("\n── " + title + " ──");
  let ng = 0;
  for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.name + (c.extra ? " … " + c.extra : "")); if (!c.ok) ng++; }
  return ng;
}
const done = async code => { await browser.close(); server.close(); relay.close(); process.exit(code); };
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
