// test_battle_resume.mjs が「壊したら本当に鳴るか」を確かめる（確認ポイント D-17 / A-14）。
//
// 使い方: node tools/break_test_battle_resume.mjs
//
// index.html を一時フォルダにコピーして1か所ずつ壊し、テストをそのコピーに対して走らせる。
// ★本物の index.html は触らない。★置換が当たったことを先に確かめる（当たらなければ止まる）。
// 壊し方ごとに「落ちるべき確認」を決めてあり、それが NG にならなければ失敗と表示する。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const EOL = html.includes("\r\n") ? "\r\n" : "\n";

const VARIANTS = [
  { name: "確認を出さない",
    from: ["  if(!GUARDED_SCREENS.includes(currentScreenName)) return;", "  e.preventDefault();"],
    to:   ["  return;", "  e.preventDefault();"],
    mustFail: ["対戦中にリロードすると", "ひとり練習の途中のリロードでは"] },
  { name: "どの画面でも確認を出す",
    from: ["  if(!GUARDED_SCREENS.includes(currentScreenName)) return;", "  e.preventDefault();"],
    to:   ["  e.preventDefault();"],
    mustFail: ["「中断」でホームへもどったあと", "結果画面のリロードでは", "ホームのリロードでは"] },
  { name: "部屋のコードを戻さない",
    from: ["  els[\"room-code-display\"].textContent = session.code;"],
    to:   [],
    mustFail: ["「----」にならない"] },
  { name: "古い保存でも上書きする",
    from: ["  if(!missesUnknown) saveLastMiss(myMissesThisRound);"],
    to:   ["  saveLastMiss(myMissesThisRound);"],
    mustFail: ["古い保存から再開したときは"] },
  { name: "まちがいリストを戻さない",
    from: ["  myMissesThisRound = missesUnknown ? [] : session.misses.slice();"],
    to:   ["  myMissesThisRound = [];"],
    mustFail: ["もう一勝負（2問）", "空で上書きされない"] },
];

const base = fs.mkdtempSync(path.join(os.tmpdir(), "kq-break-"));
function prepare(v, i) {
  const from = v.from.join(EOL), to = v.to.join(EOL);
  const hits = html.split(from).length - 1;
  if (hits !== 1) throw new Error(`「${v.name}」の置換が ${hits} か所に当たった（1か所であるべき）`);
  const dir = path.join(base, "v" + i);
  fs.mkdirSync(path.join(dir, "tools"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html.replace(from, to));
  fs.copyFileSync(path.join(ROOT, "data.js"), path.join(dir, "data.js"));
  fs.copyFileSync(path.join(ROOT, "tools", "test_battle_resume.mjs"), path.join(dir, "tools", "test_battle_resume.mjs"));
  return dir;
}
function run(dir) {
  return new Promise(res => {
    let out = "";
    const p = spawn(process.execPath, [path.join(dir, "tools", "test_battle_resume.mjs")]);
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    p.on("close", () => res(out));
  });
}

const dirs = VARIANTS.map(prepare);
const outs = await Promise.all(dirs.map(run));
let bad = 0;
VARIANTS.forEach((v, i) => {
  const ngLines = outs[i].split(/\r?\n/).filter(l => l.includes("NG"));
  const missed = v.mustFail.filter(k => !ngLines.some(l => l.includes(k)));
  if (missed.length) bad++;
  console.log(`${missed.length ? "✗ 鳴らない" : "✓ 鳴った "}  ${v.name}`);
  ngLines.forEach(l => console.log("      " + l.trim().slice(0, 110)));
  missed.forEach(k => console.log("      ★NGになるべきなのに通った: " + k));
});
fs.rmSync(base, { recursive: true, force: true });
console.log(`\n${VARIANTS.length}通りに壊して、鳴らなかったもの ${bad}件`);
process.exit(bad ? 1 : 0);
