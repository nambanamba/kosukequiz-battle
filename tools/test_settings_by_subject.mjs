// index.html から実物の loadSettings / saveSettings / switchSubject / 科目別設定の
// 関数群をそのまま抜き出して読み込み、localStorage を偽物に差しかえて動かすテスト。
// コピーではなく実コードを読むので、index.html を直せばこのテストもその内容で動く。
//
// 使い方:
//   node test_settings_by_subject.mjs [index.htmlのパス]
//   （省略時は G:\マイドライブ\四谷大塚\kosukequiz-battle\index.html）
//
import fs from "fs";
import { fileURLToPath } from "node:url";

// 既定は、このスクリプトの1つ上（リポジトリのルート）の index.html。
// フォルダごと移動しても動くよう、絶対パスは決め打ちしない
const INDEX = process.argv[2] ||
  fileURLToPath(new URL("../index.html", import.meta.url));
const HTML = fs.readFileSync(INDEX, "utf8");

// index.html から対象の関数だけを名前で切り出す。行番号で固定すると index.html を
// 直したとたんにズレるので、宣言の位置から「行頭の }」までを取る
function cut(startRe){
  const m = HTML.match(startRe);
  if(!m) throw new Error("見つかりません: " + startRe);
  const rest = HTML.slice(m.index);
  const end = rest.search(/\r?\n\}\r?\n/);
  if(end === -1) throw new Error("終わりが見つかりません: " + startRe);
  return rest.slice(0, end).replace(/\r/g,"") + "\n}\n";
}
const REAL = [
  HTML.match(/let settingsBySubject = \{\};/)[0],
  cut(/^function collectSubjectSettings\(\)\{/m),
  cut(/^function rememberSubjectSettings\(\)\{/m),
  cut(/^function restoreSubjectSettings\(subject\)\{/m),
  cut(/^function loadSettings\(\)\{/m),
  cut(/^function saveSettings\(\)\{/m),
  cut(/^function switchSubject\(subject\)\{/m)
].join("\n");

function newApp(storageSeed){
  // --- 偽の localStorage（アプリを閉じて開き直す＝この中身だけが残る） ---
  const store = Object.assign({}, storageSeed);
  const ctx = {
    window: { localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); }
    }},
    console,
    SETTINGS_KEY: "kq_battle_settings_v1", // index.html 2616行の定義と同じ
    // --- 単元まわりは今回の対象外なので最小限のスタブ ---
    UNITS_BY_SUBJECT: { "社会": ["社1","社2"], "理科": ["理1","理2"] },
    getUnitsForSubject(s){ return this.UNITS_BY_SUBJECT[s] || []; },
    getUnits(){ return this.getUnitsForSubject(this.currentSubject); },
    renderUnitChoices(){}, refreshStatRow(){}, applySettingsUI(){},
    // --- 実物の既定値（index.html の宣言と同じ） ---
    currentSubject: "社会",
    selectedUnits: new Set(["社1","社2"]),
    questionCount: "all", currentShuffle: true,
    // ★★ 2026-09-26: 出題モードが「段の選択」になった。
    //   旧 filterUnmastered / filterWeak は **tiersFromSaved() の中だけ**が知っている。
    //   ★このテストは index.html から関数を取り出して動かすので、
    //   **新しい変数と、移行の部品も同じ名前で用意する**必要がある
    selectedTiers: new Set([0, 1, 2]),
    pendingMigrationNotes: [],
    reviewAllUnitsDone: true,   // ★復習単元の移行はこのテストの対象外（済み扱い）
    migrateReviewUnitsToAll(){},
    tiersFromSaved(s2){
      // ★ index.html と同じ規則。★ここは「写し」になるので、
      //   本体を直したらここも見直すこと（確認ポイント 4-6d）。
      //   ⚠★このテストが見ているのは「保存と復元」だけで、段の意味ではありません。
      //   段の意味は tools/mikaku/tier_align_probe.mjs が見ています
      if(Array.isArray(s2.tiers)) return new Set(s2.tiers);
      const un = s2.filterUnmastered === true, wk = s2.filterWeak === true;
      if(un) return new Set([0, 1]);
      if(wk) return new Set([1]);
      return new Set([0, 1, 2]);
    },
    currentType: "all", currentPriority: "all", currentLevel: "all",
    reviewMode: false, fairMode: false,
    headStartSec: 3, answerTimeSec: 20, judgeTimeSec: 10,
    nextTimeSec: 5, skipNextTimeSec: 5,
    reviewSelectedUnits: new Set(), reviewUnitsKnown: new Set(),
    reviewPriority: "all", reviewLevel: "all", reviewType: "all",
    unitSelectionBySubject: {},
    rememberUnitSelection(){ this.unitSelectionBySubject[this.currentSubject] = new Set(this.selectedUnits); },
    restoreUnitSelection(subject){
      const saved = this.unitSelectionBySubject[subject];
      return saved ? new Set(saved) : new Set(this.getUnitsForSubject(subject));
    },
    _store: store
  };
  // 実コードを ctx の上で評価する。with(ctx) の中で宣言された function / let は
  // with より内側のスコープになるので、外から使えるよう明示的に取り出して ctx に載せる
  const NAMES = ["settingsBySubject","collectSubjectSettings","rememberSubjectSettings",
                 "restoreSubjectSettings","loadSettings","saveSettings","switchSubject"];
  const src = REAL + "\n;return {" + NAMES.map(n=>n+":"+n).join(",") + "};";
  const run = new Function("ctx", "with(ctx){ " + src + " }");
  const inner = run(new Proxy(ctx, {
    // ctx にある名前だけ with に横取りさせる。true を返しきると Object や JSON まで
    // ctx から引こうとして undefined になる
    has: (t,k) => k in t,
    get: (t,k) => t[k],
    set: (t,k,v) => { t[k] = v; return true; }
  }));
  // settingsBySubject は loadSettings/saveSettings が中身を書きかえるだけで
  // 別のオブジェクトに置きかえないので、この参照のまま覗いてよい
  Object.assign(ctx, inner);
  return ctx;
}

let pass = 0, fail = 0;
// ★ 2026-09-26: 段の選択は Set なので、比べやすいよう文字列にする
const T = a => Array.from(a.selectedTiers).sort().join(",");
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "  ✅ " : "  ❌ ") + name + "  got=" + JSON.stringify(got) + (ok ? "" : " want=" + JSON.stringify(want)));
  ok ? pass++ : fail++;
}

