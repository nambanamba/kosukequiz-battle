// 対戦の押しまちがい対策（2026-09-16）を、Android タブレット縦 800×1280 のホストで見る。
//
// 使い方: node tools/mikaku/battle_buttons_probe.mjs
//
// - 「わかった！」「スキップ」が出た画面を撮り、スキップのボタンの大きさを測る
// - 「こたえを見る」を二人とも押して判定ボタンが出た直後に「✕ 相手はまちがい」を押しても入らないこと、
//   1.2秒たってから押すと入ることを見る（そのときの画面も撮る）
// 対戦は2台目が要るので、node が2つのブラウザ文脈を中継するスタブを使う（test_battle_resume.mjs と同じ作り）
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
const errors = [];
async function makePeer(label, viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(/trystero/, r => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  const page = await ctx.newPage();
  page.on("dialog", d => d.accept());
  page.on("pageerror", e => errors.push(label + ": " + e.message));
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
// 画面のその位置に何があるか（「わかった」を押した場所の直下に、画面が切り替わったあと何が来るかを見る）
const at = (page, x, y) => page.evaluate(([x, y]) => {
  const e = document.elementFromPoint(x, y);
  if (!e) return "（何もない）";
  const b = e.closest("button, .status-banner, .cheese-countdown, .card, .judge-row") || e;
  const name = b.id ? "#" + b.id : "." + String(b.className).split(" ")[0];
  return name + "「" + (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24) + "」";
}, [x, y]);
const centerOf = (page, sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; });
const visible = (page, sel, timeout = 10000) =>
  page.waitForFunction(s => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== "none"; }, sel, { timeout });

const host = await makePeer("host", { width: 800, height: 1280 });
const guest = await makePeer("guest", { width: 390, height: 844 });
for (const p of [host.page, guest.page]) {
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.evaluate(() => {
    const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
    localStorage.clear();
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [u] }, units: [u],
      count: 3, shuffle: false, fairMode: false, headStartSec: 20, answerTimeSec: 60, judgeTimeSec: 60, nextTimeSec: 60, skipNextTimeSec: 60 }));
  });
  await p.reload(); await p.waitForTimeout(700);
}
await tap(host.page, "#create-btn");
await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent));
const code = await host.page.$eval("#room-code-display", e => e.textContent);
await tap(guest.page, "#go-join");
await guest.page.fill("#join-code-input", code);
await tap(guest.page, "#join-btn");
await visible(host.page, "#start-together-btn");
await tap(host.page, "#start-together-btn");

// ---- 「わかった！」「スキップ」の画面 ----
await visible(host.page, "#skip-btn");
await host.page.$eval("#skip-btn", e => e.scrollIntoView({ block: "center" })); await host.page.waitForTimeout(400);
const sz = await host.page.evaluate(() => {
  const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
  return { advance: r("advance-btn"), skip: r("skip-btn"), skipFont: getComputedStyle(document.getElementById("skip-btn")).fontSize };
});
console.log(`800x1280 「わかった！」${sz.advance[0]}×${sz.advance[1]}／「スキップ」${sz.skip[0]}×${sz.skip[1]}（文字 ${sz.skipFont}）`);
await host.page.screenshot({ path: path.join(SHOTS, "after_battle_800x1280_buttons_skip.png") });

