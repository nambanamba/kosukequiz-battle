// ★2026-09-27: 問題一覧のフィルタを出題とそろえた（依頼書:
//   司令塔\回答\対戦_問題一覧のフィルタを出題とそろえる_依頼_2026-09-27.md）。
// この道具は「一覧で絞った件数」と「同じ条件で実際に出題される件数」が一致することを見る。
//
// ★内部の関数（buildPool・tierOf など）を直接呼ばない。<script type="module"> の中にあり
//   window からは触れないため（実測: 触れないことを他のテストでも確認できる作り）。
//   代わりに、メイン画面のUI（単元チェック・出題タイプ・優先度・問題数「全部」）を実際に操作して
//   #pool-count-label の数字を読み、それを一覧の #list-count と突き合わせる。
//   ★両方とも本物のUI操作から出た数なので、「同じ部品を通った数」であることが保証される。
//
// 使い方: node tools/list_filter_probe.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  try {
    const { createRequire } = await import("node:module");
    return createRequire(import.meta.url)("playwright");
  } catch {}
  try {
    const { execSync } = await import("node:child_process");
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
  } catch {}
  return null;
}
const pw = await loadPlaywright();
if (!pw) { console.error("playwright が見つかりません。"); process.exit(2); }
const chromium = pw.chromium;

const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json"};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, "index.html")) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {"content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream"});
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/index.html";
const TRYSTERO_STUB = "export function joinRoom(){ return {makeAction:()=>[()=>{},()=>{}],"
  + " onPeerJoin:()=>{}, onPeerLeave:()=>{}, leave:()=>{}}; }";

async function launchBrowser(bt) {
  try { return await bt.launch(); }
  catch { return await bt.launch({ channel: "chrome" }); }
}
const browser = await launchBrowser(chromium);
const ctx = await browser.newContext();
await ctx.route("https://esm.run/trystero", r =>
  r.fulfill({ status: 200, contentType: "application/javascript", body: TRYSTERO_STUB }));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push("JSエラー: " + e.message));
page.on("dialog", d => d.accept());

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "  ✅ " : "  ❌ ") + name + "  got=" + JSON.stringify(got) + (ok ? "" : " want=" + JSON.stringify(want)));
  ok ? pass++ : fail++;
}

await page.goto(BASE);
await page.waitForTimeout(700);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(700);

