// ★「部屋を作ってから何秒たつと、あとから入った人と出会えなくなるか」の境目を出す。
//   2026-09-23 ユーザー証言:「素早く入ればはいれる／ちょっと経つとはいれない／両方リロードすれば入れる」
//   実測（本物の relay・2026-09-23）: 遅れ 25秒 → 出会えた ／ 60・180・300秒 → 出会えない。
//   ★本物の relay を何度も叩けないので、**まねごとの待ち合わせ先**で同じことが起きるかを見て、
//     起きるならここで境目を詰める（＝relay 側の事情ではなく、こちら側の作りの話だと分かる）。
//
// 使い方: node tools/mikaku/meet_age_probe.mjs [--ages=5,30,60,120]
//
// ■ ★この道具が答えるもの
//   ・まねごとの待ち合わせ先でも、時間がたつと出会えなくなるか（＝relay のせいではない証拠になる）
//   ・出会えないとき、**名乗りは届いているのか**（アプリの記録の「★相手の名乗りを受けた」で見る）
//   ・入る側だけ開き直すと直るか／作る側も開き直すと直るか（ユーザーの「両方リロード」の裏取り）
//
// ■ ★見ていないもの（4-2）: 本物の relay の癖・実機・回線
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_diag");
fs.mkdirSync(SHOTS, { recursive: true });
const AGES = (process.argv.find(a => a.startsWith("--ages=")) || "--ages=5,30,60,120").split("=")[1].split(",").map(Number);
const root = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);

const relay = await startFakeRelay({ broadcast: true, label: "meet-age" });
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

async function newPeer() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(PAGE_URL); await page.waitForTimeout(700);
  return { ctx, page, errs };
}
async function metWithin(page, ms) {
  try {
    await page.waitForFunction(() => {
      const e = document.getElementById("start-together-btn");
      return e && getComputedStyle(e).display !== "none";
    }, null, { timeout: ms });
    return true;
  } catch (e) { return false; }
}
// 診断パネルの「名乗り」の行（出ていれば）
async function annLine(page, side) {
  const id = side === "guest" ? "join-diag-text" : "create-diag-text";
  const t = await page.$eval("#" + id, e => e.textContent || "").catch(() => "");
  return (t.split("\n").find(l => l.indexOf("名乗り") === 0) || "（パネルが出ていない）").trim();
}

const rows = [];
for (const age of AGES) {
  const host = await newPeer();
  await host.page.click("#create-btn");
  await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
  const code = await host.page.$eval("#room-code-display", e => e.textContent);
  await host.page.waitForTimeout(age * 1000);
  const guest = await newPeer();
  await guest.page.click("#go-join");
  await guest.page.fill("#join-code-input", code);
  await guest.page.click("#join-btn");
  const met = await metWithin(host.page, 25000);
  let fix = "";
  if (!met) {
    // ★ユーザーの手「両方リロードして10秒以内に」を試す
    await guest.page.reload(); await guest.page.waitForTimeout(700);
    await guest.page.click("#go-join");
    await guest.page.fill("#join-code-input", code);
    await guest.page.click("#join-btn");
    const metGuestReload = await metWithin(host.page, 20000);
    if (metGuestReload) fix = "入る側だけ開き直したら出会えた";
    else {
      await host.page.reload(); await host.page.waitForTimeout(700);
      await host.page.click("#create-btn");
      await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
      const code2 = await host.page.$eval("#room-code-display", e => e.textContent);
      await guest.page.reload(); await guest.page.waitForTimeout(700);
      await guest.page.click("#go-join");
      await guest.page.fill("#join-code-input", code2);
      await guest.page.click("#join-btn");
      fix = (await metWithin(host.page, 20000)) ? "★両方開き直したら出会えた" : "開き直しても出会えない";
    }
  }
  const hl = await annLine(host.page, "host"), gl = await annLine(guest.page, "guest");
  rows.push({ age, met, fix, hl, gl, errs: host.errs.concat(guest.errs).length });
  console.log("  " + (met ? "○" : "✘") + " 部屋の古さ " + String(age).padStart(3) + "秒 … " +
    (met ? "出会えた" : "出会えない　→ " + fix));
  if (!met) { console.log("      作る側 " + hl); console.log("      入る側 " + gl); }
  await host.ctx.close(); await guest.ctx.close();
}
console.log("\n── まとめ（まねごとの待ち合わせ先・1本だけ）──");
rows.forEach(r => console.log("  " + String(r.age).padStart(3) + "秒 … " + (r.met ? "○ 出会えた" : "✘ " + r.fix) + (r.errs ? "（ページのエラー " + r.errs + "）" : "")));
const bad = rows.filter(r => !r.met);
if (bad.length === 0) console.log("\n★まねごとの待ち合わせ先では、どの古さでも出会えました。**症状は relay 側／回線側の事情の可能性が高い**");
else console.log("\n★まねごとの待ち合わせ先でも出会えない古さがあります＝**こちら側の作りの話**。境目: " + bad[0].age + "秒");
console.log("（まねごとの待ち合わせ先: 受けた告知 " + relay.state.events + " ／ 配った " + relay.state.delivered + "）");
await browser.close(); server.close(); relay.close();
