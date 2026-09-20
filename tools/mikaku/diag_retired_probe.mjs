// ★診断パネルの「★断られて使えなくなった」行が、**本当に鳴るか**を見る。
//
// 使い方: node tools/mikaku/diag_retired_probe.mjs
//
// ■ なぜ要るか（2026-09-20）
//   Trystero は、待ち合わせ先から `OK=false`（rate-limited: と duplicate: 以外）や
//   `CLOSED` を受けると、**その先を二度と使いません**（`retireRelay`）。
//   しかも core は接続を URL ごとにページ内で使い回すので、
//   **部屋を入り直しても戻りません。開き直すまで失われたままです。**
//   この行が無いと、「いま開いている N 本」が減った理由が永久に分かりません。
//
// ■ ★基準の両側を見る（確認ポイント 4-3）
//   ① 断らない待ち合わせ先だけ → 「なし」と出ること（**鳴りすぎない**）
//   ② 1本だけ断る            → 「1 本」と**理由がそのまま**出ること（**鳴る**）
//   ③ `rate-limited:` で断る  → ★**鳴らない**こと（ライブラリが切り捨てない区切りと合わせる）
//
// ■ ★見ていないもの（4-2）
//   - 本物の relay で同じ文言が返るか。ここは**まねごとの待ち合わせ先**
//   - 実機（Fire/Silk）で同じに見えるか
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

let ng = 0;
const check = (label, ok, extra) => { console.log(`  ${ok ? "✔" : "✘"} ${label}${extra ? " … " + extra : ""}`); if (!ok) ng++; };

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const browser = await chromium.launch({ channel: "chrome" });

// 1回ぶん: 指定した待ち合わせ先だけを配って、部屋を作り、診断パネルの文面を読む
async function run(urls) {
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
        if (i0 >= 0 && i1 >= 0) {
          body = Buffer.from(src.slice(0, i0) + "const RELAY_URLS = [" +
            urls.map(u => `"${u}"`).join(", ") + src.slice(i1), "utf8");
        }
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(body);
    });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const PORT = server.address().port;
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
  // ★診断パネルは「相手が見つからないまま20秒」たってから出る。短いと空のまま読む
  await page.waitForFunction(() => {
    const t = document.getElementById("create-diag-text");
    return t && t.textContent && t.textContent.indexOf("待ち合わせ先") >= 0;
  }, null, { timeout: 45000 });
  const text = await page.evaluate(() => {
    const t = document.getElementById("create-diag-text");
    return (t && t.textContent || "").trim();
  });
  await ctx.close(); server.close();
  const line = text.split("\n").find(l => l.indexOf("断られて使えなくなった") >= 0) || "（行が無い）";
  const relayLine = text.split("\n").find(l => l.indexOf("待ち合わせ先（") >= 0) || "";
  return { line, relayLine };
}

// ① 基準: 誰も断らない → 「なし」のはず（★鳴りすぎない）
{
  const a = await startFakeRelay({});
  const b = await startFakeRelay({});
  const { line } = await run([a.url, b.url]);
  console.log("\n── ① 誰も断らないとき ──\n  " + line);
  check("★断る先が無ければ「なし」と出る（鳴りすぎない）", /なし\s*$/.test(line), line.slice(0, 60));
  a.close(); b.close();
}

// ② ★本題: 1本が「banned:」で断る → 1本ぶん、理由つきで出るはず
{
  const good = await startFakeRelay({});
  const bad = await startFakeRelay({ rejectWith: "banned: ためしに断っています" });
  const { line, relayLine } = await run([good.url, bad.url]);
  console.log("\n── ② 1本が banned で断るとき ──\n  " + line + "\n  " + relayLine);
  check("★★断られた本数が 1 本と出る", /断られて使えなくなった: 1 本/.test(line), line.slice(0, 80));
  check("★理由がそのまま出る（要約しない）", line.indexOf("banned: ためしに断っています") >= 0);
  check("断った先だけが挙がっている（断らなかった先は出ない）",
        line.indexOf(new URL(good.url).port) < 0);
  check("待ち合わせ先の行でも ✘ が付く", /✘/.test(relayLine), relayLine.slice(0, 90));
  good.close(); bad.close();
}

// ③ ★鳴りすぎ確認: `rate-limited:` はライブラリが切り捨てないので、ここでも鳴らないはず
{
  const good = await startFakeRelay({});
  const limited = await startFakeRelay({ rejectWith: "rate-limited: slow down" });
  const { line } = await run([good.url, limited.url]);
  console.log("\n── ③ rate-limited で断るとき（切り捨てられない区切り）──\n  " + line);
  check("★`rate-limited:` では鳴らない（ライブラリの区切りと合っている）", /なし\s*$/.test(line), line.slice(0, 60));
  good.close(); limited.close();
}

await browser.close();
console.log(ng === 0 ? "\n✔ すべて確認できた" : `\n✘ ${ng}件 だめだった`);
console.log("★この検査は**まねごとの待ち合わせ先**です。本物・実機で同じ文言が返る保証はありません。");
process.exit(ng === 0 ? 0 : 1);
