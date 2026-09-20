// ★2つの画面が、**本物の待ち合わせ場所（relay）を通して実際に出会えるか**を見る。
//
// 使い方: node tools/mikaku/meet_probe.mjs
//
// なぜ要るか:
//   いままでの2人ぶんの検査（battle_buttons_probe・test_battle_resume ほか）は、
//   **通信を node のスタブに差し替えている**ので、待ち合わせの部分は一度も試されていない。
//   test_battle_start は本物を読むが、**部屋を作るところまで**で相手は来ない。
//   → 「relay を決めうちにしたら、出会えなくなった」を捕まえられる検査が、どこにも無かった。
//
// ★この検査が見るもの / 見ないもの（C-4d・D-16）
//   見る  … 本物の relay を通して、部屋を作った側と入った側が**お互いを見つけられるか**
//           （見つけた印＝二人ぶんの「開始する」ボタンが出ること）
//   見ない… **回線の違い**。ここは1台のPCの中の2つの画面で、どちらも同じ回線にいる。
//           携帯回線やFire タブレットで同じ結果になる保証はない（実機はB-12）。
//           道づくり（WebRTC）も、同じPCの中なのでいちばん簡単な条件でしか試していない。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_meet");
fs.mkdirSync(SHOTS, { recursive: true });
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();

