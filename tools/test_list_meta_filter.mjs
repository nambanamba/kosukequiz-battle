// kosukequiz-battle の「問題一覧の優先度・難易度」の表示とフィルタをテストする。
// index.html から実物の metaValue / matchesMetaFilter / metaTagsHtml を切り出し、
// 実際の data.js（1631問）を相手に動かす。
//
// 使い方:
//   node test_list_meta_filter.mjs [index.htmlのパス] [data.jsのパス]
//
import fs from "fs";
import { fileURLToPath } from "node:url";

// 既定は、このスクリプトの1つ上（リポジトリのルート）。
// フォルダごと移動しても動くよう、絶対パスは決め打ちしない
const INDEX = process.argv[2] || fileURLToPath(new URL("../index.html", import.meta.url));
const DATA = process.argv[3] || fileURLToPath(new URL("../data.js", import.meta.url));
const HTML = fs.readFileSync(INDEX, "utf8");

function cut(startRe){
  const m = HTML.match(startRe);
  if(!m) throw new Error("見つかりません: " + startRe);
  const rest = HTML.slice(m.index);
  const end = rest.search(/\r?\n\}\r?\n/);
  if(end === -1) throw new Error("終わりが見つかりません: " + startRe);
  return rest.slice(0, end).replace(/\r/g,"") + "\n}\n";
}
// metaValue は1行で閉じているので、cut（行頭の } を探す）ではなく行ごと取る
function cutOneLine(re){
  const m = HTML.match(re);
  if(!m) throw new Error("見つかりません: " + re);
  return m[0].replace(/\r/g, "");
}
const REAL = [
  cutOneLine(/^function metaValue\(d, key\)\{.*\}$/m),
  cut(/^function matchesMetaFilter\(value, filter\)\{/m),
  cut(/^function metaTagsHtml\(d\)\{/m)
].join("\n");

// 実物の data.js をそのまま読む（const QA_DATA = [...] なので評価して取り出す）
const QA_DATA = new Function(fs.readFileSync(DATA, "utf8") + "\n;return QA_DATA;")();

const ctx = {
  escapeHtml: s => String(s).replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))
};
const inner = new Function("ctx",
  "with(ctx){ " + REAL + "\n;return {metaValue, matchesMetaFilter, metaTagsHtml}; }")(
  new Proxy(ctx, {has:(t,k)=>k in t, get:(t,k)=>t[k], set:(t,k,v)=>{t[k]=v;return true;}}));
const {metaValue, matchesMetaFilter, metaTagsHtml} = inner;

let pass = 0, fail = 0;
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "  ✅ " : "  ❌ ") + name + "  got=" + JSON.stringify(got) + (ok ? "" : " want=" + JSON.stringify(want)));
  ok ? pass++ : fail++;
}
// 一覧の絞りこみと同じ判定を、実データ全件にかけて数える
function count(priFilter, lvFilter){
  return QA_DATA.filter(d =>
    matchesMetaFilter(metaValue(d, "priority"), priFilter) &&
    matchesMetaFilter(metaValue(d, "level"), lvFilter)).length;
}

// ★件数は決め打ちしない。問題は増えたり減ったりする（1411→1631→1342）ので、
//   その場の data.js から数えた値をもとに、つじつまが合うかだけを見る。
//   決め打ちにしていたら、旧単元を消したときにここが赤くなった（実際に赤くなった）
const 総数 = QA_DATA.length;
const 優先度未設定 = count("none", "all");
const 難易度未設定 = count("all", "none");
const 優先度あり = count("高", "all") + count("中", "all") + count("低", "all");
const 難易度あり = count("all", "基礎") + count("all", "標準") + count("all", "発展");
console.log(`\n【1】実データ${総数}問の内訳（優先度: 高${count("高","all")} 中${count("中","all")} 低${count("低","all")} 未設定${優先度未設定}）`);
{
  check("優先度の各区分の合計＝総数", 優先度あり + 優先度未設定, 総数);
  check("難易度の各区分の合計＝総数", 難易度あり + 難易度未設定, 総数);
  check("優先度と難易度の未設定は同数（必ず両方そろって欠ける）", 優先度未設定, 難易度未設定);
  check("どの区分にも1問以上ある", [count("高","all")>0, count("all","基礎")>0], [true, true]);
}

console.log("\n【2】絞りこみの数がつじつまが合うか");
{
  check("すべて＝総数", count("all", "all"), 総数);
  check("優先度未設定かつ難易度未設定＝未設定の数", count("none", "none"), 優先度未設定);
  check("優先度未設定なのに難易度は設定あり＝0", count("none", "基礎") + count("none", "標準") + count("none", "発展"), 0);
  check("優先度高かつ難易度基礎の組み合わせも数えられる", count("高", "基礎") > 0, true);
}

console.log("\n【3】★「未設定」を選べないと未設定の問題が消えてしまう（要望の勘どころ）");
{
  check("未設定を選べばその分が出る", count("none", "all"), 優先度未設定);
  check("値のある区分だけでは全問に届かない", 優先度あり < 総数, true);
  check("合わせて全問になる", 優先度未設定 + 優先度あり, 総数);
}

console.log("\n【4】各行に出すふだの中身");
{
  const withMeta = QA_DATA.find(d => d.priority && d.level);
  const noMeta = QA_DATA.find(d => !d.priority && !d.level);
  const h1 = metaTagsHtml(withMeta);
  check("優先度のふだが出る", h1.includes("優先度 " + withMeta.priority), true);
  check("難易度のふだが出る", h1.includes("難易度 " + withMeta.level), true);
  check("値ごとの色分けクラスが付く", h1.includes("pri-" + withMeta.priority) && h1.includes("lv-" + withMeta.level), true);
  const h2 = metaTagsHtml(noMeta);
  check("未設定はふだ1つにまとめる", h2, '<div class="list-meta"><span class="list-meta-tag unset">優先度・難易度 未設定</span></div>');
  check("未設定のふだは薄い見た目のクラス", h2.includes("unset"), true);
  // 片方だけの問題は現時点で0件だが、将来出てもよいように分岐は用意してある
  const h3 = metaTagsHtml({priority:"高"});
  check("片方だけでも壊れない（難易度側が未設定と出る）",
    h3.includes("優先度 高") && h3.includes("難易度 未設定"), true);
}

console.log("\n【5】空文字も「未設定」として扱う");
{
  check("空文字は null 扱い", metaValue({priority:""}, "priority"), null);
  check("空文字は none で拾える", matchesMetaFilter(metaValue({priority:""}, "priority"), "none"), true);
  check("空文字は 高 では拾わない", matchesMetaFilter(metaValue({priority:""}, "priority"), "高"), false);
  check("all は何でも通す", matchesMetaFilter(null, "all") && matchesMetaFilter("高", "all"), true);
}

console.log("\n===== 合計: " + pass + " 件成功 / " + fail + " 件失敗 =====");
process.exit(fail ? 1 : 0);
