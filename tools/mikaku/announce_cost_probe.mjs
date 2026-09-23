// ★「待っているあいだ、何秒ごとに入り直すのが安全か」を決めるために、**通信の量**を測る（2026-09-23）。
//   ユーザーの案:「10秒たったら繋がらないのが仕様なら、10秒に一度、ページの開き直し相当を入れられないか」
//   ⚠️ 10秒ごとに6か所へつなぎ直すと締め出されます（2026-09-20 と 09-23 に damus で実際に起きた）。
//   → **1回の入り直しで、待ち合わせ先に何件送ることになるか**を数えて、間隔を決める材料にする。
//
// 使い方: node tools/mikaku/announce_cost_probe.mjs
// ★まねごとの待ち合わせ先だけを使う（本物は叩かない）。待ち合わせ先は1本。
//   本物は6本なので、**実際の件数はここの約6倍**になる。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
const relay = await startFakeRelay({ broadcast: true, label: "cost" });
const appSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const APP_ID = (appSrc.match(/const APP_ID = '([^']+)'/) || [])[1];
const PAGE = `<!doctype html><meta charset="utf-8"><body><script type="module">
import { joinRoom } from "https://esm.run/trystero";
const cfg = { appId: ${JSON.stringify(APP_ID)}, relayConfig: { urls: ${JSON.stringify([relay.url])} } };
window.__join = (code) => { window.__last = joinRoom(cfg, code); return "ok"; };
window.__rejoin = async (code) => { try { await window.__last.leave(); } catch(e) {} window.__last = joinRoom(cfg, code); return "ok"; };
window.__ready = true;
</script></body>`;
const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(PAGE); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:" + server.address().port + "/");
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });

const code = "8" + String(Math.floor(Math.random() * 900) + 100);
console.log("══ ★入り直し1回ぶんの通信量（待ち合わせ先1本あたり） ══\n");
let mark = relay.state.events;
await page.evaluate(c => window.__join(c), code);
for (const t of [5, 10, 20, 30, 60]) {
  await page.waitForTimeout((t === 5 ? 5 : t - [5, 10, 20, 30][[5, 10, 20, 30, 60].indexOf(t) - 1]) * 1000);
  console.log("  入ってから " + String(t).padStart(2) + "秒 … 告知 累計 " + (relay.state.events - mark) + " 件");
}
const base60 = relay.state.events - mark;
console.log("\n  ★ふつうに入って60秒 … 合計 " + base60 + " 件（本物は6本なので、およそ " + base60 * 6 + " 件）");

mark = relay.state.events;
await page.evaluate(c => window.__rejoin(c), code);
await page.waitForTimeout(10000);
const perRejoin = relay.state.events - mark;
console.log("  ★入り直して10秒 … " + perRejoin + " 件（本物は6本なので、およそ " + perRejoin * 6 + " 件）");

// 10秒ごとに入り直したら、1分でどれだけ出すか
mark = relay.state.events;
for (let i = 0; i < 6; i++) { await page.evaluate(c => window.__rejoin(c), code); await page.waitForTimeout(10000); }
const per10s = relay.state.events - mark;
console.log("\n  ★10秒ごとに入り直して60秒 … " + per10s + " 件（本物 6本ぶんだと およそ " + per10s * 6 + " 件／分）");
console.log("  参考: ふつうに待つだけの60秒は " + base60 + " 件（同 " + base60 * 6 + " 件／分）");
console.log("  → ★10秒ごとだと、ふつうの約 " + (base60 ? (per10s / base60).toFixed(1) : "?") + " 倍の通信量になります");
await browser.close(); server.close(); relay.close();
