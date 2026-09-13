// タブレット・PCで画面を広げたときの見え方を測る（2026-09-13）。
//
// 使い方: node tools/mikaku/wide_layout_probe.mjs after
//         KQ_ROOT=<直す前の index.html を置いたフォルダ> node tools/mikaku/wide_layout_probe.mjs before
//
// A. 画面の並び: ホーム・問題一覧・ひとり練習を 390／768／1024／1280 で写真に撮り、
//    横にはみ出して横スクロールが出ていないかを見る
// B. 対戦の画面（お子さんが使うのはタブレット）: 年表3枚の問題を、タブレットの4つの大きさで出し、
//    ★「問題文」と「こたえを見る」ボタンが、スクロールせずに見えるかを測る。
//    隠れるときは、縦長の画像の高さを画面の何%までにすれば入るかを計算する。
//    対戦は2台目が要るので、node が2つのブラウザ文脈を中継するスタブを使う（test_battle_resume.mjs と同じ作り）。
//    ホストに「中断した対戦」を仕込み、「再開」→ゲストが入る、で目的の1問をすぐ出す
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = process.env.KQ_ROOT || REPO;
const LABEL = process.argv[2] || "after";
const SHOTS = path.join(REPO, "tools", "mikaku", "shots_wide");
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

const STUB = `
export function joinRoom(cfg, code){
  const actions = {};
  const room = {
    onPeerJoin(){}, onPeerLeave(){},
    makeAction(name){ const a = { send: d => window.__kqSend({code, name, data: d}), onMessage: null }; actions[name] = a; return a; },
    leave(){ window.__kqSend({code, leave: true}); }
  };
  window.__kqDeliver = (name, data) => { const a = actions[name]; if (a && a.onMessage) a.onMessage(data); };
  window.__kqPeerJoin = () => room.onPeerJoin();
  setTimeout(() => window.__kqSend({code, join: true}), 0);
  return room;
}`;

