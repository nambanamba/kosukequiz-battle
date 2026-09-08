// 同じ編の中で「答えが同じ」問題の組を洗い出す。
//
// なぜ要るか: 問題を書き換えると、**同じ編の既存問題と答えも手がかりも同じ**に
// なってしまうことがある。実際に12件起きた。しかも「向きを逆にする」で直すと、
// **衝突相手が別の問題に移るだけ**のことがある（kaki7_68 は kaki7_25 との重複が
// 消えたが、隣の kaki7_67 とぶつかった）。人が目で追うと必ず見落とす。
//
// ★これは「候補を出す」道具です。**答えが同じ＝重複ではありません。**
//   手がかりが別なら両方あってよい問題です（「松島」を松尾芭蕉の説明文から問うのと、
//   地図の位置から問うのとでは、試している力が違う）。**判定は人がしてください。**
//   自動で弾いてはいけません。
//
// 使い方:
//   node tools/find_same_answer.mjs            # 変更された問題を含む組だけ（既定）
//   node tools/find_same_answer.mjs --all      # 全問（候補が増えます）
//   node tools/find_same_answer.mjs 3 4        # 復習編3と4だけ
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

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const only = args.map(Number).filter(n => FILES[n]);

// 配信中の data.js（＝取り込みずみの内容）。元データと比べて「変わった問題」を知るため
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "data.js"), "utf8")
                + "\n;globalThis.__OUT = QA_DATA;", ctx);
const live = new Map(ctx.__OUT.map(d => [d.id, d]));

// 「（島根県）です。」→「島根県」、「（促成）栽培です。」→「促成栽培」
const normalize = a => (a || "").replace(/[（）()\s・]/g, "").replace(/です。?$/, "");
// 記号だけの答え（ア／ウ／A など）は位置を選ばせる問題で、大量にぶつかるので外す
const isSymbol = k => /^[ア-ンあ-んA-H0-9]{1,4}$/.test(k);

let total = 0;
for (const n of (only.length ? only : Object.keys(FILES).map(Number))) {
  const rows = JSON.parse(fs.readFileSync(path.join(SRC, FILES[n]), "utf8"));
  const list = Array.isArray(rows) ? rows : (rows.questions || rows.items);

  const groups = new Map();
  for (const d of list) {
    const k = normalize(d.a);
    if (!k || isSymbol(k)) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }

  const hits = [];
  for (const [k, members] of groups) {
    if (members.length < 2) continue;
    // 既定では「今回変わった問題を含む組」だけ。全問だと候補が多すぎて使えない
    const changed = members.filter(d => {
      const cur = live.get(d.id);
      return !cur || (cur.q ?? "") !== (d.q ?? "") || (cur.a ?? "") !== (d.a ?? "");
    });
    if (!showAll && changed.length === 0) continue;
    hits.push({ k, members, changed: new Set(changed.map(d => d.id)) });
  }
  if (!hits.length) continue;

  console.log("\n===== 復習編" + n + "  " + hits.length + "組 =====");
  for (const h of hits) {
    // 番号が隣どうしの組は、並べれば一目で分かる型なので目立たせる
    const nums = h.members.map(d => Number(String(d.id).split("_")[1])).sort((a, b) => a - b);
    const adjacent = nums.some((v, i) => i > 0 && v - nums[i - 1] === 1);
    console.log("\n  【答え: " + h.k + "】" + (adjacent ? "  ★番号が隣どうし" : ""));
    for (const d of h.members) {
      console.log("    " + (h.changed.has(d.id) ? "変更 " : "既存 ") + d.id
                  + "  " + (d.q || "").slice(0, 60).replace(/\n/g, "／"));
    }
    total++;
  }
}
console.log("\n===== 候補 " + total + "組 ====="
            + (showAll ? "（全問）" : "（今回変わった問題を含む組だけ。全部見るには --all）"));
console.log("※ 答えが同じでも、**手がかりが別なら重複ではありません。**判定は人がしてください");
