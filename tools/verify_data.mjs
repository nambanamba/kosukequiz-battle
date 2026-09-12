// 取り込みのあとに「本当に元データどおりに入ったか」を確かめる。
//
// なぜ要るか: import_quiz.py は取り込む道具であり、その道具自身の報告だけで
// 確かめると、**道具にバグがあったときに気づけない**。ここでは data.js を
// 実際にブラウザと同じように読み込ませ、元データJSONと id キーで突き合わせる。
//
// 使い方:
//   node tools/verify_data.mjs          # 全編
//   node tools/verify_data.mjs 2 4      # 復習編2と4だけ
//
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC  = path.resolve(ROOT, "..", "5年下", "quiz_csv_夏期講習");
const FILES = {
  1: "復習編1_日本の食料生産_v2.json", 2: "復習編2_工業資源輸送機関.json",
  3: "復習編3_九州地方.json",          4: "復習編4_中国四国地方.json",
  5: "復習編5_近畿地方.json",          6: "復習編6_中部地方.json",
  7: "復習編7_関東地方.json",          8: "復習編8_東北北海道地方.json",
};
// data.js の項目名 ← 元データJSONの項目名（img だけ名前が違う）
const FIELDS = [["q","q"], ["a","a"], ["sol","sol"], ["img","file"],
                ["priority","priority"], ["level","level"]];

// data.js を、ブラウザと同じように「実際に読み込んで」配列を取り出す。
// 正規表現で読むと、data.js が壊れていても気づけない
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "data.js"), "utf8")
                + "\n;globalThis.__OUT = QA_DATA;", ctx);
const all = ctx.__OUT;
const byId = new Map(all.map(d => [d.id, d]));

let ng = 0;
const say = (ok, msg) => { console.log((ok ? "  ✅ " : "  ❌ ") + msg); if (!ok) ng++; };

console.log("\n===== data.js 全体 =====");
say(Array.isArray(all) && all.length > 0, "data.js を読み込めた（" + all.length + "件）");
say(byId.size === all.length, "id の重複なし（ユニーク " + byId.size + "件）");

const want = (process.argv.slice(2).map(Number).filter(n => FILES[n]));
const targets = want.length ? want : Object.keys(FILES).map(Number);

console.log("\n===== 元データとの突き合わせ（id キー） =====");
for (const n of targets) {
  const rows = JSON.parse(fs.readFileSync(path.join(SRC, FILES[n]), "utf8"));
  const list = Array.isArray(rows) ? rows : (rows.questions || rows.items);
  const bad = [];
  for (const src of list) {
    const cur = byId.get(src.id);
    if (!cur) { bad.push(src.id + ":data.jsに無い"); continue; }
    for (const [k, s] of FIELDS) {
      if ((cur[k] ?? "") !== (src[s] ?? "")) bad.push(src.id + ":" + k);
    }
  }
  say(bad.length === 0, "復習編" + n + "  " + list.length + "問  不一致 " + bad.length
      + "件" + (bad.length ? "  " + bad.slice(0, 8).join(" / ") : ""));
}

console.log("\n===== 画像 =====");
const files = new Set(fs.readdirSync(path.join(ROOT, "images")));
const refs = [...new Set(all.map(d => d.img).filter(Boolean))];
const missing = refs.filter(f => !files.has(f));
say(missing.length === 0, "参照している画像がすべて実在する（" + refs.length + "種）"
    + (missing.length ? "  無い: " + missing.slice(0, 5).join(" / ") : ""));

// ★kaki4_79 と同じ「解答不能」の型。図表を指しているのに画像が無い問題。
//   実際に、分県図の付いていない問題が配信され、実機で答えられなかったことがある
console.log("\n===== 解答できるか（kaki4_79 と同じ型がないか） =====");
// 図表を指す墨付きかっこを**名指しで並べる**。データにあるのは12種だけで、
// 【演習年表】【練習問題】のように図表と関係ないものが混ざっているため、
// 「かっこの中に図や表があれば拾う」だと【演習年表】まで拾ってしまう。
// 以前は【表】【図】【グラフ】の3つだけで、**claude-18 が見つけた
// 「【地図】が残っているのに file が空」を拾えなかった**（2026-09-09）。
// **新しい種類の墨付きかっこを使い始めたら、ここに足すこと。**
const FIG = /【(地図|白地図|図|表|グラフ|写真)[0-9０-９]*】|(右|次|上|左|下)の(表|図|グラフ|地図|写真)|地図中|図中|表中|グラフ中/;
const noFig = all.filter(d => !d.img && FIG.test(d.q || ""));
say(noFig.length === 0, "図表を指すことばがあるのに画像が無い問題が無い"
    + (noFig.length ? "  " + noFig.slice(0, 5).map(d => d.id).join(" / ") : ""));

