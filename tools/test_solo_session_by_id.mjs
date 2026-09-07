// kosukequiz-battle の「中断したひとり練習」の保存・復元をテストする。
// index.html から実物の saveSoloSession / loadSoloSession / restoreSoloSession を
// 名前で切り出して動かすので、コピーではなく実コードを検証する。
//
// ここが壊れると、中断中の練習を再開したときに別の問題が出て、
// 成績も別の問題に紐づくため、問題を配列の途中に足す前に必ず通すこと。
//
// 使い方:
//   node test_solo_session_by_id.mjs [index.htmlのパス]
//
import fs from "fs";
import { fileURLToPath } from "node:url";

// 既定は、このスクリプトの1つ上（リポジトリのルート）の index.html。
// フォルダごと移動しても動くよう、絶対パスは決め打ちしない
const INDEX = process.argv[2] ||
  fileURLToPath(new URL("../index.html", import.meta.url));
const HTML = fs.readFileSync(INDEX, "utf8");

function cut(startRe){
  const m = HTML.match(startRe);
  if(!m) throw new Error("見つかりません: " + startRe);
  const rest = HTML.slice(m.index);
  const end = rest.search(/\r?\n\}\r?\n/);
  if(end === -1) throw new Error("終わりが見つかりません: " + startRe);
  return rest.slice(0, end).replace(/\r/g,"") + "\n}\n";
}
const REAL = [
  HTML.match(/const SOLO_SESSION_VERSION = \d+;/)[0],
  cut(/^function saveSoloSession\(\)\{/m),
  cut(/^function loadSoloSession\(\)\{/m),
  cut(/^function restoreSoloSession\(session\)\{/m)
].join("\n");

// 問題データの見立て。id と並び順を別々に動かせるようにしてある
function makeQA(ids){ return ids.map(id => ({id: id, q: "問"+id, u: "単元", subj: "社会"})); }

function newApp(qaIds, storageSeed){
  const store = Object.assign({}, storageSeed);
  const ctx = {
    window: { localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    }},
    console,
    SOLO_SESSION_KEY: "kq_battle_solo_session_v1",
    QA_DATA: makeQA(qaIds),
    quizQueue: [], quizPos: 0, quizResults: [],
    reviewMode: false, inSoloRetryRound: false,
    _store: store
  };
  const NAMES = ["saveSoloSession","loadSoloSession","restoreSoloSession"];
  const src = REAL + "\n;return {" + NAMES.map(n=>n+":"+n).join(",") + "};";
  const run = new Function("ctx", "with(ctx){ " + src + " }");
  Object.assign(ctx, run(new Proxy(ctx, {
    has: (t,k) => k in t,
    get: (t,k) => t[k],
    set: (t,k,v) => { t[k] = v; return true; }
  })));
  return ctx;
}

let pass = 0, fail = 0;
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "  ✅ " : "  ❌ ") + name + "  got=" + JSON.stringify(got) + (ok ? "" : " want=" + JSON.stringify(want)));
  ok ? pass++ : fail++;
}
// 復元した中断データが「どの問題を指しているか」を id で見る
function queueIds(app, s){ return s.quizQueue.map(i => app.QA_DATA[i].id); }
function resultIds(app, s){ return s.quizResults.map(r => app.QA_DATA[r.idx].id); }

const BASE = ["q01","q02","q03","q04","q05"];

// ============ 1. ふつうに中断して再開できるか ============
console.log("\n【1】中断したところから、同じ問題で再開できるか");
{
  const a = newApp(BASE);
  a.quizQueue = [0,1,2,3,4]; a.quizPos = 2;
  a.quizResults = [{idx:0, correct:true, recorded:true}, {idx:1, correct:false, recorded:false}];
  a.saveSoloSession();
  const b = newApp(BASE, a._store);            // 閉じて開き直す
  const s = b.restoreSoloSession(b.loadSoloSession());
  check("出題の並びが同じ", queueIds(b,s), ["q01","q02","q03","q04","q05"]);
  check("どこまで進んだかが同じ", s.quizPos, 2);
  check("解答済みの問題が同じ", resultIds(b,s), ["q01","q02"]);
  check("正誤も保たれている", s.quizResults.map(r=>r.correct), [true,false]);
}

