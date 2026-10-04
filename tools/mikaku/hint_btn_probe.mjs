// ヒントボタン（2026-10-04・ユーザー「ヒントボタンは欲しいです」）。本物の Chrome・390x844・まねごとの待ち合わせ先
// 使い方: node tools/mikaku/hint_btn_probe.mjs   スクショは tools/mikaku/shots_hint/（コミットしない）
// 見ること:
//   H1 一人: 図のある一問一答にヒントが出る。押すたびに1手ずつ（共通の3手）。3手で「ここまで」。図の無い問には出ない
//   H2 データに "hint"（配列）があれば、そちらを出す（data.js の写しに仮に入れて配る）
//   H3 一人: 図のある大問の小問にもヒントが出る
//   H4 答えを見たらヒントのボタンは消える（出したヒントは残る）。記録（stats）はヒントで1文字も変わらない。使った手数は別の入れ物に残る
//   H5 二人: ヒントはホストの画面だけ。ホストが押すとゲストに「ヒントを見ました（1 / 3）」
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_hint"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "43e3d97";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const DATA = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
const QA = new Function(DATA.replace(/^const /gm, "var ") + "\nreturn QA_DATA;")();
const U = "第6回.ヒトと動物の呼吸・循環";
const X = QA.find(q => q.u === U && q.img && q.kind !== "calc").id;           // 図のある一問一答
const Z = QA.filter(q => q.u === U && q.img && q.kind !== "calc")[1].id;      // 図のある一問一答（データのヒントを入れる）
const Y = QA.find(q => q.u === U && !q.img && q.kind !== "calc").id;           // 図の無い一問一答
const CUSTOM = ["（検査用）図の左上を見よう", "（検査用）矢印の向きを決めよう"];
function dataWithHint() {
  const needle = '"id": "' + Z + '",';
  if (DATA.split(needle).length !== 2) throw new Error("ヒントを入れる行が見つかりません: " + Z);
  const nl = DATA.includes("\r\n") ? "\r\n" : "\n";
  return DATA.replace(needle, needle + nl + '  "hint": ' + JSON.stringify(CUSTOM) + ",");
}
const relay = await startFakeRelay({ broadcast: true, label: "hint" });
let SERVED = CURRENT, SERVED_DATA = dataWithHint();
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
// 理科で、答えるのは X・Z・Y と大問 r6_基本問題_3 の小問だけ（ほかは全部おぼえ済み）
const SEED = (arg) => {
  const [mig, ids, gkey] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 };
  const g = DAIMON_DATA.find(g => g.key === gkey);
  const keep = new Set(ids.concat(g.items.map(i => i.id)));
  const st = {};
  QA_DATA.forEach(d => { if (d.subj === "理科" && d.kind !== "daimon" && !keep.has(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { if (!keep.has(it.id)) st[it.id] = Object.assign({}, known); }));
  const units = [...new Set(QA_DATA.filter(d => d.subj === "理科").map(d => d.u))];
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "理科", unitsBySubject: { "理科": units }, units: units, count: keep.size, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, reviewAllUnits: true, headStartSec: 1, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600 }));
  return g.items.map(i => i.id);
};