// ============ 1. 科目を切りかえたとき、それぞれの前回値にもどるか ============
console.log("\n【1】科目を切りかえたとき、問題数とフィルタが科目ごとの前回値になるか");
{
  const a = newApp({});
  a.loadSettings();
  // 社会で「20問・にがて絞りON」にする
  a.questionCount = 20; a.selectedTiers = new Set([1]); a.currentLevel = "基礎";   // ★旧 filterWeak=true 相当
  a.saveSettings();
  // 理科に切りかえて「10問・にがて絞りOFF」にする
  a.switchSubject("理科");
  check("理科に切りかえた直後は理科の既定値", [a.questionCount, T(a), a.currentLevel], ["all", "0,1,2", "all"]);
  a.questionCount = 10; a.selectedTiers = new Set([0, 1, 2]); a.currentLevel = "発展";
  a.saveSettings();
  // 社会にもどす
  a.switchSubject("社会");
  check("社会にもどすと社会の前回値", [a.questionCount, T(a), a.currentLevel], [20, "1", "基礎"]);
  a.switchSubject("理科");
  check("もう一度理科にすると理科の前回値", [a.questionCount, T(a), a.currentLevel], [10, "0,1,2", "発展"]);
}

// ============ 2. 閉じて開き直しても両科目の設定が残るか ============
console.log("\n【2】アプリを閉じて開き直したあとも、両方の科目の設定が保たれるか");
{
  const a = newApp({});
  a.loadSettings();
  a.questionCount = 30; a.selectedTiers = new Set([0, 1]); a.currentPriority = "高";
  a.saveSettings();
  a.switchSubject("理科");
  a.questionCount = 10; a.selectedTiers = new Set([0, 1, 2]); a.currentPriority = "低";
  a.currentShuffle = false; a.reviewMode = true; a.currentType = "image";
  a.saveSettings();
  // ここで「閉じる」。localStorage の中身だけを引きついで開き直す
  const b = newApp(a._store);
  b.loadSettings();
  check("開き直した直後は理科（最後に使った科目）", b.currentSubject, "理科");
  check("理科の設定が残っている",
    [b.questionCount, T(b), b.currentPriority, b.currentShuffle, b.reviewMode, b.currentType],
    [10, "0,1,2", "低", false, true, "image"]);
  b.switchSubject("社会");
  check("社会の設定も残っている",
    [b.questionCount, T(b), b.currentPriority],
    [30, "0,1", "高"]);
}

