// 「二人で始める」が実際に動くかを、**本物の trystero を読み込ませて**確かめる。
//
// なぜ要るか: 対戦の通信ライブラリ（trystero）を、モジュール先頭の import から
// 「対戦を始めるときに読み込む」形に変えた。速度のためだが、**本当のリスクは速度ではなく
// 「対戦が始められなくなること」**。対戦はこのアプリの中心機能で、ひとり練習より優先度が高い。
//
// smoke-test は WebRTC をスタブに差し替えているので、**読み込みそのものは検査されていない。**
// ここでは差し替えず、実際にインターネットから読み込ませる。
//
// 使い方:
//   node tools/test_battle_start.mjs
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

let pass = 0, fail = 0;
function check(name, got, want){
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "  ✅ " : "  ❌ ") + name + "  got=" + JSON.stringify(got) + (ok ? "" : " want=" + JSON.stringify(want)));
  ok ? pass++ : fail++;
}

const browser = await pw.chromium.launch();

// 「二人で始める」を押して、部屋ができて相手を待つ状態まで行けるか。
// 2台目が無くても、ホスト側が待機に入るところまでは確かめられる
async function tryStart({ wait, blockFirst, label }){
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e).slice(0, 120)));
  // **本当に部屋ができたか**の証拠。trystero は部屋を作ると中継サーバーへ
  // つなぎに行くので、その通信が始まったかどうかで判定する。
  // 画面の「相手を待っています」は読み込みを待つ前に出てしまうため、
  // それだけでは「部屋ができた」証明にならない（弱い判定だった）
  const sockets = [];
  page.on("websocket", ws => sockets.push(ws.url()));
  let blocked = 0;
  if (blockFirst) {
    // 読み込みを最初の何回かだけ失敗させ、**やり直す経路が動くか**を見る。
    // 予備のCDNも含めて止めるので、「先読みが完全に失敗した状態」も作れる
    await ctx.route(/(esm\.run\/trystero|cdn\.jsdelivr\.net\/npm\/trystero)/, route => {
      if (blocked < blockFirst) { blocked++; route.abort(); } else route.continue();
    });
  }
  await page.goto(BASE + "index.html", { waitUntil: "load" });
  await page.waitForSelector("#unit-choices .choice", { timeout: 60000 });
  if (wait) await page.waitForTimeout(wait);   // 裏の先読みが終わるのを待つ
  await page.click("#create-btn");
  // 部屋のコードが出て「相手を待っています」の状態になるまで
  let ok = true;
  try {
    await page.waitForFunction(() => {
      const w = document.getElementById("home-waiting");
      const code = document.getElementById("room-code-display");
      return w && w.style.display === "block" && code && /^[A-Z0-9]{3,}$/i.test(code.textContent.trim());
    }, { timeout: 45000 });
  } catch { ok = false; }
  // 中継サーバーへつなぎに行くまで待つ（＝trystero が読めて joinRoom が動いた証拠）
  const until = Date.now() + 45000;
  while (sockets.length === 0 && Date.now() < until) await page.waitForTimeout(250);
  const connected = sockets.length > 0;
  const state = await page.evaluate(() => ({
    code: (document.getElementById("room-code-display").textContent || "").trim(),
    waiting: document.getElementById("home-waiting").style.display,
    err: (document.getElementById("create-error").className || "").includes("show")
      ? document.getElementById("create-error").textContent : null,
  }));
  await ctx.close();
  return { label, ok, connected, sockets: sockets.length, state, errors, blocked };
}

console.log("\n【1】画面が出て数秒おいてから押す（裏の先読みが効いている状態）");
{
  const r = await tryStart({ wait: 5000, label: "先読みずみ" });
  check("画面が相手待ちになる", r.ok, true);
  check("★本当に部屋ができた（中継サーバーに接続）", r.connected, true);
  check("部屋のコードが出ている", /^[A-Z0-9]{3,}$/i.test(r.state.code), true);
  check("エラー表示が出ていない", r.state.err, null);
  check("JSエラーが出ていない", r.errors, []);
}

console.log("\n【2】★起動直後に急いで押す（先読みが終わる前。ここが一番危ない）");
{
  const r = await tryStart({ wait: 0, label: "先読み前" });
  check("画面が相手待ちになる", r.ok, true);
  check("★本当に部屋ができた（中継サーバーに接続）", r.connected, true);
  check("部屋のコードが出ている", /^[A-Z0-9]{3,}$/i.test(r.state.code), true);
  check("エラー表示が出ていない", r.state.err, null);
  check("JSエラーが出ていない", r.errors, []);
}

console.log("\n【3】★読み込みが1回失敗する（自動でやり直して先読みが間に合うか）");
{
  const r = await tryStart({ wait: 5000, blockFirst: 1, label: "1回失敗" });
  check("読み込みを1回止めた", r.blocked, 1);
  check("画面が相手待ちになる", r.ok, true);
  check("★それでも本当に部屋ができた（中継サーバーに接続）", r.connected, true);
  check("エラー表示が出ていない", r.state.err, null);
}

console.log("\n【4】★先読みが完全に失敗したあとに押す（押したときにやり直せるか）");
{
  // ここが一番こわい場面。裏の先読みがまるごと失敗しても、
  // **そのあと「二人で始める」を押せば対戦が始められる**ことを確かめる。
  // 同じURLで頼み直しても取りに行ってくれないので、URLを変えて頼み直している
  const r = await tryStart({ wait: 5000, blockFirst: 2, label: "先読み全滅後" });
  check("先読みを2回とも止めた", r.blocked, 2);
  check("押したあとに本当に部屋ができた（中継サーバーに接続）", r.connected, true);
  check("エラー表示が出ていない", r.state.err, null);
}

await browser.close();
server.close();
console.log("\n===== 合計: " + pass + " 件成功 / " + fail + " 件失敗 =====");
console.log("※ 本物の trystero をインターネットから読み込んでいます（スタブではありません）");
console.log("※ 2台目をつないだ実際の対戦は、実機で確認してください");
process.exit(fail ? 1 : 0);
