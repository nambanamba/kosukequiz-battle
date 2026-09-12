// 「20秒で解けるか」を、長さではなく★解く手順で調べる（A-9）。
//
// A-9 の本体は手順。選択肢が無くても、表・グラフ・前提を読み解いてから
// 答える2段階なら20秒で解けない。逆に短い単語なら選択肢が20個あってもよい。
//
// 使い方: node tools/step20/scan.mjs [id接頭辞]   （既定は kaki）
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "data.js"), "utf8") + "\n;globalThis.__O=QA_DATA;", ctx);
const PRE = process.argv[2] || "kaki";
const D = ctx.__O.filter(d => d.id.startsWith(PRE));

// ---- 手順の数え方 ----
// ①答えが2つ以上ある（A-8: 1問で答えるものが複数ある設問は重すぎる）
// ★答えのかっこを数えるのは誤検出が多い。「（真珠）です（志摩半島にあります）」の
//   2つ目は補足であって答えではない。**問題文が複数を求めているか**で判定する。
const multiAnswer = d => {
  const q = d.q || "";
  const askMulti = /また、|それぞれ|[2-9２-９]つ(答え|挙げ|書き)|すべて(答え|挙げ|書き)|両方(答え|)/.test(q);
  if (!askMulti) return false;
  // 「すべて答えなさい」で答えが短い語の並びなら1段階でよい（A-9: 短い単語なら可）
  const a = (d.a || "").replace(/^（|）です。?$/g, "");
  if (/^すべて|をすべて/.test(q) && a.length <= 20 && !/また、/.test(q)) return false;
  return true;
};
// ②長い選択肢を読み比べる（型1・型3）。見出しを持ち、かつ中身が長い
const optionHeads = q => {
  const m = q.match(/(?:^|[\s　。、])(?:ア|イ|ウ|エ|オ|カ|キ|ク|ケ|A|B|C|D|E|F|G)[\s　]/g) || [];
  return m.length;
};
const longOptions = d => {
  const q = d.q || "";
  const n = optionHeads(q);
  if (n < 3) return false;
  // 見出しで割って、中身の平均が長いか
  const parts = q.split(/(?:ア|イ|ウ|エ|オ|カ|キ|ク|ケ|A|B|C|D|E|F|G)[\s　]/).slice(1);
  if (!parts.length) return false;
  const avg = parts.reduce((s, p) => s + p.length, 0) / parts.length;
  return avg >= 15;
};
// ③図表の数値を読み解いてから答える（型4）。
//   「図を見て名前を言う」は1段階。「図から読み取って、それを知識に当てる」は2段階。
const readThenAnswer = d => {
  const q = d.q || "";
  if (!/表|グラフ/.test(q)) return false;
  // 比較・順位・割合を読み取らせているか
  return /最も|いちばん|第何位|何％|何パーセント|割合が高い|割合が低い|多い順|どちら/.test(q);
};
// ④前提が長い（読むだけで時間が尽きる）
const longPremise = d => (d.q || "").length >= 100;

const SIGNALS = [
  ["①答えが2つ以上（A-8）", multiAnswer],
  ["②長い選択肢の読み比べ", longOptions],
  ["③図表を読み解いてから答える", readThenAnswer],
  ["④前提が100字以上", longPremise],
];
const hits = new Map();
console.log("対象: " + PRE + "* " + D.length + "問\n");
for (const [name, fn] of SIGNALS) {
  const list = D.filter(fn);
  console.log("== " + name + ": " + list.length + "件");
  for (const d of list) {
    if (!hits.has(d.id)) hits.set(d.id, []);
    hits.get(d.id).push(name[0]);
  }
}
console.log("\n== どれかに当たった問: " + hits.size + "件（重複を除く）\n");
for (const [id, sig] of hits) {
  const d = D.find(x => x.id === id);
  console.log("--- " + id + "  [" + sig.join("") + "]  " + (d.q || "").length + "字  img=" + (d.img || "なし"));
  console.log("  Q: " + (d.q || "").replace(/\n/g, "／"));
  console.log("  A: " + (d.a || "").replace(/\n/g, "／"));
}
