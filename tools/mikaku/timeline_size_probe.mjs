// 年表の画像が、端末の幅いっぱいに出ているかを測る（2026-09-13 ユーザー依頼「横に隙間はいらない」）。
//
// 使い方: node tools/mikaku/timeline_size_probe.mjs before   （直す前）
//         node tools/mikaku/timeline_size_probe.mjs after    （直したあと）
//
// 本物の Chrome で、ひとり練習の画面に年表の問題を1問ずつ出して測る。
// ★対戦の画面も同じ .img-wrap の CSS を使うので、ひとり練習で代わりに測る（対戦は2台目が要るため）。
// 出すもの（幅 390／768／1280 ごと）:
//   画像の表示サイズ・左右の隙間・画面の下にはみ出すか・赤丸の位置（画像に対する％）・画面写真
//   ＋ 画像ファイルそのものの左右の余白（白い部分の幅。①アプリの枠のせいか ②画像のせいかを分ける）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// 直す前の版を測るときは、KQ_ROOT に「コミットずみの index.html を置いたフォルダ」を渡す
// （写真はいつもリポジトリの shots_timeline に置く）
const ROOT = process.env.KQ_ROOT || REPO;
const LABEL = process.argv[2] || "before";
const SHOTS = path.join(REPO, "tools", "mikaku", "shots_timeline");
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

// 年表3枚の代表＋比べるための横長の地図（年表以外の見え方が変わらないかを見る）
const TARGETS = ["g1r57", "g2r66", "g3r67", "g1r83"];
const VIEWPORTS = [[390, 844], [768, 1024], [1280, 800]];

const browser = await chromium.launch({ channel: "chrome" });
const bboxDone = new Set();
for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route(/trystero/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: "export function joinRoom(){}" }));
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.goto(BASE); await page.waitForTimeout(600);
  for (const id of TARGETS) {
    // ★ひとり練習の「中断した続き」を仕込んで、再開ボタンでその1問を出す（順に解いて探さずに済む）
    await page.evaluate(id => {
      const q = QA_DATA.find(d => d.id === id);
      localStorage.clear();
      localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [q.u] }, units: [q.u] }));
      localStorage.setItem("kq_battle_solo_session_v1", JSON.stringify({ v: 2, quizIds: [id], quizPos: 0, quizResults: [] }));
    }, id);
    await page.reload(); await page.waitForTimeout(600);
    await page.$eval("#resume-solo-btn", e => e.click());
    await page.waitForFunction(() => { const i = document.getElementById("solo-img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const img = document.getElementById("solo-img"), wrap = document.getElementById("solo-img-wrap");
      const wr = wrap.getBoundingClientRect();
      // ★object-fit:contain なので、<img> の箱は枠いっぱいでも、絵はその中に縮めて描かれる。
      //   箱の大きさを測っても隙間は0と出る（はじめそう測って外した）。★実際に絵が描かれた四角を計算する
      const cs = getComputedStyle(img);
      const bl = parseFloat(cs.borderLeftWidth), bt = parseFloat(cs.borderTopWidth);
      const box = img.getBoundingClientRect();
      const ew = img.clientWidth, eh = img.clientHeight;             // 枠線を除いた中身の大きさ
      const s = Math.min(ew / img.naturalWidth, eh / img.naturalHeight);
      const cw = img.naturalWidth * s, ch = img.naturalHeight * s;
      const ir = { left: box.left + bl + (ew - cw) / 2, top: box.top + bt + (eh - ch) / 2, width: cw, height: ch };
      ir.right = ir.left + cw; ir.bottom = ir.top + ch;
      const marks = [...document.querySelectorAll("#solo-marks .mark")].map(k => {
        const r = k.getBoundingClientRect();
        return [+((r.left - ir.left) / ir.width * 100).toFixed(1), +((r.top - ir.top) / ir.height * 100).toFixed(1), +(r.width / ir.width * 100).toFixed(1)];
      });
      return { qid: document.getElementById("solo-q-id").textContent, file: img.getAttribute("src"),
        wrapW: Math.round(wr.width), box: [Math.round(box.width), Math.round(box.height)], img: [Math.round(cw), Math.round(ch)],
        gapL: Math.round(ir.left - wr.left), gapR: Math.round(wr.right - ir.right),
        blankTopBottom: Math.round((eh - ch) / 2),
        imgBottomOver: Math.round(ir.bottom - innerHeight), marks };
    });
    console.log(`[${LABEL}] ${w}x${h} ${m.qid} ${m.file}  枠${m.wrapW}px  箱${m.box[0]}×${m.box[1]}  絵${m.img[0]}×${m.img[1]}  隙間 左${m.gapL}/右${m.gapR}・上下${m.blankTopBottom}  絵の下端の画面はみ出し${m.imgBottomOver}px  赤丸${m.marks.length}個 ${JSON.stringify(m.marks.slice(0, 3))}`);
    await page.screenshot({ path: path.join(SHOTS, `${LABEL}_${w}_${id}.png`), fullPage: false });

    // 画像ファイルそのものの左右の白い余白（1回だけ）
    if (!bboxDone.has(m.file)) {
      bboxDone.add(m.file);
      const bb = await page.evaluate(() => {
        const img = document.getElementById("solo-img");
        const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        const inked = col => { for (let y = 0; y < c.height; y += 2) { const p = (y * c.width + col) * 4; if (d[p] < 225 || d[p+1] < 225 || d[p+2] < 225) return true; } return false; };
        let L = 0; while (L < c.width && !inked(L)) L++;
        let R = c.width - 1; while (R > 0 && !inked(R)) R--;
        return { size: [c.width, c.height], blankLeft: L, blankRight: c.width - 1 - R };
      });
      console.log(`    画像ファイル ${m.file}: ${bb.size[0]}×${bb.size[1]}  左の白${bb.blankLeft}px（${(bb.blankLeft / bb.size[0] * 100).toFixed(1)}%）／右の白${bb.blankRight}px（${(bb.blankRight / bb.size[0] * 100).toFixed(1)}%）`);
    }
  }
  if (errs.length) console.log("  JSエラー:", errs);
  await ctx.close();
}
await browser.close();
server.close();
