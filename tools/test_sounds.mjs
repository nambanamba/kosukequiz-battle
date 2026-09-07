// kosukequiz-battle の音まわりをテストする。
// index.html から実物の queueSound / playNotes と、4つの音の関数を切り出して動かす。
// AudioContext は偽物に差しかえ、「いつ・どの高さの音が・どれだけ鳴ったか」を記録する。
//
// 確かめること:
//   - 正解音・不正解音・わかった通知が、それぞれ別の音になっているか（同じだと区別がつかない）
//   - 3つ以上が同時に鳴らないか（重なるとどれも何の音か分からなくなる）
//   - 不正解音が正解音より短く・小さいか（責める音にしない、という方針）
//
// 使い方:
//   node test_sounds.mjs [index.htmlのパス]
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
function cutConst(name){
  const m = HTML.match(new RegExp("^const " + name + " = \\d+;", "m"));
  if(!m) throw new Error("見つかりません: const " + name);
  return m[0];
}
const REAL = [
  "let soundBusyUntil = 0;",
  cut(/^function queueSound\(playNow, ms\)\{/m),
  // playNotes は切り出さない。ctx 側の記録用に差しかえて、
  // 各音が「どんな音符を渡したか」を見る（with の中に宣言があると差しかえが効かないため）
  cutConst("CHIME_MS"), cut(/^function playChime\(\)\{/m),
  cutConst("MISS_MS"),  cut(/^function playMissSound\(\)\{/m),
  cutConst("CUE_MS"),   cut(/^function playAdvanceCue\(\)\{/m),
  cutConst("ATTACK_MS"), cut(/^function playAttackSound\(\)\{/m),
  cut(/^function playAttackSoundNow\(\)\{/m)
].join("\n");

// 偽の AudioContext。鳴らした音を記録するだけ
function newAudio(){
  const played = [];
  let clock = 0;
  const ctx = {
    played,
    tick(ms){ clock += ms; },     // 時間を進める
    nowMs(){ return clock; },
    audioCtx: {
      currentTime: 0,
      // アタック音だけは playNotes を通さず、じかにオシレータを作って
      // 周波数を下げていく（220→55Hz）作りなので、ここでも記録できるようにしておく
      createOscillator(){
        const o = {type:"", frequency:{value:0,
          setValueAtTime(v){o.frequency.value=v;}, exponentialRampToValueAtTime(){}},
          connect(){return o;},
          start(t){ o._start=t; if(ctx.onOsc) ctx.onOsc(o); },
          stop(t){o._stop=t;}};
        return o;
      },
      createGain(){
        const g = {gain:{_peak:0,
          setValueAtTime(){},
          exponentialRampToValueAtTime(v){ if(v > g.gain._peak) g.gain._peak = v; }},
          connect(){return {};}};
        g._isGain = true;
        return g;
      },
      destination: {}
    }
  };
  return ctx;
}

// setTimeout を、テストが時間を進めたときだけ動く偽物に差しかえる
function makeHarness(){
  const audio = newAudio();
  let now = 0;
  const pending = [];
  const notesLog = [];
  const ctx = Object.assign(audio, {
    Date: {now: ()=>now},
    setTimeout: (fn, ms)=>{ pending.push({at: now + ms, fn}); },
    // playNotes は実物を使うが、鳴らした内容を記録できるよう destination を覗く
    _log: notesLog
  });
  // アタック音（playNotes を通らない）が鳴ったときの記録
  ctx.onOsc = (o)=>{
    notesLog.push({at: now, notes: [o.frequency.value], gains: [1], type: o.type, peak: null, len: 0.25, attack: true});
  };
  // 記録用の playNotes。実物の各音の関数が、これに音符を渡してくる
  ctx.playNotes = (notes, type, peak)=>{
    if(!ctx.audioCtx) return;      // 実物と同じく、音が使えないときは何もしない
    notesLog.push({at: now, notes: notes.map(n=>n.f), type, peak,
                   gains: notes.map(n=>n.g === undefined ? 1 : n.g),
                   len: Math.max(...notes.map(n=>n.t+n.d))});
  };
  const inner = new Function("ctx", "with(ctx){ " + REAL +
    "\n;return {playChime, playMissSound, playAdvanceCue, playAttackSound,"
    + " peek:()=>soundBusyUntil}; }")(
    new Proxy(ctx, {has:(t,k)=>k in t, get:(t,k)=>t[k], set:(t,k,v)=>{t[k]=v;return true;}}));
  return {
    ...inner,
    log: notesLog,
    advance(ms){                       // 時間を ms 進めて、たまった setTimeout を発火させる
      const target = now + ms;
      pending.sort((a,b)=>a.at-b.at);
      while(pending.length && pending[0].at <= target){
        const t = pending.shift(); now = t.at; t.fn();
      }
      now = target;
    },
    nowAt: ()=>now
  };
}

let pass = 0, fail = 0;
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "  ✅ " : "  ❌ ") + name + "  got=" + JSON.stringify(got) + (ok ? "" : " want=" + JSON.stringify(want)));
  ok ? pass++ : fail++;
}

console.log("\n【1】3つの音が、それぞれ別の音になっているか（同じだと区別がつかない）");
{
  const h = makeHarness();
  h.playChime();       h.advance(1000);
  h.playMissSound();   h.advance(1000);
  h.playAdvanceCue();  h.advance(1000);
  const [correct, miss, cue] = h.log;
  // 正解音は「ピン」「ポーン」の2音＋それぞれの倍音。耳に聞こえるのは2音
  const mainNotes = correct.notes.filter((f,i)=>correct.gains[i] === 1);
  check("正解音の主音は2音（ピン・ポーン）", mainNotes.length, 2);
  check("わかった通知は1音", cue.notes.length, 1);
  check("★正解音とわかった通知は音の数が違う（耳で区別できる）",
    mainNotes.length !== cue.notes.length, true);
  check("3つとも周波数の並びが違う",
    new Set([correct, miss, cue].map(x=>x.notes.join(","))).size, 3);
  check("正解音は下がる2音（G5→C5）", mainNotes, [784, 523.25]);
  check("不正解音は下がる2音", miss.notes, [392, 294]);
  check("わかった通知は高い単音", cue.notes, [1046.5]);
}

console.log("\n【2】不正解音は「責める音」になっていないか");
{
  const h = makeHarness();
  h.playChime();     h.advance(1000);
  h.playMissSound(); h.advance(1000);
  const [correct, miss] = h.log;
  check("★不正解音のほうが小さい", miss.peak < correct.peak, true);
  check("正解音の音量", correct.peak, 0.42);
  check("不正解音の音量（変えていない）", miss.peak, 0.16);
  check("★不正解音のほうが短い", miss.len < correct.len, true);
  check("不正解音はやわらかい音（sine。square のようなかたい音でない）", miss.type, "sine");
  check("不正解音は下向き（2音目のほうが低い）", miss.notes[1] < miss.notes[0], true);
}

console.log("\n【3】★音が重ならないか（重なるとどれも聞き取れない）");
{
  const h = makeHarness();
  // 自分が正解した直後に、ホストの「わかった」が飛んでくる場面
  h.playChime();
  h.playAdvanceCue();
  h.advance(50);
  check("正解音だけが鳴っている（通知はまだ待っている）", h.log.length, 1);
  h.advance(950);
  check("正解音が終わってから通知が鳴った", h.log.length, 2);
  const [correct, cue] = h.log;
  check("★通知は正解音が鳴り終わったあと", cue.at >= correct.at + 950, true);
}

console.log("\n【4】★3つ以上が続けて来ても、順番に鳴るか");
{
  const h = makeHarness();
  h.playChime(); h.playAttackSound(); h.playAdvanceCue();
  h.advance(3000);
  check("3つとも鳴った", h.log.length, 3);
  const times = h.log.map(x=>x.at);
  check("鳴った時刻が全部ちがう（同時に鳴っていない）", new Set(times).size, 3);
  check("鳴った順に並んでいる", times.slice().sort((a,b)=>a-b), times);
  const gaps = times.slice(1).map((t,i)=>t - times[i]);
  check("★どの間隔も、前の音の長さ以上あいている", gaps.every(g=>g >= 200), true);
}

console.log("\n【5】不正解のときも同じように重ならないか");
{
  const h = makeHarness();
  h.playMissSound(); h.playAdvanceCue();
  h.advance(2000);
  check("2つとも鳴った", h.log.length, 2);
  check("★通知は不正解音のあと", h.log[1].at >= h.log[0].at + 320, true);
}

console.log("\n【6】音が使えない端末でも落ちないか");
{
  const h = makeHarness();
  h.audioCtx = null;   // まだ画面に触っていない iOS/Safari など
  let threw = null;
  try{ h.playChime(); h.playMissSound(); h.playAdvanceCue(); h.advance(2000); }
  catch(e){ threw = String(e); }
  check("例外を投げない", threw, null);
}

console.log("\n===== 合計: " + pass + " 件成功 / " + fail + " 件失敗 =====");
console.log("※ 音の感じ（きつくないか・区別しやすいか）は実機で聞かないと分かりません");
process.exit(fail ? 1 : 0);
