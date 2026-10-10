// こどもどうし対戦（公平モード）で、おたがいに〇✕を付けて最後まで進めるか（2026-10-10・kids-mode-fix）
//   ユーザー「こどもどうし対戦モード（公平モード）も、正誤が入れられなくなってます」（#39 で親子の流れにしたため）
//   公平モードは #39 の前（ce0ce6f）の流れ: 両方が答え、おたがいに〇✕。⚡は出さない。ゲストの設定ではなくホストの公平モードで決まる
// 本物の Chrome 2枚＋まねごとの待ち合わせ先。使い方: node tools/mikaku/kids_mode_probe.mjs
//   K1 ホストも相手に〇✕を付けられる ／ K2 両方に点 ／ K3 ⚡は出さない・点の箱は2つ ／ K4 最後まで進み両方の点 ／ K5 記録は両方の端末に
// 自己テスト: #39 を入れた master（620b898）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_kids_mode"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "620b898";   // ★#39 を入れた master（公平モードで〇✕が付けられなくなった版）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "kidsmode" });
let SERVED = CURRENT;
function withFakeRelay(src) {
  const i0 = src.indexOf("const RELAY_URLS = ["), i1 = src.indexOf("];", i0);
  if (i0 < 0 || i1 < 0) throw new Error("RELAY_URLS が見つかりません");
  return src.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + src.slice(i1);
}
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(withFakeRelay(SERVED), "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });

// 短い一問一答だけが先頭に count 問ならぶ社会の単元をえらび、そこだけを出す（ふつうの時間＝基本×1 になる）
const SEED = (o) => {
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1, "tiers-from-modes": 1 }));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_merge_all_v1", "1");   // 答えが2つのカードを分けない
  const simple = d => d.subj === "社会" && d.kind !== "calc" && d.kind !== "daimon" && !d.img && String(d.q).length <= 60 && !/[「（(]/.test(d.q)
    && !/[①-⑳…・、,]/.test(String(d.a)) && d.priority !== "低";
  const byU = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.kind !== "calc") (byU[d.u] = byU[d.u] || []).push(d); });
  const u = Object.keys(byU).find(k => byU[k].length >= o.count && byU[k].slice(0, o.count).every(simple));
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: o.count, shuffle: false, fairMode: !!o.fair,
    headStartSec: o.base, answerTimeSec: 3, judgeTimeSec: 30, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (o.pre) localStorage.setItem("kq_battle_speed_points_v1", JSON.stringify({ days: o.pre }));
  if (o.off) localStorage.setItem("kq_battle_speed_points_off_v1", "1");
  return { u, ids: byU[u].slice(0, o.count).map(d => d.id) };
};
const dayKey = (t) => { const d = new Date(t), p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
const TODAY = dayKey(Date.now()), YDAY = dayKey(Date.now() - 864e5);


async function mk() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e).split("\n")[0])); page.on("dialog", d => d.accept().catch(() => {}));
  await page.goto(PAGE_URL); await page.waitForTimeout(400);
  return { ctx, page, errs };
}
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 15000 });
const txt = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: true }).catch(() => {});
const today = pg => pg.evaluate(k => { try { return ((JSON.parse(localStorage.getItem("kq_battle_speed_points_v1") || "{}").days) || {})[k] || 0; } catch (e) { return -1; } }, TODAY);
const rec = pg => pg.evaluate(() => { const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"); let c = 0, w = 0; Object.values(st).forEach(v => { c += v.correct || 0; w += v.wrong || 0; }); return { c, w }; });
async function run(label, src) {
  SERVED = src; const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const host = await mk(), guest = await mk();
  try {
    await host.page.evaluate(SEED, { count: 3, base: 3, fair: true });
    await guest.page.evaluate(SEED, { count: 3, base: 3, fair: false });   // ★ゲストの設定は公平モードでない（ホストの設定で決まること）
    await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(800); await guest.page.waitForTimeout(800);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await txt(host.page, "#room-code-display");
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    let prev = "";
    for (let i = 0; i < 3; i++) {
      await host.page.waitForFunction(p => { const t = document.getElementById("battle-q-id").textContent; return document.getElementById("screen-battle").classList.contains("active") && t && t !== p; }, prev, { timeout: 20000 });
      const q = await txt(host.page, "#battle-q-id"); prev = q;
      await guest.page.waitForFunction(q => document.getElementById("battle-q-id").textContent === q, q, { timeout: 8000 });
      // ゲスト（子ども）: 答えを見て、ホストを〇
      if (await vis(guest.page, "#answer-reveal-btn")) await tap(guest.page, "#answer-reveal-btn");
      await waitVis(guest.page, "#judge-ok");
      if (i === 0) {
        const k0 = { hostSp: await vis(host.page, "#battle-sp-now"), guestBoxes: await guest.page.evaluate(() => Array.from(document.querySelectorAll("#screen-battle .score-row .score-box")).filter(e => getComputedStyle(e).display !== "none").length) };
        check("K3 公平モードでは⚡を出さない・点の箱は2つ（あなた・相手）", !k0.hostSp && k0.guestBoxes === 2, JSON.stringify(k0));
        await shot(host.page, label + "_K_host_q1"); await shot(guest.page, label + "_K_guest_q1");
      }
      await tap(guest.page, "#judge-ok");
      // ホスト（子ども）: 答えが開いて、相手を判定するボタンが出る
      const hj = await waitVis(host.page, "#judge-ok", 8000).then(() => true).catch(() => false);
      if (i === 0) check("K1 ホストも相手（ゲスト）に〇✕を付けられる（判定ボタンが出る）", hj, "");
      if (!hj) throw new Error("ホストの判定ボタンが出ない " + q);
      await tap(host.page, "#judge-ok");
      await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 10000 });
      if (i === 0) {
        const s1 = { h: await txt(host.page, "#score-me"), ho: await txt(host.page, "#score-opp"), g: await txt(guest.page, "#score-me"), go: await txt(guest.page, "#score-opp") };
        check("K2 おたがいの〇で両方に1点（ホスト 1-1・ゲスト 1-1）", s1.h === "1" && s1.ho === "1" && s1.g === "1" && s1.go === "1", JSON.stringify(s1));
      }
      await tap(host.page, "#next-btn");
    }
    await host.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 15000 });
    await guest.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 15000 });
    const fin = { hs: await txt(host.page, "#result-score"), hsub: await txt(host.page, "#result-sub"), gs: await txt(guest.page, "#result-score"), gsub: await txt(guest.page, "#result-sub"),
      hrec: await rec(host.page), grec: await rec(guest.page), hsp: await today(host.page), hsum: await vis(host.page, "#battle-sp-summary") };
    check("K4 最後まで進み、終わりの画面は両方の点（あなた：3問正解／相手：3問正解）", fin.hs === "あなた：3問正解" && fin.hsub === "相手：3問正解" && fin.gs === "あなた：3問正解" && fin.gsub === "相手：3問正解", JSON.stringify(fin));
    check("K5 記録は両方の端末に3問〇（こどもどうし＝おたがいに判定）", fin.hrec.c === 3 && fin.grec.c === 3 && fin.hrec.w === 0 && fin.grec.w === 0, JSON.stringify(fin));
    check("K3 ⚡は数えない・終わりの画面にも出ない", fin.hsp === 0 && !fin.hsum, JSON.stringify(fin));
    await shot(host.page, label + "_K_result_host");
    check("画面のエラー 0", host.errs.length + guest.errs.length === 0, host.errs.concat(guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); await shot(host.page, label + "_ERR_host"); await shot(guest.page, label + "_ERR_guest"); }
  finally { await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