// ---- メイン画面: 単元選択をちょうど units の集合にする ----
async function setMainUnits(units) {
  // ALL は「全部選択中なら全解除、そうでなければ全選択」のトグル。まず全解除してから個別に選ぶ
  const allOn = await page.evaluate(() => document.querySelector('#unit-choices .choice[data-unit="ALL"]').classList.contains("selected"));
  if (allOn) await page.click('#unit-choices .choice[data-unit="ALL"]');
  else {
    // 念のため、いま選ばれているものを全部外す
    const on = await page.evaluate(() => [...document.querySelectorAll('#unit-choices .choice.selected')].map(e=>e.dataset.unit).filter(u=>u!=="ALL"));
    for (const u of on) await clickUnit(u);
  }
  for (const u of units) {
    await openUnitGroupIfNeeded(u);
    await clickUnit(u);
  }
}
// 属性セレクタの値として使うだけなので、CSS識別子エスケープは不要。" と \ だけ気をつける
function escapeAttr(s) { return s.replace(/[\\"]/g, ch => "\\" + ch); }
async function clickUnit(u) {
  await page.click(`#unit-choices .choice[data-unit="${escapeAttr(u)}"]`);
}
// 社会は地理/公民/歴史でアコーディオン化されている。閉じたグループの中の単元は
// クリックできないので、その単元を含む見出しを（閉じていれば）開く
async function openUnitGroupIfNeeded(u) {
  await page.evaluate((uu) => {
    const el = document.querySelector(`#unit-choices .choice[data-unit="${CSS.escape(uu)}"]`);
    if (!el) return;
    const body = el.closest(".unit-group-body");
    if (!body) return; // 理科などアコーディオンの外
    if (body.style.display === "none") {
      const key = body.dataset.group;
      document.querySelector(`.unit-group-header[data-group="${key}"]`).click();
    }
  }, u);
  await page.waitForTimeout(100);
}

// メイン画面の「出題タイプ・優先度」はたたまれているので、まず開く
async function openSetupFilterPanel() {
  const hidden = await page.evaluate(() => document.getElementById("setup-filter-panel").hidden);
  if (hidden) await page.click("#setup-filter-open");
  await page.waitForTimeout(100);
}
async function setMainType(type) {
  await openSetupFilterPanel();
  await page.click(`#type-${type === "all" ? "all" : type}`);
}
async function setMainPriority(pri) {
  await openSetupFilterPanel();
  const id = pri === "all" ? "priority-all" : (pri === "普通" ? "priority-normal" : "priority-low");
  await page.click("#" + id);
}
async function ensureQuestionCountAll() {
  const isAll = await page.evaluate(() => document.querySelector('.count-choice[data-count="all"]').classList.contains("on"));
  if (!isAll) await page.click('.count-choice[data-count="all"]');
}
async function readMainCount() {
  await page.waitForTimeout(150);
  const label = await page.evaluate(() => document.getElementById("pool-count-label").textContent);
  const m = label.match(/^(\d+)問/);
  return m ? parseInt(m[1], 10) : null;
}

// ---- 一覧画面: 単元・出題タイプ・優先度を同じにする ----
async function openListWith(units, type, pri) {
  await page.click("#list-btn");
  await page.waitForTimeout(400);
  await page.selectOption("#list-unit-select", units);
  await page.click(`#list-type-row .toggle[data-list-type="${type}"]`);
  const priId = pri === "all" ? "all" : pri;
  await page.click(`#list-priority-row .toggle[data-list-priority="${priId}"]`);
  await page.waitForTimeout(300);
  const txt = await page.evaluate(() => document.getElementById("list-count").textContent);
  const m = txt.match(/^(\d+)問/);
  return m ? parseInt(m[1], 10) : null;
}
async function backToHome() {
  await page.click("#list-back");
  await page.waitForTimeout(300);
}

// ★件数を決め打ちしない代わりに、テストが「0対0」で無意味に通らないよう、
//   その絞り込みに1問以上ヒットする単元を実データから探す（4-6p: 検査対象を決め打ちしない）
const { imgUnit, textUnit, lowUnit1, lowUnit2, bigUnit } = await page.evaluate(() => {
  const all = QA_DATA.filter(q => q.subj === "社会" && q.kind !== "calc");
  const prioOf = d => d && d.priority === "低" ? "低" : "普通";
  const withCount = (pred) => {
    const c = {};
    all.filter(pred).forEach(d => { c[d.u] = (c[d.u] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  };
  const imgUnits = withCount(d => !!d.img);
  const textUnits = withCount(d => !d.img && prioOf(d) === "普通");
  const lowUnits = withCount(d => prioOf(d) === "低");
  const byUnitTotal = {};
  all.forEach(d => { byUnitTotal[d.u] = (byUnitTotal[d.u] || 0) + 1; });
  const bigUnit = Object.entries(byUnitTotal).sort((a, b) => b[1] - a[1])[0][0];
  return { imgUnit: imgUnits[0], textUnit: textUnits[0], lowUnit1: lowUnits[0], lowUnit2: lowUnits[1] || lowUnits[0], bigUnit };
});

console.log("\n【1】単元1つ・図の問題だけ・優先度すべて");
{
  await setMainUnits([imgUnit]);
  await setMainType("image");
  await setMainPriority("all");
  await ensureQuestionCountAll();
  const mainN = await readMainCount();
  const listN = await openListWith([imgUnit], "image", "all");
  check("一覧の件数＝出題できる件数（0より大きい想定）", listN, mainN);
  check("★0対0の無意味な一致ではない", listN > 0, true);
  await backToHome();
}

console.log("\n【2】単元1つ・文章問題だけ・優先度=普通");
{
  await setMainUnits([textUnit]);
  await setMainType("text");
  await setMainPriority("普通");
  await ensureQuestionCountAll();
  const mainN = await readMainCount();
  const listN = await openListWith([textUnit], "text", "普通");
  check("一覧の件数＝出題できる件数（0より大きい想定）", listN, mainN);
  check("★0対0の無意味な一致ではない", listN > 0, true);
  await backToHome();
}

console.log("\n【3】単元2つ・すべて・優先度=低（★複数選択の合算が一致するか）");
{
  await setMainUnits([lowUnit1, lowUnit2]);
  await setMainType("all");
  await setMainPriority("低");
  await ensureQuestionCountAll();
  const mainN = await readMainCount();
  const listN = await openListWith([lowUnit1, lowUnit2], "all", "低");
  check("一覧の件数＝出題できる件数（0より大きい想定）", listN, mainN);
  check("★0対0の無意味な一致ではない", listN > 0, true);
  await backToHome();
}

console.log("\n【4】表示順「出題順」の並びが、実際の「出題順どおり」の並びと一致する");
{
  // 段を1つだけ選んで絞る（narrowing）＝「出題順どおり」の並びが orderByTiers になる条件
  await setMainUnits([bigUnit]);
  await setMainType("all");
  await setMainPriority("all");
  await page.evaluate(() => document.querySelectorAll(".mode-filter").forEach(e => {
    if (e.dataset.tier !== "0" && e.classList.contains("on")) e.click();
  }));
  const battleHidden = await page.evaluate(() => document.getElementById("battle-settings-panel").hidden);
  if (battleHidden) await page.click("#battle-settings-open");
  await page.waitForTimeout(100);
  await page.click("#order-toggle"); // 出題順どおり
  await ensureQuestionCountAll();
  await page.waitForTimeout(150);
  await page.click("#solo-start-btn");
  await page.waitForTimeout(600);
  const soloOrder = [];
  for (let i = 0; i < 5; i++) {
    const qid = await page.evaluate(() => document.getElementById("solo-q-id").textContent.replace(/^No\./, ""));
    soloOrder.push(qid);
    await page.click("#solo-reveal-btn"); await page.waitForTimeout(120);
    await page.click("#solo-judge-ok"); await page.waitForTimeout(200);
  }
  await page.click("#solo-back");
  await page.waitForTimeout(300);

  const listN = await openListWith([bigUnit], "all", "all");
  // 段を1段目だけに絞って一覧も同じ土俵にする
  await page.click('.list-filter-toggle[data-tier="1"]');
  await page.click('.list-filter-toggle[data-tier="2"]');
  await page.waitForTimeout(200);
  const listOrder = await page.evaluate(() => [...document.querySelectorAll("#list-items .list-item")].slice(0, 5).map(e => e.dataset.qid));
  check("先頭5問のIDが、出題順どおりの実際の並びと一致する", listOrder, soloOrder);
  await backToHome();
}

await ctx.close();
await browser.close();
server.close();

console.log("\nJSエラー: " + errors.length + "件");
if (errors.length) errors.forEach(e => console.log("  " + e));
console.log("\n===== 合計: " + pass + " 件成功 / " + fail + " 件失敗 =====");
process.exit(fail || errors.length ? 1 : 0);
