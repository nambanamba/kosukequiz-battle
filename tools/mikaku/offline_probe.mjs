// ネットなし（機内）で使えるか（2026-10-21 ユーザー「ペルー旅行の機内で、こうすけが暗記カードで勉強できるように」）。
// 本物の Chrome・390x844。sw.js を本当に動かす（localStorage kq_battle_sw_test=1 のときだけ 127.0.0.1 でも動く）。
// 使い方: node tools/mikaku/offline_probe.mjs
// 見ること:
//   O1 ネットありで1回開くと、本体と機内用の図が全部保存される（「✅ ネットなしで使えます」）
//   O2 ネットを切って（Playwright の offline ＋ ★配る側のサーバも止める）開き直しても、画面が出る・「ネットにつながっていません」が出る
//   O3 二人の対戦のボタンを押しても始まらない（待ち画面に行かない）・知らせが出る・画面のエラーなし
//   O4 機内用の「20問ではじめる」→ 20問を最後まで解ける・出た図は全部表示される（naturalWidth>0）
//   O5 記録（kq_battle_stats_v1）が残る・開き直しても残る・送信の待ち行列にたまる（ネットなしで PUT は0）
//   O6 ネットが戻ると、たまっていた記録が送られる（まねの GitHub API に session が届く・待ち行列が空になる）
//   O7 版が変わると入れ物が入れかわる（古い入れ物は消える）・中身が同じ図はダウンロードし直さない・変わった図だけ取り直す
//   E  画面のエラー 0
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webmanifest": "application/manifest+json" };
let siteDown = false, swOverride = null;
const reqLog = [];
const server = http.createServer((req, res) => {
  if (siteDown) { req.socket.destroy(); return; }
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  reqLog.push(rel);
  if (rel === "sw.js" && swOverride) { res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-store" }); res.end(swOverride); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
// ---- まねの GitHub API ----
const TOKEN = "github_pat_TESTONLY_1234567890";
let apiDown = false; const files = new Map(), apiLog = [];
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version" };
const api = http.createServer((req, res) => {
  if (apiDown) { req.socket.destroy(); return; }
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const m = /^\/repos\/nambanamba\/kosuke-records\/contents\/([^?]+)/.exec(req.url);
    const send = (st, o) => { res.writeHead(st, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify(o)); };
    if (!m) return send(404, { message: "Not Found" });
    const p = decodeURIComponent(m[1]);
    apiLog.push({ method: req.method, path: p });
    if (req.headers.authorization !== "Bearer " + TOKEN) return send(401, {});
    if (req.method === "GET") { const f = files.get(p); return f ? send(200, { sha: f.sha, path: p }) : send(404, {}); }
    if (req.method === "PUT") { const j = JSON.parse(b), f = files.get(p); const sha = "s" + Math.random().toString(16).slice(2); files.set(p, { sha }); return send(f ? 200 : 201, { content: { path: p, sha } }); }
    send(405, {});
  });
});
await new Promise(r => api.listen(0, "127.0.0.1", r));
const API_URL = "http://127.0.0.1:" + api.address().port;

const results = []; let fails = 0;
const check = (name, ok, info) => { results.push((ok ? "✅ " : "❌ ") + name + (info ? "  … " + info : "")); if (!ok) fails++; };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
await ctx.addInitScript(([tok, apiUrl]) => {
  try {
    localStorage.setItem("kq_battle_sw_test", "1");
    if (!localStorage.getItem("kq_battle_send_gh_v1")) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify({ token: tok, api: apiUrl }));
  } catch (e) {}
}, [TOKEN, API_URL]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("dialog", d => d.dismiss());
const swStatus = () => page.evaluate(() => new Promise(res => {
  const c = navigator.serviceWorker.controller; if (!c) return res(null);
  const ch = new MessageChannel(); ch.port1.onmessage = e => res(e.data); c.postMessage({ type: "status" }, [ch.port2]);
  setTimeout(() => res(null), 8000);
}));
const statsCount = () => page.evaluate(() => { try { return Object.keys(JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}")).length; } catch (e) { return -1; } });
const outboxCount = () => page.evaluate(() => new Promise(res => {
  const r = indexedDB.open("kq_battle_outbox", 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("q")) r.result.createObjectStore("q", { keyPath: "id" }); };
  r.onsuccess = () => { const t = r.result.transaction("q", "readonly").objectStore("q").getAll(); t.onsuccess = () => { res(t.result.map(x => x.kind)); r.result.close(); }; t.onerror = () => res(null); };
  r.onerror = () => res(null);
}));
const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await page.waitForTimeout(300); } return null; };

// ---- O1 ネットありで開く ----
await page.goto(PAGE_URL);
await page.evaluate(() => navigator.serviceWorker.ready);
let st = await waitFor(async () => { const s = await swStatus(); return s && s.shell === s.shellTotal && s.kinai === s.kinaiTotal ? s : null; }, 60000);
check("O1 ネットありで開くと本体と機内用の図が保存される", !!st, st ? "本体 " + st.shell + "/" + st.shellTotal + "・機内用の図 " + st.kinai + "/" + st.kinaiTotal + "・版 " + st.version : JSON.stringify(await swStatus()));
await page.click("#kinai-open");
const saveText = await waitFor(async () => { const t = await page.textContent("#kinai-save"); return /ネットなしで使えます/.test(t) ? t : null; }, 10000);
check("O1b 機内用の欄に「✅ ネットなしで使えます」", !!saveText, saveText || await page.textContent("#kinai-save"));
await page.waitForTimeout(2500);   // 起動時の snapshot 送信などを先に済ませる
const putsBefore = apiLog.filter(x => x.method === "PUT").length;

// ---- O2 ネットを切って開き直す ----
siteDown = true; apiDown = true; await ctx.setOffline(true);
await page.reload();
await page.waitForSelector("#kinai-start-btn", { state: "attached", timeout: 15000 });
const offNote = await page.isVisible("#offline-note");
check("O2 ネットなしで開き直しても画面が出る・「ネットにつながっていません」が出る", offNote, "offline-note=" + offNote);
const unitsTxt = await page.$$eval("#kinai-units .choice .name", els => els.map(e => e.textContent));
check("O2b 機内用の単元に第6〜8回の社会・理科とおまけ.ペルー", unitsTxt.some(t => /社会 第6回/.test(t)) && unitsTxt.some(t => /理科 第8回/.test(t)) && unitsTxt.some(t => /おまけ.ペルー/.test(t)) && !unitsTxt.some(t => /第[1-5]回\./.test(t)), unitsTxt.join(" / "));

// ---- O3 対戦は始まらない ----
await page.click("#create-btn");
await page.waitForTimeout(500);
const waiting = await page.isVisible("#home-waiting");
const toast = await page.isVisible("#kinai-toast").catch(() => false);
check("O3 ネットなしで「二人で始める」を押しても待ち画面に行かない・知らせが出る", !waiting && toast, "waiting=" + waiting + " toast=" + toast);
await page.click("#go-join");
await page.waitForTimeout(300);
const joinActive = await page.evaluate(() => document.getElementById("screen-join").classList.contains("active"));
check("O3b 「部屋に入る」も開かない", !joinActive);

// ---- O4 20問を解く ----
const statsBefore = await statsCount();
await page.click("#kinai-start-btn");
await page.waitForSelector("#screen-solo.active", { timeout: 5000 });
const counter0 = await page.textContent("#solo-counter");
let answered = 0, imgsSeen = 0, imgsBroken = [], guard = 0;
while (guard++ < 200) {
  if (await page.evaluate(() => document.getElementById("screen-solo-result").classList.contains("active"))) break;
  const qid = (await page.textContent("#solo-q-id")).trim();
  const imgVis = await page.isVisible("#solo-img");
  if (imgVis) {
    await page.waitForFunction(() => { const i = document.getElementById("solo-img"); return i.complete; }, null, { timeout: 5000 }).catch(() => {});
    const ok = await page.evaluate(() => document.getElementById("solo-img").naturalWidth > 0);
    imgsSeen++; if (!ok) imgsBroken.push(qid + ":" + await page.getAttribute("#solo-img", "src"));
  }
  const figs = await page.$$eval("#solo-daimon-fig img", els => els.map(e => ({ src: e.getAttribute("src"), ok: e.complete && e.naturalWidth > 0, complete: e.complete })));
  for (const f of figs) { imgsSeen++; if (f.complete && !f.ok) imgsBroken.push(qid + ":" + f.src); }
  if (await page.isVisible("#solo-reveal-btn")) { await page.click("#solo-reveal-btn"); }
  else if (await page.isVisible("#solo-timeup-next-btn")) { await page.click("#solo-timeup-next-btn"); continue; }
  else if (await page.isVisible("#solo-skip-next-btn")) { await page.click("#solo-skip-next-btn"); continue; }
  await page.waitForSelector("#solo-judge-ok", { state: "visible", timeout: 5000 });
  await page.click(answered % 5 === 4 ? "#solo-judge-ng" : "#solo-judge-ok");
  answered++;
  await page.waitForTimeout(80);
}
const resultOn = await page.evaluate(() => document.getElementById("screen-solo-result").classList.contains("active"));
check("O4 機内用の20問を最後まで解ける", resultOn && /\/\s*20$/.test(counter0.trim()), "最初の表示 " + counter0.trim() + "・答えた回数 " + answered + "・結果 " + (resultOn ? await page.textContent("#solo-result-score") : "出ない"));
check("O4b 出た図はネットなしでも全部表示される", imgsSeen > 0 && imgsBroken.length === 0, "図 " + imgsSeen + "枚・出ない " + imgsBroken.length + (imgsBroken.length ? " " + imgsBroken.slice(0, 5).join(" ") : ""));
check("O4c おわりに「つぎの20問」が出る", await page.isVisible("#kinai-next-btn"));

// ---- O5 記録 ----
const statsAfter = await statsCount();
const ob = await outboxCount();
const putsOffline = apiLog.filter(x => x.method === "PUT").length - putsBefore;
check("O5 記録が残る（ネットなし）", statsAfter > statsBefore, "記録のある問題 " + statsBefore + " → " + statsAfter);
check("O5b 送信の待ち行列にたまる・ネットなしで送らない", Array.isArray(ob) && ob.includes("session") && putsOffline === 0, "待ち行列 " + JSON.stringify(ob) + "・PUT " + putsOffline);
await page.reload();
await page.waitForSelector("#kinai-start-btn", { state: "attached", timeout: 15000 });
const statsReload = await statsCount();
check("O5c ネットなしで開き直しても記録が残る", statsReload === statsAfter, String(statsReload));

// ---- O6 ネットが戻る ----
siteDown = false; apiDown = false; await ctx.setOffline(false);
const sent = await waitFor(async () => { const o = await outboxCount(); return Array.isArray(o) && o.length === 0 && apiLog.some(x => x.method === "PUT" && /^battle\/session\//.test(x.path)) ? true : null; }, 20000);
check("O6 ネットが戻ると、たまっていた記録が送られる", !!sent, "PUT " + apiLog.filter(x => x.method === "PUT").map(x => x.path).join(", ") + "・待ち行列 " + JSON.stringify(await outboxCount()));

// ---- O7 版の入れかわり ----
const sw0 = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const m = /const KINAI_IMAGES = (\[.*\]);/.exec(sw0); const kinaiList = JSON.parse(m[1]);
const changed = kinaiList[0];
swOverride = sw0.replace(/const VERSION = "[^"]*";/, 'const VERSION = "probe2";')
  .replace(new RegExp('"' + changed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '":"[0-9a-f]+"'), '"' + changed + '":"ffffffffff"');
reqLog.length = 0;
await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
const swapped = await waitFor(async () => { const k = await page.evaluate(() => caches.keys()); return k.includes("kq-img-probe2") && k.includes("kq-shell-probe2") && k.filter(n => /^kq-/.test(n)).length === 2 ? k : null; }, 30000);
const imgReqs = reqLog.filter(r => r.startsWith("images/"));
check("O7 版が変わると入れ物が入れかわる（古い入れ物は消える）", !!swapped, JSON.stringify(swapped || await page.evaluate(() => caches.keys())));
check("O7b 中身が同じ図は取り直さない・変わった図だけ取り直す", imgReqs.length === 1 && imgReqs[0] === "images/" + changed, "取り直した図 " + imgReqs.length + "枚 " + imgReqs.slice(0, 5).join(" "));
st = await swStatus();
check("O7c 入れかわったあとも機内用の図は全部ある", st && st.version === "probe2" && st.kinai === st.kinaiTotal, JSON.stringify(st));

// ---- O8 ほかの図も全部保存 ----
swOverride = null;
await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
await waitFor(async () => { const s = await swStatus(); return s && s.version !== "probe2" ? s : null; }, 30000);
await page.reload();
await page.waitForSelector("#kinai-cache-all-btn", { state: "visible", timeout: 15000 });
await page.click("#kinai-cache-all-btn");
const allSt = await waitFor(async () => { const s = await swStatus(); return s && s.all === s.allTotal ? s : null; }, 120000);
check("O8 「ほかの単元の図も全部保存」で図が全部入る", !!allSt, JSON.stringify(allSt || await swStatus()));

check("E 画面のエラー 0", errors.length === 0, errors.slice(0, 5).join(" | "));
console.log(results.join("\n"));
console.log(fails ? "★ " + fails + " 件だめ" : "全部OK");
await browser.close(); server.close(); api.close();
process.exit(fails ? 1 : 0);
