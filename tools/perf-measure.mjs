// 実機（低スペックAndroid）を想定して、重い処理の所要時間を測る。
//
// なぜCPUを絞るか: お子さんが使っているのは廉価帯のAndroid。PCでの数字は
// 判断材料にならない。CDP の Emulation.setCPUThrottlingRate で減速して測る。
//
// なぜページ内で測るか: playwright の click は「押せる状態か」の判定や
// 押したあとの安定待ちを含むので、JavaScript がどれだけ時間を食っているかを
// 見るには向かない（実際、一覧を開くところで待ちきれずに落ちた）。
// ページの中で performance.now() をはさんで、処理そのものの時間を測る。
//
// 目安（低スペック端末で）:
//   ボタンを押してからの反応 …… 100ms 以内（超えると「反応が悪い」と感じる）
//   一覧を開く／絞りこみ    …… 500ms 以内
//   起動〜操作できるまで    …… 3秒以内
//
// 使い方:
//   node tools/perf-measure.mjs        # 1倍・4倍・6倍
//   node tools/perf-measure.mjs 6      # 6倍だけ
//
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadPlaywright(){
  try { return await import("playwright"); } catch {}
  try {
    const { execSync } = await import("node:child_process");
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
  } catch {}
  return null;
}
const pw = await loadPlaywright();
if (!pw) { console.error("playwright が見つかりません。`npm i -g playwright` を実行してください。"); process.exit(2); }

const MIME = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".jpg":"image/jpeg", ".png":"image/png"};
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

const rates = process.argv[2] ? [Number(process.argv[2])] : [1, 4, 6];
const browser = await pw.chromium.launch();
const results = [];

for (const rate of rates) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });

  const t0 = Date.now();
  await page.goto(BASE + "index.html", { waitUntil: "load" });
  await page.waitForSelector("#unit-choices .choice", { timeout: 120000 });
  const boot = Date.now() - t0;

  // index.html の中身は module なので、外から関数を直接呼べない。
  // 実際にボタンを押して、押してから画面が描き変わるまでを測る（体感に近い）
  const m = await page.evaluate(async () => {
    const out = {};
    const paint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const tap = async (name, el) => {
      if (!el) { out[name] = null; return; }
      const s = performance.now();
      el.click();
      await paint();
      out[name] = Math.round(performance.now() - s);
    };
    const $ = id => document.getElementById(id);
    const n = () => document.querySelectorAll(".list-item").length;

    out["問題数"] = QA_DATA.length;
    const dj = performance.getEntriesByType("resource").find(r => r.name.endsWith("data.js"));
    out["data.js の取得"] = dj ? Math.round(dj.duration) : null;

    // ホーム画面のボタン
    await tap("科目を切りかえる", $("subject-science"));
    await tap("科目をもどす", $("subject-social"));

    // 一覧を開く（全件）
    await tap("★一覧を開く(全件)", $("list-btn"));
    out["そのときのDOM件数"] = n();

    // 絞りこみを変える（優先度=高）
    await tap("★絞りこみ(優先度=高)", document.querySelector('#list-priority-row .toggle[data-list-priority="高"]'));
    out["そのときのDOM件数2"] = n();
    await tap("絞りこみをもどす", document.querySelector('#list-priority-row .toggle[data-list-priority="all"]'));

    // 単元を1つだけにする（件数が効いているかを見る）
    const sel = $("list-unit-select");
    const opt = [...sel.options].find(o => o.value !== "ALL");
    if (opt) {
      sel.value = opt.value;
      const s = performance.now();
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      await paint();
      out["★単元1つだけ"] = Math.round(performance.now() - s);
      out["そのときのDOM件数3"] = n();
      sel.value = "ALL"; sel.dispatchEvent(new Event("change", { bubbles: true }));
      await paint();
    }

    await tap("一覧を閉じる", $("list-back"));

    // ひとり練習
    await tap("「一人で始める」を押す", $("solo-start-btn"));
    if ($("solo-reveal-btn") && $("solo-reveal-btn").style.display !== "none") {
      await tap("「こたえを見る」を押す", $("solo-reveal-btn"));
    }
    await tap("「〇わかった」を押す", $("solo-judge-ok"));
    return out;
  });

  const row = Object.assign({ rate, "起動〜単元が出るまで": boot }, m);
  results.push(row);
  // 1条件ずつ、終わった時点で出す（rate=6 は時間がかかるので途中経過が見えるように）
  console.log(`\n--- rate=${rate} ---`);
  for (const [k, v] of Object.entries(row)) if (k !== "rate") console.log(`  ${k}: ${v}`);
  await ctx.close();
}
await browser.close();
server.close();

const keys = [...new Set(results.flatMap(r => Object.keys(r)))].filter(k => k !== "rate");
const wide = s => [...s].reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0);
const w = Math.max(...keys.map(wide), 4);
const pad = s => s + " ".repeat(Math.max(0, w - wide(s)));
console.log("\n低スペックAndroidを想定した所要時間（ミリ秒）");
console.log("rate=1 はこのPCそのまま。rate=6 が廉価Androidの目安\n");
console.log(pad("項目") + results.map(r => ("rate=" + r.rate).padStart(10)).join(""));
for (const k of keys) console.log(pad(k) + results.map(r => String(r[k] ?? "-").padStart(10)).join(""));

const target = { "科目を切りかえる":100, "「一人で始める」を押す":100, "「こたえを見る」を押す":100, "「〇わかった」を押す":100,
  "★一覧を開く(全件)":500, "★絞りこみ(優先度=高)":500, "★単元1つだけ":500,
  "起動〜単元が出るまで":3000 };
const slow = results.find(r => r.rate === 6) || results[results.length-1];
console.log(`\n目安を超えたもの（rate=${slow.rate}）:`);
let any = false;
for (const [k, limit] of Object.entries(target)) {
  if (slow[k] != null && slow[k] > limit) { console.log(`  ★ ${k}: ${slow[k]}ms（目安 ${limit}ms）`); any = true; }
}
if (!any) console.log("  なし");