// ---- 「わかった！」→ 二人とも「こたえを見る」→ 判定ボタンが出た直後に押す ----
const [wx, wy] = await centerOf(host.page, "#advance-btn");
console.log(`対戦（ホスト）: 「わかった！」の場所 (${wx}, ${wy}) にあるもの … 押す前: ${await at(host.page, wx, wy)}`);
await tap(host.page, "#advance-btn");
await host.page.waitForTimeout(50);
console.log(`  押した直後: ${await at(host.page, wx, wy)}`);
await visible(host.page, "#answer-reveal-btn");
await host.page.waitForTimeout(250);
console.log(`  0.3秒後: ${await at(host.page, wx, wy)}`);
const [rx, ry] = await centerOf(host.page, "#answer-reveal-btn");
console.log(`  「答えを見る」の場所 (${rx}, ${ry})`);
await visible(guest.page, "#answer-reveal-btn");
await tap(guest.page, "#answer-reveal-btn");
await host.page.waitForTimeout(200);
const tReveal = Date.now();
await tap(host.page, "#answer-reveal-btn");
const hiddenRightAfter = await host.page.$eval("#judge-row", e => getComputedStyle(e).display === "none");
await visible(host.page, "#judge-row");
console.log(`  判定ボタン: 「答えを見る」を押した直後は ${hiddenRightAfter ? "まだ出ていない" : "★もう出ている"}／出るまで 約${Date.now() - tReveal}ms（0.3秒遅れて出す）`);
console.log(`  二人とも「答えを見る」を押して判定ボタンが出たとき: 「わかった！」の場所 → ${await at(host.page, wx, wy)}／「答えを見る」の場所 → ${await at(host.page, rx, ry)}`);
// 出たらすぐ押せる（反応しない時間・薄い表示は無い）
await host.page.$eval("#judge-row", e => e.scrollIntoView({ block: "center" }));
await host.page.screenshot({ path: path.join(SHOTS, "after_battle_800x1280_buttons_judge_shown.png") });
await tap(host.page, "#judge-ng");
await host.page.waitForTimeout(200);
const took = await host.page.evaluate(() => getComputedStyle(document.getElementById("judge-row")).display === "none");
console.log(`判定ボタンが出てすぐ「✕」: ${took ? "入った（判定ボタンが消えた）" : "★入らなかった"}`);
await host.page.screenshot({ path: path.join(SHOTS, "after_battle_800x1280_buttons_judge_done.png") });
console.log(`JSエラー: ${errors.length}件 ${errors.slice(0, 3).join(" / ")}`);

await host.ctx.close(); await guest.ctx.close();

// ---- ひとり練習: ボタンの名前が「〇 わかった」「✕ まちがえた」なので、こちらの流れも見る ----
{
  const solo = await makePeer("solo", { width: 800, height: 1280 });
  const p = solo.page;
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.evaluate(() => {
    const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
    localStorage.clear();
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: 3, shuffle: false }));
  });
  await p.reload(); await p.waitForTimeout(700);
  await tap(p, "#solo-start-btn");
  await visible(p, "#solo-reveal-btn");
  await tap(p, "#solo-reveal-btn");
  await visible(p, "#solo-judge-ok");
  await p.waitForTimeout(200);
  const [sx, sy] = await centerOf(p, "#solo-judge-ok");
  const [nx, ny] = await centerOf(p, "#solo-judge-ng");
  console.log(`ひとり練習: 「〇 わかった」の場所 (${sx}, ${sy})／「✕ まちがえた」の場所 (${nx}, ${ny})`);
  await p.screenshot({ path: path.join(SHOTS, "after_solo_800x1280_buttons_judge.png") });
  await tap(p, "#solo-judge-ok");
  await p.waitForTimeout(50);
  console.log(`  「〇 わかった」を押した直後、その場所にあるもの: ${await at(p, sx, sy)}`);
  await p.waitForTimeout(300);
  const second = await at(p, sx, sy);
  console.log(`  0.3秒後: ${second}`);
  // 続けてもう一度同じ場所を押したとき（指の続きの一押し）
  await p.mouse.click(sx, sy);
  await p.waitForTimeout(100);
  console.log(`  同じ場所をもう一度押したあと、その場所にあるもの: ${await at(p, sx, sy)}／「✕ まちがえた」の場所: ${await at(p, nx, ny)}`);
  await p.screenshot({ path: path.join(SHOTS, "after_solo_800x1280_buttons_after_double_tap.png") });
  await solo.ctx.close();
}
console.log(`JSエラー（ひとり練習までふくむ）: ${errors.length}件`);
await browser.close();
server.close();
