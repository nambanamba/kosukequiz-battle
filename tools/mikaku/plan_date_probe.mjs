// 今日やること：date が今日（日本時間）より先のセットは本体に出さず「つぎ」にだけ出す（2026-10-23・案C）
// 使い方: node tools/mikaku/plan_date_probe.mjs   （端末の写しを直接入れて見る。GitHub には触らない）
//   D1 先の日付の未完セット(2)と今日のセット(1)が未完 → 本体は1
//   D2 今日のセット(1)が全部済み・先のセット(2) → 本体は1の「おわり！」・つぎ（明日のぶん）に2
//   D3 date の無いセットは今までどおり（番号順・先とはみなさない）
//   D4 過ぎた日の未完セット(1)・今日(2) → 本体は1（今までどおり）
//   D5 先の日付のセットしか無い → 今までどおり先のセットを本体に出す
//   D6 今日(date=今日)のセットは本体に出る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL_ = "http://127.0.0.1:" + server.address().port + "/index.html";
const jst = n => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
const mk = (no, date, done) => ({ no, label: "セット" + no, ...(date ? { date } : {}), items: [{ subj: "理科", title: "行" + no, ids: ["r6p12"] }], _done: !!done });
const browser = await chromium.launch({ channel: "chrome" });
let bad = 0;
async function scene(name, sets, expect) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(URL_);
  await pg.evaluate(a => {
    localStorage.clear();
    localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 }));
    localStorage.setItem("kq_battle_daimon_merged_v1", "1");
    localStorage.setItem("kq_battle_plan_index_v2", JSON.stringify(a.sets.map(s => s.no)));
    const o = {}; a.sets.forEach(s => { const c = Object.assign({}, s); delete c._done; o[s.no] = c; });
    localStorage.setItem("kq_battle_plan_sets_v2", JSON.stringify(o));
    localStorage.setItem("kq_battle_plan_auto_off_v1", "1");
    a.sets.filter(s => s._done).forEach(s => { const d = {}; s.items.forEach((it, i) => { d[i + ":" + it.title] = Date.now(); }); const all = {}; all[s.no] = d; localStorage.setItem("kq_battle_plan_done_v2", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("kq_battle_plan_done_v2") || "{}"), all))); });
  }, { sets });
  await pg.reload(); await pg.waitForTimeout(1500);
  const got = await pg.evaluate(() => ({
    cur: (document.querySelector("#plan-cur .plan-head") || {}).textContent || "",
    nx: (document.querySelector("#plan-next .plan-head") || {}).textContent || "",
    fin: getComputedStyle(document.getElementById("plan-done")).display !== "none" }));
  const ok = got.cur === expect.cur && got.nx === expect.nx && got.fin === !!expect.fin && errs.length === 0;
  if (!ok) bad++;
  console.log((ok ? "  ✔ " : "  ✘ ") + name + " … " + JSON.stringify(got) + (errs.length ? " ERR " + errs[0] : ""));
  await ctx.close();
}
const T = "今日やること：", N = "つぎ（明日のぶん）：";
await scene("D1 先の日付(2)は本体に出ない・今日(1)が出る", [mk(1, jst(0)), mk(2, jst(1))], { cur: T + "セット1", nx: "" });
await scene("D2 今日(1)が済み・先(2) → 本体1『おわり！』・つぎに2", [mk(1, jst(0), true), mk(2, jst(1))], { cur: T + "セット1", nx: N + "セット2", fin: true });
await scene("D3 date の無いセットは今までどおり", [mk(1, null), mk(2, null)], { cur: T + "セット1", nx: "" });
await scene("D4 過ぎた日の未完(1)は今までどおり本体に出る", [mk(1, jst(-1)), mk(2, jst(0))], { cur: T + "セット1", nx: "" });
await scene("D5 先の日付しか無い → 今までどおり先のセットを出す", [mk(1, jst(1))], { cur: T + "セット1", nx: "" });
await scene("D6 今日のセットは出る", [mk(1, jst(0))], { cur: T + "セット1", nx: "" });
await scene("D7 昨日(1)済み・今日(2)未完・明日(3) → 本体2", [mk(1, jst(-1), true), mk(2, jst(0)), mk(3, jst(1))], { cur: T + "セット2", nx: "" });
await browser.close(); server.close();
console.log(bad ? "\n✘ " + bad + " 件ひっかかりました" : "\n✔ 全部通りました");
process.exit(bad ? 1 : 0);
