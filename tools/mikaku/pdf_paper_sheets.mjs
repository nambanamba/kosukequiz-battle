// ★「紙で出す」6題ぶんを、印刷と同じ条件（@media print・A4縦）で実際に PDF にする（2026-09-28）。
// 司令塔「幅358pxのスマホ幅の撮影なので、A4の実際の印刷がどうなるかを確かめてください」。
// ★画像はコミットしない（司令塔の依頼どおり）。この道具自体もコミット対象外（一時使用）。
// 使い方: node tools/mikaku/pdf_paper_sheets.mjs
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_paper");
fs.mkdirSync(SHOTS, { recursive: true });
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end()
    : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL0 = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
// ★PDF はスマホ幅ではなくデスクトップ幅で開く（印刷ダイアログを開く親のウィンドウ幅の影響を受けないか確かめる）
const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
const page = await ctx.newPage();
page.on("dialog", d => d.accept().catch(() => {}));

await page.goto(URL0); await page.waitForTimeout(500);
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(700);
await page.click("#subject-science"); await page.waitForTimeout(300);
await page.click("#paper-open-btn"); await page.waitForTimeout(300);

const keys = await page.evaluate(() => [...document.querySelectorAll("#paper-list-body .paper-row")].map(e => e.dataset.key));
console.log("紙の大問:", keys.length, "件");

for (const key of keys) {
  // ★screen メディアのまま操作する（print メディアだと .screen が全部隠れてクリックできない）
  await page.click('.paper-row[data-key="' + key + '"]'); await page.waitForTimeout(300);
  // ★印刷と同じ条件: PDF を書き出す直前だけ @media print を適用する
  //   （page.pdf は既定で print を適用するが、ここでも明示しておく。
  //   CSS 側の @page で A4 縦・余白14mmを指定ずみ）
  await page.emulateMedia({ media: "print" });
  const safeName = key.replace(/[^\w一-龥ぁ-んァ-ヶー_-]/g, "_");
  const out = path.join(SHOTS, safeName + ".pdf");
  await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
  console.log("作った:", out);
  await page.emulateMedia({ media: "screen" });
  await page.click("#paper-print-back"); await page.waitForTimeout(200);
}

await ctx.close();
await browser.close();
server.close();
console.log("完了。" + keys.length + "個の PDF を " + SHOTS + " に置きました。");
