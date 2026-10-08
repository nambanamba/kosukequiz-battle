// 二人対戦: 「開始」を両方押したあと、最初の問題が両方の画面に出るか（2026-10-08・ユーザー「対戦ができなくなりました」「始まりません」）
// 本物の Chrome 2枚（390x844）＋まねごとの待ち合わせ先。使い方: node tools/mikaku/start_first_q_probe.mjs [commit]
//   commit を付けると、その版の index.html で試す（どの版から鳴るかを調べる用）。ONLY=S1,S3 で絞れる
// 条件:
//   S1 ふつうの「二人で始める」（両方とも何も保存されていない）
//   S2 ふつうの「二人で始める」（両方とも今日より前の保存: tiers あり tiers4 なし）
//   S3 今日やることの「二人で」（偽の plan・まねの GitHub API）
//   S4 ホストに今までの記録（定着だった問題が多い・correctDays なし）
//   S5 ゲストの保存済みの設定が古い（tiers なし・filterUnmastered/filterWeak のころ）
//   S6 S4＋S5＋今日やること
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_start_first_q"); fs.mkdirSync(SHOTS, { recursive: true });
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const REV = process.argv[2] || "";
const SRC = REV ? execSync("git show " + REV + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) : fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
// 版ちがいの組み合わせ（片方の端末が古い版を開いたまま）: HOSTREV / GUESTREV に commit
const srcCache = new Map();
function srcOf(rev) { if (!srcCache.has(rev)) srcCache.set(rev, execSync("git show " + rev + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })); return srcCache.get(rev); }
const relay = await startFakeRelay({ broadcast: true, label: "startq" });
// REAL=1 … 本物の待ち合わせ先（RELAY_URLS をそのまま）で試す
function withFakeRelay(s) { if (process.env.REAL) return s; const i0 = s.indexOf("const RELAY_URLS = ["), i1 = s.indexOf("];", i0); if (i0 < 0) throw new Error("RELAY_URLS"); return s.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + s.slice(i1); }
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const qrev = /[?&]rev=([0-9a-f]+)/.exec(req.url);
  // HOSTTR / GUESTTR … その端末が読む trystero の版をきめる（端末ごとにちがう版が手元に残っている状態を作る）
  const qtr = /[?&]tr=([0-9.]+)/.exec(req.url);
  if (rel === "index.html") { let src = qrev ? srcOf(qrev[1]) : SRC;
    if (qtr) src = /const TRYSTERO_VERSION = '/.test(src) ? src.replace(/const TRYSTERO_VERSION = '[^']*'/, "const TRYSTERO_VERSION = '" + qtr[1] + "'")
      : src.replace("'https://esm.run/trystero'", "'https://esm.run/trystero@" + qtr[1] + "'").replace("'https://cdn.jsdelivr.net/npm/trystero/+esm'", "'https://cdn.jsdelivr.net/npm/trystero@" + qtr[1] + "/+esm'");
    res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(withFakeRelay(src), "utf8")); return; }
  if (REV && (rel === "data.js" || rel === "daimon_data.js")) { try { const b = execSync("git show " + REV + ":" + rel, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }); res.writeHead(200, { "content-type": MIME[".js"] }); res.end(b); return; } catch {} }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = process.env.LIVE ? "https://nambanamba.github.io/kosukequiz-battle/index.html" : "http://127.0.0.1:" + server.address().port + "/index.html";  // LIVE=1 … 公開中の版そのもの
// まねの GitHub API（plan だけ）
const SETS = { "plan/index.json": { sets: [1] }, "plan/0001.json": { no: 1, label: "テスト", items: [
  { subj: "社会", title: "社会を3問", unit: "第6回.鎌倉時代", count: 3 }, { subj: "理科", title: "理科2枚", ids: ["r6p12", "r6p11"] } ] } };
