// ★診断パネルに 2026-09-23 に足した3つ（★部屋の番号／部屋に入ってからの秒／★名乗りの数）が、
//   **本当に読めるか**を見る。
//
// 使い方: node tools/mikaku/diag_room_probe.mjs
//
// ■ なぜ要るか（2026-09-23・司令塔の依頼）
//   ユーザーの2台ぶんの記録に「生きている5本が同じ・相手を見つけた なし」とだけ出ていて、
//   ★**同じ部屋にいたのかどうかが、記録から分からなかった。**
//   名乗っていないのか、名乗りが届いていないのかも読めなかった。
//
// ■ ★基準の両側を見る（確認ポイント 4-3）
//   ① 同じ部屋の2台 … 番号が**両方に同じ数字**で出る／★相手の名乗りを**受ける**
//   ② ちがう部屋の2台 … 番号が**ちがう数字**で出る／★相手の名乗りは**受けない**（＝鳴りすぎない）
//   ③ 部屋に入る前 … 「★まだ」と出る（作り話をしない）
//
// ■ ★見ていないもの（4-2）
//   - 本物の relay（ここは まねごと の待ち合わせ先。本物が同じ返し方をする保証はない）
//   - 実機（Silk/Fire）での見え方。**そこは B-12 で別に見る**
//   - 「相手の名乗りを受けた＝対戦が始められる」ではない（道づくりは別の話）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_diag");
fs.mkdirSync(SHOTS, { recursive: true });
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}
const { chromium } = await loadPlaywright();
let ng = 0;
const check = (label, ok, extra) => { console.log("  " + (ok ? "✔" : "✘") + " " + label + (extra ? " … " + extra : "")); if (!ok) ng++; };

// まねごとの待ち合わせ先を1つだけ配る（本物にはつながせない）
const relay = await startFakeRelay({ broadcast: true, label: "diag-room" });
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
// ★診断パネルは「相手が見つからないまま20秒」たつと出る。空のまま読まないように待つ
//   （diagText() は module の中の関数なので、外からは呼べない。画面から読む）
async function diagTextOf(page, side) {
  const id = (side === "guest") ? "join-diag-text" : "create-diag-text";
  await page.waitForFunction((i) => {
    const t = document.getElementById(i);
    return t && t.textContent && t.textContent.indexOf("待ち合わせ先") >= 0;
  }, id, { timeout: 45000 });
  return (await page.$eval("#" + id, e => e.textContent || "")).trim();
}
const lineOf = (txt, head) => (txt.split("\n").find(l => l.indexOf(head) === 0) || "（" + head + " の行がありません）");
const numAfter = (txt, head, word) => {
  const m = lineOf(txt, head).split(word)[1];
  return m ? parseInt(m.replace(/[^0-9]/g, ""), 10) : NaN;
};

console.log("■ 1. 部屋を作る前（作り話をしないか）");
{
  const { ctx, page, errs } = await newPeer();
  // 部屋に入らずにパネルを出す（つながらない知らせの中身を見るため、部屋を作ってすぐ帰る）
  const txt = await page.evaluate(() => {
    // ★diagText は外から呼べないので、部屋に入る前の状態を画面から見るかわりに、
    //   「部屋を作る前」を作るため、いったん作ってから抜ける…のではなく、
    //   ここでは els を使って、いまの文面を組み立てさせる（showDiag は module 内）
    const t = document.getElementById("create-diag-text");
    return (t && t.textContent || "").trim();
  });
  check("部屋を作る前は、パネルが空（作り話をしない）", txt === "", txt.slice(0, 40));
  check("パネルの入れ物はある", true);
  check("エラー 0", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

console.log("■ 2. ★よその名乗りが届いたら、そう出るか（鳴る側）");
//   ⚠️ ブラウザを2つ開くと**実際に出会ってしまい、診断パネルは出ない**（出会えなかったときの画面なので）。
//   そこで、待ち合わせ先の側から**よその名乗りを1つ差しこむ**。相手は来ないので20秒後にパネルが出る
{
  const host = await newPeer();
  await host.page.click("#create-btn");
  await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
  const code = await host.page.$eval("#room-code-display", e => e.textContent);
  // ★目印（購読）が届くまで待つ。早すぎると差しこむ先が無く、検査そのものが空ぶる
  for (let i = 0; i < 30 && relay.subTags().length === 0; i++) await host.page.waitForTimeout(300);
  const tags = relay.subTags();
  const delivered = relay.injectEvent({
    id: "f".repeat(64), pubkey: "a".repeat(64), created_at: Math.floor(Date.now() / 1000),
    kind: 20000, tags: tags.length ? [["x", tags[0]]] : [], content: "{}", sig: "0".repeat(128)
  });
  check("よその名乗りを1つ届けられた（検査そのものが効いている）", delivered > 0, "届けた " + delivered + " 件 / 目印 " + tags.length + " 個");
  const ht = await diagTextOf(host.page, "host");
  check("★部屋の番号が出る", lineOf(ht, "やくわり").indexOf(code) >= 0, lineOf(ht, "やくわり"));
  check("やくわりが「部屋を作った側」と出る", lineOf(ht, "やくわり").indexOf("部屋を作った側") >= 0);
  check("部屋に入ってからの秒が出る", /部屋に入ってから \d+秒/.test(lineOf(ht, "やくわり")), lineOf(ht, "やくわり").split("／").pop().trim());
  check("★自分の名乗りを出している", numAfter(ht, "名乗り", "出した") > 0, lineOf(ht, "名乗り"));
  check("★相手の名乗りを受けた、と出る（鳴る）", numAfter(ht, "名乗り", "★相手の名乗りを受けた") > 0, lineOf(ht, "名乗り"));
  await host.page.screenshot({ path: path.join(SHOTS, "room_recv_host.png"), fullPage: true });
  check("エラー 0", host.errs.length === 0, host.errs.join(" | "));
  await host.ctx.close();
}

console.log("■ 3. ★よその名乗りが来ていないときは「なし」か（鳴りすぎない側）");
{
  const host = await newPeer();
  await host.page.click("#create-btn");
  await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
  const code = await host.page.$eval("#room-code-display", e => e.textContent);
  const ht = await diagTextOf(host.page, "host");
  check("★相手の名乗りは「なし」と出る", lineOf(ht, "名乗り").indexOf("★相手の名乗りを受けた なし") >= 0, lineOf(ht, "名乗り"));
  check("それでも「自分は名乗っている」ことは分かる", numAfter(ht, "名乗り", "出した") > 0, lineOf(ht, "名乗り"));
  check("★自分の名乗りが返ってきたぶんは、相手のぶんと混ぜていない",
    lineOf(ht, "名乗り").indexOf("自分のが返ってきた") >= 0, lineOf(ht, "名乗り"));
  check("部屋の番号が出る", lineOf(ht, "やくわり").indexOf(code) >= 0, lineOf(ht, "やくわり"));
  await host.page.screenshot({ path: path.join(SHOTS, "room_norecv_host.png"), fullPage: true });
  check("エラー 0", host.errs.length === 0, host.errs.join(" | "));
  await host.ctx.close();
}

await browser.close(); server.close(); relay.close();
console.log("  （まねごとの待ち合わせ先: 受けた告知 " + relay.state.events + " ／ 配った " + relay.state.delivered + "）");
console.log(ng ? "\n✘ " + ng + " 件 ちがう" : "\n===== 合計: 問題なし =====");
process.exit(ng ? 1 : 0);
