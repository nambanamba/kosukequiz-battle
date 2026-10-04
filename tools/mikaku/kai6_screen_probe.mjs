// 第6回（社会・理科）の取り込みを画面で見る（2026-10-03）。本物の Chrome・390x844。
// 使い方: node tools/mikaku/kai6_screen_probe.mjs   スクショは tools/mikaku/shots_kai6/（コミットしない）
// 見ること:
//   S1 社会の単元えらびに「第6回.鎌倉時代」が出る（一問一答47＋社会の大問の小問21＝68問。2026-10-04 社会の大問が入った）
//   S2 理科の単元えらびに「第6回.ヒトと動物の呼吸・循環」が出る（一問一答28＋アプリに出る大問の小問）
//   S3 理科の大問の一覧に第6回の7題が出る。紙の3題（練習1・練習3・発展）は出ない
//   S4 紙で出すの一覧に第6回の3題が出る（「発展」の見出しが崩れない）。問題の紙に答えが出ない
//   S5 第6回の大問（基本1）を一覧から開いて1問目が出る
//   S6 年表の問 g6r24〜g6r38 の15問すべてに枠が登録され、合計20枠
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_kai6"); fs.mkdirSync(SHOTS, { recursive: true });
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage(); const errs = [];
page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
const shot = n => page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: true });
const tap = sel => page.$eval(sel, e => e.click());
try {
  await page.goto(URL0); await page.waitForTimeout(800);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 })); localStorage.setItem("kq_battle_daimon_merged_v1", "1"); });
  await page.reload(); await page.waitForTimeout(900);
  const unitText = () => page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice")].map(e => e.textContent.replace(/\s+/g, " ").trim()));
  await tap("#subject-social"); await page.waitForTimeout(300);
  const us = await unitText();
  const s6 = us.find(t => t.includes("第6回.鎌倉時代"));
  check("S1 社会の単元に 第6回.鎌倉時代（68問＝一問一答47＋大問の小問21）", s6 && /68問/.test(s6), s6);
  await shot("S1_social_units");
  await tap("#subject-science"); await page.waitForTimeout(300);
  const ur = await unitText();
  const r6 = ur.find(t => t.includes("第6回.ヒトと動物の呼吸・循環"));
  const expect = await page.evaluate(() => QA_DATA.filter(q => q.subj === "理科" && q.u === "第6回.ヒトと動物の呼吸・循環" && q.kind !== "calc" && q.kind !== "daimon").length
    + DAIMON_DATA.filter(g => g.kai === 6 && g.subj !== "社会" && !g.paper).reduce((a, g) => a + g.items.length, 0));   // 一問一答35＋大問の小問38＝73（2026-10-03 夜: その2 で一問一答 29→35、その3 で小問をまとめて 59→38）
  check("S2 理科の単元に 第6回.ヒトと動物の呼吸・循環（" + expect + "問）", r6 && r6.includes(String(expect)), r6);
  await shot("S2_science_units");
  const m = await page.evaluate(() => ({ visible: DAIMON_DATA.filter(g => g.kai === 6 && g.subj !== "社会" && !g.paper).map(g => g.key), paper: DAIMON_DATA.filter(g => g.kai === 6 && g.subj !== "社会" && g.paper).map(g => g.key + ":" + g.items.length) }));
  check("S3 アプリに出る第6回の大問 7題・紙は3題", m.visible.length === 7 && m.paper.length === 3 && expect === 73, JSON.stringify(m) + " ／ 単元の問数 " + expect);
  await tap("#daimon-open-btn"); await page.waitForTimeout(500);
  const dl = await page.evaluate(() => document.getElementById("daimon-list-body").innerText);
  check("S3 大問の一覧に第6回が出る", /第6回/.test(dl), dl.slice(0, 80));
  const keys = await page.evaluate(() => [...document.querySelectorAll("#daimon-list-body [data-key]")].map(e => e.dataset.key).filter(k => /^r6_/.test(k)));
  // ★「テスト形式（大問）で解く」の一覧は、前から紙の大問も並べる（第3・4回も同じ・2026-09-28 から）。出題（QA_DATA）には入らない
  const r3paperInList = await page.evaluate(() => { const ks = new Set([...document.querySelectorAll("#daimon-list-body [data-key]")].map(e => e.dataset.key)); return DAIMON_DATA.filter(g => g.kai === 3 && g.paper).every(g => ks.has(g.key)); });
  const inQA = await page.evaluate(() => DAIMON_DATA.filter(g => g.kai === 6 && g.subj !== "社会" && g.paper).filter(g => QA_DATA.some(q => q.id === g.key || (q.itemIds || []).some(x => g.items.some(it => it.id === x)))).map(g => g.key));
  check("S3 大問の一覧の第6回は10題（第3回と同じく紙も並ぶ: " + r3paperInList + "）。紙の3題は出題（QA_DATA）に入らない", keys.length === 10 && r3paperInList && inQA.length === 0, keys.join(" ") + " ／ 出題に入った紙: " + inQA.join(" "));
  await shot("S3_daimon_list");
  // 第6回 基本問題 大問1 を開く
  const opened = await page.evaluate(() => {
    const el = [...document.querySelectorAll("#daimon-list-body *")].filter(e => e.children.length === 0 || e.tagName === "BUTTON").find(e => /第6回/.test(e.closest("[data-key]") ? e.closest("[data-key]").dataset.key + e.textContent : "") && /基本/.test(e.textContent + (e.closest("[data-key]") || {}).dataset?.key));
    const k = [...document.querySelectorAll("#daimon-list-body [data-key]")].find(e => e.dataset.key === "r6_基本問題_1");
    const t = k && (k.querySelector("button") || k); if (t) { t.click(); return k.dataset.key; } return null;
  });
  await page.waitForTimeout(600);
  const scr = await page.evaluate(() => (document.querySelector(".screen.active") || {}).id);
  check("S5 第6回 基本問題 大問1 を開ける（" + opened + " → " + scr + "）", opened && scr === "screen-daimon", "");
  if (scr === "screen-daimon") await shot("S5_daimon_r6k1");
  await page.reload(); await page.waitForTimeout(900);
  await tap("#subject-science"); await page.waitForTimeout(300);
  await tap("#paper-open-btn"); await page.waitForTimeout(500);
  const pl = await page.evaluate(() => document.getElementById("paper-list-body").innerText);
  check("S4 紙で出すの一覧に第6回と「発展」が出る", /第6回/.test(pl) && /発展/.test(pl), pl.replace(/\s+/g, " ").slice(0, 200));
  await shot("S4_paper_list");
  // TIMELINE_MARKS はページの外から見えない（const）ので、index.html の本文から数える
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tl = { miss: [], n: 0 };
  for (let i = 24; i <= 38; i++) { const mm = html.match(new RegExp('^  "g6r' + i + '": (\\[.*\\]),\\s*$', "m")); if (!mm) tl.miss.push("g6r" + i); else tl.n += JSON.parse(mm[1]).length; }
  check("S6 年表 g6r24〜38 の15問すべてに枠・合計20枠", tl.miss.length === 0 && tl.n === 20, JSON.stringify(tl));
  check("画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました"); console.log("写真: " + SHOTS);
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
