// ★2026-11-15 同じ答えの集約（ユーザー OK「あってそうです、お願いします」・全体確認から）
//   例: 答え 1天保のききん 2吉宗 3天保のききん 4天保のききん 5綱吉 6水野 7松平・1回3問・3 が答える量の多いもの（空らん2つ）
//   A1 11-15（今日から）: 1回目 2,3,5 → ◎ → 2回目 6,7,1 → ◎ → 3回目の先頭 4（＝出る順 2,3,5,6,7,1,4）
//   A2 ✕・スキップは次の回の先頭（2回目で 6 をスキップ → 3回目の先頭は 6）
//   A3 11-14 は前の道のまま（1回目は 3,2,5＝組のいちばん前のカードの順）
// 使い方: node tools/mikaku/agg_1115_probe.mjs
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const HOOK = "window.__agg = { add: c => { QA_DATA.push(c); return QA_DATA.length - 1; }, order: l => orderByLog(l), log: s => { studyLog.sessions.push(s); }, groups: l => answerGroups(l) };\n";
const SRC = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace("function buildPlan(){", HOOK + "function buildPlan(){");
const server = http.createServer((req, res) => { const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(SRC); return; }
  fs.readFile(path.join(ROOT, rel), (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": rel.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream" }), res.end(b))); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chrome" }); const errs = [];
const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
async function open(when) {
  const page = await (await browser.newContext()).newPage(); page.on("pageerror", e => errs.push(String(e)));
  await page.clock.install({ time: new Date(when) });
  await page.goto("http://127.0.0.1:" + server.address().port + "/index.html"); await page.waitForTimeout(800);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 })); localStorage.setItem("kq_battle_daimon_merged_v1", "1"); });
  await page.reload(); await page.waitForFunction(() => !!window.__agg, null, { timeout: 30000 }); await page.waitForTimeout(1500); return page; }
const RUN = ({ skip6 }) => { const A = window.__agg, base = Date.now() - 3600e3;
  const ANS = ["天保のききん", "吉宗", "天保のききん", "天保のききん", "綱吉", "水野", "松平"];
  const idx = ANS.map((a, k) => A.add({ id: "zz" + (k + 1), subj: "社会", u: "試験.集約", q: k === 2 ? "（　）が起きた。（　）のとき大塩平八郎が乱を起こした。" : "問" + (k + 1) + " （　）は何ですか。", a, priority: "普通", level: "基礎" }));
  const name = i => String(QA_DATA[i].id).slice(2), rounds = [];
  for (let r = 0; r < 3; r++) { const o = A.order(idx).slice(0, 3); rounds.push(o.map(name));
    A.log({ id: "szz" + r, k: "solo", role: "", st: base + r * 60000, la: base + r * 60000 + 30000, done: true, q: o.map(i => [QA_DATA[i].id, 2, skip6 && r === 1 && name(i) === "6" ? "skip" : "o", 0]) }); }
  return { rounds, groups: A.groups(idx).map(g => g.map(name).join("")) }; };
try {
  let page = await open("2026-11-15T19:00:00+09:00"); const a = await page.evaluate(RUN, { skip6: false });
  check(`A1 11-15 組 ${a.groups.join("・")} → ${a.rounds.map(r => r.join(",")).join(" → ")}`, a.rounds[0].join(",") === "2,3,5" && a.rounds[1].join(",") === "6,7,1" && a.rounds[2][0] === "4", "");
  page = await open("2026-11-16T08:00:00+09:00"); const b = await page.evaluate(RUN, { skip6: true });
  check(`A2 2回目で 6 をスキップ → ${b.rounds.map(r => r.join(",")).join(" → ")}（3回目の先頭が 6）`, b.rounds[2][0] === "6", "");
  page = await open("2026-11-14T08:00:00+09:00"); const c = await page.evaluate(RUN, { skip6: false });
  check(`A3 11-14 は前の道 → ${c.rounds.map(r => r.join(",")).join(" → ")}`, c.rounds[0].join(",") === "3,2,5", "");
  check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x.slice(0, 300) : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました");
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
