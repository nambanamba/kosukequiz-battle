// アプリの「保存してGitHubに報告する」で作られた修正報告Issueを読んで、
// data.js の該当問題の "q" / "a" を書きかえる。
//
// Issueの本文は index.html の reportEditToGitHub() が作る決まった形:
//   ## 問題ID / ## 単元 / ## 元の問題文 / ## 元のこたえ / ## 直した問題文 / ## 直したこたえ
//
// data.js は1問1ブロックの整形されたJSON風テキストなので、問題IDでブロックを
// 見つけて "q": と "a": の行だけを差し替える。ほかの行やファイル全体の整形には
// 触れないので、差分は必要最小限になる。
//
// 入力（環境変数）: ISSUE_BODY, ISSUE_NUMBER
// 出力: GITHUB_OUTPUT に applied(true/false) / id / reason / title を書く
const fs = require("fs");
const path = require("path");

const DATA_JS = path.join(__dirname, "..", "..", "data.js");

// 「## 見出し」ごとに本文を切り出す。区切り線（---）から下は署名なので読まない。
// 正規表現の先読みで書くと最後の見出しを取り逃がしやすいので、行をたどる形にする
function sections(body){
  const out = {};
  let cur = null, buf = [];
  const flush = ()=>{ if(cur !== null) out[cur] = buf.join("\n").trim(); cur = null; buf = []; };
  for(const line of body.split("\n")){
    const head = line.match(/^##\s+(.+?)\s*$/);
    if(head){ flush(); cur = head[1]; continue; }
    if(/^---+\s*$/.test(line)){ flush(); continue; }
    if(cur !== null) buf.push(line);
  }
  flush();
  return out;
}

function fail(reason){
  out({applied: "false", reason});
  console.log("適用しませんでした: " + reason);
  process.exit(0); // ワークフロー自体は成功させ、Issueにコメントで知らせる
}

function out(obj){
  if(!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(obj).map(([k, v])=>{
    const s = String(v);
    // 複数行の値も安全に渡せるようヒアドキュメント形式で書く
    return s.includes("\n") ? k + "<<__EOF__\n" + s + "\n__EOF__" : k + "=" + s;
  });
  fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
}

const body = (process.env.ISSUE_BODY || "").replace(/\r\n/g, "\n");
if(!body.trim()) fail("Issueの本文が空です");

const parts = sections(body);
const id = (parts["問題ID"] || "").trim();
const newQ = parts["直した問題文"];
const newA = parts["直したこたえ"];

if(!id) fail("「## 問題ID」が読み取れませんでした");
if(!/^[A-Za-z0-9_.\-]+$/.test(id)) fail("問題IDの形式が想定と違います: " + id);
if(newQ === undefined || newA === undefined) fail("「## 直した問題文」または「## 直したこたえ」が読み取れませんでした");
if(!newQ.trim() || !newA.trim()) fail("直した問題文・こたえが空です");

const src = fs.readFileSync(DATA_JS, "utf8");

// 問題IDの行を探し、その問題のブロック（ {  …  }, ）の範囲を求める
const idLine = new RegExp('^[ \\t]*"id":[ \\t]*' + JSON.stringify(id) + '[ \\t]*,?[ \\t]*$', "m");
const idMatch = src.match(idLine);
if(!idMatch) fail("data.js に問題ID " + id + " が見つかりませんでした（すでに消された問題かもしれません）");

const idPos = idMatch.index;
const blockStart = src.lastIndexOf("\n {", idPos);
const blockEnd = src.indexOf("\n },", idPos);
if(blockStart === -1 || blockEnd === -1) fail("data.js の該当ブロックの範囲を特定できませんでした: " + id);
const block = src.slice(blockStart, blockEnd);

// "q" と "a" の行を差し替える。値はJSON.stringifyでエスケープする
function replaceField(text, field, value){
  const re = new RegExp('(^[ \\t]*"' + field + '":[ \\t]*)("(?:[^"\\\\]|\\\\.)*")([ \\t]*,?[ \\t]*$)', "m");
  if(!re.test(text)) return null;
  return text.replace(re, (m, head, _old, tail)=> head + JSON.stringify(value) + tail);
}

let updated = replaceField(block, "q", newQ);
if(updated === null) fail('ブロック内に "q" の行が見つかりませんでした: ' + id);
updated = replaceField(updated, "a", newA);
if(updated === null) fail('ブロック内に "a" の行が見つかりませんでした: ' + id);

if(updated === block) fail("data.js の中身はすでに報告どおりです（変更なし）");

const next = src.slice(0, blockStart) + updated + src.slice(blockEnd);

// 壊していないか、書き出す前に必ず読み直して確かめる
let parsed;
try{
  parsed = eval(next + "; QA_DATA");
}catch(e){
  fail("書きかえた結果の data.js が読み取れませんでした: " + e.message);
}
const before = eval(src + "; QA_DATA");
if(!Array.isArray(parsed) || parsed.length !== before.length) fail("書きかえで問題数が変わってしまいました");
const target = parsed.find(x => x.id === id);
if(!target || target.q !== newQ || target.a !== newA) fail("書きかえた内容が想定と一致しませんでした");

fs.writeFileSync(DATA_JS, next);
console.log("data.js を更新しました: " + id);
out({
  applied: "true",
  id,
  unit: target.u || "",
  title: "[data.js修正] " + (target.u || "") + " - " + id
});
