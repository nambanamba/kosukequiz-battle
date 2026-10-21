// sw.js の「BUILD」の間を書く（ネットなしで使うための保存の一覧と版）。2026-10-21
// 使い方:
//   node tools/build_sw.mjs          … 書く
//   node tools/build_sw.mjs --check  … 書かずに、今の sw.js が最新かだけ見る（古ければ exit 1）
// ★図（images/）か、機内用の範囲の問題（data.js・daimon_data.js）を足したら回すこと。
//   回し忘れても本体はネット優先なので古くはならないが、★新しく入った図が機内用に保存されない
//
// 機内用の範囲（index.html の KINAI_RULE と同じ規則。変えるときは両方）:
//   社会・理科の「第6回.〜第9回.」で始まる単元（優先度「低」は除く）＋ 単元「おまけ.ペルー」
//   ＋ 第6〜9回の大問（ロング編・紙の大問は除く）の図（問題の図・小問の図・答えの図）
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const SHELL_FILES = ["index.html", "data.js", "daimon_data.js", "manifest.webmanifest"];
const KINAI_UNIT = /^第[6-9]回\./;
const KINAI_EXTRA_UNITS = ["おまけ.ペルー"];
const KINAI_KAI = [6, 7, 8, 9];

const h = buf => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 10);
const ctx = {}; vm.createContext(ctx);
for(const f of ["data.js", "daimon_data.js"]){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const (\w+)\s*=/gm, "this.$1 ="), ctx);
}
const QA = ctx.QA_DATA, DM = ctx.DAIMON_DATA || [];
const kinai = new Set();
const isKinaiUnit = d => (KINAI_UNIT.test(d.u || "") && (d.subj === "社会" || d.subj === "理科")) || KINAI_EXTRA_UNITS.includes(d.u);
QA.forEach(d => { if(isKinaiUnit(d) && d.priority !== "低" && d.kind !== "calc" && d.img) kinai.add(d.img); });
DM.forEach(g => {
  if(g.long || g.paper === true || !KINAI_KAI.includes(Number(g.kai))) return;
  if(g.file) kinai.add(g.file);
  (g.items || []).forEach(it => { if(it.file) kinai.add(it.file); if(it.aFile) kinai.add(it.aFile); });
});
const imgDir = path.join(ROOT, "images");
const images = {};
for(const f of fs.readdirSync(imgDir).sort()){
  const p = path.join(imgDir, f);
  if(fs.statSync(p).isFile() && /\.(png|jpe?g|gif|webp|svg)$/i.test(f)) images[f.normalize("NFC")] = h(fs.readFileSync(p));
}
const missing = [...kinai].filter(n => !images[n.normalize("NFC")]);
if(missing.length){ console.error("機内用の図が images/ にありません: " + missing.join(", ")); process.exit(1); }

const swPath = path.join(ROOT, "sw.js");
const sw = fs.readFileSync(swPath, "utf8");
const START = "// ==BUILD START==\n", END = "// ==BUILD END==";
const a = sw.indexOf(START), b = sw.indexOf(END);
if(a < 0 || b < 0) { console.error("sw.js に BUILD の印がありません"); process.exit(1); }
const rest = sw.slice(0, a) + sw.slice(b);   // 生成部分を除いた sw.js（これも版に入れる）
const kinaiList = [...kinai].map(n => n.normalize("NFC")).sort();
// ★本体（index.html など）は版に入れない。本体はネット優先なので、版を上げなくても新しいものが出る。
//   版に入れると、本体を直すたびに --check が鳴ってしまう（鳴るのは、図か機内用の範囲が変わったときだけにする）
const version = h(JSON.stringify([SHELL_FILES, images, kinaiList, h(rest)]));
const block = START
  + "const VERSION = " + JSON.stringify(version) + ";\n"
  + "const SHELL = " + JSON.stringify(SHELL_FILES) + ";\n"
  + "const IMAGES = " + JSON.stringify(images) + ";\n"
  + "const KINAI_IMAGES = " + JSON.stringify(kinaiList) + ";\n";
const next = sw.slice(0, a) + block + sw.slice(b);
let kinaiBytes = 0; kinaiList.forEach(n => { kinaiBytes += fs.statSync(path.join(imgDir, n)).size; });
let allBytes = 0; Object.keys(images).forEach(n => { allBytes += fs.statSync(path.join(imgDir, n)).size; });
let shellBytes = 0; SHELL_FILES.forEach(f => { shellBytes += fs.statSync(path.join(ROOT, f)).size; });
const mb = n => (n / 1e6).toFixed(1) + "MB";
const summary = "版 " + version + " / 本体 " + mb(shellBytes) + " / 機内用の図 " + kinaiList.length + "枚 " + mb(kinaiBytes) + " / 図ぜんぶ " + Object.keys(images).length + "枚 " + mb(allBytes);
if(CHECK){
  if(next !== sw){ console.error("sw.js が古いです（node tools/build_sw.mjs を回してください）。" + summary); process.exit(1); }
  console.log("sw.js は最新です。" + summary);
}else{
  if(next !== sw) fs.writeFileSync(swPath, next);
  console.log((next !== sw ? "sw.js を書きました。" : "sw.js は最新でした。") + summary);
}