// ============ 2. ★問題を途中に挿入しても、同じ問題で再開できるか ============
console.log("\n【2】★問題を配列の途中に足しても、再開したとき同じ問題が出るか（今回の修正の本題）");
{
  const a = newApp(BASE);
  a.quizQueue = [2,3,4]; a.quizPos = 1;        // q03,q04,q05 を解いていて q04 の途中
  a.quizResults = [{idx:2, correct:true, recorded:true}];
  a.saveSoloSession();
  // データ更新で q01 と q02 のあいだに新しい問題が入り、以降の添字が1つずれる
  const AFTER = ["q01","q_new","q02","q03","q04","q05"];
  const b = newApp(AFTER, a._store);
  const s = b.restoreSoloSession(b.loadSoloSession());
  check("再開しても同じ問題が並んでいる", queueIds(b,s), ["q03","q04","q05"]);
  check("添字は正しくずれている（1,2,3ではなく3,4,5）", s.quizQueue, [3,4,5]);
  check("解答済みも同じ問題を指している", resultIds(b,s), ["q03"]);
  check("進んだ位置も同じ", s.quizPos, 1);
}

// ============ 3. 問題が消えたとき、残りだけで再開できるか ============
console.log("\n【3】出題中の問題がデータから消えたとき、残りだけで再開できるか");
{
  const a = newApp(BASE);
  a.quizQueue = [0,1,2,3,4]; a.quizPos = 3;
  a.quizResults = [{idx:0,correct:true,recorded:true},{idx:1,correct:true,recorded:true},{idx:2,correct:false,recorded:false}];
  a.saveSoloSession();
  const AFTER = ["q01","q03","q05"];           // q02 と q04 が消えた
  const b = newApp(AFTER, a._store);
  const s = b.restoreSoloSession(b.loadSoloSession());
  check("消えた問題は取りのぞかれる", queueIds(b,s), ["q01","q03","q05"]);
  check("済んだ問題数も数え直される（3問中q02が消えたので2）", s.quizPos, 2);
  check("消えた問題の解答結果も取りのぞかれる", resultIds(b,s), ["q01","q03"]);
}

// ============ 4. 古い形式（添字で保存していたころ）は捨てるか ============
console.log("\n【4】添字で保存していた古い中断データは、読まずに捨てるか");
{
  // 修正前の形式そのもの。これをそのまま復元すると別の問題が出る
  const oldFormat = JSON.stringify({
    quizQueue: [0,1,2,3,4], quizPos: 2,
    quizResults: [{idx:0,correct:true,recorded:true}],
    reviewMode: false, inSoloRetryRound: false
  });
  const b = newApp(BASE, { "kq_battle_solo_session_v1": oldFormat });
  const s = b.restoreSoloSession(b.loadSoloSession());
  check("古い形式は復元しない（nullを返す）", s, null);
}

// ============ 5. 壊れたデータ・空データで落ちないか ============
console.log("\n【5】壊れたデータや空のデータで落ちないか");
{
  const cases = {
    "壊れたJSON": "{こわれた",
    "空オブジェクト": "{}",
    "quizIdsが配列でない": JSON.stringify({v:2, quizIds:"abc", quizPos:0}),
    "全部のidが今のデータに無い": JSON.stringify({v:2, quizIds:["zzz","yyy"], quizPos:1, quizResults:[]})
  };
  Object.keys(cases).forEach(name=>{
    const b = newApp(BASE, { "kq_battle_solo_session_v1": cases[name] });
    let got, threw = null;
    try { got = b.restoreSoloSession(b.loadSoloSession()); } catch(e){ threw = String(e); }
    check(name + " → 落ちずに null", [threw, got], [null, null]);
  });
}

// ============ 6. 保存した内容が id になっているか（添字が残っていないか） ============
console.log("\n【6】保存された中身が、添字ではなく id になっているか");
{
  const a = newApp(BASE);
  a.quizQueue = [1,3]; a.quizPos = 1;
  a.quizResults = [{idx:1, correct:true, recorded:true}];
  a.saveSoloSession();
  const saved = JSON.parse(a._store["kq_battle_solo_session_v1"]);
  check("バージョンが入っている", saved.v, 2);
  check("出題順が id で保存されている", saved.quizIds, ["q02","q04"]);
  check("解答結果も id で保存されている", saved.quizResults.map(r=>r.id), ["q02"]);
  check("添字(quizQueue/idx)は保存されていない",
    [saved.quizQueue === undefined, saved.quizResults.every(r=>r.idx === undefined)], [true, true]);
}

console.log("\n===== 合計: " + pass + " 件成功 / " + fail + " 件失敗 =====");
process.exit(fail ? 1 : 0);
