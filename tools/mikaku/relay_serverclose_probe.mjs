// ★★待ち合わせ先が **相手から切られた** あと、張り直すか。
//
// 使い方: node tools/mikaku/relay_serverclose_probe.mjs [--wait 60] [--close-after 8]
//
// ■ なぜこの形で試すのか（確認ポイント 4-1）
//   2026-09-20 に実測した壊れ方は「**relay 側から切られて、そのあと張り直さない**」だった。
//   ところが `relay_reconnect_probe`（**こちらから `close()` する**形）は**通ってしまった**。
//   ＝ **切り方が実際の壊れ方と違うと、検査は鳴らない。**
//   なので、こちらで中身を決められる待ち合わせ先（`fake_relay.mjs`）を立てて、
//   **向こうから切る**ところまで作った。
//
// ■ 何を数えるか
//   **待ち合わせ先に「何回つなぎに来たか」**。
//   1回きり＝張り直していない。2回以上＝張り直している。
//   ★ページの中の数え方ではなく、**受ける側で数える**（アプリの申告に頼らない・0-1）
//
// ■ ★言えないこと（4-2）
//   - 実機（Fire/Silk）の症状が治るか。**ここでは分からない**
//   - 本物の relay が同じ振る舞いをするか。ここは**まねごとの待ち合わせ先**
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();

const ARGV = process.argv.slice(2);
const argOf = (n) => { const i = ARGV.indexOf(n); return i >= 0 ? ARGV[i + 1] : null; };
const WAIT = Number(argOf("--wait") || 60);
const CLOSE_AFTER = Number(argOf("--close-after") || 8) * 1000;

// ① 切らない待ち合わせ先（対照）と ② 8秒で切る待ち合わせ先
// ★`--keeps N` … 切らない待ち合わせ先を N 本用意する。
//   2026-09-20 の食いちがい（**本物6本では張り直さないのに、まねごと2本では張り直す**）を
//   確かめるため。「一定数つながっていれば張り直さない」なら、**N を増やすと張り直さなくなる**はず。
const KEEPS = Number(argOf("--keeps") || 1);
const keeps = [];
for (let i = 0; i < KEEPS; i++) keeps.push(await startFakeRelay({ label: "切らない" + i }));
const drop = await startFakeRelay({ closeAfterMs: CLOSE_AFTER, label: "★切る" });
console.log(`まねごとの待ち合わせ先: 切らない ${KEEPS}本 ／ ${CLOSE_AFTER / 1000}秒で切る 1本（合計 ${KEEPS + 1}本）`);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => {
    if (e) { res.writeHead(404).end(); return; }
    let body = b;
    if (rel === "index.html") {
      // ★待ち合わせ先を、こちらの2本だけに差しかえる（本物には迷惑をかけない）
      const src = b.toString("utf8");
      const i0 = src.indexOf("const RELAY_URLS = [");
      const i1 = src.indexOf("];", i0);
      if (i0 >= 0 && i1 >= 0) {
        const list = keeps.map(k => `"${k.url}"`).concat([`"${drop.url}"`]).join(", ");
        body = Buffer.from(src.slice(0, i0) + "const RELAY_URLS = [" + list + src.slice(i1), "utf8");
      }
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(body);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

let ng = 0;
const check = (label, ok, extra) => { console.log(`  ${ok ? "✔" : "✘"} ${label}${extra ? " … " + extra : ""}`); if (!ok) ng++; };

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${PORT}/index.html`);
await page.waitForTimeout(400);
await page.evaluate(() => {
  const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
  localStorage.clear();
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
    subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: 3 }));
});
await page.reload(); await page.waitForTimeout(800);
await page.$eval("#create-btn", e => e.click());
await page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });

await page.waitForTimeout(3000);
console.log(`\n── 基準（切られる前）──`);
console.log(`  切らない側に つなぎに来た ${keeps.map(k => k.state.connects).join("/")} 回 ／ 切る側に ${drop.state.connects} 回`);
check("★まず、両方につながっている（これが無いと以降は測れない）",
      keeps.every(k => k.state.connects >= 1) && drop.state.connects >= 1,
      (keeps.every(k => k.state.connects) && drop.state.connects) ? "" : "★つながっていない。まねごとの待ち合わせ先か、環境の側を疑ってください");

const base = drop.state.connects;
console.log(`\n── ${CLOSE_AFTER / 1000}秒で切られたあと、${WAIT}秒のあいだ見る ──`);
for (let s = 10; s <= WAIT; s += 10) {
  await page.waitForTimeout(10000);
  const inPage = await page.evaluate(() => (typeof diagWsOpenNow === "function" ? diagWsOpenNow() : -1));
  console.log(`  ${String(s).padStart(3)}秒: 切る側に つなぎに来た ${drop.state.connects} 回（切った ${drop.state.closes} 回）` +
              ` ／ 画面の「いま開いている」= ${inPage} 本`);
}
check("★★相手から切られたあと、張り直してつなぎに来る", drop.state.connects > base,
      drop.state.connects > base ? `${base} 回 → ${drop.state.connects} 回` : "★1回きり。張り直していない");
check("張り直しが暴走していない（回数が多すぎない）", drop.state.connects <= base + 12,
      `${WAIT}秒で ${drop.state.connects} 回`);
check("切らない側は、無駄につなぎ直していない", keeps.every(k => k.state.connects <= 2), keeps.map(k => k.state.connects).join("/") + " 回");

await browser.close(); server.close(); keeps.forEach(k => k.close()); drop.close();
console.log(ng === 0 ? "\n✔ すべて確認できた" : `\n✘ ${ng}件 だめだった`);
console.log("★この検査が言えるのは「張り直すか」までです。**実機の症状が治ったかは分かりません。**");
process.exit(ng === 0 ? 0 : 1);
