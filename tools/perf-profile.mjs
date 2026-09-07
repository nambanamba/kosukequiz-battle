// 「一覧を開く」ときに、どの関数が時間を食っているかを実測する。
//
// perf-measure.mjs で「一覧を開くのに9.5秒」と分かったが、イベント委譲では
// ほとんど改善しなかった。つまり重いのは別の場所。推測を重ねずに、
// CDP の Profiler で関数ごとの時間を取って確かめる。
//
// 使い方:
//   node tools/perf-profile.mjs        # CPUを絞らず
//   node tools/perf-profile.mjs 4      # 4倍に絞って
//
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function loadPlaywright(){
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const pw = await loadPlaywright();

const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".jpg":"image/jpeg", ".png":"image/png"};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {"content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream"});
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/";

const rate = Number(process.argv[2] || 1);
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate });

await page.goto(BASE + "index.html", { waitUntil: "load" });
await page.waitForSelector("#unit-choices .choice", { timeout: 120000 });

await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); // 0.2ms きざみ
await cdp.send("Profiler.start");

const took = await page.evaluate(async () => {
  const paint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const s = performance.now();
  document.getElementById("list-btn").click();
  await paint();
  return Math.round(performance.now() - s);
});

const { profile } = await cdp.send("Profiler.stop");
await browser.close();
server.close();

// ---- 関数ごとの自己時間を集計する ----
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const self = new Map();
const total = profile.samples.length;
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  if (!n) return;
  const f = n.callFrame;
  const name = (f.functionName || "(無名)") +
    (f.url ? "  " + f.url.replace(/^https?:\/\/[^/]+\//, "") + ":" + (f.lineNumber + 1) : "");
  self.set(name, (self.get(name) || 0) + (dt[i] || 0));
});
const rows = [...self.entries()].sort((a, b) => b[1] - a[1]);
const sum = rows.reduce((n, r) => n + r[1], 0);

console.log(`\n「一覧を開く」の内訳（rate=${rate}／実測 ${took}ms／サンプル ${total}件）\n`);
console.log("  時間(ms)   割合   関数");
for (const [name, us] of rows.slice(0, 22)) {
  const ms = us / 1000;
  if (ms < 1) break;
  console.log(`  ${ms.toFixed(0).padStart(8)}  ${((us / sum) * 100).toFixed(1).padStart(5)}%   ${name}`);
}
