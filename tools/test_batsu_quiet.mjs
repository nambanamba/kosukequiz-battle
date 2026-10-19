// 「やっぱり ✕ に直す」を親が押したとき、子ども（ホスト）の端末に ✕ の知らせ
// （大きな✕・不正解の音・不正解の文）が出ないことを確かめる。記録は✕で残ること、〇に直すと従来どおり知らせが出ることも見る。
// 使い方: node tools/test_batsu_quiet.mjs [index.htmlのパス]   （直す前の版を渡すと「鳴る＝失敗」になる）
import fs from "fs";
import { fileURLToPath } from "node:url";
const INDEX = process.argv[2] || fileURLToPath(new URL("../index.html", import.meta.url));
const HTML = fs.readFileSync(INDEX, "utf8");
const m = HTML.match(/^function applyJudgeFixOnHost\(data\)\{/m);
if(!m) throw new Error("applyJudgeFixOnHost が見つかりません");
const rest = HTML.slice(m.index);
const src = rest.slice(0, rest.search(/\r?\n\}\r?\n/)).replace(/\r/g,"") + "\n}\n";

function run(correctNow, fixTo){
  const calls = [], sent = [];
  const st = {
    lastHostRecord: {qid:"q1", idx:0, rawCorrect:correctNow, statBefore:null, norecord:false, forcedWrong:false, requeued:false, sp:false},
    stats:{}, myMissesThisRound:[], questionIds:["q1","q2"], currentIndex:0, scored:true,
    scores:{host:1,guest:0}, opponentVerdictOfMe:correctNow,
  };
  const env = {
    isPartId:()=>false, recRestore(){}, recordResult(q,c){ st.stats[q]=c; }, studyLogFix(){}, spBonus(){},
    battleUnrequeue(){}, battleRequeue(){}, isRepeatInRound:()=>false, saveBattleSession(){}, updateScoreUI(){},
    updateMyResultUI(){ calls.push("updateMyResultUI"); }, showBigVerdict(){ calls.push("showBigVerdict"); },
    playMissSound(){ calls.push("playMissSound"); }, playChime(){ calls.push("playChime"); },
    judgefixAction:{send(x){ sent.push(x); }},
  };
  const fn = new Function("st","env", "with(env){ let stats=st.stats, lastHostRecord=st.lastHostRecord, myMissesThisRound=st.myMissesThisRound, questionIds=st.questionIds, currentIndex=st.currentIndex, scored=st.scored, scores=st.scores, opponentVerdictOfMe=st.opponentVerdictOfMe; " + src + "\n applyJudgeFixOnHost({qid:'q1',idx:0,correct:"+fixTo+"}); return {rec:stats.q1}; }");
  const out = fn(st, env);
  return {calls, sent, rec: out.rec};
}
let bad = 0;
const ck = (n, ok)=>{ console.log((ok?"✔ ":"✘ ")+n); if(!ok) bad++; };
const x = run(true, false);
ck("〇→✕に直す: 記録は✕で残る", x.rec === false);
ck("〇→✕に直す: 子どもの端末に知らせ（文・大きな✕・音）が出ない", x.calls.length === 0);
ck("〇→✕に直す: 親への返事（ack ok）は返る", x.sent.length === 1 && x.sent[0].ok === true && x.sent[0].correct === false);
const y = run(false, true);
ck("✕→〇に直す: 従来どおり知らせが出る", y.calls.includes("updateMyResultUI") && y.rec === true);
process.exit(bad ? 1 : 0);
