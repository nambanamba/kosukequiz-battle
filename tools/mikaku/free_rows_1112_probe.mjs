// ★2026-11-12 今日やることの 社会・理科 の「一人で」「二人で」＝下の選び方どおり（自動のセットは使わない）
// 使い方: node tools/mikaku/free_rows_1112_probe.mjs（アプリは module なので、中の変数は見ない。画面だけで見る）
// 見ること:
//   F1 今日やることに 社会・理科 の2行・それぞれ「n問」＝その教科に切りかえたときの大きいボタンの数
//   F2 理科の単元を2つだけにして社会にもどす → 理科の行の数は その2単元の数・社会の大きいボタンの数は変わらない（数えても いまの教科の選択は変わらない）
//   F3 社会の行の「一人で」→ 一人の画面「1 / n」（n＝行の数）・社会の問題
//   F4 開き直して 理科の行の「一人で」→「1 / n」（n＝理科の行の数）・単元は選んだ2つのどちらか
//   F5 開き直して 理科の行の「二人で」→ 部屋ができる（大きい「二人で始める」と同じ待ち合わせ）・教科は理科
//   F6 kosuke-records の今日のセットが端末にあっても、行は2行のまま（できた・二人のつづきの印は出ない）
//   E  画面のエラー 0
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": rel.endsWith(".html") ? "text/html; charset=utf-8" : rel.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL0 = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: 1024, height: 1366 } })).newPage(); const errs = [];
page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
const active = () => page.evaluate(() => (document.querySelector(".screen.active") || {}).id);
const rows = () => page.evaluate(() => [...document.querySelectorAll("#plan-cur .plan-kid-row")].map(r => ({ s: r.dataset.subj, sub: r.querySelector(".plan-kid-sub").textContent, btn: [...r.querySelectorAll("button")].map(b => b.textContent + (b.disabled ? "×" : "")) })));
const bigN = () => page.evaluate(() => (document.getElementById("solo-start-btn").textContent.match(/（(\d+)問/) || [])[1]);
const soloInfo = () => page.evaluate(() => ({ c: document.getElementById("solo-counter").textContent, u: document.getElementById("solo-unit-tag").textContent, id: document.getElementById("solo-q-id").textContent }));
const fresh = async () => {
  await page.goto(URL0); await page.waitForTimeout(600);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 })); localStorage.setItem("kq_battle_daimon_merged_v1", "1"); });
  await page.reload(); await page.waitForTimeout(900);
};
const pick2 = async () => {   // 理科の単元を 第11回 の先頭2つ（無ければ1つ）だけにする（「すべて」を外してから2つ押す）
  await page.$eval("#subject-science", e => e.click()); await page.waitForTimeout(300);
  return page.evaluate(() => {
    const all = document.querySelector('#unit-choices .choice[data-unit="ALL"]'); if (all && all.classList.contains("selected")) all.click();
    const us = [...document.querySelectorAll("#unit-choices .choice")].map(e => e.dataset.unit).filter(u => /第11回/.test(u)).slice(0, 2);
    us.forEach(u => document.querySelector('#unit-choices .choice[data-unit="' + u + '"]').click());
    return us;
  });
};
try {
  await fresh();
  await page.$eval("#subject-science", e => e.click()); await page.waitForTimeout(300); const nR = await bigN();
  await page.$eval("#subject-social", e => e.click()); await page.waitForTimeout(300); const nS = await bigN();
  let r = await rows();
  check("F1 今日やることに 社会・理科 の2行・数は大きいボタンと同じ（社会 " + nS + "・理科 " + nR + "）", r.length === 2 && r[0].s === "社会" && r[1].s === "理科" && r[0].sub === nS + "問" && r[1].sub === nR + "問" && r.every(x => x.btn.join() === "一人で,二人で"), JSON.stringify(r));
  const two = await pick2(); await page.waitForTimeout(300);
  const n2 = await bigN();
  await page.$eval("#subject-social", e => e.click()); await page.waitForTimeout(300);
  const sNow = await bigN();
  r = await rows();
  check("F2 理科を2単元（" + two.join("・") + "）にして社会へ → 理科の行 " + n2 + "問・社会の大きいボタンは " + sNow + "問のまま", two.length >= 1 && r[1].sub === n2 + "問" && sNow === nS && n2 !== nR, JSON.stringify(r));
  await page.click('#plan-cur .plan-kid-row[data-subj="社会"] button[data-kind="solo"]'); await page.waitForTimeout(800);
  let q = await soloInfo();
  check("F3 社会の「一人で」→ 一人の画面「" + q.c + "」（行は " + nS + "問）・社会の問題（" + q.id + "）", (await active()) === "screen-solo" && q.c === "1 / " + nS && /No\.g/.test(q.id), JSON.stringify(q));
  await page.goto(URL0); await page.waitForTimeout(900);
  await page.click('#plan-cur .plan-kid-row[data-subj="理科"] button[data-kind="solo"]'); await page.waitForTimeout(800);
  q = await soloInfo();
  check("F4 開き直して 理科の「一人で」→「" + q.c + "」（行は " + n2 + "問）・単元は2つのどちらか（" + q.u + "）", (await active()) === "screen-solo" && q.c === "1 / " + n2 && two.includes(q.u), JSON.stringify(q));
  await page.goto(URL0); await page.waitForTimeout(900);
  await page.click('#plan-cur .plan-kid-row[data-subj="理科"] button[data-kind="battle"]'); await page.waitForTimeout(2500);
  const bt = await page.evaluate(() => ({ wait: document.getElementById("home-waiting").style.display, sci: document.getElementById("subject-science").classList.contains("on"), txt: document.getElementById("home-waiting").innerText.replace(/\s+/g, " ").slice(0, 80) }));
  check("F5 理科の「二人で」→ 部屋ができる（大きい「二人で始める」と同じ待ち合わせ）・教科は理科", bt.wait === "block" && bt.sci, JSON.stringify(bt));
  await fresh();
  await page.evaluate(() => { localStorage.setItem("kq_battle_plan_sets_v2", JSON.stringify({ 5: { label: "テスト", items: [{ subj: "社会", title: "晩：3問", ids: ["g6r1", "g6r2", "g6r3"] }] } })); localStorage.setItem("kq_battle_plan_index_v2", "[5]"); });
  await page.reload(); await page.waitForTimeout(900);
  r = await rows();
  const boxText = await page.$eval("#plan-box", e => e.innerText);
  check("F6 今日のセットが端末にあっても 行は 社会・理科 の2行（できた・つづきの印なし）", r.length === 2 && r.every(x => /^\d+問$/.test(x.sub)) && !/テスト|できた|つづき/.test(boxText), JSON.stringify(r));
  check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました");
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
