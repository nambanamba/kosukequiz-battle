// ★2026-11-14 ユーザーの決まり「一問一答と計算を分ける」: 紙に式が要る計算のカード（CALC_OUT）を 11-15 から出題に入れない
// 使い方: node tools/mikaku/calc_out_1114_probe.mjs（BASE=1 で直す前）
// 見ること（理科 第11回・全部）:
//   C1 11-14 の「一人で」には r11m50・r11m52 が入る（今日の分は変えない）
//   C2 11-15 の「一人で」には入らない・ほかの第11回のカードは同じ数
//   C3 問題の一覧には 11-15 でも出る（データは消さない）
//   C5 暗算をカードへ（r11w01〜07）: 11-14 は入らず、11-15 は入る
//   C4 11-15 は 第7回・第8回の 7枚（r7m58〜63・r8m52）も入らない
//   E  画面のエラー 0
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const SRC = process.env.BASE ? execSync("git show ce0a11a:index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }) : fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(SRC); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": rel.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL0 = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 1366 } }); const page = await ctx.newPage(); const errs = [];
page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
const tap = sel => page.$eval(sel, e => e.click());
const qid = () => page.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, ""));
const counter = () => page.$eval("#solo-counter", e => e.textContent);
const at = async (ymd) => { await page.clock.setSystemTime(new Date(ymd + "T08:00:00+09:00")); };
const soloRow = async () => { await page.$eval('#plan-cur .plan-kid-row[data-subj="社会"] .plan-kid-btn[data-kind="solo"]', e => e.click()); await page.waitForTimeout(900); };
const answer = async (ok) => { const id = await qid(); await tap("#solo-reveal-btn"); await page.waitForTimeout(150); await tap(ok ? "#solo-judge-ok" : "#solo-judge-ng"); await page.waitForTimeout(400); return id; };
const setIds = async () => page.evaluate(() => { const s = JSON.parse(localStorage.getItem("kq_battle_solo_session_v1") || "null"); return s ? [...new Set(s.quizIds)] : null; });
try {
  await page.clock.install({ time: new Date("2026-11-14T20:00:00+09:00") });
  await page.goto(URL0); await page.waitForTimeout(600);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 })); localStorage.setItem("kq_battle_daimon_merged_v1", "1");
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "理科", unitsBySubject: { "社会": ["第11回.江戸時代(2)"], "理科": ["第11回.光と音"] }, units: ["第11回.光と音"], count: "all", shuffle: false, tiers: [0, 1, 2, 3], fairMode: false })); });
  await page.reload(); await page.waitForTimeout(1200);
  const run = async () => { await page.$eval('#plan-cur .plan-kid-row[data-subj="理科"] .plan-kid-btn[data-kind="solo"]', e => e.click()); await page.waitForTimeout(900);
    const ids = [...new Set((JSON.parse(localStorage_get() || "null") || {}).quizIds || [])]; return ids; };
  const getIds = async () => { await page.$eval('#plan-cur .plan-kid-row[data-subj="理科"] .plan-kid-btn[data-kind="solo"]', e => e.click()); await page.waitForTimeout(900);
    return page.evaluate(() => { const s = JSON.parse(localStorage.getItem("kq_battle_solo_session_v1") || "null"); return s ? [...new Set(s.quizIds.map(x => String(x).replace(/~\d+$/, "")))] : []; }); };
  const d1 = await getIds();
  check("C1 11-14 の一人で（" + d1.length + "枚）に r11m50 " + d1.includes("r11m50") + "・r11m52 " + d1.includes("r11m52"), d1.includes("r11m50") && d1.includes("r11m52"), "");
  await tap("#solo-back"); await page.waitForTimeout(600);
  await page.evaluate(() => { localStorage.removeItem("kq_battle_solo_session_v1"); localStorage.setItem("kq_battle_free_keep_v1", "{}"); });
  await at("2026-11-15"); await page.reload(); await page.waitForTimeout(1200);
  const d2 = await getIds();
  check("C2 11-15 の一人で（" + d2.length + "枚）に r11m50・r11m52 なし・ほかは同じ", !d2.includes("r11m50") && !d2.includes("r11m52") && d2.length === d1.length - 2 + 7 && d1.filter(x => x !== "r11m50" && x !== "r11m52").every(x => d2.includes(x)), "");
  const W7 = ["r11w01", "r11w02", "r11w03", "r11w04", "r11w05", "r11w06", "r11w07"];
  check("C5 r11w01〜07: 11-14 は " + W7.filter(x => d1.includes(x)).length + "/7・11-15 は " + W7.filter(x => d2.includes(x)).length + "/7", W7.every(x => !d1.includes(x)) && W7.every(x => d2.includes(x)), "");
  await tap("#solo-back"); await page.waitForTimeout(600);
  const inData = await page.evaluate(() => ["r11m50", "r11m52"].every(id => QA_DATA.some(d => d.id === id)));
  check("C3 データには残っている（一覧・全部の問題で見られる）", inData, "");
  await page.evaluate(() => { const st = JSON.parse(localStorage.getItem("kq_battle_settings_v1")); st.unitsBySubject["理科"] = ["第7回.物の燃焼", "第8回.ばね・浮力・圧力"]; st.units = st.unitsBySubject["理科"]; localStorage.setItem("kq_battle_settings_v1", JSON.stringify(st)); localStorage.removeItem("kq_battle_solo_session_v1"); localStorage.setItem("kq_battle_free_keep_v1", "{}"); });
  await page.reload(); await page.waitForTimeout(1200);
  const d4 = await getIds(); const seven = ["r7m58", "r7m59", "r7m60", "r7m61", "r7m62", "r7m63", "r8m52"];
  check("C4 11-15 の 第7回・第8回（" + d4.length + "枚）に 7枚なし", d4.length > 20 && seven.every(x => !d4.includes(x)), JSON.stringify(seven.filter(x => d4.includes(x))));
  const W8 = Array.from({ length: 20 }, (_, k) => "r8w" + String(k + 1).padStart(2, "0"));
  check("C6 11-15 の第8回に r8w01〜20 " + W8.filter(x => d4.includes(x)).length + "/20", W8.every(x => d4.includes(x)), JSON.stringify(W8.filter(x => !d4.includes(x))));
  await page.evaluate(() => { const st = JSON.parse(localStorage.getItem("kq_battle_settings_v1")); st.unitsBySubject["理科"] = ["第2回.てこ・滑車・輪軸"]; st.units = st.unitsBySubject["理科"]; localStorage.setItem("kq_battle_settings_v1", JSON.stringify(st)); localStorage.removeItem("kq_battle_solo_session_v1"); localStorage.setItem("kq_battle_free_keep_v1", "{}"); });
  await page.reload(); await page.waitForTimeout(1200);
  const d7 = await getIds(); const W2 = Array.from({ length: 14 }, (_, k) => "r2w" + String(k + 1).padStart(2, "0"));
  check("C7 11-15 の第2回に r2w01〜14 " + W2.filter(x => d7.includes(x)).length + "/14", W2.every(x => d7.includes(x)), JSON.stringify(W2.filter(x => !d7.includes(x))));
  check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x.slice(0, 300) : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました");
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
