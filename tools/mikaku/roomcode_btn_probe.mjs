// 部屋の番号を変えるリンク「別のコードにする」の大きさ（2026-10-03・ユーザー「もう少し小さく」）
// 本物の Chrome・390x844。部屋を作った待ち画面で測る。スクショは tools/mikaku/shots_roomcode/（コミットしない）
// 見ること:
//   R1 文字が 12px より小さい（もとは 12px）
//   R2 押せる高さは 24px 以上（押しにくくなりすぎない）
//   R3 押すと番号が変わる（機能は残る）
//   R4 押せる範囲が横いっぱいの帯ではない（もとは幅 358px。うっかり触れて番号が変わらないように）
// 自己テスト: 直す前（4363c8a）で R1 が鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_roomcode"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "4363c8a";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "roomcode" });
let SERVED = CURRENT;
function withFakeRelay(src) {
  const i0 = src.indexOf("const RELAY_URLS = ["), i1 = src.indexOf("];", i0);
  if (i0 < 0 || i1 < 0) throw new Error("RELAY_URLS が見つかりません");
  return src.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + src.slice(i1);
}
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(Buffer.from(withFakeRelay(SERVED), "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(String(e)));
  try {
    await page.goto(PAGE_URL); await page.waitForTimeout(500);
    await page.$eval("#create-btn", e => e.click());
    await page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => { const e = document.getElementById("room-code-change"); const r = e.getBoundingClientRect(); return { fs: parseFloat(getComputedStyle(e).fontSize), h: r.height, w: r.width }; });
    await page.screenshot({ path: path.join(SHOTS, label + "_waiting.png") });
    check("R1 文字が 12px より小さい（" + m.fs + "px）", m.fs < 12, m.fs);
    check("R2 押せる高さ 24px 以上（" + Math.round(m.h) + "px）", m.h >= 24, m.h);
    check("R4 押せる範囲が文字のまわりだけ（幅 " + Math.round(m.w) + "px ≤ 160）", m.w <= 160, m.w);
    const c0 = await page.$eval("#room-code-display", e => e.textContent);
    await page.$eval("#room-code-change", e => e.click());
    await page.waitForFunction(c => { const t = document.getElementById("room-code-display").textContent; return /^\d{4}$/.test(t) && t !== c; }, c0, { timeout: 15000 }).catch(() => {});
    const c1 = await page.$eval("#room-code-display", e => e.textContent);
    check("R3 押すと番号が変わる（" + c0 + "→" + c1 + "）", c1 !== c0 && /^\d{4}$/.test(c1));
    check("画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
  finally { await ctx.close(); }
  return out;
}
function report(title, out) { console.log("\n── " + title + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.name + (c.extra ? " … " + c.extra : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照", await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件");
await done(ng ? 1 : 0);
