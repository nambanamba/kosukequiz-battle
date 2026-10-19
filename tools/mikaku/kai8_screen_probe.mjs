// 第8回社会の取り込みを画面で見る（2026-10-10）。本物の Chrome・390x844。
// 使い方: node tools/mikaku/kai7_screen_probe.mjs   スクショは tools/mikaku/shots_kai8/（コミットしない）
// 見ること:
//   S1 社会の単元えらびに「第7回.室町時代」（一問一答118＋大問の小問27）
//   S2 理科の単元えらびに「第7回.物の燃焼」（一問一答54＋アプリに出る大問の小問43）
//   S3 ★練習3の分割（daimon_data.js の形）: 「3」＝問1〜4 は紙の印なし・紙の印は「3（問5・6）」と「発展」だけ
//   S4 ★第7回の理科を全部、一人で実際に解く（?subj=理科&unit=）: 紙の7問は1問も出ない・「3」の問1〜4は出る
//   S5 大問の一覧から「3」を開くと 問1〜4 だけが出る
//   S6 ★一人で「3」を実際に解く（?ids=）と、出るのは r7r301〜304 の4問だけ
//   S7 紙で出すの一覧に「3（問5・6）」と「発展」が出て「3」は出ない。問題の紙に答えが出ない
//   S8 表のカード（r7m33 表1・g7r105 表A）と年表 g7r60 に画像が出る。答えの図（aFile）は第7回に無い
//   S9 第7回の画像が全部 200
//   S10 年表 g7r56〜72 の17問に枠・合計25枠／優先度「低」 理科8・社会68
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_kai8"); fs.mkdirSync(SHOTS, { recursive: true });
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
const G = "第8回.安土・桃山時代";
try {
  await fresh();
  const unitText = () => page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice")].map(e => e.textContent.replace(/\s+/g, " ").trim()));
  await tap("#subject-social"); await page.waitForTimeout(300);
  const gExp = await page.evaluate(G => QA_DATA.filter(q => q.subj === "社会" && q.u === G && q.kind !== "daimon").length + DAIMON_DATA.filter(g => g.kai === 8 && g.subj === "社会" && !g.paper).reduce((a, g) => a + g.items.length, 0), G);
  const gRow = (await unitText()).find(t => t.includes(G));
  check("S1 社会の単元に " + G + "（128＋26=154問）", gExp === 154 && gRow && gRow.includes("154"), gRow);
  for (const [id, img] of [["g8r52", "kai8_01.jpg"], ["g8r45", "kai8_02.jpg"], ["g8r95", "kai8_09.jpg"], ["g8r101", "kai8_11.jpg"], ["g8r76", "kai8_05.jpg"]]) {
    await fresh("?ids=" + id);
    await tap("#today-start-btn"); await page.waitForTimeout(1300);
    const st = await page.evaluate(() => { const im = document.getElementById("solo-img"); return { id: document.getElementById("solo-q-id").textContent, src: im.getAttribute("src") || "", ok: im.complete && im.naturalWidth > 0, shown: !!document.getElementById("solo-img-wrap").offsetParent }; });
    check("S8 " + id + " のカードに " + img + " が出る", st.id.replace(/~\d+$/, "") === "No." + id && st.src.endsWith(img) && st.ok && st.shown, JSON.stringify(st));
    await shot("S8_card_" + id, false);
  }
  const af = await page.evaluate(() => DAIMON_DATA.filter(g => g.kai === 8).flatMap(g => g.items).filter(i => i.aFile).length);
  check("S8 第8回に答えの図（aFile）は無い", af === 0, af);
  const imgs = await page.evaluate(() => [...new Set([...QA_DATA.filter(q => /^g8r/.test(q.id) && q.img).map(q => q.img), ...DAIMON_DATA.filter(g => g.kai === 8 && g.subj === "社会").flatMap(g => [g.file, ...g.items.map(i => i.file)]).filter(Boolean)])]);
  const st = await page.evaluate(async list => { const r = []; for (const n of list) { const x = await fetch("images/" + n); r.push(n + ":" + x.status); } return r; }, imgs);
  const bad = st.filter(s => !s.endsWith(":200"));
  check("S9 第8回社会の画像 " + imgs.length + "枚 すべて 200・kai8_10 は無い", bad.length === 0 && imgs.length === 12 && !imgs.includes("kai8_10.jpg") && !imgs.includes("kai8_12.jpg"), bad.join(" ") + " n=" + imgs.length);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tl = { miss: [], n: 0 };
  for (let i = 52; i <= 67; i++) { const mm = html.match(new RegExp('^  "g8r' + i + '": (\\[.*\\]),\\s*$', "m")); if (!mm) tl.miss.push("g8r" + i); else tl.n += JSON.parse(mm[1]).length; }
  check("S10 年表 g8r52〜67 の16問すべてに枠・合計29枠", tl.miss.length === 0 && tl.n === 29, JSON.stringify(tl));
  const low = await page.evaluate(() => ({ g: QA_DATA.filter(q => /^g8r/.test(q.id) && q.priority === "低").length, n: QA_DATA.filter(q => /^g8r/.test(q.id) && q.priority !== "低").length }));
  check("S10 優先度 低55・普通73", low.g === 55 && low.n === 73, JSON.stringify(low));
  // S12 10-19 追加の15問: 地図（kai8_14: 114〜120 / kai8_13: 121・122）が出る・記述（123〜127）の問いと答えと解説が横にはみ出さない
  for (const [id, img] of [["g8r114", "kai8_14.jpg"], ["g8r120", "kai8_14.jpg"], ["g8r121", "kai8_13.jpg"], ["g8r122", "kai8_13.jpg"], ["g8r123", ""], ["g8r124", ""], ["g8r125", ""], ["g8r126", ""], ["g8r127", ""], ["g8r128", ""]]) {
    await fresh("?ids=" + id);
    await tap("#today-start-btn"); await page.waitForTimeout(1300);
    await page.evaluate(() => { const b = document.getElementById("solo-reveal-btn"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(300);
    const st = await page.evaluate(() => { const im = document.getElementById("solo-img"); const de = document.documentElement; const sc = document.getElementById("screen-solo");
      const wide = [...sc.querySelectorAll("*")].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.id || e.className).slice(0, 5);
      return { id: document.getElementById("solo-q-id").textContent, src: im.getAttribute("src") || "", ok: im.complete && im.naturalWidth > 0, shown: !!document.getElementById("solo-img-wrap").offsetParent, pageOver: de.scrollWidth > de.clientWidth, wide }; });
    check("S12 " + id + (img ? " に " + img + " が出る" : "（画像なし）") + "・横にはみ出さない", st.id.replace(/~\d+$/, "") === "No." + id && (img ? st.src.endsWith(img) && st.ok && st.shown : true) && !st.pageOver && st.wide.length === 0, JSON.stringify(st));
    await shot("S12_card_" + id, false);
  }
  // S11 第8回の社会を全部一人で解く
  await fresh("?subj=" + encodeURIComponent("社会") + "&unit=" + encodeURIComponent(G));
  await tap("#today-start-btn"); await page.waitForTimeout(1200);
  const all = new Set(); let steps = 0;
  for (; steps < 400 && (await active()) === "screen-solo"; steps++) {
    all.add(await page.evaluate(() => document.getElementById("solo-q-id").textContent.replace(/^No\./, "")));
    await page.evaluate(() => { const b = document.getElementById("solo-reveal-btn"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(100);
    await page.evaluate(() => { const b = document.getElementById("solo-judge-ok"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(180);
  }
  const g8 = [...all].filter(id => /^g8r/.test(id)).length, d8 = [...all].filter(id => /^g8d/.test(id)).length;
  check("S11 第8回の社会を全部解く: 一問一答128＋大問26が出て、最後は結果画面", g8 === 128 && d8 === 26, steps + "手・g8r " + g8 + "・g8d " + d8 + "・最後 " + (await active()));
  check("画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました"); console.log("写真: " + SHOTS);
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
