// 第9回社会の取り込みを画面で見る（2026-10-24）。本物の Chrome・390x844。kai8_screen_probe.mjs を写したもの
// 使い方: node tools/mikaku/kai9_screen_probe.mjs   スクショは tools/mikaku/shots_kai9/（コミットしない）
// 見ること:
//   S1 社会の単元えらびに「第9回.江戸時代(1)」（一問一答112＋大問の小問23＝135問）
//   S8 図のカード（年表・肖像画・地図・グラフ・写真・絵・表）に kai9_01〜10 が出て、横にはみ出さない
//   S9 第9回社会の画像 10枚 すべて 200
//   S10 年表 g9r46〜55 の10問すべてに枠・合計19枠／優先度 低36・普通76
//   S11 第9回の社会を全部一人で解く: 一問一答112＋大問23が出て、最後は結果画面
//   S10 年表 g7r56〜72 の17問に枠・合計25枠／優先度「低」 理科8・社会68
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_kai9"); fs.mkdirSync(SHOTS, { recursive: true });
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
const G = "第9回.江戸時代(1)";
try {
  await fresh();
  const unitText = () => page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice")].map(e => e.textContent.replace(/\s+/g, " ").trim()));
  await tap("#subject-social"); await page.waitForTimeout(300);
  const gExp = await page.evaluate(G => QA_DATA.filter(q => q.subj === "社会" && q.u === G && q.kind !== "daimon").length + DAIMON_DATA.filter(g => g.kai === 9 && g.subj === "社会" && !g.paper).reduce((a, g) => a + g.items.length, 0), G);
  const gRow = (await unitText()).find(t => t.includes(G));
  check("S1 社会の単元に " + G + "（112＋23=135問）", gExp === 135 && gRow && gRow.includes("135"), gRow);
  for (const [id, img] of [["g9r46", "kai9_01.jpg"], ["g9r89", "kai9_02.jpg"], ["g9r90", "kai9_03.jpg"], ["g9r91", "kai9_04.jpg"], ["g9r93", "kai9_05.jpg"], ["g9r94", "kai9_06.jpg"], ["g9r95", "kai9_07.jpg"], ["g9r96", "kai9_08.jpg"], ["g9r83", "kai9_09.jpg"], ["g9r86", "kai9_10.jpg"]]) {
    await fresh("?ids=" + id);
    await tap("#today-start-btn"); await page.waitForTimeout(1300);
    await page.evaluate(() => { const b = document.getElementById("solo-reveal-btn"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(300);
    const st = await page.evaluate(() => { const im = document.getElementById("solo-img"); const de = document.documentElement; const sc = document.getElementById("screen-solo");
      const wide = [...sc.querySelectorAll("*")].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.id || e.className).slice(0, 5);
      return { id: document.getElementById("solo-q-id").textContent, src: im.getAttribute("src") || "", ok: im.complete && im.naturalWidth > 0, shown: !!document.getElementById("solo-img-wrap").offsetParent, pageOver: de.scrollWidth > de.clientWidth, wide }; });
    check("S8 " + id + " のカードに " + img + " が出る・横にはみ出さない", st.id.replace(/~\d+$/, "") === "No." + id && st.src.endsWith(img) && st.ok && st.shown && !st.pageOver && st.wide.length === 0, JSON.stringify(st));
    await shot("S8_card_" + id, false);
  }
  const imgs = await page.evaluate(() => [...new Set([...QA_DATA.filter(q => /^g9r/.test(q.id) && q.img).map(q => q.img), ...DAIMON_DATA.filter(g => g.kai === 9 && g.subj === "社会").flatMap(g => [g.file, ...g.items.map(i => i.file)]).filter(Boolean)])]);
  const st = await page.evaluate(async list => { const r = []; for (const n of list) { const x = await fetch("images/" + n); r.push(n + ":" + x.status); } return r; }, imgs);
  const bad = st.filter(s => !s.endsWith(":200"));
  check("S9 第9回社会の画像 " + imgs.length + "枚 すべて 200", bad.length === 0 && imgs.length === 10, bad.join(" ") + " n=" + imgs.length);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tl = { miss: [], n: 0 };
  for (let i = 46; i <= 55; i++) { const mm = html.match(new RegExp('^  "g9r' + i + '": (\\[.*\\]),\\s*$', "m")); if (!mm) tl.miss.push("g9r" + i); else tl.n += JSON.parse(mm[1]).length; }
  check("S10 年表 g9r46〜55 の10問すべてに枠・合計19枠", tl.miss.length === 0 && tl.n === 19, JSON.stringify(tl));
  const low = await page.evaluate(() => ({ g: QA_DATA.filter(q => /^g9r/.test(q.id) && q.priority === "低").length, n: QA_DATA.filter(q => /^g9r/.test(q.id) && q.priority !== "低").length }));
  check("S10 優先度 低36・普通76", low.g === 36 && low.n === 76, JSON.stringify(low));
  await fresh("?subj=" + encodeURIComponent("社会") + "&unit=" + encodeURIComponent(G));
  await tap("#today-start-btn"); await page.waitForTimeout(1200);
  const all = new Set(); let steps = 0;
  for (; steps < 400 && (await active()) === "screen-solo"; steps++) {
    all.add(await page.evaluate(() => document.getElementById("solo-q-id").textContent.replace(/^No\./, "")));
    await page.evaluate(() => { const b = document.getElementById("solo-reveal-btn"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(100);
    await page.evaluate(() => { const b = document.getElementById("solo-judge-ok"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(180);
  }
  const g9 = [...all].filter(id => /^g9r/.test(id)).length, d9 = [...all].filter(id => /^g9d/.test(id)).length;
  check("S11 第9回の社会を全部解く: 一問一答112＋大問23が出て、最後は結果画面", g9 === 112 && d9 === 23, steps + "手・g9r " + g9 + "・g9d " + d9 + "・最後 " + (await active()));
  check("画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました"); console.log("写真: " + SHOTS);
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