async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const hints = (pg, p) => pg.evaluate(p => [...document.querySelectorAll("#" + p + "-hint-list li")].map(e => e.textContent), p);
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    const pg = solo.page;
    const itemIds = await pg.evaluate(SEED, [MIG, [X, Z, Y], "r6_基本問題_3"]);
    await pg.reload(); await pg.waitForTimeout(900);
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(500);
    const seen = {};
    for (let k = 0; k < 3 + itemIds.length + 2; k++) {
      if (!(await vis(pg, "#solo-reveal-btn"))) break;
      const id = await pg.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, ""));
      const hv = await vis(pg, "#solo-hint-btn");
      seen[id] = hv;
      if (id === X) {
        const st0 = await pg.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
        const got = [];
        for (let t = 0; t < 4; t++) { if (await vis(pg, "#solo-hint-btn") && !(await pg.$eval("#solo-hint-btn", e => e.disabled))) await tap(pg, "#solo-hint-btn"); await pg.waitForTimeout(100); got.push((await hints(pg, "solo")).length); }
        const lis = await hints(pg, "solo"), btn = await pg.$eval("#solo-hint-btn", e => ({ t: e.textContent, d: e.disabled })).catch(() => ({}));
        check("H1 図のある一問一答 " + X + ": 押すたびに1手ずつ（" + got.join("→") + "）・共通の3手・3手で「ここまで」", JSON.stringify(got) === "[1,2,3,3]" && /名前が書いてある/.test(lis[0] || "") && btn.d && /ここまで/.test(btn.t), JSON.stringify(lis));
        await shot(pg, "H1_solo_hint3");
        const st1 = await pg.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
        const use = await pg.evaluate(i => (JSON.parse(localStorage.getItem("kq_battle_hint_use_v1") || "{}"))[i] || null, X);
        check("H4 ヒントで記録（stats）は1文字も変わらない・使った手数は別に残る（" + JSON.stringify(use) + "）", st0 === st1 && use && use.max === 3);
        await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(200);
        check("H4 答えを見たらヒントのボタンは消え、出したヒントは残る", !(await vis(pg, "#solo-hint-btn")) && (await hints(pg, "solo")).length === 3);
      } else if (id === Z) {
        await tap(pg, "#solo-hint-btn").catch(() => {}); await pg.waitForTimeout(100);
        const l1 = await hints(pg, "solo");
        await tap(pg, "#solo-hint-btn").catch(() => {}); await pg.waitForTimeout(100);
        const l2 = await hints(pg, "solo"); const d = await pg.$eval("#solo-hint-btn", e => e.disabled).catch(() => null);
        check("H2 データの hint（2手）を優先: " + JSON.stringify(l2), JSON.stringify(l1) === JSON.stringify(CUSTOM.slice(0, 1)) && JSON.stringify(l2) === JSON.stringify(CUSTOM) && d === true);
        await shot(pg, "H2_solo_custom");
        await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(150);
      } else if (itemIds.includes(id) && !seen.__shotDaimon) {
        seen.__shotDaimon = true; await tap(pg, "#solo-hint-btn").catch(() => {}); await pg.waitForTimeout(100); await shot(pg, "H3_solo_daimon");
        await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(150);
      } else { await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(150); }
      await waitVis(pg, "#solo-judge-ok", 5000); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(350);
    }
    check("H1 図の無い一問一答 " + Y + " にはヒントが出ない", seen[Y] === false, JSON.stringify(seen[Y]));
    check("H3 図のある大問の小問にもヒントが出る（" + itemIds.filter(i => seen[i]).length + "/" + itemIds.filter(i => i in seen).length + "）", itemIds.some(i => i in seen) && itemIds.filter(i => i in seen).every(i => seen[i] === true));
    // ===== H5 二人 =====
    await host.page.evaluate(SEED, [MIG, [X], "r6_基本問題_3"]); await guest.page.evaluate(SEED, [MIG, [X], "r6_基本問題_3"]);
    await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(800); await guest.page.waitForTimeout(800);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    await waitVis(host.page, "#advance-btn", 30000);
    const b1 = await host.page.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
    await tap(host.page, "#advance-btn");
    await guest.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", b1, { timeout: 20000 });
    const hHint = await vis(host.page, "#battle-hint-btn"), gHint = await vis(guest.page, "#battle-hint-btn");
    if (hHint) { await tap(host.page, "#battle-hint-btn"); await host.page.waitForTimeout(800); }
    const note = await guest.page.evaluate(() => { const e = document.getElementById("hint-guest-note"); return e && getComputedStyle(e).display !== "none" ? e.textContent : ""; });
    await shot(host.page, "H5_host"); await shot(guest.page, "H5_guest");
    check("H5 二人（" + b1 + "）: ヒントはホストだけ・押すとゲストに「ヒントを見ました（1 / 3）」", b1 === X && hHint && !gHint && /ヒントを見ました（1 \/ 3）/.test(note), JSON.stringify({ hHint, gHint, note }));
    check("画面のエラー 0", solo.errs.length + host.errs.length + guest.errs.length === 0, [].concat(solo.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("対象: 図あり " + X + "・データのヒントを入れる " + Z + "・図なし " + Y + "・大問 r6_基本問題_3");
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
