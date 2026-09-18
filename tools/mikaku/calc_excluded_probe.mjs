// 計算が要る問題（kind:"calc"）が、出題に出ないことを見る（2026-09-18）。
//
// 使い方: node tools/mikaku/calc_excluded_probe.mjs
//
// ・ひとり練習（＝対戦・復習ミックスと同じ buildPool／buildReviewPool を通る）に出ないこと
// ・問題一覧にも出ないこと（2026-09-18 ユーザー判断で一覧からも消した）
// ・ホームの「全問題数」にも入らないこと
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();
const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".jpg":"image/jpeg", ".png":"image/png"};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, {"content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream"}), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/index.html";

const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: 800, height: 1280 } })).newPage();
const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("dialog", d => d.accept());
await page.goto(BASE); await page.waitForTimeout(700);

const info = await page.evaluate(() => {
  const calc = QA_DATA.filter(q => q.kind === "calc");
  const unit = calc.length ? calc[0].u : null;
  return { ids: calc.map(q => q.id), unit, inUnit: QA_DATA.filter(q => q.u === unit).length };
});
console.log(`計算の問題: ${info.ids.join(" ")}（単元「${info.unit}」全${info.inUnit}問）`);

// 理科・その単元だけにして、ひとり練習を「全部」で始める
await page.evaluate(u => {
  localStorage.clear();
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "理科", unitsBySubject: { "理科": [u] }, units: [u], count: "all", shuffle: false }));
}, info.unit);
await page.reload(); await page.waitForTimeout(800);
const stat = await page.evaluate(() => +document.getElementById("stat-total").textContent);
console.log(`ホームの「全問題数」: ${stat}問（計算の5問を除いた数なら正しい）`);
await page.$eval("#solo-start-btn", e => e.click());
await page.waitForTimeout(900);
const picked = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("kq_battle_solo_session_v1") || "{}");
  return s.quizIds || [];
});
const leaked = picked.filter(id => info.ids.includes(id));
console.log(`ひとり練習に出た: ${picked.length}問／そのうち計算の問題: ${leaked.length}問 ${leaked.join(" ")}`);
console.log(leaked.length === 0 ? "→ ★計算の問題は出題されない" : "→ ★出てしまっている");

// 問題一覧（いまの作りでは出る）
await page.$eval("#solo-back", e => e.click()); await page.waitForTimeout(400);
await page.$eval("#list-btn", e => e.click()); await page.waitForTimeout(400);
await page.selectOption("#list-unit-select", info.unit); await page.waitForTimeout(1500);
const inList = await page.evaluate(ids => ids.filter(id => document.querySelector(`#list-items .list-item[data-qid="${id}"]`)), info.ids);
console.log(`問題一覧に出ている計算の問題: ${inList.length}問（0問なら正しい。記録は残っていて、CSVの書き出しで見られる）`);
console.log(`JSエラー: ${errs.length}件`);
await browser.close(); server.close();
