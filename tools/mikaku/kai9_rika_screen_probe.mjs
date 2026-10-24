// 第9回理科の取り込みを画面で見る（2026-10-24）。本物の Chrome・390x844。kai8_rika_screen_probe.mjs を第9回に写したもの
// 使い方: node tools/mikaku/kai9_rika_screen_probe.mjs   スクショは tools/mikaku/shots_kai9r/（コミットしない）
// 見ること:
//   R1 理科の単元えらびに「第9回.流水と地層」（一問一答65＋アプリに出る大問の小問33）
//   R3 紙の印は 練習4（問3・4）2問・発展1問 の2題だけ／アプリに出る大問 7題／練習4=問1・2
//   R5 大問の一覧に第9回の9題
//   R4 ★第9回の理科を全部、一人で実際に解く: 紙の3問は1問も出ない・練習4の問1・2は出る・大問の小問33・カード65
//   R7 紙で出すの一覧に 練習4（問3・4）と発展だけ。問題の紙に問3・問4だけ
//   R8 表・図のカードに画像が出る／R9 第9回の画像 20枚が全部 200／R10 優先度 高25・普通34・低6／calc は入っていない
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_kai9r"); fs.mkdirSync(SHOTS, { recursive: true });
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": rel.endsWith(".html") ? "text/html; charset=utf-8" : rel.endsWith(".js") ? "text/javascript; charset=utf-8" : rel.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL0 = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage(); const errs = [];
page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
const shot = (n, full = true) => page.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: full });
const tap = sel => page.$eval(sel, e => e.click());
const active = () => page.evaluate(() => (document.querySelector(".screen.active") || {}).id);
const fresh = async (q = "") => {
  await page.goto(URL0 + q); await page.waitForTimeout(700);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 })); localStorage.setItem("kq_battle_daimon_merged_v1", "1"); });
  await page.reload(); await page.waitForTimeout(900);
};
const R = "第9回.流水と地層", K4P = "r9_練習問題_4（問3・4）", KH = "r9_練習問題_発展";
try {
  await fresh();
  await tap("#subject-science"); await page.waitForTimeout(300);
  const rExp = await page.evaluate(R => QA_DATA.filter(q => q.subj === "理科" && q.u === R && q.kind !== "daimon").length + DAIMON_DATA.filter(g => g.kai === 9 && g.subj !== "社会" && !g.paper).reduce((a, g) => a + g.items.length, 0), R);
  const rRow = (await page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice")].map(e => e.textContent.replace(/\s+/g, " ").trim()))).find(t => t.includes(R));
  check("R1 理科の単元に " + R + "（カード65＋大問の小問33。数は部分で数えた答える数）", rExp >= 98 && rRow && /\d+問/.test(rRow), rExp + " " + rRow);
  await shot("R1_units");
  const sp = await page.evaluate(() => { const r = DAIMON_DATA.filter(g => g.kai === 9 && g.subj !== "社会"); return { paper: r.filter(g => g.paper).map(g => g.key + ":" + g.items.length), visible: r.filter(g => !g.paper).length, n4: (r.find(g => g.key === "r9_練習問題_4") || {}).items.map(i => i.id).join(",") }; });
  check("R3 紙の印は 練習4（問3・4）2問・発展1問 の2題だけ／アプリに出る大問 7題／練習4=問1・2", sp.paper.join(" ") === "r9_練習問題_4（問3・4）:2 r9_練習問題_発展:1" && sp.visible === 7 && sp.n4 === "r9r401,r9r402", JSON.stringify(sp));
  await tap("#daimon-open-btn"); await page.waitForTimeout(500);
  const keys = await page.evaluate(() => [...document.querySelectorAll("#daimon-list-body [data-key]")].map(e => e.dataset.key).filter(k => /^r9_/.test(k)));
  check("R5 大問の一覧に第9回の9題（紙もこれまでどおり並ぶ）", keys.length === 9 && keys.includes(K4P) && keys.includes(KH), keys.join(" "));
  // R4 第9回の理科を全部一人で解く
  await fresh("?subj=" + encodeURIComponent("理科") + "&unit=" + encodeURIComponent(R));
  await tap("#today-start-btn"); await page.waitForTimeout(1200);
  const all = new Set(); let steps = 0;
  for (; steps < 400 && (await active()) === "screen-solo"; steps++) {
    all.add(await page.evaluate(() => document.getElementById("solo-q-id").textContent.replace(/^No\./, "")));
    await page.evaluate(() => { const b = document.getElementById("solo-reveal-btn"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(100);
    await page.evaluate(() => { const b = document.getElementById("solo-judge-ok"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(180);
  }
  const ids = [...all];
  const paperSeen = ids.filter(id => /^r9r(403|404|50\d)$/.test(id));
  const r4seen = ["r9r401", "r9r402"].filter(id => all.has(id));
  const dmSeen = ids.filter(id => /^r9[ykr]\d/.test(id)).length, cardSeen = new Set(ids.filter(id => /^r9m/.test(id)).map(id => id.replace(/~\d+$/, ""))).size;
  check("R4 第9回の理科を全部解く: 紙の3問は1問も出ない・練習4の問1・2は出る・大問の小問33・カード65", paperSeen.length === 0 && r4seen.length === 2 && dmSeen === 33 && cardSeen === 65,
    steps + "手・カード" + cardSeen + "・大問の小問" + dmSeen + "／紙: " + (paperSeen.join(",") || "なし") + "／最後 " + (await active()));
  // R7 紙で出す
  await fresh();
  await tap("#subject-science"); await page.waitForTimeout(300);
  await tap("#paper-open-btn"); await page.waitForTimeout(500);
  const prow = await page.evaluate(() => [...document.querySelectorAll("#paper-list-body .paper-row")].map(e => e.dataset.key).filter(k => /^r9_/.test(k)));
  check("R7 紙で出すの一覧に 練習4（問3・4）と発展だけ", prow.length === 2 && prow.includes(K4P) && prow.includes(KH), prow.join(" "));
  await shot("R7_paper_list");
  await page.$eval('.paper-row[data-key="' + K4P + '"]', e => e.click()); await page.waitForTimeout(250);
  await page.$eval("#paper-pick-go", e => e.click()).catch(() => {}); await page.waitForTimeout(500);
  const sheets = await page.evaluate(() => [...document.querySelectorAll("#paper-print-body .paper-sheet")].map(e => e.innerText));
  const qs = sheets[0] || "";
  check("R7 問題の紙に 問3・問4 だけ", (await active()) === "screen-paper-print" && /問3/.test(qs) && /問4/.test(qs) && !/問1/.test(qs), sheets.length + "枚 " + qs.replace(/\s+/g, " ").slice(0, 100));
  await shot("R7_paper_print");
  // R8 画像つきカード
  for (const [id, img] of [["r9m14", "r9_02.jpg"], ["r9m20", "r9_03.jpg"], ["r9m22", "r9_04.jpg"], ["r9m23", "r9_07.jpg"], ["r9m49", "r9_06.jpg"], ["r9m53", "r9_08.jpg"], ["r9m56", "r9_09.jpg"]]) {
    await fresh("?ids=" + id);
    await tap("#today-start-btn"); await page.waitForTimeout(1300);
    const st = await page.evaluate(() => { const im = document.getElementById("solo-img"); return { id: document.getElementById("solo-q-id").textContent, src: im.getAttribute("src") || "", ok: im.complete && im.naturalWidth > 0, shown: !!document.getElementById("solo-img-wrap").offsetParent }; });
    check("R8 " + id + " のカードに " + img + " が出る", st.id.replace(/~\d+$/, "") === "No." + id && st.src.endsWith(img) && st.ok && st.shown, JSON.stringify(st));
    await shot("R8_card_" + id, false);
  }
  // R9 画像が全部 200
  const imgs = await page.evaluate(() => [...new Set([...QA_DATA.filter(q => /^r9m/.test(q.id) && q.img).map(q => q.img), ...DAIMON_DATA.filter(g => g.kai === 9 && g.subj !== "社会").flatMap(g => [g.file, ...g.items.map(i => i.file), ...g.items.map(i => i.aFile)]).filter(Boolean)])]);
  const st = await page.evaluate(async list => { const r = []; for (const n of list) { const x = await fetch("images/" + n); r.push(n + ":" + x.status); } return r; }, imgs);
  const bad = st.filter(s => !s.endsWith(":200"));
  const unused = [];
  check("R9 第9回の理科の画像 " + imgs.length + "枚 すべて 200", bad.length === 0 && unused.length === 0 && imgs.length === 20, bad.join(" ") + " n=" + imgs.length + " " + unused.join(","));
  const low = await page.evaluate(() => { const c = {}; QA_DATA.filter(q => /^r9m/.test(q.id)).forEach(q => c[q.priority] = (c[q.priority] || 0) + 1); return c; });
  check("R10 優先度 高25・普通34・低6", low["高"] === 25 && low["普通"] === 34 && low["低"] === 6, JSON.stringify(low));
  check("calc は入っていない", await page.evaluate(() => !QA_DATA.some(q => /^r9[cd]/.test(q.id) || q.kind === "calc" && q.u && q.u.startsWith("第9回"))), "");
  check("画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました"); console.log("写真: " + SHOTS);
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
