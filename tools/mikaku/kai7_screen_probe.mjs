// 第7回（社会・理科）の取り込みを画面で見る（2026-10-10）。本物の Chrome・390x844。
// 使い方: node tools/mikaku/kai7_screen_probe.mjs   スクショは tools/mikaku/shots_kai7/（コミットしない）
// 見ること:
//   S1 社会の単元えらびに「第7回.室町時代」（一問一答118＋大問の小問27）
//   S2 理科の単元えらびに「第7回.物の燃焼」（一問一答53＋アプリに出る大問の小問43）
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
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_kai7"); fs.mkdirSync(SHOTS, { recursive: true });
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
const R = "第7回.物の燃焼", G = "第7回.室町時代", K3 = "r7_練習問題_3", K3P = "r7_練習問題_3（問5・6）", KH = "r7_練習問題_発展";
try {
  await fresh();
  const unitText = () => page.evaluate(() => [...document.querySelectorAll("#unit-choices .choice")].map(e => e.textContent.replace(/\s+/g, " ").trim()));
  await tap("#subject-social"); await page.waitForTimeout(300);
  const gExp = await page.evaluate(G => QA_DATA.filter(q => q.subj === "社会" && q.u === G && q.kind !== "daimon").length + DAIMON_DATA.filter(g => g.kai === 7 && g.subj === "社会" && !g.paper).reduce((a, g) => a + g.items.length, 0), G);
  const gRow = (await unitText()).find(t => t.includes(G));
  check("S1 社会の単元に " + G + "（" + gExp + "問＝118＋27）", gExp === 145 && gRow && gRow.includes("145"), gRow);
  await tap("#subject-science"); await page.waitForTimeout(300);
  const rExp = await page.evaluate(R => QA_DATA.filter(q => q.subj === "理科" && q.u === R && q.kind !== "daimon").length + DAIMON_DATA.filter(g => g.kai === 7 && g.subj !== "社会" && !g.paper).reduce((a, g) => a + g.items.length, 0), R);
  const rRow = (await unitText()).find(t => t.includes(R));
  // ★単元の数は「答える数」（答えが複数の理科カードは部分の数で数える）なので 96 より多い。紙の7問が入っていないことは S4 で実際に解いて見る
  check("S2 理科の単元に " + R + "（カード53＋大問の小問43。数は部分で数えた答える数）", rExp === 96 && rRow && /\d+問/.test(rRow), rRow);
  await shot("S2_science_units");
  // S3 データの形（daimon_data.js）。アプリの中身は module で外から見えないので、出るかどうかは S5〜S7 で画面から見る
  const sp = await page.evaluate(([K3, K3P, KH]) => {
    const r7 = DAIMON_DATA.filter(g => g.kai === 7 && g.subj !== "社会");
    const g3 = r7.find(g => g.key === K3);
    return { g3: g3 && !g3.paper ? g3.items.map(i => i.id).join(",") : null, paper: r7.filter(g => g.paper).map(g => g.key + ":" + g.items.length), visible: r7.filter(g => !g.paper).length };
  }, [K3, K3P, KH]);
  check("S3 「3」= 問1〜4（紙の印なし: " + sp.g3 + "）", sp.g3 === "r7r301,r7r302,r7r303,r7r304", "");
  check("S3 紙の印は 3（問5・6）2問・発展5問 の2題だけ／アプリに出る理科の大問 8題", sp.paper.join(" ") === K3P + ":2 " + KH + ":5" && sp.visible === 8, sp.paper.join(" ") + " ／ " + sp.visible);
  // S5 大問の一覧
  await tap("#daimon-open-btn"); await page.waitForTimeout(500);
  const keys = await page.evaluate(() => [...document.querySelectorAll("#daimon-list-body [data-key]")].map(e => e.dataset.key).filter(k => /^r7_/.test(k)));
  check("S5 大問の一覧に第7回の10題（紙もこれまでどおり並ぶ）", keys.length === 10 && keys.includes(K3) && keys.includes(K3P), keys.join(" "));
  const opened = await page.evaluate(K3 => { const k = [...document.querySelectorAll("#daimon-list-body [data-key]")].find(e => e.dataset.key === K3); const t = k && (k.querySelector("button") || k); if (t) { t.click(); return true; } return false; }, K3);
  await page.waitForTimeout(600);
  const dtext = await page.evaluate(() => document.getElementById("screen-daimon").innerText);
  check("S5 「3」を開くと 1 / 4（問1〜4 の4問）", opened && (await active()) === "screen-daimon" && /1 \/ 4/.test(dtext), (await active()));
  await shot("S5_daimon_r7r3");
  // S4 ★第7回の理科を全部、一人で実際に解いて、出た問題の id を集める（紙の2題が1問も出ないこと・「3」の4問は出ること）
  await fresh("?subj=" + encodeURIComponent("理科") + "&unit=" + encodeURIComponent(R));
  await tap("#today-start-btn"); await page.waitForTimeout(1200);
  const all = new Set(); let steps = 0;
  for (; steps < 400 && (await active()) === "screen-solo"; steps++) {
    const id = await page.evaluate(() => document.getElementById("solo-q-id").textContent.replace(/^No\./, ""));
    all.add(id);
    await page.evaluate(() => { const b = document.getElementById("solo-reveal-btn"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(120);
    await page.evaluate(() => { const b = document.getElementById("solo-judge-ok"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(220);
  }
  const ids = [...all];
  const paperSeen = ids.filter(id => /^r7r(305|306|50\d)$/.test(id));
  const r3seen = ["r7r301", "r7r302", "r7r303", "r7r304"].filter(id => all.has(id));
  const dmSeen = ids.filter(id => /^r7[ykr]\d/.test(id)).length, cardSeen = new Set(ids.filter(id => /^r7m/.test(id)).map(id => id.replace(/~\d+$/, ""))).size;
  check("S4 第7回の理科を全部解く: 紙の7問は1問も出ない・「3」の問1〜4は全部出る", paperSeen.length === 0 && r3seen.length === 4 && dmSeen === 43 && cardSeen === 53,
    steps + "手・出た id " + ids.length + "（カード" + cardSeen + "・大問の小問" + dmSeen + "）／紙: " + (paperSeen.join(",") || "なし") + "／3: " + r3seen.join(",") + "／最後の画面 " + (await active()));
  // S6 一人で「3」を実際に解く
  await fresh("?ids=" + encodeURIComponent(K3) + "," + encodeURIComponent(K3P));
  const todayT = await page.evaluate(() => document.getElementById("today-title").textContent);
  await tap("#today-start-btn"); await page.waitForTimeout(1200);
  const seen = [];
  for (let s = 0; s < 12 && (await active()) === "screen-solo"; s++) {
    const id = await page.evaluate(() => document.getElementById("solo-q-id").textContent);
    if (!seen.includes(id)) seen.push(id);
    if (s === 0) await shot("S6_solo_r7r3_first", false);
    await page.evaluate(() => { const b = document.getElementById("solo-reveal-btn"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(300);
    await page.evaluate(() => { const b = document.getElementById("solo-judge-ok"); if (b && b.offsetParent) b.click(); }); await page.waitForTimeout(500);
  }
  check("S6 一人で「3」を解くと r7r301〜304 の4問だけ（紙の 3（問5・6）はリンクに書いても出ない）", seen.join(",") === "No.r7r301,No.r7r302,No.r7r303,No.r7r304", todayT + " → " + seen.join(","));
  // S7 紙で出す
  await fresh();
  await tap("#subject-science"); await page.waitForTimeout(300);
  await tap("#paper-open-btn"); await page.waitForTimeout(500);
  const prow = await page.evaluate(() => [...document.querySelectorAll("#paper-list-body .paper-row")].map(e => e.dataset.key).filter(k => /^r7_/.test(k)));
  check("S7 紙で出すの一覧に 3（問5・6）と発展（3 は無い）", prow.length === 2 && prow.includes(K3P) && prow.includes(KH), prow.join(" "));
  const p3 = await page.$('.paper-row[data-key="' + K3P + '"]');
  if (p3) await p3.scrollIntoViewIfNeeded();
  await shot("S7_paper_list");
  await page.$eval('.paper-row[data-key="' + K3P + '"]', e => e.click()); await page.waitForTimeout(250);
  await page.$eval("#paper-pick-go", e => e.click()).catch(() => {}); await page.waitForTimeout(500);
  const sheets = await page.evaluate(() => [...document.querySelectorAll("#paper-print-body .paper-sheet")].map(e => e.innerText));
  const qs = sheets[0] || "";
  check("S7 問題の紙に 問5・問6 だけ・答え（2g）が無い", (await active()) === "screen-paper-print" && /問5/.test(qs) && /問6/.test(qs) && !/問1/.test(qs) && !/2g/.test(qs), sheets.length + "枚 " + qs.replace(/\s+/g, " ").slice(0, 120));
  await shot("S7_paper_print_r7r3_56");
  // S8 表のカード
  for (const [id, img] of [["r7m33", "r7_03.jpg"], ["g7r105", "kai7_08.jpg"], ["g7r60", "kai7_01.jpg"]]) {
    await fresh("?ids=" + id);
    await tap("#today-start-btn"); await page.waitForTimeout(1300);
    const st = await page.evaluate(() => { const im = document.getElementById("solo-img"); return { id: document.getElementById("solo-q-id").textContent, src: im.getAttribute("src") || "", ok: im.complete && im.naturalWidth > 0, shown: !!document.getElementById("solo-img-wrap").offsetParent }; });
    check("S8 " + id + " のカードに " + img + " が出る", st.id.replace(/~\d+$/, "") === "No." + id && st.src.endsWith(img) && st.ok && st.shown, JSON.stringify(st));
    await shot("S8_card_" + id, false);
  }
  const af = await page.evaluate(() => DAIMON_DATA.filter(g => g.kai === 7).flatMap(g => g.items).filter(i => i.aFile).length);
  check("S8 第7回に答えの図（aFile）は無い", af === 0, af);
  // S9 画像が全部 200
  const imgs = await page.evaluate(() => [...new Set([...QA_DATA.filter(q => /^(r7m|g7r)/.test(q.id) && q.img).map(q => q.img), ...DAIMON_DATA.filter(g => g.kai === 7).flatMap(g => [g.file, ...g.items.map(i => i.file)]).filter(Boolean)])]);
  const st = await page.evaluate(async list => { const r = []; for (const n of list) { const x = await fetch("images/" + n); r.push(n + ":" + x.status); } return r; }, imgs);
  const bad = st.filter(s => !s.endsWith(":200"));
  check("S9 第7回の画像 " + imgs.length + "枚 すべて 200", bad.length === 0 && imgs.length === 28, bad.join(" "));
  // S10 年表と優先度
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tl = { miss: [], n: 0 };
  for (let i = 56; i <= 72; i++) { const mm = html.match(new RegExp('^  "g7r' + i + '": (\\[.*\\]),\\s*$', "m")); if (!mm) tl.miss.push("g7r" + i); else tl.n += JSON.parse(mm[1]).length; }
  check("S10 年表 g7r56〜72 の17問すべてに枠・合計25枠", tl.miss.length === 0 && tl.n === 25, JSON.stringify(tl));
  const low = await page.evaluate(() => ({ r: QA_DATA.filter(q => /^r7m/.test(q.id) && q.priority === "低").length, g: QA_DATA.filter(q => /^g7r/.test(q.id) && q.priority === "低").length }));
  check("S10 優先度「低」 理科8・社会68", low.r === 8 && low.g === 68, JSON.stringify(low));
  check("画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました"); console.log("写真: " + SHOTS);
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
