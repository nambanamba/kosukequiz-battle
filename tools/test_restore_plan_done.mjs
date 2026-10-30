// 2026-10-30「記録を取り戻す」で 今日やることの「できた」印も写るか（10-30 の実物: セット27 朝18行できた・晩18行まだ）
//   node tools/test_restore_plan_done.mjs <fixtures のフォルダ>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FX = process.argv[2];
async function loadPlaywright(){
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const pw = await loadPlaywright();
const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".jpg":"image/jpeg", ".png":"image/png", ".json":"application/json"};
const fx = n => fs.readFileSync(path.join(FX, n), "utf8");
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  const m = u.match(/^\/repos\/R\/contents\/(.+)$/);
  if (m) {
    const p = m[1], j = (o) => { res.writeHead(200, {"content-type": "application/json"}); res.end(typeof o === "string" ? o : JSON.stringify(o)); };
    if (p === "battle/snapshot") return j([{ name: "2026-10-30.json" }]);
    if (p === "battle/session") return j([]);
    const f = p.replace(/\//g, "_");
    if (fs.existsSync(path.join(FX, f))) return j(fx(f));
    res.writeHead(404).end(); return;
  }
  const file = path.join(ROOT, u.replace(/^\/+/, "") || "index.html");
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => { if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {"content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream"}); res.end(buf); });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/";
let pass = 0, fail = 0;
const check = (name, ok, info) => { console.log((ok ? "  ✅ " : "  ❌ ") + name + (info ? "  " + info : "")); ok ? pass++ : fail++; };
let browser;
try { browser = await pw.chromium.launch(); } catch { browser = await pw.chromium.launch({ channel: "chrome" }); }
const dec = n => JSON.parse(Buffer.from(JSON.parse(fx(n)).content, "base64").toString("utf8"));
const S27 = dec("plan_0027.json"), S28 = dec("plan_0028.json"), PD = dec("battle_plan_done_0027.json");
const ctx = await browser.newContext({ viewport: { width: 820, height: 1100 } });
await ctx.addInitScript(([s27, s28, api]) => {
  try{
    if (sessionStorage.getItem("init")) return; sessionStorage.setItem("init", "1");
    localStorage.setItem("kq_battle_plan_index_v2", JSON.stringify([27, 28]));
    localStorage.setItem("kq_battle_plan_sets_v2", JSON.stringify({ 27: s27, 28: s28 }));
    localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify({ token: "github_pat_TEST", api: api, repo: "R" }));
  }catch(e){}
}, [S27, S28, BASE]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
const alerts = [];
page.on("dialog", d => { alerts.push(d.message()); d.accept(); });
await page.goto(BASE + "index.html", { waitUntil: "load" });
await page.waitForSelector(".plan-kid-row", { timeout: 60000 });
const rows = () => page.evaluate(() => [...document.querySelectorAll(".plan-kid-row")].map(e => e.innerText.replace(/\s+/g, " ").slice(0, 40)));
console.log("  前: " + JSON.stringify((await rows()).slice(0, 3)));
await page.evaluate(() => document.getElementById("send-restore-btn").click());
for (let i = 0; i < 100 && !alerts.some(a => /取り戻しました|取り戻せません/.test(a)); i++) await page.waitForTimeout(200);
console.log("  知らせ: " + alerts.join(" / ").replace(/\n/g, " | "));
const st = await page.evaluate(() => ({ d: JSON.parse(localStorage.getItem("kq_battle_plan_done_v2") || "{}"), m: JSON.parse(localStorage.getItem("kq_battle_plan_miss_v2") || "{}") }));
const want = PD.items.filter(o => o.done).length;
check("できた印 " + want + " 行が写る", Object.keys(st.d[27] || {}).length === want, "got " + Object.keys(st.d[27] || {}).length);
const wantMiss = PD.items.filter(o => o.miss && o.miss.length).length;
check("朝まちがえた問題 " + wantMiss + " 行が写る", Object.keys(st.m[27] || {}).length === wantMiss);
check("知らせに 写した行の数", alerts.some(a => a.includes("できた」印を写した行: " + want)));
await page.waitForTimeout(800);
const after = await rows();
console.log("  後: " + JSON.stringify(after.slice(0, 3)));
check("ホームは 夜のぶん から（朝の行は できた）", (await page.evaluate(() => document.body.innerText)).includes("夜のぶん"));
// 2回押しても増えない・消えない
alerts.length = 0;
await page.evaluate(() => document.getElementById("send-restore-btn").click());
for (let i = 0; i < 100 && !alerts.some(a => /取り戻しました/.test(a)); i++) await page.waitForTimeout(200);
check("2回目は 0 行（二重にならない）", alerts.some(a => a.includes("写した行: 0")));
await page.reload(); await page.waitForSelector(".plan-kid-row", { timeout: 60000 }); await page.waitForTimeout(800);
const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_plan_done_v2") || "{}"));
check("開き直しても印は残る", Object.keys(st2[27] || {}).length === want);
await page.screenshot({ path: path.join(FX, "after.png") });
check("エラーなし", errors.length === 0, errors.join(" | "));
console.log(`合格 ${pass} / 不合格 ${fail}`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
