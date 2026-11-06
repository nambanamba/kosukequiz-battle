// 第11回（社会・理科）の取り込みを画面で見る（2026-11-06）。本物の Chrome・390x844。kai9_screen_probe.mjs を写したもの
// 使い方: node tools/mikaku/kai11_screen_probe.mjs   スクショは tools/mikaku/shots_kai11/（コミットしない）
// 見ること:
//   S1 社会の単元に「第11回.江戸時代(2)」93問（大問なし）／理科の単元に「第11回.光と音」65＋大問のアプリの小問
//   S8 図のある第11回のカード（社会16・理科13）すべてで図が出て、横にはみ出さない
//   S9 第11回の画像（カード・大問）すべて 200
//   S10 年表 g11r47〜52 の6問に枠・合計10枠／優先度 社会 低25・普通68／理科 高26・普通32・低7
//   S11 第11回の社会・理科を全部一人で解く: 全部出て、最後は結果画面
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_kai11"); fs.mkdirSync(SHOTS, { recursive: true });
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

const GS = "第11回.江戸時代(2)", GR = "第11回.光と音";
try {
  await fresh();
  const unitText = () => page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice")].map(e => e.textContent.replace(/\s+/g, " ").trim()));
  const cnt = await page.evaluate(([GS, GR]) => ({
    s: QA_DATA.filter(q => q.subj === "社会" && q.u === GS).length + DAIMON_DATA.filter(g => g.kai === 11 && g.subj === "社会" && !g.paper).reduce((a, g) => a + g.items.length, 0),
    r: QA_DATA.filter(q => q.subj === "理科" && q.u === GR).length,
    rm: QA_DATA.filter(q => /^r11m/.test(q.id)).length,
    rd: DAIMON_DATA.filter(g => g.kai === 11 && /^r11_/.test(g.key) && !g.paper).reduce((a, g) => a + g.items.length, 0),
    rp: DAIMON_DATA.filter(g => g.kai === 11 && /^r11_/.test(g.key) && g.paper).length }), [GS, GR]);
  await tap("#subject-social"); await page.waitForTimeout(300);
  const sRow = (await unitText()).find(t => t.includes(GS));
  check("S1 社会の単元に " + GS + "（93問・大問なし）", cnt.s === 93 && sRow && sRow.includes("93"), sRow + " " + JSON.stringify(cnt));
  await fresh(); await tap("#subject-science"); await page.waitForTimeout(300);
  const rRow = (await unitText()).find(t => t.includes(GR));
  check("S1 理科の単元に " + GR + "（一問一答65＋大問6題の小問 " + cnt.rd + "・紙 " + cnt.rp + "題）", cnt.rm === 65 && cnt.r === 71 && cnt.rd === 27 && cnt.rp === 2 && !!rRow, rRow + " " + JSON.stringify(cnt));
  const cards = await page.evaluate(() => QA_DATA.filter(q => /^(g11r|r11m)/.test(q.id) && q.img).map(q => [q.id, q.img]));
  check("S8 図のあるカード 社会16・理科13", cards.filter(c => /^g/.test(c[0])).length === 16 && cards.filter(c => /^r/.test(c[0])).length === 13, cards.length);
  for (const [id, img] of cards) {
    await fresh("?ids=" + id);
    await tap("#today-start-btn"); await page.waitForTimeout(1300);
    await page.evaluate(() => { const b = document.getElementById("solo-reveal-btn"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(300);
    const st = await page.evaluate(() => { const im = document.getElementById("solo-img"); const de = document.documentElement; const sc = document.getElementById("screen-solo");
      const wide = [...sc.querySelectorAll("*")].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.id || e.className).slice(0, 5);
      return { id: document.getElementById("solo-q-id").textContent, src: im.getAttribute("src") || "", ok: im.complete && im.naturalWidth > 0, shown: !!document.getElementById("solo-img-wrap").offsetParent, pageOver: de.scrollWidth > de.clientWidth, wide }; });
    check("S8 " + id + " のカードに " + img + " が出る・横にはみ出さない", st.id.replace(/~\d+$/, "") === "No." + id && st.src.endsWith(img) && st.ok && st.shown && !st.pageOver && st.wide.length === 0, JSON.stringify(st));
    await shot("S8_card_" + id, false);
  }
  const imgs = await page.evaluate(() => [...new Set([...QA_DATA.filter(q => /^(g11r|r11m)/.test(q.id) && q.img).map(q => q.img), ...DAIMON_DATA.filter(g => g.kai === 11).flatMap(g => [g.file, ...g.items.map(i => i.file)]).filter(Boolean)])]);
  const st = await page.evaluate(async list => { const r = []; for (const n of list) { const x = await fetch("images/" + n); r.push(n + ":" + x.status); } return r; }, imgs);
  const bad = st.filter(s => !s.endsWith(":200"));
  check("S9 第11回の画像 " + imgs.length + "枚 すべて 200", bad.length === 0 && imgs.length >= 27, bad.join(" ") + " n=" + imgs.length);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tl = { miss: [], n: 0 };
  for (let i = 47; i <= 52; i++) { const mm = html.match(new RegExp('^  "g11r' + i + '": (\\[[^\\r\\n]*\\]),', "m")); if (!mm) tl.miss.push("g11r" + i); else tl.n += JSON.parse(mm[1]).length; }
  check("S10 年表 g11r47〜52 の6問すべてに枠・合計10枠", tl.miss.length === 0 && tl.n === 10, JSON.stringify(tl));
  const pr = await page.evaluate(() => { const c = (re, p) => QA_DATA.filter(q => re.test(q.id) && q.priority === p).length; return { g低: c(/^g11r/, "低"), g普通: c(/^g11r/, "普通"), r高: c(/^r11m/, "高"), r普通: c(/^r11m/, "普通"), r低: c(/^r11m/, "低") }; });
  check("S10 優先度 社会 低25・普通68／理科 高26・普通32・低7", pr.g低 === 25 && pr.g普通 === 68 && pr.r高 === 26 && pr.r普通 === 32 && pr.r低 === 7, JSON.stringify(pr));
  for (const [subj, G, re, n] of [["社会", GS, /^g11[rd]/, 93], ["理科", GR, /^r11m/, 65]]) {
    await fresh("?subj=" + encodeURIComponent(subj) + "&unit=" + encodeURIComponent(G));
    await tap("#today-start-btn"); await page.waitForTimeout(1200);
    const all = new Set(); let steps = 0;
    for (; steps < 400 && (await active()) === "screen-solo"; steps++) {
      all.add(await page.evaluate(() => document.getElementById("solo-q-id").textContent.replace(/^No\./, "")));
      await page.evaluate(() => { const b = document.getElementById("solo-reveal-btn"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(100);
      await page.evaluate(() => { const b = document.getElementById("solo-judge-ok"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(180);
    }
    const k = new Set([...all].map(id => id.replace(/~\d+$/, "")).filter(id => re.test(id))).size;
    if (subj === "理科") { const dk = [...all].filter(id => /^r11[kr]\d/.test(id) || /^r11_/.test(id)).length; check("S11 理科の大問（アプリの6題）も出る", dk > 0, dk + "件 例 " + [...all].filter(id => !/^r11m/.test(id)).slice(0, 4).join(",")); }
    check("S11 第11回の" + subj + "を全部解く: " + n + "問（分けたカードは1問に数える）が出て、最後は結果画面", k === n && (await active()) !== "screen-solo", steps + "手・" + k + "問・最後 " + (await active()));
  }
  check("画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました"); console.log("写真: " + SHOTS);
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