const browser = await chromium.launch({ channel: "chrome" });
const rooms = new Map();
async function makePeer(viewport) {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
  await ctx.route(/trystero/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  const page = await ctx.newPage();
  page.on("dialog", d => d.accept());
  await ctx.exposeBinding("__kqSend", (src, msg) => {
    const p = src.page;
    const set = rooms.get(msg.code) || new Set(); rooms.set(msg.code, set);
    if (msg.leave) { set.delete(p); return; }
    if (msg.join) { set.add(p); for (const q of set) q.evaluate(() => window.__kqPeerJoin && window.__kqPeerJoin()).catch(() => {}); return; }
    for (const q of set) if (q !== p) q.evaluate(([n, d]) => window.__kqDeliver && window.__kqDeliver(n, d), [msg.name, msg.data]).catch(() => {});
  });
  return { ctx, page };
}
const tap = (page, sel) => page.$eval(sel, e => e.click());
const settingsFor = unit => ({ subject: "社会", unitsBySubject: { "社会": [unit] }, units: [unit],
  answerTimeSec: 600, judgeTimeSec: 600, nextTimeSec: 600, headStartSec: 0, fairMode: false });

// ---------------------------------------------------------------- A. 画面の並び
console.log(`==== A. 画面の並び（${LABEL}）`);
for (const [w, h] of [[390, 844], [800, 1280], [768, 1024], [1024, 768], [1280, 800]]) {
  const { ctx, page } = await makePeer({ width: w, height: h });
  await page.goto(BASE); await page.waitForTimeout(500);
  const unit = await page.evaluate(() => QA_DATA.find(q => q.id === "g2r66").u);
  await page.evaluate(s => { localStorage.clear(); localStorage.setItem("kq_battle_settings_v1", JSON.stringify(s)); }, settingsFor(unit));
  await page.reload(); await page.waitForTimeout(700);
  const over = () => page.evaluate(() => ({ wrap: Math.round(document.querySelector(".wrap").getBoundingClientRect().width),
    hscroll: document.documentElement.scrollWidth > innerWidth + 1 }));
  const shot = async name => { const o = await over(); console.log(`  ${w}x${h} ${name}: 入れ物の幅${o.wrap}px 横スクロール${o.hscroll ? "★あり" : "なし"}`);
    await page.screenshot({ path: path.join(SHOTS, `${LABEL}_${w}x${h}_${name}.png`) }); };
  await shot("home");
  // トップ画面の並び全体（2026-09-13 並べ替え）。上から下までを1枚で撮る
  await page.screenshot({ path: path.join(SHOTS, `${LABEL}_${w}x${h}_home_full.png`), fullPage: true });
  // メイン画面の「出題タイプ・優先度・難易度」のあたり（2026-09-13 からパネルでたためる）
  const homeAnchor = (await page.$("#setup-filter-open")) ? "#setup-filter-open" : "#type-all";
  await page.$eval(homeAnchor, e => e.scrollIntoView({ block: "center" })); await page.waitForTimeout(300);
  await shot("home_filters");
  if (await page.$("#setup-filter-open")) {
    await tap(page, "#setup-filter-open"); await page.waitForTimeout(300);
    await page.$eval("#setup-filter-open", e => e.scrollIntoView({ block: "start" })); await page.waitForTimeout(300);
    await shot("home_filters_open");
    await tap(page, "#setup-filter-open"); await page.waitForTimeout(200);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await tap(page, "#list-btn"); await page.waitForTimeout(2500);
  await shot("list");
  // 単元を1つ選んだ形（2026-09-13 から、一覧は選ぶまで何も出さない）
  await page.selectOption("#list-unit-select", unit).catch(() => {});
  await page.waitForTimeout(2500);
  await shot("list_unit");
  // 一覧の年表①（g2r66「演習年表①」）の行（2026-09-13 ユーザーが写真で「左右に余白」と指摘した画面）
  try {
    await page.waitForSelector('#list-items .list-item[data-qid="g2r66"]', { timeout: 15000 });
    await page.$eval('#list-items .list-item[data-qid="g2r66"]', e => e.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(1500);
    const lm = await page.$eval('#list-items .list-item[data-qid="g2r66"] .list-img-wrap img', img => {
      const r = img.getBoundingClientRect(), w = img.closest(".list-img-wrap").getBoundingClientRect();
      return { img: [Math.round(r.width), Math.round(r.height)], wrap: Math.round(w.width) };
    });
    console.log(`  ${w}x${h} 一覧の年表① g2r66: 画像${lm.img[0]}×${lm.img[1]}／枠${lm.wrap}px`);
    await shot("list_g2r66");
  } catch (e) { console.log(`  ${w}x${h} 一覧の年表①: 行が見つからない（${String(e.message).slice(0, 60)}）`); }
  // 絞りこみのパネルを開いた形も撮る（はじめは閉じている）
  if (await page.$("#list-filter-open")) {
    await tap(page, "#list-filter-open"); await page.waitForTimeout(300);
    await shot("list_open");
    await tap(page, "#list-filter-open"); await page.waitForTimeout(200);
  }
  await page.evaluate(() => { localStorage.setItem("kq_battle_solo_session_v1", JSON.stringify({ v: 2, quizIds: ["g2r66"], quizPos: 0, quizResults: [] })); });
  await page.reload(); await page.waitForTimeout(700);
  await tap(page, "#resume-solo-btn"); await page.waitForTimeout(1200);
  await shot("solo");
  await ctx.close();
}

// ---------------------------------------------------------------- B. 対戦の画面（タブレット）
console.log(`==== B. 対戦の画面（${LABEL}）: 問題文と「こたえを見る」がスクロールせずに見えるか`);
const TARGETS = ["g2r66", "g3r67", "g1r57"];
let n = 0;
// ★先頭2つがユーザーの端末（Android タブレット・Chrome）でよくある大きさ。向きはまだ分からない
// ONLY_A=1 のときは、対戦の画面（時間がかかる）を飛ばす
// B_SMALL=1 のときは、スマホとユーザーのタブレット（縦）の2つだけ
for (const [w, h] of (process.env.ONLY_A ? [] : process.env.B_SMALL ? [[800, 1280], [390, 844]]
    : [[800, 1280], [390, 844], [1280, 800], [768, 1024], [820, 1180], [1024, 768], [1180, 820]])) {
  for (const id of TARGETS) {
    const code = String(5000 + (n++));
    const host = await makePeer({ width: w, height: h }), guest = await makePeer({ width: 390, height: 844 });
    await host.page.goto(BASE); await guest.page.goto(BASE);
    const unit = await host.page.evaluate(id => QA_DATA.find(q => q.id === id).u, id);
    await host.page.evaluate(([s, id, code]) => {
      localStorage.clear();
      localStorage.setItem("kq_battle_settings_v1", JSON.stringify(s));
      localStorage.setItem("kq_battle_host_session_v1", JSON.stringify({ code, questionIds: [id], currentIndex: 0,
        scores: { host: 0, guest: 0 }, hostSkippedIds: [], inMissRetryRound: false, misses: [], recordedIdx: -1, scoredIdx: -1 }));
    }, [settingsFor(unit), id, code]);
    await guest.page.evaluate(s => { localStorage.clear(); localStorage.setItem("kq_battle_settings_v1", JSON.stringify(s)); }, settingsFor(unit));
    await host.page.reload(); await guest.page.reload();
    await host.page.waitForTimeout(700); await guest.page.waitForTimeout(700);
    await tap(host.page, "#resume-battle-btn");
    await host.page.waitForTimeout(800);
    await tap(guest.page, "#go-join");
    await guest.page.fill("#join-code-input", code);
    await tap(guest.page, "#join-btn");
    try {
      await host.page.waitForFunction(() => { const b = document.getElementById("answer-reveal-btn"); const i = document.getElementById("battle-img");
        return b && getComputedStyle(b).display !== "none" && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
    } catch { console.log(`  ${w}x${h} ${id}: ★対戦の画面が出なかった`); await host.ctx.close(); await guest.ctx.close(); continue; }
    await host.page.evaluate(() => scrollTo(0, 0));
    await host.page.waitForTimeout(500);
    const m = await host.page.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect();
      const img = r("battle-img"), q = r("battle-q"), b = r("answer-reveal-btn"), vh = innerHeight;
      const hide = Math.max(b.bottom, q.bottom) - vh;          // 下に隠れている量（正なら隠れている）
      const fitH = img.height - Math.max(0, hide + 8);           // 8px の余裕を見て、入るための画像の高さ
      return { vh, img: [Math.round(img.width), Math.round(img.height)], imgTop: Math.round(img.top),
        qBottom: Math.round(q.bottom), btnBottom: Math.round(b.bottom), qOk: q.bottom <= vh, btnOk: b.bottom <= vh,
        fitH: Math.round(fitH), fitPct: +(fitH / vh * 100).toFixed(1), file: document.getElementById("battle-img").getAttribute("src") };
    });
    console.log(`  ${w}x${h} ${id} ${m.file}: 画像${m.img[0]}×${m.img[1]}（上端${m.imgTop}）  問題文の下端${m.qBottom}${m.qOk ? "○" : "✕隠れる"}  ボタンの下端${m.btnBottom}${m.btnOk ? "○" : "✕隠れる"}／画面${m.vh}` +
      (m.qOk && m.btnOk ? "" : `  → 入れるには画像の高さを${m.fitH}px（画面の${m.fitPct}%）まで`));
    await host.page.screenshot({ path: path.join(SHOTS, `${LABEL}_battle_${w}x${h}_${id}.png`) });
    await host.ctx.close(); await guest.ctx.close();
  }
}
await browser.close();
server.close();
