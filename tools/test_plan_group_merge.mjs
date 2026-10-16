// 「今日やること」で merge:true の行と merge なしの行が1つの教科にまとまるとき、
// 子ども画面の「○問」と、実際に出す問題数がそろうか（2026-10-17: 20問が19問になった）。
// 10-17 の plan/0011.json と同じ形（merge:true 15 ＋ merge なし 5、片方に重み2のカード r6m21）
//   node tools/test_plan_group_merge.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function loadPlaywright(){
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const pw = await loadPlaywright();
const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".jpg":"image/jpeg", ".png":"image/png"};
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => { if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {"content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream"}); res.end(buf); });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/";
let pass = 0, fail = 0;
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "  ✅ " : "  ❌ ") + name + "  got=" + JSON.stringify(got) + (ok ? "" : " want=" + JSON.stringify(want)));
  ok ? pass++ : fail++;
}
let browser;
try { browser = await pw.chromium.launch(); } catch { browser = await pw.chromium.launch({ channel: "chrome" }); }

const pad = (p, a, b) => Array.from({length: b - a + 1}, (_, k) => p + String(a + k).padStart(2, "0"));
const SET = { no: 11, label: "検査用", items: [
  { subj: "理科", title: "朝：テスト前のおさらい15問", ids: pad("r6m", 1, 15), count: 15, order: "weak", merge: true },
  { subj: "理科", title: "朝：第6回の未定着5問", ids: ["r6m21", "r6p27", "r6p28", "r6p29", "r6p30", "r6p31", "r6p32"], count: 5, order: "weak" }
] };
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
await ctx.addInitScript(([set]) => {
  try{
    localStorage.setItem("kq_battle_plan_index_v2", JSON.stringify([11]));
    localStorage.setItem("kq_battle_plan_sets_v2", JSON.stringify({ 11: set }));
  }catch(e){}
}, [SET]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e).slice(0, 120)));
await page.goto(BASE + "index.html", { waitUntil: "load" });
await page.waitForSelector(".plan-kid-row", { timeout: 60000 });
const sub = (await page.textContent(".plan-kid-row .plan-kid-sub")).trim();
console.log("  行: " + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".plan-kid-row")].map(e => e.innerText.replace(/\s+/g, " ")))));
console.log("  子ども画面の表示: " + sub);
check("朝の理科が 20問 と表示される", sub, "20問");
// 実際に出す問題数: 「一人で」を押して、出題の数を読む
await page.click(".plan-kid-row .plan-kid-btn[data-kind=solo]");
await page.waitForTimeout(1500);
const prog = await page.evaluate(() => (document.body.innerText.match(/\d+\s*\/\s*\d+|\d+問中/g) || []).slice(0, 3));
console.log("  出題画面の進み具合: " + JSON.stringify(prog));
check("出題の数も 20問", prog[0], "1 / 20");
check("JSエラーが出ていない", errors, []);
await ctx.close(); await browser.close(); server.close();
console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
