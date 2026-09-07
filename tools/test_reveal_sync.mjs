// kosukequiz-battle の「こたえを二人そろってから開く」ロジックをテストする。
// index.html から実物の requestReveal / maybeReveal / resetRevealSync と、
// 受信ハンドラの中身を切り出して、2台の端末を模して動かす。
//
// 実機（スマホ2台＋WebRTC）でしか確かめられない部分は別にある（下の「※」参照）が、
// 「どちらが先に押しても、二人そろうまで開かない」という肝は、ここで機械的に確かめられる。
//
// 使い方:
//   node test_reveal_sync.mjs [index.htmlのパス]
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
// 受信ハンドラは setupActions() の中にあるので、その代入文だけを取り出す
function cutHandler(){
  const m = HTML.match(/  revealAction\.onMessage = \(data\)=>\{[\s\S]*?\r?\n  \};\r?\n/);
  if(!m) throw new Error("revealAction.onMessage が見つかりません");
  return m[0].replace(/\r/g,"");
}
const REAL = [
  "let iAskedRevealIdx = -1;",
  "let peerAskedRevealIdx = -1;",
  cut(/^function resetRevealSync\(fullClear\)\{/m),
  cut(/^function requestReveal\(\)\{/m),
  cut(/^function maybeReveal\(\)\{/m),
  "const revealAction = {};",
  cutHandler()
].join("\n");

// 1台ぶんの端末を作る。ボタンと「答えが開いたか」だけを持つ最小の見立て
function newDevice(name){
  const btn = {disabled:false, textContent:"こたえを見る", _cls:new Set(),
               classList:{add(c){btn._cls.add(c);}, remove(c){btn._cls.delete(c);},
                          contains(c){return btn._cls.has(c);}}};
  const ctx = {
    name,
    els: {"answer-reveal-btn": btn},
    currentIndex: 0,
    room: {},               // 対戦中（相手がいる）
    revealed: 0,            // revealAnswer が呼ばれた回数
    sent: [],               // 相手に送った合図
    revealAnswer(){ ctx.revealed++; },
    _btn: btn
  };
  const src = REAL + "\n;return {resetRevealSync, requestReveal, maybeReveal, revealAction,"
            + " peek:()=>({i:iAskedRevealIdx, p:peerAskedRevealIdx})};";
  const run = new Function("ctx", "with(ctx){ " + src + " }");
  const inner = run(new Proxy(ctx, {
    has: (t,k) => k in t,
    get: (t,k) => t[k],
    set: (t,k,v) => { t[k] = v; return true; }
  }));
  Object.assign(ctx, inner);
  // send は実物の revealAction.send を差しかえる（相手に配るのはテスト側でやる）
  ctx.revealAction.send = (d)=>{ ctx.sent.push(d); };
  return ctx;
}
// 片方が送った合図を、もう片方に届ける
function deliver(from, to){
  while(from.sent.length) to.revealAction.onMessage(from.sent.shift());
}

let pass = 0, fail = 0;
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "  ✅ " : "  ❌ ") + name + "  got=" + JSON.stringify(got) + (ok ? "" : " want=" + JSON.stringify(want)));
  ok ? pass++ : fail++;
}

// ============ 1. 片方だけでは開かない ============
console.log("\n【1】片方が押しただけでは、どちらの端末でも答えが開かない");
{
  const host = newDevice("host"), guest = newDevice("guest");
  host.resetRevealSync(); guest.resetRevealSync();
  host.requestReveal();
  check("押した側は開いていない", host.revealed, 0);
  deliver(host, guest);
  check("相手側も開いていない", guest.revealed, 0);
  check("押した側のボタンは待ち状態", [host._btn.disabled, host._btn.textContent], [true, "相手を待っています…"]);
  check("相手側のボタンは「相手は準備OK」", guest._btn.textContent, "相手は準備OK！ こたえを見る");
  check("相手側のボタンはまだ押せる", guest._btn.disabled, false);
}

// ============ 2. 二人そろったら開く（ホストが先） ============
console.log("\n【2】二人そろうと、両方の端末で開く（ホストが先に押した場合）");
{
  const host = newDevice("host"), guest = newDevice("guest");
  host.resetRevealSync(); guest.resetRevealSync();
  host.requestReveal(); deliver(host, guest);
  guest.requestReveal(); deliver(guest, host);
  check("ホスト側で開いた", host.revealed, 1);
  check("ゲスト側でも開いた", guest.revealed, 1);
}

