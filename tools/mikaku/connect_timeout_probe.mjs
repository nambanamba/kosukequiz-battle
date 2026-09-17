// つながらないときの知らせ（2026-09-18）を見る。
//
// 使い方: node tools/mikaku/connect_timeout_probe.mjs
//
// 相手が来ない状態（部屋には入れるが、だれも参加しない）を作り、20秒後に
// 「つながりませんでした」と「もう一度つなぐ」が出るかを、ホスト側とゲスト側で見る。
// ★本物の通信はしない（trystero を、何も起きないスタブに差し替える）。
//   本当につながるかは実機2台（4G/5G）でしか分からない。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_wide");
fs.mkdirSync(SHOTS, { recursive: true });

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();

const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".jpg":"image/jpeg", ".png":"image/png"};
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
const BASE = "http://127.0.0.1:" + server.address().port + "/index.html";

// 部屋には入れるが、相手はいつまでも来ないスタブ
const STUB = `
export function joinRoom(cfg, code){
  window.__kqRtc = cfg && cfg.rtcConfig ? cfg.rtcConfig : null;   // 中継の設定が渡っているかを見る
  return { onPeerJoin(){}, onPeerLeave(){},
    makeAction(){ return { send(){}, onMessage: null }; }, leave(){} };
}`;

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 800, height: 1280 } });
await ctx.route(/trystero/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("dialog", d => d.accept());
await page.goto(BASE); await page.waitForTimeout(700);
await page.evaluate(() => {
  const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc").u;
  localStorage.clear();
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: 3 }));
});
await page.reload(); await page.waitForTimeout(700);

// ---- ホスト: 部屋を作って待つ ----
await page.$eval("#create-btn", e => e.click());
await page.waitForTimeout(1500);
const rtc = await page.evaluate(() => window.__kqRtc);
const turns = (rtc?.iceServers || []).filter(s => /^turns?:/i.test(Array.isArray(s.urls) ? s.urls[0] : s.urls));
console.log(`中継（TURN）の設定が渡っている: ${turns.length}件／STUN をふくめ ${(rtc?.iceServers || []).length}件`);
const before = await page.evaluate(() => ({
  err: getComputedStyle(document.getElementById("create-error")).display !== "none" && document.getElementById("create-error").classList.contains("show"),
  retry: getComputedStyle(document.getElementById("create-retry-btn")).display !== "none"
}));
console.log(`5秒の時点: 知らせ ${before.err ? "出ている" : "出ていない"}／もう一度つなぐ ${before.retry ? "出ている" : "出ていない"}（まだ出ないのが正しい）`);
await page.waitForTimeout(20000);
const after = await page.evaluate(() => ({
  shown: document.getElementById("create-error").classList.contains("show"),
  text: document.getElementById("create-error").textContent.replace(/\s+/g, " ").trim(),
  retry: getComputedStyle(document.getElementById("create-retry-btn")).display !== "none"
}));
console.log(`20秒すぎ（ホスト）: 知らせ ${after.shown ? "出た" : "★出ない"}／もう一度つなぐ ${after.retry ? "出た" : "★出ない"}`);
console.log(`  文面: ${after.text}`);
await page.screenshot({ path: path.join(SHOTS, "after_connect_timeout_host_800x1280.png") });

// 「もう一度つなぐ」を押すと、知らせが消えて待ち直す
await page.$eval("#create-retry-btn", e => e.click());
await page.waitForTimeout(800);
const retried = await page.evaluate(() => ({
  shown: document.getElementById("create-error").classList.contains("show"),
  note: document.getElementById("home-waiting-note").textContent.trim()
}));
console.log(`もう一度つなぐを押したあと: 知らせ ${retried.shown ? "★残っている" : "消えた"}／画面の字「${retried.note}」`);

// ---- ゲスト: 番号を入れてつなぐ ----
await page.$eval("#create-cancel", e => e.click());
await page.waitForTimeout(300);
await page.$eval("#go-join", e => e.click());
await page.fill("#join-code-input", "1234");
await page.$eval("#join-btn", e => e.click());
await page.waitForTimeout(21000);
const guest = await page.evaluate(() => ({
  shown: document.getElementById("join-error").classList.contains("show"),
  retry: getComputedStyle(document.getElementById("join-retry-btn")).display !== "none"
}));
console.log(`20秒すぎ（ゲスト）: 知らせ ${guest.shown ? "出た" : "★出ない"}／もう一度つなぐ ${guest.retry ? "出た" : "★出ない"}`);
await page.screenshot({ path: path.join(SHOTS, "after_connect_timeout_guest_800x1280.png") });
console.log(`JSエラー: ${errors.length}件 ${errors.slice(0, 2).join(" / ")}`);

await ctx.close(); await browser.close(); server.close();
