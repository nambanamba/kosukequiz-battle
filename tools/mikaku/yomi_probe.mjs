// 答えの読みがな "yomi"（2026-10-13・依頼書 司令塔\回答\社会_語呂と読みがなを暗記カードに_依頼_2026-10-13.md）。本物の Chrome・390x844・まねごとの待ち合わせ先
// 使い方: node tools/mikaku/yomi_probe.mjs   スクショは tools/mikaku/shots_yomi/（コミットしない）
// data.js の写しの X（g7r34）に yomi を仮に入れて配る（data.js そのものは変えない）
// 見ること:
//   Y1 一人: 答えを開く前は読みが見えない。開いたら答えの下に「よみ：問屋（といや）　土倉（どそう）」。yomi の無い Y には何も出ない
//   Y2 二人: 読みは答えが見えている画面だけ（ホストは開く前は見えない・ゲスト＝親は答えといっしょに見える）。スキップで答えを見せたら、ホストに読みが出る
//   Y3 問題一覧: X の行に読み・Y の行には無い
//   Y4 記録（stats）に読みは入らない
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_yomi"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "3a5a817";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const DATA = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
const QA = new Function(DATA.replace(/^const /gm, "var ") + "\nreturn QA_DATA;")();
const X = "g7r34", YOMI = "問屋＝といや　土倉＝どそう", WANT = "よみ：問屋（といや）　土倉（どそう）";
const UX = QA.find(d => d.id === X).u;
const Y = QA.find(q => q.u === UX && q.id !== X && !q.img && !q.yomi && !/^\s*[①-⑳]/.test(q.a || "")).id;
function dataWithYomi() {
  const needle = '"id": "' + X + '",';
  if (DATA.split(needle).length !== 2) throw new Error("読みを入れる行が見つかりません: " + X);
  const nl = DATA.includes("\r\n") ? "\r\n" : "\n";
  return DATA.replace(needle, needle + nl + '  "yomi": ' + JSON.stringify(YOMI) + ",");
}
const relay = await startFakeRelay({ broadcast: true, label: "yomi" });
let SERVED = CURRENT; const SERVED_DATA = dataWithYomi();
function withFakeRelay(s) { const i0 = s.indexOf("const RELAY_URLS = ["), i1 = s.indexOf("];", i0); return s.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + s.slice(i1); }
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(withFakeRelay(SERVED), "utf8")); return; }
  if (rel === "data.js") { res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-store" }); res.end(Buffer.from(SERVED_DATA, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
// 社会で、答えるのは ids だけ（ほかは全部おぼえ済み）
const SEED = (arg) => {
  const [mig, ids] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 };
  const keep = new Set(ids);
  const st = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.kind !== "daimon" && !keep.has(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { st[it.id] = Object.assign({}, known); }));
  const units = [...new Set(QA_DATA.filter(d => d.subj === "社会").map(d => d.u))];
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": units }, units: units, count: keep.size, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, reviewAllUnits: true, headStartSec: 1, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600 }));
};

async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const visText = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== "none" && e.offsetParent !== null ? e.textContent : ""; }, sel);
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    // ===== Y1 一人 =====
    const pg = solo.page;
    await pg.evaluate(SEED, [MIG, [X, Y]]);
    await pg.reload(); await pg.waitForTimeout(900);
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(500);
    const seen = {};
    for (let k = 0; k < 4; k++) {
      if (!(await vis(pg, "#solo-reveal-btn"))) break;
      const id = await pg.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, ""));
      const before = await visText(pg, "#solo-yomi");
      await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(200);
      const after = await visText(pg, "#solo-yomi");
      seen[id] = { before, after };
      if (id === X) await shot(pg, "Y1_solo_X");
      await waitVis(pg, "#solo-judge-ok", 5000); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(350);
    }
    check("Y1 一人 " + X + ": 開く前は読みが見えない", seen[X] && seen[X].before === "", JSON.stringify(seen[X]));
    check("Y1 一人 " + X + ": 開いたら「" + WANT + "」", seen[X] && seen[X].after === WANT, JSON.stringify(seen[X]));
    check("Y1 一人 " + Y + "（yomi なし）: 何も出ない", seen[Y] && seen[Y].before === "" && seen[Y].after === "", JSON.stringify(seen[Y]));
    // ===== Y4 記録 =====
    const st = await pg.evaluate(i => (JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"))[i] || null, X);
    check("Y4 記録に読みは入らない", st && !JSON.stringify(st).includes("といや"), JSON.stringify(st));
    // ===== Y3 問題一覧 =====
    await pg.reload(); await pg.waitForTimeout(900);
    await tap(pg, "#list-btn"); await pg.waitForTimeout(600);
    await pg.evaluate(u => { const s = document.getElementById("list-unit-select"); [...s.options].forEach(o => o.selected = o.value === u || o.textContent.trim() === u); s.dispatchEvent(new Event("change", { bubbles: true })); }, UX);
    await pg.waitForTimeout(1500);
    const rows = await pg.evaluate(([x, y]) => {
      const pick = id => { const r = [...document.querySelectorAll(".list-item")].find(e => e.textContent.includes("No." + id) || e.dataset.id === id || e.dataset.qid === id); return r ? ((r.querySelector(".yomi-text") || {}).textContent || "") : null; };
      return { x: pick(x), y: pick(y), n: document.querySelectorAll(".list-item").length };
    }, [X, Y]);
    await shot(pg, "Y3_list");
    check("Y3 問題一覧: " + X + " に読み・" + Y + " には無い", rows.x === WANT && rows.y === "", JSON.stringify(rows));
    // ===== Y2 二人 =====
    await host.page.evaluate(SEED, [MIG, [X]]); await guest.page.evaluate(SEED, [MIG, [X]]);
    await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(800); await guest.page.waitForTimeout(800);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    await waitVis(host.page, "#skip-btn", 30000);
    const b1 = await host.page.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
    await guest.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", b1, { timeout: 20000 });
    // ★ゲスト（親の端末）は答えがはじめから見えている。読みは「答えが見えているときだけ」見えればよい
    const hb = await visText(host.page, "#battle-yomi"), gb = await visText(guest.page, "#battle-yomi");
    const ha0 = await vis(host.page, "#battle-a"), ga0 = await vis(guest.page, "#battle-a");
    await tap(host.page, "#skip-btn"); await host.page.waitForTimeout(600);
    const ha = await visText(host.page, "#battle-yomi");
    await shot(host.page, "Y2_host_skip");
    check("Y2 二人（" + b1 + "）: 読みは答えが見えている画面だけ（ホスト 答え" + ha0 + "・ゲスト 答え" + ga0 + "）", b1 === X && !ha0 && hb === "" && (ga0 ? gb === WANT : gb === ""), JSON.stringify({ b1, hb, gb }));
    check("Y2 二人: スキップで答えを見せたらホストに「" + WANT + "」", ha === WANT, JSON.stringify(ha));
    check("画面のエラー 0", solo.errs.length + host.errs.length + guest.errs.length === 0, [].concat(solo.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("対象: 読みあり " + X + "・読みなし " + Y);
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