// 丸数字は**夏期講習だけ**で見る。ほかの単元では【演習まとめ①】のように
// 設問の通し番号や空欄の印として使っていて、図表を指していないため
// （全体にかけると124件の誤検出が出た。いつも赤くなる検査は、そのうち誰も見なくなる）
const kakiCirc = all.filter(d => d.id.startsWith("kaki") && !d.img && /[①-⑳]/.test(d.q || ""));
say(kakiCirc.length === 0, "夏期講習で、丸数字を使っているのに画像が無い問題が無い"
    + (kakiCirc.length ? "  " + kakiCirc.slice(0, 5).map(d => d.id).join(" / ") : ""));

// ★逆の型: **画像はあるのに、問題文がその図をまったく参照していない。**
//   書き換えで「Aの県にある世界文化遺産」→「広島県にある…」と地図を見なくてよくしたのに、
//   画像だけ残ったもの。**手がかりの何もない地図が表示され、子どもが図を探して戸惑う。**
//   ★これは**注意して見るための一覧**で、失敗にはしない。
//   もともと図を見せるだけの問題（写真を見て名前を答える等）が正しく引っかかるため、
//   これで止めると「いつも赤い検査」になって誰も見なくなる。判断は人がする
console.log("\n===== 参考: 画像はあるが、問題文が図を参照していない =====");
const orphan = all.filter(d => d.id.startsWith("kaki") && d.img && !FIG.test(d.q || "")
                               && !/[①-⑳]|[ア-ン]〜[ア-ン]|[A-H]〜[A-H]/.test(d.q || ""));
if (orphan.length === 0) {
  console.log("  ✅ ありません");
} else {
  console.log("  ⚠️ " + orphan.length + "件（失敗にはしません。図が要るかどうか人が見てください）");
  for (const d of orphan.slice(0, 20)) {
    console.log("     " + d.id + "  " + d.img + "  " + (d.q || "").slice(0, 45).replace(/\n/g, "／"));
  }
  if (orphan.length > 20) console.log("     …ほか " + (orphan.length - 20) + "件");
}

// ★もう1つの「解答不能」の型（2026-09-12 に kaki2_75/76/77 で実際に起きた）。
//   **答えが記号なのに、その記号が画像に印刷されていない。**
//   kaki_r2_graph06.jpg は帯グラフ3本が無印なのに、問題文は「ア〜ウから選んで
//   記号で答えなさい」、答えは（ア）（イ）（ウ）だった。どの帯がアなのか分からない。
//
//   ★上の「図表を指すことばがあるのに画像が無い」では捕まらない。
//   図を指すことばがあり、画像も実在するので、条件を満たしてしまう。
//
//   画像の中の文字を機械で読むのは大仕事なので、ここでは**目で見る対象を絞る**。
//   確かめるのは画像1枚につき1回で済むので、問ごとではなく**画像ごとにまとめる**。
console.log("\n===== 参考: 答えが記号。その記号が画像に印刷されているか（画像ごと） =====");
// 「（ア）です」「（あ）です。」のように、答えがalmost記号だけのもの
const SYM_ONLY = /^（?\s*([ア-ンあ-んA-H])\s*）?\s*(です|)[。．]?$/;
const symRows = all.filter(d => d.img && SYM_ONLY.test((d.a || "").trim()));
const byImg = new Map();
for (const d of symRows) {
  if (!byImg.has(d.img)) byImg.set(d.img, []);
  byImg.get(d.img).push(d);
}
if (byImg.size === 0) {
  console.log("  ✅ ありません（答えが記号だけの問に、画像つきのものは無い）");
} else {
  console.log("  ⚠️ " + byImg.size + "枚 / " + symRows.length
              + "問（失敗にはしません。★画像を開いて、記号が印刷されているか人が見てください）");
  for (const [img, rows] of [...byImg].sort((a, b) => b[1].length - a[1].length)) {
    const syms = [...new Set(rows.map(d => (d.a || "").match(SYM_ONLY)[1]))].sort();
    console.log("     " + img + "  " + rows.length + "問  この記号が要る: "
                + syms.join("・"));
    console.log("        " + rows.map(d => d.id).join(" "));
  }
}

console.log("\n===== 合計: " + (ng ? "★" + ng + " 件の問題あり" : "問題なし") + " =====");
process.exit(ng ? 1 : 0);