// index.html だけは、頼まれ方によって中身を変えて返す（?relay=default なら決めうちを外す）
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const [p0, q] = req.url.split("?");
  const rel = decodeURIComponent(p0).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    let body = buf;
    if (rel === "index.html" && /relay=default/.test(q || "")) {
      const t = buf.toString("utf8").replace(", relayConfig: RELAY_CONFIG", "");
      body = Buffer.from(t, "utf8");
    }
    // ★でたらめな待ち合わせ先だけを見る版（③の自己確認用）。
    //   ページの中の変数は外からさわれないので、**配る中身のほうを変える**
    if (rel === "index.html" && /relay=bogus/.test(q || "")) {
      // ★正規表現に改行を書かず、位置を探して差しかえる（書き換え道具ごしだと壊れやすいため）
      const src = buf.toString("utf8");
      const i0 = src.indexOf("const RELAY_URLS = [");
      const i1 = src.indexOf("];", i0);
      const t = (i0 < 0 || i1 < 0) ? src
        : src.slice(0, i0) + 'const RELAY_URLS = ["wss://kosukequiz.invalid.example"' + src.slice(i1);
      body = Buffer.from(t, "utf8");
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(body);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

let ng = 0;
const check = (label, ok, extra) => {
  console.log(`  ${ok ? "✔" : "✘"} ${label}${extra ? " … " + extra : ""}`);
  if (!ok) ng++;
};
const browser = await chromium.launch({ channel: "chrome" });

async function newPeer(ctxOpts, query) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html${query}`);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
    localStorage.clear();
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
      subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: 3 }));
  });
  await page.reload(); await page.waitForTimeout(800);
  return { ctx, page };
}
const tap = (page, sel) => page.$eval(sel, e => e.click());
const relayLineOf = page => page.evaluate(() => {
  const t = document.getElementById("create-diag-text") || document.getElementById("join-diag-text");
  return (t && t.textContent || "").split("\n").filter(l => /^待ち合わせ/.test(l)).join(" | ");
});

// 1回ぶん: 部屋を作る → コードで入る → お互いを見つけたか
async function meet(query, label) {
  console.log(`\n── ${label} ──`);
  const host = await newPeer({ viewport: { width: 390, height: 844 } }, query);
  const guest = await newPeer({ viewport: { width: 390, height: 844 } }, query);
  const t0 = Date.now();
  await tap(host.page, "#create-btn");
  await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
  const code = await host.page.$eval("#room-code-display", e => e.textContent);
  console.log(`  部屋のコード: ${code}`);
  await tap(guest.page, "#go-join");
  await guest.page.fill("#join-code-input", code);
  await tap(guest.page, "#join-btn");

  let met = true, secs = 0;
  try {
    await host.page.waitForFunction(() => {
      const e = document.getElementById("start-together-btn");
      return e && getComputedStyle(e).display !== "none";
    }, null, { timeout: 45000 });
    secs = Math.round((Date.now() - t0) / 1000);
  } catch (e) { met = false; }
  check("★部屋を作った側が、相手を見つけた", met, met ? `${secs}秒でそろった` : "★45秒たっても出会えなかった");
  if (met) {
    const gOk = await guest.page.evaluate(() => {
      // ★入った側のボタンは `join-start-together-btn`（部屋を作った側とは別の id）
      const e = document.getElementById("join-start-together-btn");
      return !!(e && getComputedStyle(e).display !== "none");
    }).catch(() => false);
    check("入った側にも「開始する」が出ている", gOk);
  } else {
    // ★出会えなかったときは、**画面に出る記録をそのまま読む**（これがユーザーに届く形）
    await host.page.waitForTimeout(21000);
    console.log("  ── 部屋を作った側の記録 ──\n    " + (await relayLineOf(host.page)).replace(" | ", "\n    "));
    console.log("  ── 入った側の記録 ──\n    " + (await relayLineOf(guest.page)).replace(" | ", "\n    "));
  }
  await host.page.screenshot({ path: path.join(SHOTS, label.replace(/[^\w]/g, "_") + "_host.png"), fullPage: true });
  await guest.page.screenshot({ path: path.join(SHOTS, label.replace(/[^\w]/g, "_") + "_guest.png"), fullPage: true });
  await host.ctx.close(); await guest.ctx.close();
  return met;
}

const pinned = await meet("", "① いまの index.html（待ち合わせ先を決めうち）");
const dflt = await meet("?relay=default", "② くらべ用: 決めうちを外した（ライブラリの既定まかせ）");

// ★この検査が鳴るか（D-17）: **出会えない形**を作って、ちゃんと ✘ になることを見る。
//   片方だけ別の待ち合わせ場所にいれば、原理的に出会えない。
console.log("\n── ③ この検査が鳴るか（わざと別の待ち合わせ場所にする）──");
{
  const host = await newPeer({ viewport: { width: 390, height: 844 } }, "");
  // 入る側だけ、どこにも無い待ち合わせ場所に向かわせる
  const guest = await newPeer({ viewport: { width: 390, height: 844 } }, "?relay=bogus");
  await tap(host.page, "#create-btn");
  await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
  const code = await host.page.$eval("#room-code-display", e => e.textContent);
  await tap(guest.page, "#go-join");
  await guest.page.fill("#join-code-input", code);
  await tap(guest.page, "#join-btn");
  let met = true;
  try {
    await host.page.waitForFunction(() => {
      const e = document.getElementById("start-together-btn");
      return e && getComputedStyle(e).display !== "none";
    }, null, { timeout: 30000 });
  } catch (e) { met = false; }
  check("★別の場所にいると、ちゃんと出会えない（＝①の ✔ は本物）", !met,
        met ? "★出会えてしまった。①の結果は信用できない" : "");
  await host.ctx.close(); await guest.ctx.close();
}

// ---- ④ ★本物のライブラリの接続を、ちゃんと数えられているか ----
//   司令塔から「実機の記録では `試した 0` なのに相手は見つけている＝計測が捉えていないのでは」
//   という指摘があった（2026-09-20 16:51 の Silk）。**ここで実際に確かめる。**
//   相手が来ないまま20秒おいて、記録に待ち合わせ先の名前が出るかを見る。
console.log("\n── ④ ★本物のライブラリの接続を数えられているか ──");
{
  const host = await newPeer({ viewport: { width: 390, height: 844 } }, "");
  await tap(host.page, "#create-btn");
  await host.page.waitForTimeout(22000);
  const line = await relayLineOf(host.page);
  console.log("    " + line.split(" | ").join("\n    "));
  check("★本物の trystero が開いた待ち合わせ先を、記録に出せている",
        /いま開いている [1-9]/.test(line) && /待ち合わせ先[^:]*: ○/.test(line),
        /いま開いている 0/.test(line) ? "★数えられていない（実機の記録と同じ現象がPCでも起きる）" : "");
  await host.page.screenshot({ path: path.join(SHOTS, "4_ws_count_host.png"), fullPage: true });
  await host.ctx.close();
}

await browser.close();
server.close();
console.log(`\n決めうち: ${pinned ? "出会えた" : "★出会えない"} ／ 既定まかせ: ${dflt ? "出会えた" : "★出会えない"}`);
console.log(`写真: ${SHOTS}`);
console.log(ng === 0 ? "✔ すべて確認できた" : `✘ ${ng}件 だめだった`);
process.exit(ng === 0 ? 0 : 1);