const TOKEN = "github_pat_TESTONLY_1234567890";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version" };
const api = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const send = (st, o) => { res.writeHead(st, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify(o)); };
    const m = /^\/repos\/nambanamba\/kosuke-records\/contents\/([^?]+)/.exec(req.url); if (!m) return send(404, {});
    const p = decodeURIComponent(m[1]);
    if (req.method === "GET" && SETS[p]) return send(200, { sha: "x", content: Buffer.from(JSON.stringify(SETS[p]), "utf8").toString("base64") });
    if (req.method === "GET") return send(404, {});
    if (req.method === "PUT") return send(201, {});
    send(405, {});
  });
});
await new Promise(r => api.listen(0, "127.0.0.1", r));
const API_URL = "http://127.0.0.1:" + api.address().port;
const browser = await chromium.launch({ channel: "chrome" });

// seed: { mig, settings: "pre4"|"old", tiers, stats: "mastered", plan }
const SEED = (o) => {
  localStorage.clear();
  if (o.mig) { localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1, "tiers-from-modes": 1 })); localStorage.setItem("kq_battle_daimon_merged_v1", "1"); }
  const subj = o.subj || "社会";
  const units = [...new Set(QA_DATA.filter(d => d.subj === subj).map(d => d.u))];
  if (o.settings === "pre4") localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: subj, unitsBySubject: { [subj]: units }, units: units, count: 10, shuffle: true, tiers: o.tiers || [0, 1], reviewAllUnits: true, fairMode: false, headStartSec: 3, answerTimeSec: 8, judgeTimeSec: 10, nextTimeSec: 8, skipNextTimeSec: 8, speedLevel: 2 }));
  if (o.settings === "old") localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: subj, units: units, count: 10, shuffle: true, filterUnmastered: true, filterWeak: true, fairMode: false, headStartSec: 3, answerTimeSec: 8, judgeTimeSec: 10, nextTimeSec: 8 }));
  if (o.stats === "mastered") {
    const now = Date.now(), st = {};
    QA_DATA.forEach((d, k) => { if (d.kind === "daimon") return; if (k % 5 === 0) return; // 8割は定着だった（正解3回・box3・correctDays なし）
      st[d.id] = k % 7 === 0 ? { correct: 1, wrong: 2, box: 0, lastCorrectAt: now - 5e8, lastAnswered: now - 4e8 } : { correct: 3, wrong: 0, box: 3, nextDue: now - 1e8, lastCorrectAt: now - 9e8 + k, lastAnswered: now - 9e8 + k }; });
    if (typeof DAIMON_DATA !== "undefined") DAIMON_DATA.forEach((g, j) => g.items.forEach(it => { if (j % 3) st[it.id] = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }; }));
    localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  }
  if (o.leftover) localStorage.setItem("kq_battle_host_session_v1", JSON.stringify({ code: "1234", questionIds: QA_DATA.slice(0, 5).map(d => d.id), currentIndex: 2, scores: { host: 1, guest: 1 }, hostSkippedIds: [], inMissRetryRound: false, misses: [], recordedIdx: 1, scoredIdx: 1, savedAt: Date.now() - 3600e3 }));
  if (o.plan) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify({ token: o.token, api: o.api }));
};
const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
const state = pg => pg.evaluate(() => ({ screen: (document.querySelector(".screen.active") || {}).id, q: (document.getElementById("battle-q").textContent || "").slice(0, 30), id: document.getElementById("battle-q-id").textContent || "", banner: (document.getElementById("status-banner") || {}).textContent || "" }));

