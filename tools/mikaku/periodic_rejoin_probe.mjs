// ★提案する直し（待っているあいだ、N秒ごとに「ちゃんとした入り直し」をする）が、
//   **遅れて来た相手と出会わせるか**を、アプリを変える前にライブラリ単体で確かめる（2026-09-23）。
//
// ■ 確かめる形（★まねごとの待ち合わせ先だけ。本物は叩かない）
//   A 何もしない（いまの作り）      … 作る側は入ったまま。入る側は90秒後に入る
//   B 25秒ごとに入り直す（提案）    … 作る側だけが入り直す。入る側は90秒後に入る
//   ★Bで出会えて A で出会えなければ、提案は効いている。両方出会えたら、**この道具では差が出ない**と報告する
//
// 使い方: node tools/mikaku/periodic_rejoin_probe.mjs [--late=90] [--every=25]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
const LATE = Number((process.argv.find(a => a.startsWith("--late=")) || "--late=90").split("=")[1]);
const EVERY = Number((process.argv.find(a => a.startsWith("--every=")) || "--every=25").split("=")[1]);
const relay = await startFakeRelay({ broadcast: true, label: "periodic" });
const appSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const APP_ID = (appSrc.match(/const APP_ID = '([^']+)'/) || [])[1];
const PAGE = `<!doctype html><meta charset="utf-8"><body><script type="module">
import { joinRoom } from "https://esm.run/trystero";
const cfg = { appId: ${JSON.stringify(APP_ID)}, relayConfig: { urls: ${JSON.stringify([relay.url])} } };
window.__peers = 0; window.__rejoins = 0;
// ★このアプリと同じ使い方に合わせる（room.onPeerJoin は関数ではなく、代入する口）
const hook = (r) => { r.onPeerJoin = () => { window.__peers++; }; return r; };
window.__join = (code) => { window.__last = hook(joinRoom(cfg, code)); return "ok"; };
// ★提案する直し: leave() を**待ってから**入り直す（待たないと同じ入れ物が返り、名乗りが止まる）
window.__rejoin = async (code) => {
  try { await window.__last.leave(); } catch(e) {}
  window.__last = hook(joinRoom(cfg, code)); window.__rejoins++; return "ok";
};
window.__startPeriodic = (code, everyMs) => {
  window.__timer = setInterval(() => { if(window.__peers === 0) window.__rejoin(code); }, everyMs);
  return "ok";
};
window.__stop = () => { clearInterval(window.__timer); return "ok"; };
window.__ready = true;
</script></body>`;
const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(PAGE); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL = "http://127.0.0.1:" + server.address().port + "/";
const browser = await chromium.launch({ channel: "chrome" });
async function newPage() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  return { ctx, page, errs };
}
async function trial(periodic) {
  const code = "7" + String(Math.floor(Math.random() * 900) + 100);
  const host = await newPage();
  await host.page.evaluate(c => window.__join(c), code);
  if (periodic) await host.page.evaluate(([c, e]) => window.__startPeriodic(c, e * 1000), [code, EVERY]);
  await host.page.waitForTimeout(LATE * 1000);
  const guest = await newPage();
  await guest.page.evaluate(c => window.__join(c), code);
  let met = false;
  for (let i = 0; i < 40; i++) {           // 最大40秒待つ
    await guest.page.waitForTimeout(1000);
    const h = await host.page.evaluate(() => window.__peers);
    const g = await guest.page.evaluate(() => window.__peers);
    if (h > 0 && g > 0) { met = true; break; }
  }
  const rejoins = await host.page.evaluate(() => window.__rejoins);
  await host.page.evaluate(() => window.__stop());
  const errs = host.errs.length + guest.errs.length;
  await host.ctx.close(); await guest.ctx.close();
  return { met, rejoins, errs };
}
console.log("══ ★" + LATE + "秒あとに来た相手と出会えるか ══  （まねごとの待ち合わせ先・1本）\n");
const a = await trial(false);
console.log("  A いまの作り（入ったまま待つ）      … " + (a.met ? "○ 出会えた" : "✘ 出会えない") + (a.errs ? "（エラー " + a.errs + "）" : ""));
const b = await trial(true);
console.log("  B ★" + EVERY + "秒ごとに入り直す（提案） … " + (b.met ? "○ 出会えた" : "✘ 出会えない") +
  " ／ 入り直した回数 " + b.rejoins + (b.errs ? "（エラー " + b.errs + "）" : ""));
console.log("\n── 読み方 ──");
if (!a.met && b.met) console.log("  ★提案は効いています（Aで出会えず、Bで出会えた）");
else if (a.met && b.met) console.log("  ★この回はAでも出会えました。**差が出ていません**（この道具では提案の効果を示せていない）");
else if (!b.met) console.log("  ★Bでも出会えません。**提案では足りません**。別の手を考えること");
await browser.close(); server.close(); relay.close();