// ============ 3. 逆順でも同じ（ゲストが先） ============
console.log("\n【3】ゲストが先に押しても同じように開く");
{
  const host = newDevice("host"), guest = newDevice("guest");
  host.resetRevealSync(); guest.resetRevealSync();
  guest.requestReveal(); deliver(guest, host);
  check("ゲストが押しただけでは開かない", [host.revealed, guest.revealed], [0, 0]);
  host.requestReveal(); deliver(host, guest);
  check("そろって両方で開いた", [host.revealed, guest.revealed], [1, 1]);
}

// ============ 4. ★相手の合図が自分の準備より先に届いても消えない ============
console.log("\n【4】★相手の合図が、自分がその問題の準備をする前に届いても消えない");
{
  const host = newDevice("host"), guest = newDevice("guest");
  // ゲストが1問目を先に進めて押し、その合図がホストに届く。
  // そのあとでホストが1問目の準備（resetRevealSync）をする、という順番
  guest.resetRevealSync(); guest.requestReveal();
  deliver(guest, host);                 // ホストはまだ resetRevealSync していない
  host.resetRevealSync();               // ← ここで消えてしまうと不具合
  host.requestReveal();
  check("ホスト側で開いた（合図が消えていない）", host.revealed, 1);
}

// ============ 5. 前の問題の合図で、次の問題が勝手に開かない ============
console.log("\n【5】前の問題の合図が残っていても、次の問題が勝手に開かない");
{
  const host = newDevice("host"), guest = newDevice("guest");
  host.resetRevealSync(); guest.resetRevealSync();
  guest.requestReveal(); deliver(guest, host);   // 1問目にゲストが押した
  host.requestReveal();
  check("1問目は開いた", host.revealed, 1);
  // 2問目へ。両方とも問題ごとの数えなおしが走る
  host.currentIndex = 1; guest.currentIndex = 1;
  host.resetRevealSync(); guest.resetRevealSync();
  host.requestReveal();
  check("2問目はホストが押しただけでは開かない", host.revealed, 1);
  deliver(host, guest);
  check("ゲスト側も開いていない", guest.revealed, 0);
  guest.requestReveal(); deliver(guest, host);
  check("そろってから開いた", [host.revealed, guest.revealed], [2, 1]);
}

// ============ 6. 同じ問題で2回押しても二重に開かない ============
console.log("\n【6】同じ問題で続けて押しても、二重には開かない");
{
  const host = newDevice("host"), guest = newDevice("guest");
  host.resetRevealSync(); guest.resetRevealSync();
  guest.requestReveal(); deliver(guest, host);
  host.requestReveal();
  host.requestReveal();   // 連打
  host.requestReveal();
  check("開いたのは1回だけ", host.revealed, 1);
  check("送った合図も1回だけ", host.sent.length + 1, 1 + 1); // deliver前に1件
}

// ============ 7. ひとりのとき（相手がいない）は待たずに開く ============
console.log("\n【7】相手がいないときは待たずに開く（固まらない）");
{
  const solo = newDevice("solo");
  solo.room = null;          // 対戦相手なし
  solo.resetRevealSync();
  solo.requestReveal();
  check("すぐ開いた", solo.revealed, 1);
  check("合図は送っていない", solo.sent.length, 0);
}

// ============ 8. 数えなおしでボタンの見た目が戻る ============
console.log("\n【8】次の問題に進むと、ボタンの見た目がもとに戻る");
{
  const host = newDevice("host"), guest = newDevice("guest");
  host.resetRevealSync(); guest.resetRevealSync();
  host.requestReveal(); deliver(host, guest);
  check("待ち状態になっている", [host._btn.disabled, guest._btn.classList.contains("peer-ready")], [true, true]);
  host.currentIndex = 1; guest.currentIndex = 1;
  host.resetRevealSync(); guest.resetRevealSync();
  check("ホストのボタンが戻った", [host._btn.disabled, host._btn.textContent], [false, "こたえを見る"]);
  check("ゲストの強調も消えた", [guest._btn.classList.contains("peer-ready"), guest._btn.textContent], [false, "こたえを見る"]);
}

console.log("\n===== 合計: " + pass + " 件成功 / " + fail + " 件失敗 =====");
console.log("※ 実機でしか確かめられないこと: iOS/Safari で相手の操作をきっかけに音が鳴るか");
console.log("   （AudioContext は自分が一度も画面に触っていないと鳴らないため）");
process.exit(fail ? 1 : 0);
