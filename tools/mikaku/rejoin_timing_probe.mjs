// ★「もう一度つなぐ」が効かない理由を、ライブラリの動きそのもので確かめる（2026-09-23）。
//
// ■ ソースで見つけたこと（@trystero-p2p/core 0.25.4）
//   ① joinRoom の先頭: `if(f[S]?.[R]) return f[S][R]`
//      → ★**同じ appId・同じ部屋番号なら、既にある部屋をそのまま返す**（作り直さない）
//   ② leave(): `await 送信; await 99ms待つ; 相手を捨てる; 片づけ()`
//      → ★**片づけは、少なくとも99ミリ秒あと**
//   ③ アプリの「もう一度つなぐ」: `room.leave()`（待たない）→ すぐ `joinRoom(同じ番号)`
//      → ★**古い部屋を受け取り、そのすぐあとに片づけられるのでは？**（＝名乗らなくなる）
//
// ■ ここで測ること（★まねごとの待ち合わせ先だけ。本物は使わない）
//   1. leave() の直後に joinRoom すると、**同じ部屋の入れ物が返るか**
//   2. そのあと、待ち合わせ先への**告知が止まるか**（＝相手から見つけられなくなる）
//   3. ★**どれだけ待てば、新しい部屋になるか**（0 / 150 / 300 / 600 ミリ秒）
//   → これが分かれば、**ページの開き直しをしなくても直せる**
//
// 使い方: node tools/mikaku/rejoin_timing_probe.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
let ng = 0;
const check = (label, ok, extra) => { console.log("  " + (ok ? "✔" : "✘") + " " + label + (extra ? " … " + extra : "")); if (!ok) ng++; };

const relay = await startFakeRelay({ broadcast: true, label: "rejoin" });
// アプリと同じ appId・同じ読み込み先を使う（アプリの index.html から読み取る）
const appSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const APP_ID = (appSrc.match(/const APP_ID = '([^']+)'/) || [])[1];
const PAGE = `<!doctype html><meta charset="utf-8"><title>rejoin probe</title><body>
<script type="module">
import { joinRoom } from "https://esm.run/trystero";
const cfg = { appId: ${JSON.stringify(APP_ID)}, relayConfig: { urls: ${JSON.stringify([relay.url])} } };
window.__r = { log: [] };
window.__join = (code) => { const r = joinRoom(cfg, code); window.__last = r; return "ok"; };
window.__same = (code) => { const r = joinRoom(cfg, code); const same = (r === window.__last); window.__last = r; return same; };
window.__leaveThenJoin = async (code, waitMs) => {
  const before = window.__last;
  const p = window.__last.leave();
  if (waitMs === "await") { try { await p; } catch(e) {} } else if (waitMs > 0) { await new Promise(r => setTimeout(r, waitMs)); }
  const r = joinRoom(cfg, code);
  window.__last = r;
  return { sameObject: r === before };
};
window.__ready = true;
</script></body>`;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL = "http://127.0.0.1:" + server.address().port + "/";
const browser = await chromium.launch({ channel: "chrome" });

// 待ち合わせ先に届いた告知の数で、「名乗っているか」を測る
const eventsNow = () => relay.state.events;
async function run(waitMs, label) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const code = "9" + String(Math.floor(Math.random() * 900) + 100);
  await page.evaluate(c => window.__join(c), code);
  await page.waitForTimeout(3000);
  const beforeRejoin = eventsNow();
  const res = await page.evaluate(([c, w]) => window.__leaveThenJoin(c, w), [code, waitMs]);
  const atRejoin = eventsNow();
  await page.waitForTimeout(8000);   // 入り直したあと、名乗り続けるか
  const after = eventsNow() - atRejoin;
  console.log("  " + label.padEnd(26) +
    " 同じ入れ物が返った: " + (res.sameObject ? "★はい" : "いいえ") +
    " ／ 入り直したあと8秒の告知: " + after + " 件" +
    (errs.length ? " ／ ページのエラー " + errs.length : ""));
  await ctx.close();
  return { same: res.sameObject, after, errs };
}

console.log("══ ★leave() の直後に入り直すと、何が起きるか ══");
console.log("   （まねごとの待ち合わせ先。本物は使っていません。appId は本番と同じ）\n");
const r0 = await run(0, "待たずに入り直す（いまの作り）");
const r150 = await run(150, "150ミリ秒 待つ");
const r300 = await run(300, "300ミリ秒 待つ");
const rAwait = await run("await", "★leave() を待ってから");

console.log("\n── まとめ ──");
check("★待たずに入り直すと、同じ入れ物が返る（＝入り直せていない）", r0.same === true,
  r0.same ? "はい（いまの「もう一度つなぐ」はこれ）" : "いいえ（見立て外れ）");
check("★待たずに入り直すと、そのあと名乗らなくなる", r0.after === 0, r0.after + " 件");
check("300ミリ秒 待てば、新しい入れ物になる", r300.same === false, r300.same ? "まだ同じ" : "新しい");
check("★300ミリ秒 待てば、名乗り続ける", r300.after > 0, r300.after + " 件");
check("leave() を待ってから入り直せば、新しい入れ物になる", rAwait.same === false, rAwait.same ? "まだ同じ" : "新しい");
check("★leave() を待ってから入り直せば、名乗り続ける", rAwait.after > 0, rAwait.after + " 件");
console.log("\n  150ミリ秒のとき: 同じ入れ物 " + (r150.same ? "はい" : "いいえ") + " ／ 告知 " + r150.after + " 件（境目の目安）");
await browser.close(); server.close(); relay.close();
console.log(ng ? "\n✘ " + ng + " 件 ちがう" : "\n===== 合計: 見立てどおり =====");
process.exit(ng ? 1 : 0);