const TRV = {};   // 各端末が実際に読んだ trystero の版
async function run(name, hostSeed, guestSeed, how) {
  const mk = async (who) => {
    // TAP=1 … 指で押す（本物のタップ。上に何かかぶっていたら押せない）。VW/VH で画面の大きさ
    const ctx = await browser.newContext({ viewport: { width: +(process.env.VW || 390), height: +(process.env.VH || 844) }, hasTouch: !!process.env.TAP, isMobile: !!process.env.TAP });
    const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(who + " pageerror: " + String(e).split("\n")[0]));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errs.push(who + " console." + m.type() + ": " + m.text().slice(0, 200)); });
    page.on("dialog", d => d.accept().catch(() => {}));
    page.on("request", r => { const m = /trystero(?:-p2p\/nostr)?@([0-9.]+)/.exec(r.url()); if (m) TRV[who] = m[1]; });
    const rv = who === "host" ? process.env.HOSTREV : process.env.GUESTREV;
    const tv = who === "host" ? process.env.HOSTTR : process.env.GUESTTR;
    const qs = [rv ? "rev=" + rv : "", tv ? "tr=" + tv : ""].filter(Boolean).join("&");
    await page.goto(PAGE_URL + (qs ? "?" + qs : "")); await page.waitForTimeout(400);
    return { ctx, page, errs };
  };
  const host = await mk("host"), guest = await mk("guest");
  let ok = false, detail = "";
  try {
    await host.page.evaluate(SEED, Object.assign({ token: TOKEN, api: API_URL }, hostSeed));
    await guest.page.evaluate(SEED, guestSeed);
    await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(1500); await guest.page.waitForTimeout(800);
    if (how === "plan" || how === "plan2") {
      await waitVis(host.page, "#plan-cur .plan-battle-btn", 10000);
      if (process.env.TAP) await host.page.locator("#plan-cur .plan-battle-btn").nth(how === "plan2" ? 1 : 0).tap({ timeout: 5000 });
      else await host.page.evaluate(k => document.querySelectorAll("#plan-cur .plan-battle-btn")[k].click(), how === "plan2" ? 1 : 0);
    } else {
      if (process.env.TAP) await host.page.tap("#create-btn", { timeout: 5000 }); else await host.page.$eval("#create-btn", e => e.click());
    }
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await guest.page.$eval("#go-join", e => e.click()); await guest.page.fill("#join-code-input", code); await guest.page.$eval("#join-btn", e => e.click());
    await waitVis(host.page, "#start-together-btn", 60000);
    await waitVis(guest.page, "#join-start-together-btn", 30000);
    // ORDER=guest … ゲストが先に「開始する」を押す（間を2秒あける）
    if (process.env.TAP) { await host.page.tap("#start-together-btn", { timeout: 5000 }); await guest.page.tap("#join-start-together-btn", { timeout: 5000 }); }
    else if (process.env.ORDER === "guest") { await guest.page.$eval("#join-start-together-btn", e => e.click()); await host.page.waitForTimeout(2000); await host.page.$eval("#start-together-btn", e => e.click()); }
    else { await host.page.$eval("#start-together-btn", e => e.click()); await guest.page.$eval("#join-start-together-btn", e => e.click()); }
    const t0 = Date.now();
    const okq = pg => pg.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active") && document.getElementById("battle-q").textContent.trim().length > 0, null, { timeout: 15000 }).then(() => true).catch(() => false);
    // ホストは先に問題を見る（考える時間）。ゲストは「わかった」のあとに出る（今までどおり）
    const h = await okq(host.page);
    let g = false, j = false;
    if (h) {
      await waitVis(host.page, "#advance-btn", 15000).then(() => process.env.TAP ? host.page.tap("#advance-btn", { timeout: 5000 }) : host.page.$eval("#advance-btn", e => e.click())).catch(e => console.log("     わかった が押せない: " + String(e.message).slice(0, 160)));
      g = await okq(guest.page);
      // ゲストが答えを見て〇 → ホストの答えが開く
      if (g) j = await waitVis(guest.page, "#answer-reveal-btn", 15000).then(async () => { await guest.page.$eval("#answer-reveal-btn", e => e.click()); await waitVis(guest.page, "#judge-ok", 15000); await guest.page.$eval("#judge-ok", e => e.click());
        return host.page.waitForFunction(() => document.getElementById("battle-a-block").classList.contains("show"), null, { timeout: 15000 }).then(() => true); }).catch(() => false);
    }
    const hs = await state(host.page), gs = await state(guest.page);
    ok = h && g && j; detail = "host1問目=" + h + " guest1問目=" + g + " 判定で開く=" + j + " host=" + JSON.stringify(hs) + " guest=" + JSON.stringify(gs) + " " + (Date.now() - t0) + "ms";
    if (!ok) { await host.page.screenshot({ path: path.join(SHOTS, name + "_host.png") }).catch(() => {}); await guest.page.screenshot({ path: path.join(SHOTS, name + "_guest.png") }).catch(() => {}); }
  } catch (e) { detail = "途中で止まった: " + String(e && e.message || e).split("\n")[0]; await host.page.screenshot({ path: path.join(SHOTS, name + "_ERR_host.png") }).catch(() => {}); await guest.page.screenshot({ path: path.join(SHOTS, name + "_ERR_guest.png") }).catch(() => {}); }
  const errs = host.errs.concat(guest.errs).filter(x => !/favicon|404 \(Not Found\)/.test(x));
  console.log((ok ? "  ✔ " : "  ✘ ") + name + " … trystero host=" + TRV.host + " guest=" + TRV.guest + " … " + detail);
  if (errs.length) console.log("     エラー " + errs.length + " 件:\n       " + errs.slice(0, 12).join("\n       "));
  await host.ctx.close(); await guest.ctx.close();
  return ok && !errs.some(x => /pageerror/.test(x));
}
console.log("■ 版: " + (REV || "作業中の index.html") + (process.env.HOSTREV ? " ホスト=" + process.env.HOSTREV : "") + (process.env.GUESTREV ? " ゲスト=" + process.env.GUESTREV : "") + (process.env.HOSTTR ? " ホストのtrystero=" + process.env.HOSTTR : "") + (process.env.GUESTTR ? " ゲストのtrystero=" + process.env.GUESTTR : ""));
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const S = [
  ["S1 ふつう・何も保存なし", {}, {}, "normal"],
  ["S2 ふつう・今日より前の保存（tiers・tiers4 なし）", { mig: true, settings: "pre4" }, { mig: true, settings: "pre4" }, "normal"],
  ["S3 今日やることの二人で", { mig: true, settings: "pre4", plan: true }, { mig: true, settings: "pre4" }, "plan"],
  ["S3b 今日やることの二人で（理科の大問の行）", { mig: true, settings: "pre4", plan: true }, { mig: true, settings: "pre4" }, "plan2"],
  ["S7 ふつう・理科（大問まじり）", { mig: true, settings: "pre4", subj: "理科", stats: "mastered" }, { mig: true, settings: "pre4", subj: "理科" }, "normal"],
  ["S8 ホストに前回の対戦が残っている", { mig: true, settings: "pre4", leftover: true, stats: "mastered" }, { mig: true, settings: "pre4" }, "normal"],
  ["S8b 前回の対戦が残っている＋今日やること", { mig: true, settings: "pre4", leftover: true, plan: true }, { mig: true, settings: "pre4" }, "plan"],
  ["S4 ホストに今までの記録（定着が多い・correctDays なし）", { mig: true, settings: "pre4", stats: "mastered" }, { mig: true, settings: "pre4" }, "normal"],
  ["S4b ホスト記録あり・定着だけ選択（tiers [2]）", { mig: true, settings: "pre4", tiers: [2], stats: "mastered" }, { mig: true, settings: "pre4" }, "normal"],
  ["S5 ゲストの設定が古い（filterUnmastered のころ）", { mig: true, settings: "pre4" }, { settings: "old" }, "normal"],
  ["S6 記録あり＋ゲスト古い＋今日やること", { mig: true, settings: "pre4", stats: "mastered", plan: true }, { settings: "old", stats: "mastered" }, "plan"],
];
let ng = 0;
for (const [n, h, g, how] of S) {
  if (only && !only.some(k => n.split(" ")[0] === k)) continue;
  const r = await run(n.split(" ")[0], h, g, how);
  if (!r) ng++;
  console.log("     ↑ " + n);
}
console.log(ng ? "\n✘ " + ng + " 件で始まらない（またはエラー）" : "\n✔ 全部始まった");
await browser.close(); server.close(); relay.close(); api.close(); process.exit(ng ? 1 : 0);