// ============ 3. 後方互換：旧フラット形式の設定が消えないか ============
console.log("\n【3】旧バージョンのフラットな設定が、社会・理科の両方に引きつがれるか（設定が消えない）");
{
  // 科目別を持っていなかったころの保存内容そのもの
  const old = JSON.stringify({
    subject: "社会",
    units: ["社1"],
    filterUnmastered: true, filterWeak: true,
    type: "text", priority: "中", level: "標準",
    // ★ここに `reviewMixCount: 7` が残っているのは、**わざとです**。
    //   2026-09-26（午後）に「最低出題数」を概念ごと廃止したので、
    //   ★**このキーはもう読まれません**。確かめているのは
    //   「★知らないキーが混じっていても、**他の設定が壊れない**」ことだけです。
    shuffle: false, count: 30, reviewMixCount: 7, reviewMode: true,
    fairMode: true, headStartSec: 9, answerTimeSec: 45
  });
  const a = newApp({ "kq_battle_settings_v1": old });
  a.loadSettings();
  check("社会は旧設定をそのまま引きつぐ",
    [a.questionCount, T(a), a.currentType, a.currentPriority, a.currentLevel, a.currentShuffle, a.reviewMode],
    [30, "0,1", "text", "中", "標準", false, true]);   // ★旧「両方ON」→ 1段目+2段目
    // ★ 2026-09-26（午後）: minTotalCount は概念ごと廃止。読みません
  a.switchSubject("理科");
  check("理科にも旧設定が初期値として引きつがれる（初期値に戻らない）",
    [a.questionCount, T(a), a.currentType, a.currentPriority, a.currentLevel, a.currentShuffle, a.reviewMode],
    [30, "0,1", "text", "中", "標準", false, true]);   // ★旧「両方ON」→ 1段目+2段目
    // ★ 2026-09-26（午後）: minTotalCount は概念ごと廃止。読みません
  check("科目共通のままにした時間設定・公平モードは維持",
    [a.fairMode, a.headStartSec, a.answerTimeSec], [true, 9, 45]);
  // 理科だけ変えても社会は動かない
  a.questionCount = 10; a.saveSettings();
  a.switchSubject("社会");
  check("引きつぎ後は科目ごとに分かれて動く", a.questionCount, 30);
}

// ============ 4. 旧バージョンのindex.htmlがキャッシュから開かれても壊れないか ============
console.log("\n【4】新形式で保存したものを、旧バージョン（フラットしか読まない）が読めるか");
{
  const a = newApp({});
  a.loadSettings();
  a.questionCount = 20; a.selectedTiers = new Set([1]);
  a.saveSettings();
  const saved = JSON.parse(a._store["kq_battle_settings_v1"]);
  check("フラットなキーも今の科目の値で書かれている", [saved.count, (saved.tiers || []).join(",")], [20, "1"]);
  check("settingsBySubject も書かれている", Object.keys(saved.settingsBySubject).sort(), ["理科","社会"].sort());
  check("旧互換の units も残っている", Array.isArray(saved.units), true);
}

// ============ 5. 壊れた保存データでも落ちないか ============
console.log("\n【5】保存データが壊れていても落ちないか");
{
  const a = newApp({ "kq_battle_settings_v1": "{壊れたJSON" });
  let threw = null;
  try { a.loadSettings(); } catch(e){ threw = String(e); }
  check("例外を投げない", threw, null);
  check("既定値で動く", [a.questionCount, a.currentSubject], ["all", "社会"]);
  a.switchSubject("理科");
  check("壊れていても科目切りかえができる", a.currentSubject, "理科");
}

console.log("\n===== 合計: " + pass + " 件成功 / " + fail + " 件失敗 =====");
process.exit(fail ? 1 : 0);
