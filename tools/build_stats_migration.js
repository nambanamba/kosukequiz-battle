// 夏期講習の復習編に作り直された単元について、旧問題→新問題の対応表をつくる。
//
// 復習編は旧単元の作り直しだが、問題文も設問形式も別物なので1対1では対応しない。
// そこで「答えの語」が同じ・または一方がもう一方を含む（中京⊂中京工業地帯、
// 釧路⊂釧路港、シラス⊂シラス台地）ものを同じ知識項目とみなして、ざっくり
// 対応づける。取りこぼしや多少の取りすぎは許容する方針。
//
// 使い方: node tools/build_stats_migration.js          … 対応表をJSONで標準出力
//         node tools/build_stats_migration.js --report … 結果を人が読む形で出力
//
// 復習編が増えたら UNIT_PAIRS に足して再実行し、index.html の
// STATS_MIGRATION（と MIGRATION_ID）を更新してから旧単元をdata.jsから消す。
const fs = require("fs");
const path = require("path");
const QA_DATA = eval(fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8") + "; QA_DATA");

const UNIT_PAIRS = [
  ["1.日本の食料生産", "夏期講習 復習編1.日本の食料生産"],
  ["2.工業・資源・輸送機関", "夏期講習 復習編2.工業・資源・輸送機関"],
  ["3.九州地方", "夏期講習 復習編3.九州地方"],
  ["4.中国・四国地方", "夏期講習 復習編4.中国・四国地方"]
];

const norm = s => String(s)
  .replace(/[\s　]/g, "").replace(/[，、。．,.]/g, "").replace(/[・･〈〉〔〕]/g, "")
  .replace(/[ａ-ｚＡ-Ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .toLowerCase();

// 選択肢の記号（ア・イ・A・1 など1文字）は知識の語ではないので使わない
const isChoiceLabel = t => t.length === 1;

// 「（…）」の中身。入れ子（おうとう（さくらんぼ））は内側・外側の両方を拾う
function parenContents(text){
  const s = String(text), stack = [], out = [];
  for(let i = 0; i < s.length; i++){
    const c = s[i];
    if(c === "（" || c === "(") stack.push(i);
    else if(c === "）" || c === ")"){ const st = stack.pop(); if(st !== undefined) out.push(s.slice(st + 1, i)); }
  }
  return out;
}
// 「A〈B〉」「A（B）」「A/B」は同じ答えの言いかえ。ばらして両方を候補にする
function alternatives(term){
  const inner = [...String(term).matchAll(/[〈〔［\[（(]([^〉〕］\]）)]*)[〉〕］\]）)]/g)].map(m => m[1]);
  const head = String(term).replace(/[〈〔［\[（(][^〉〕］\]）)]*[〉〕］\]）)]/g, "");
  return [head, ...inner, ...String(term).split(/[\/／]/)].map(t => t.trim()).filter(Boolean);
}
// 問題の「答えの語」。旧問題は問題文にも（　）があるので、そちらに出るものは除く
function terms(item){
  const inQ = new Set(parenContents(item.q).map(t => norm(t)));
  const out = new Set();
  for(const raw of parenContents(item.a)){
    if(inQ.has(norm(raw))) continue;
    for(const t of alternatives(raw)){
      const k = norm(t);
      if(k.length >= 2 && !isChoiceLabel(k)) out.add(k);
    }
  }
  return [...out];
}

function build(){
  const by = {};
  for(const q of QA_DATA) (by[q.u] = by[q.u] || []).push(q);
  const map = {}, report = [];
  for(const [oldUnit, newUnit] of UNIT_PAIRS){
    const O = by[oldUnit] || [], N = by[newUnit] || [];
    if(!O.length || !N.length){ report.push({unit: oldUnit, error: "単元が見つからない"}); continue; }
    const newIndex = N.map(q => ({id: q.id, terms: terms(q)}));
    const hits = [], misses = [];
    for(const q of O){
      const mine = terms(q);
      const to = [];
      for(const n of newIndex){
        // どちらかがもう一方を含んでいれば同じ知識項目とみなす
        if(n.terms.some(nt => mine.some(mt => nt === mt || nt.includes(mt) || mt.includes(nt)))) to.push(n.id);
      }
      if(to.length){ map[q.id] = to; hits.push({old: q.id, to, terms: mine, q: q.q.slice(0, 30)}); }
      else misses.push({old: q.id, terms: mine, q: q.q.slice(0, 30)});
    }
    report.push({unit: oldUnit, newUnit, oldCount: O.length, newCount: N.length, hits, misses});
  }
  return {map, report};
}

const {map, report} = build();
if(process.argv.includes("--report")){
  let to = 0, th = 0;
  for(const r of report){
    if(r.error){ console.log("=== " + r.unit + ": " + r.error); continue; }
    to += r.oldCount; th += r.hits.length;
    console.log("=== " + r.unit + " (" + r.oldCount + "問) → " + r.newUnit + " (" + r.newCount + "問)");
    console.log("    対応づいた: " + r.hits.length + "/" + r.oldCount + " (" + Math.round(r.hits.length / r.oldCount * 100) + "%)"
      + " / 新問題1問あたり平均 " + (r.hits.reduce((s, h) => s + h.to.length, 0) / (r.hits.length || 1)).toFixed(1) + "件に反映");
    console.log("    -- 対応づかなかったもの (" + r.misses.length + "件) --");
    r.misses.forEach(m => console.log("      " + m.old + " 語=" + m.terms.join("/") + " | " + m.q));
  }
  console.log("\n合計: " + th + "/" + to + " (" + Math.round(th / to * 100) + "%)");
}else{
  console.log(JSON.stringify(map));
}
