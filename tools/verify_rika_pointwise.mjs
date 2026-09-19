// 理科の data.js と元データを「id キー」で1問ずつ突き合わせる。
//
// ■ なぜ import_rika.py の --check ではだめか
//   import_rika.py は「丸ごと再取り込み」の道具で、memo だけを r?m01 から
//   歯抜けなしに振り直す。いまの data.js はその形ではない:
//     第2回 … calc 5問（r2m12・13・15・16・17）を data.js に残している
//     第3回 … 78問で id は r3m01〜r3m91（欠番13。2026-09-13 の横ぐし改訂3）
//   走らせると id が動き、お子さんの解答履歴が別の問題に付けかわる（確認ポイント C-5）。
//   この道具は data.js を一切書きかえず、読んで比べるだけ。
//
// ■ 対応づけのしかた
//   元データに id 欄は無いので、問題文（q）の完全一致でひもづける。
//   q を書きかえた回では対応がつかないので、そのときは --map で
//   「id,no」の対応表（CSV）を渡す。対応がつかない問は必ず報告する。
//
//   使い方:
//     node tools/verify_rika_pointwise.mjs 2
//     node tools/verify_rika_pointwise.mjs 3 --map tools/map_r3.csv
//     node tools/verify_rika_pointwise.mjs 2 --sha e9cd20e9...   （読む前に照合）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const BATTLE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(path.dirname(BATTLE), "5年下", "quiz_csv_理科");
const FILES = {
  1: "第1回_生物のつながり.json",
  2: "第2回_てこ滑車輪軸.json",
  3: "第3回_水溶液の中和.json",
  // ★第4回はまだ納品されていないので、ファイル名を決め打ちしない（推測で書くと A-10 の型）。
  //    `第4回_*.json` が1つだけ在れば、それを使う。
};
if (!FILES[4] && fs.existsSync(SRC)) {
  const c = fs.readdirSync(SRC).filter((f) => /^第4回_.*\.json$/.test(f) && !/_calc_|_納品_/.test(f));
  if (c.length === 1) FILES[4] = c[0];
}
// 元データのキー名 -> data.js のキー名（import_rika.py の RENAME と同じ）
const RENAME = { subject: "subj", genre: "u", file: "img" };
// 比べる欄（import_rika.py の OUT_KEYS から id・kai を除いたもの）
const FIELDS = ["subj", "u", "q", "note", "a", "img", "kind", "priority", "level", "sol"];

const die = (m) => { console.log("✖ " + m); process.exit(1); };
const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };

const kai = Number(process.argv[2]);
if (!kai || kai < 1 || kai > 9) die("第N回の数字を渡してください（例: node tools/verify_rika_pointwise.mjs 2）。");
if (!FILES[kai]) die(`第${kai}回の元データが ${SRC} に見つかりません（まだ納品されていない可能性があります）。`);
const srcPath = path.join(SRC, FILES[kai]);
if (!fs.existsSync(srcPath)) die("元データが見つかりません: " + srcPath);

// ★読む前に sha256 を照合する（確認ポイント C-4c-2）
const raw = fs.readFileSync(srcPath);
const sha = crypto.createHash("sha256").update(raw).digest("hex");
const want = arg("--sha");
console.log(`元データ: ${FILES[kai]}`);
console.log(`  sha256: ${sha}`);
if (want) {
  if (sha !== want) die(`宣言された sha256 と違います。\n  宣言: ${want}\n  実物: ${sha}\n  → まだ編集中か、同期が遅れている可能性があります（CLAUDE.md 0d）。取り込まないでください。`);
  console.log("  ✔ 宣言された sha256 と一致");
}

const src = JSON.parse(raw.toString("utf8"));
const js = fs.readFileSync(path.join(BATTLE, "data.js"), "utf8");
const QA = eval(js.slice(js.indexOf("const QA_DATA = [") + "const QA_DATA = ".length, js.lastIndexOf("];") + 1));

const mine = QA.filter((o) => new RegExp("^r" + kai + "m[0-9]+$").test(o.id))
  .sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3)));
const byNo = new Map(src.map((r) => [r.no, r]));

// id -> 元データの行 を決める
let pairs = [];
const unmatched = [];
const mapPath = arg("--map");
if (mapPath) {
  const wanted = new Map();
  for (const line of fs.readFileSync(mapPath, "utf8").split(/\r?\n/)) {
    const m = line.trim().match(/^(r\d+m\d+)\s*,\s*(\d+)$/);
    if (m) wanted.set(m[1], Number(m[2]));
  }
  for (const o of mine) {
    const no = wanted.get(o.id);
    const r = no == null ? null : byNo.get(no);
    if (r) pairs.push([o, r]); else unmatched.push(o.id);
  }
} else {
  const byQ = new Map();
  for (const r of src) {
    const k = (r.q || "").trim();
    byQ.set(k, byQ.has(k) ? null : r); // 同じ問題文が2つあれば null（あいまいなので使わない）
  }
  for (const o of mine) {
    const r = byQ.get((o.q || "").trim());
    if (r) pairs.push([o, r]); else unmatched.push(o.id);
  }
}

if (mine.length === 0) die(`data.js に r${kai}m* が1問もありません。回の数字か data.js の書式が想定と違います。`);

const nMemo = src.filter((r) => r.kind === "memo").length;
const nCalc = src.filter((r) => r.kind === "calc").length;
console.log(`  元データ: ${src.length}問（memo ${nMemo} / calc ${nCalc}）`);
console.log(`  data.js の r${kai}m*: ${mine.length}問  ${mine[0]?.id}〜${mine[mine.length - 1]?.id}`);
const nums = mine.map((o) => Number(o.id.slice(3)));
const gaps = [];
for (let n = 1; n <= Math.max(...nums); n++) if (!nums.includes(n)) gaps.push(n);
console.log(`  id の欠番: ${gaps.length ? gaps.join("・") : "なし"}`);
console.log(`  ひもづいた: ${pairs.length}問 ／ ★つかなかった: ${unmatched.length}問 ${unmatched.join("・") || ""}`);

// 欄ごとに比べる
if (pairs.length === 0) die("1問もひもづきませんでした。『差分0』ではありません。--map で対応表を渡してください。");

let diffs = 0;
for (const [o, r] of pairs) {
  const conv = {};
  for (const [k, v] of Object.entries(r)) conv[RENAME[k] ?? k] = v;
  for (const f of FIELDS) {
    // data.js は空文字のキーを書き出さない。元データの空欄と同じ扱いにする
    const a = o[f] ?? "";
    const b = conv[f] ?? "";
    if (String(a) !== String(b)) {
      diffs++;
      console.log(`  ✖ ${o.id}（no.${r.no}）の ${f}`);
      console.log(`      data.js : ${JSON.stringify(a).slice(0, 120)}`);
      console.log(`      元データ: ${JSON.stringify(b).slice(0, 120)}`);
    }
  }
}
// 元データにあって data.js に無い問（取り込み漏れ）
const used = new Set(pairs.map(([, r]) => r.no));
const notIn = src.filter((r) => !used.has(r.no));
console.log(`\n  元データにあって data.js に対応が無い行: ${notIn.length}件`);
if (notIn.length) console.log(`    no: ${notIn.map((r) => `${r.no}(${r.kind})`).join("・")}`);
console.log(`\n${diffs === 0 && unmatched.length === 0 ? "✔ 差分0" : `✖ 差分 ${diffs}件 ／ 対応のつかない id ${unmatched.length}件`}`);
process.exit(diffs === 0 && unmatched.length === 0 ? 0 : 1);
