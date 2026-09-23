// ★アプリの「もう一度つなぐ」を押したあと、**名乗りが出るか**を測る（2026-09-23）。
//
// ■ なぜ要るか
//   ライブラリのソースと単体の実験で、**押すと名乗りが止まる**ことが分かった
//   （`joinRoom` は同じ番号なら既にある部屋を返し、`leave()` の片づけは99ミリ秒あと）。
//   ★ここでは**アプリのボタンそのもの**で測る。直す前に「0件」を先に出しておき、
//     直したあと「出るようになった」を数字で示すため（確認ポイント 4-1）。
//
// 使い方: node tools/mikaku/retry_button_probe.mjs
//   ★まねごとの待ち合わせ先だけを使う（本物は叩かない）。
//
// ■ ★この道具が言えること／言えないこと（4-2）
//   言える  … 「押すと名乗りが止まる」が直ったか
//   ★言えない… 「対戦がつながるようになった」。**まねごとでは症状の再現が不安定**（60秒×／90・120秒○）。
//               実機での確認は別（B-12）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_diag");
fs.mkdirSync(SHOTS, { recursive: true });
const root = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
let ng = 0;
const check = (label, ok, extra) => { console.log("  " + (ok ? "✔" : "✘") + " " + label + (extra ? " … " + extra : "")); if (!ok) ng++; };

const relay = await startFakeRelay({ broadcast: true, label: "retry-btn" });
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => {
    if (e) { res.writeHead(404).end(); return; }
    let body = b;
    if (rel === "index.html") {
      const src = b.toString("utf8");
      const i0 = src.indexOf("const RELAY_URLS = [");
      const i1 = src.indexOf("];", i0);
      if (i0 >= 0 && i1 >= 0) body = Buffer.from(src.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + src.slice(i1), "utf8");
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(body);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  await page.goto(PAGE_URL); await page.waitForTimeout(700);
  return { ctx, page, errs };
}
// 「もう一度つなぐ」が出るまで（相手が来ないまま20秒）待つ
async function waitRetryBtn(page, id) {
  await page.waitForFunction(i => {
    const e = document.getElementById(i);
    return e && getComputedStyle(e).display !== "none";
  }, id, { timeout: 45000 });
}

console.log("══ ★「もう一度つなぐ」を押したあと、名乗りが出るか ══  （まねごとの待ち合わせ先・1本）\n");

console.log("■ 1. 部屋を作った側");
{
  const { ctx, page, errs } = await open();
  await page.click("#create-btn");
  await page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
  const code = await page.$eval("#room-code-display", e => e.textContent);
  await waitRetryBtn(page, "create-retry-btn");
  await page.waitForTimeout(1500);
  const before = relay.state.events;
  await page.$eval("#create-retry-btn", e => e.click());
  await page.waitForTimeout(8000);
  const after = relay.state.events - before;
  console.log("     押したあと8秒の告知: " + after + " 件");
  check("★押したあとも名乗っている（0件だと相手から見つけられない）", after > 0, after + " 件");
  check("部屋の番号は変わらない", (await page.$eval("#room-code-display", e => e.textContent)) === code, code);
  check("ページのエラー 0", errs.length === 0, errs.slice(0, 2).join(" | "));
  await page.screenshot({ path: path.join(SHOTS, "retry_btn_host.png"), fullPage: true });
  await ctx.close();
}

console.log("■ 2. 部屋に入った側");
{
  const host = await open();
  await host.page.click("#create-btn");
  await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
  const code = await host.page.$eval("#room-code-display", e => e.textContent);
  await host.ctx.close();          // 相手は居ない状態にする（入る側だけを見る）
  const { ctx, page, errs } = await open();
  await page.click("#go-join");
  await page.fill("#join-code-input", code);
  await page.click("#join-btn");
  await waitRetryBtn(page, "join-retry-btn");
  await page.waitForTimeout(1500);
  const before = relay.state.events;
  await page.$eval("#join-retry-btn", e => e.click());
  await page.waitForTimeout(8000);
  const after = relay.state.events - before;
  console.log("     押したあと8秒の告知: " + after + " 件");
  check("★押したあとも名乗っている", after > 0, after + " 件");
  check("ページのエラー 0", errs.length === 0, errs.slice(0, 2).join(" | "));
  await ctx.close();
}

console.log("■ 3. ★連打しても壊れないか（5回続けて押す）");
{
  const { ctx, page, errs } = await open();
  await page.click("#create-btn");
  await page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
  const code = await page.$eval("#room-code-display", e => e.textContent);
  await waitRetryBtn(page, "create-retry-btn");
  const before = relay.state.events;
  for (let i = 0; i < 5; i++) { await page.$eval("#create-retry-btn", e => e.click()); await page.waitForTimeout(120); }
  await page.waitForTimeout(9000);
  const after = relay.state.events - before;
  console.log("     5回押したあと9秒の告知: " + after + " 件");
  check("★連打しても名乗りは続く", after > 0, after + " 件");
  check("★連打しても、告知が何倍にもならない（連打止めが効いている）", after <= 12, after + " 件（1回ぶんは4件前後）");
  check("番号は変わらない", (await page.$eval("#room-code-display", e => e.textContent)) === code, code);
  check("ページのエラー 0", errs.length === 0, errs.slice(0, 2).join(" | "));
  await ctx.close();
}

await browser.close(); server.close(); relay.close();
console.log("\n★この道具が言えるのは「押すと名乗りが止まる」が直ったかまでです。");
console.log("　**対戦がつながるようになったかは、実機で確かめてください**（まねごとでは再現が不安定）");
console.log(ng ? "\n✘ " + ng + " 件 ちがう" : "\n===== 合計: 問題なし =====");
process.exit(ng ? 1 : 0);
