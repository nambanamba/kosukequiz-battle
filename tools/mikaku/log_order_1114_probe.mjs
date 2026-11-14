// ★2026-11-14 ユーザー OK: 今日やることの行を「前の回の×・スキップ → まだ出ていない → ◎の古い順」で選ぶ（ランダムは並べ方だけ）。11-15 の分から
// 使い方: node tools/mikaku/log_order_1114_probe.mjs（BASE=1 で直す前 121d955 を見る）。1つの Chrome・時計を決めて動かす
// 見ること（社会 第11回・20問・ランダム）:
//   L1 11-15 の「一人で」20問のうち 10問を答える（3問 ✕・7問 〇）→ もどる
//   L2 11-16 に開き、社会の「つづきを消す」→「一人で」: ✕ の3問が全部入る・前の日に出て答えなかった10問が全部入る・〇の7問は入らない（2日たっていない）
//   L3 11-16 の20問は、まだ答えたことのない問題（✕3問のほか）で埋まる
//   L4 11-14（直す前の日付）は いままでどおり（この直しは働かない）: 11-14 に ✕ を付けて、11-14 のうちに開き直しても、並べ方はランダムのまま（✕が必ず入るとは限らない）… 数えるだけ
//   L5 新しいアプリの親が「やった分」で 11-15 の 〇 を × に切り替えた（kq_battle_cards_marks_v1）→ 11-16 にその問題が入る
//   E  画面のエラー 0
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const SRC = process.env.BASE ? execSync("git show 121d955:index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }) : fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
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
  await page.clock.install({ time: new Date("2026-11-15T08:00:00+09:00") });
  await page.goto(URL0); await page.waitForTimeout(600);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 })); localStorage.setItem("kq_battle_daimon_merged_v1", "1");
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": ["第11回.江戸時代(2)"], "理科": ["第11回.光と音"] }, units: ["第11回.江戸時代(2)"], count: 20, shuffle: true, tiers: [0, 1, 2, 3], fairMode: false })); });
  await page.reload(); await page.waitForTimeout(1200);
  await soloRow();
  const day1 = await setIds();
  const x = [], o = [];
  for (let k = 0; k < 10; k++) { const bad = k === 1 || k === 4 || k === 7; (bad ? x : o).push(await answer(!bad)); }
  const left1 = day1 ? day1.filter(id => !x.includes(id) && !o.includes(id)) : [];
  check("L1 11-15 の一人で（" + (day1 && day1.length) + "問）10問答えた ✕" + x.join(",") + " 〇" + o.length + "・のこり " + left1.length, day1 && day1.length >= 18 && x.length === 3 && o.length === 7, (await counter()));
  await tap("#solo-back"); await page.waitForTimeout(800);
  await at("2026-11-16");
  await page.evaluate(id => localStorage.setItem("kq_battle_cards_marks_v1", JSON.stringify({ ["1_" + id]: { id, m: "×", t: Date.now(), d: "2026-11-15", by: "parent" } })), o[0]);
  await page.reload(); await page.waitForTimeout(1200);
  await page.$eval('#plan-cur .plan-kid-row[data-subj="社会"] .plan-kid-clear', e => e.click()); await page.waitForTimeout(500);
  await soloRow();
  const day2 = await setIds(), c2 = await counter();
  const hasX = x.filter(id => day2.includes(id)), hasL = left1.filter(id => day2.includes(id)), hasO = o.slice(1).filter(id => day2.includes(id)), hasM = day2.includes(o[0]);
  check("L2 11-16（" + c2 + "）✕ " + hasX.length + "/3・前の日のこり " + hasL.length + "/" + left1.length + "・〇 " + hasO.length + "/6・切り替えた " + o[0] + " " + hasM, hasX.length === 3 && hasL.length === left1.length && hasO.length === 0 && hasM, JSON.stringify({ day2 }));
  const others = day2.filter(id => !x.includes(id));
  check("L3 ほかの " + others.length + "問は まだ答えたことのない問題", others.every(id => !o.slice(1).includes(id)), "");
  check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x.slice(0, 300) : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました");
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
