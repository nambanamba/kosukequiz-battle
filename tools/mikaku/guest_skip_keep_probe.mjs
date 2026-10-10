// 子どもがスキップしたとき、親（ゲスト）の画面から問題を消さない（2026-10-10・ユーザー）
//   ユーザー「子供がスキップした時、親の画面から問題を消さないでほしいです。説明と化してもいいですし」
// 本物の Chrome 2枚（390x844）＋まねごとの待ち合わせ先。一問一答（社会）と大問の小問（理科）の両方
// 使い方: node tools/mikaku/guest_skip_keep_probe.mjs
//   K1 子どもがスキップ → 親の画面の問題・答えは残る（問題文が同じ・答えが開いたまま・問題の枠が見える）
//   K2 親の画面に「スキップしました」が出る・〇✕の帯は消える（✕で記録されるので押さなくてよい）
//   K3 子どもの画面は今までどおり（答えが開き「つぎの問題へ」が出る）・記録はホストに✕が1回
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_guest_skip_keep"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "606b72e";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "guestskipkeep" });
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
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
// 社会: 図の無い単元の先頭2問。理科: 小問3〜6の大問1つだけが答える状態
const SEED = (arg) => {
  const [mig, kind] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  const times = { headStartSec: 1, answerTimeSec: 4, judgeTimeSec: 1, nextTimeSec: 600, skipNextTimeSec: 600 };
  if (kind === "qa") {
    const u = QA_DATA.find(q => q.subj === "社会" && q.kind !== "calc" && !q.img).u;
    localStorage.setItem("kq_battle_settings_v1", JSON.stringify(Object.assign({ subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: 2, shuffle: false, filterUnmastered: false, filterWeak: false, fairMode: false }, times)));
    return { ids: null };
  }
  const now = Date.now();
  const g = DAIMON_DATA.find(g => !g.paper && g.items.length >= 3 && g.items.length <= 6);
  const units = [...new Set(QA_DATA.filter(d => d.subj === "理科").map(d => d.u))];
  const known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 };
  const st = {};
  QA_DATA.forEach(d => { if (d.subj === "理科" && d.kind !== "daimon") st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => { if (h !== g) h.items.forEach(it => { st[it.id] = Object.assign({}, known); }); });
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify(Object.assign({ subject: "理科", unitsBySubject: { "理科": units }, units: units, count: g.items.length, shuffle: false, tiers: [0], filterUnmastered: false, filterWeak: false, fairMode: false, reviewAllUnits: true }, times)));
  return { ids: g.items.map(i => i.id) };
};

async function run(label, src, kind) {
  SERVED = src; const out = [];
  const tag = kind === "qa" ? "一問一答" : "小問";
  const check = (n, ok, x) => out.push({ n: tag + " " + n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
    await page.goto(PAGE_URL); await page.waitForTimeout(500);
    return { ctx, page, errs };
  };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const aOpen = pg => pg.evaluate(() => document.getElementById("battle-a-block").classList.contains("show"));
  const badge = pg => pg.evaluate(() => { const e = document.getElementById("host-seen-badge"); return e && getComputedStyle(e).display !== "none" ? e.textContent : ""; });
  const qid = pg => pg.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
  const statOf = (pg, id) => pg.evaluate(i => (JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"))[i] || null, id);
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + kind + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const host = await mk(), guest = await mk();
  try {
    await host.page.evaluate(SEED, [MIG, kind]);
    await guest.page.evaluate(SEED, [MIG, kind]);
    await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(800); await guest.page.waitForTimeout(800);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    // ===== 1問目: 両方に問題が出ている。子どもがスキップを押す =====
    await waitVis(host.page, "#skip-btn", 30000);
    await waitVis(guest.page, "#judge-row", 20000);
    const id1 = await qid(host.page);
    const h0 = await statOf(host.page, id1);
    const q0 = await guest.page.$eval("#battle-q", e => e.textContent);
    await guest.page.waitForTimeout(400);
    await shot(guest.page, "K0_before");
    await tap(host.page, "#skip-btn");
    await host.page.waitForFunction(() => { const b = document.getElementById("skip-continue-btn"); return b && getComputedStyle(b).display !== "none"; }, null, { timeout: 15000 });
    await guest.page.waitForFunction(() => /スキップ/.test((document.getElementById("guest-wait-status") || {}).textContent || ""), null, { timeout: 15000 });
    await guest.page.waitForTimeout(500);
    const k = { q: await guest.page.$eval("#battle-q", e => e.textContent), qVis: await vis(guest.page, "#battle-view"), aOpen: await aOpen(guest.page),
      aText: await guest.page.$eval("#battle-a", e => e.textContent), judge: await vis(guest.page, "#judge-row"),
      banner: await guest.page.$eval("#guest-wait-status", e => e.textContent), bannerVis: await vis(guest.page, "#guest-wait-status") };
    await shot(guest.page, "K1_guest_after_skip"); await shot(host.page, "K3_host_after_skip");
    check("K1 子どもがスキップしても、親の画面の問題は消えない（問題文が同じ・枠が見える）", k.qVis && k.q === q0 && k.q.length > 0, JSON.stringify({ q0: q0.slice(0, 30), q: k.q.slice(0, 30), qVis: k.qVis }));
    check("K1b 答えも開いたまま（説明に使える）", k.aOpen && k.aText.length > 0, JSON.stringify({ aOpen: k.aOpen, a: k.aText.slice(0, 20) }));
    check("K2 親の画面に「スキップしました」が出る・〇✕の帯は消える", k.bannerVis && /スキップしました/.test(k.banner) && !k.judge, JSON.stringify({ banner: k.banner, judge: k.judge }));
    const hs = { aOpen: await aOpen(host.page), cont: await vis(host.page, "#skip-continue-btn") };
    const h1 = await statOf(host.page, id1);
    check("K3 子どもの画面は今までどおり（答えが開く・つぎの問題へ）" + (kind === "daimon" ? "・小問の記録はホストに✕1回（一問一答の✕は、あとで出し直したときに付く＝今までどおり）" : ""), hs.aOpen && hs.cont && (kind !== "daimon" || ((h1 && h1.wrong) || 0) - ((h0 && h0.wrong) || 0) === 1), JSON.stringify({ hs, w0: h0 && h0.wrong, w1: h1 && h1.wrong }));
    check("E 画面のエラー 0", host.errs.length === 0 && guest.errs.length === 0, host.errs.concat(guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split(String.fromCharCode(10))[0]); }
  finally { await host.ctx.close(); await guest.ctx.close(); }
  return out;
}

function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT + "（一問一答）", await run("base", BASELINE, "qa"));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
let ng = report("いまの index.html（一問一答）", await run("now", CURRENT, "qa"));
ng += report("いまの index.html（大問の小問）", await run("now", CURRENT, "daimon"));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
