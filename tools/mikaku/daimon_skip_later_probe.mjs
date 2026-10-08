// 大問の小問のスキップを「あとでもう一度」に（2026-10-05・ユーザー「あとで出しましょう」）。二人・本物の Chrome・まねごとの待ち合わせ先
// 使い方: node tools/mikaku/daimon_skip_later_probe.mjs   スクショは tools/mikaku/shots_daimon_skip/（コミットしない）
// 見ること:
//   K1 ホストが小問(1)をスキップ → 答えが出て、ホストの記録は✕（1回目）
//   K2 次は(2)。ホスト・ゲストとも「前の小問」の欄で(1)は「あとでもう一度出ます」だけ（答えは出さない）
//   K3 (1)は大問の残りの小問のあとにもう一度出る（ゲストも同じ並び）
//   K4 出し直しで答えても、ホストの記録は増えない（✕1のまま）。ゲストは出し直しで初めて答えるので、ふつうに記録が付く
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_daimon_skip"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "68bf34b";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "dskip" });
let SERVED = CURRENT;
function withFakeRelay(s) { const i0 = s.indexOf("const RELAY_URLS = ["), i1 = s.indexOf("];", i0); return s.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + s.slice(i1); }
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
const SEED = (mig) => {
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }, st = {};
  const g = DAIMON_DATA.find(g => g.key === "r6_基本問題_4");
  const units = [...new Set(QA_DATA.filter(d => d.subj === "理科").map(d => d.u))];
  QA_DATA.forEach(d => { if (d.subj === "理科" && d.kind !== "daimon") st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => { if (h !== g) h.items.forEach(it => { st[it.id] = Object.assign({}, known); }); });
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "理科", unitsBySubject: { "理科": units }, units, count: g.items.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, reviewAllUnits: true, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600 }));
  return { ids: g.items.map(i => i.id), a0: g.items[0].a };
};
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const shown = pg => pg.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
  const statOf = (pg, id) => pg.evaluate(i => (JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"))[i] || null, id);
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const host = await mk(), guest = await mk();
  try {
    const S = await host.page.evaluate(SEED, MIG); await guest.page.evaluate(SEED, MIG);
    await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(800); await guest.page.waitForTimeout(800);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    await waitVis(host.page, "#skip-btn", 30000);
    const d1 = await shown(host.page);
    await tap(host.page, "#skip-btn"); await host.page.waitForTimeout(500);
    const k1 = { st: await statOf(host.page, d1), a: await host.page.evaluate(() => document.getElementById("battle-a-block").classList.contains("show")) };
    check("K1 ホストが小問 " + d1 + " をスキップ → 答えが出て、ホストの記録は✕", d1 === S.ids[0] && k1.a && k1.st && k1.st.wrong === 1 && (k1.st.correct || 0) === 0, JSON.stringify(k1));
    await tap(host.page, "#skip-continue-btn").catch(() => {}); await host.page.waitForTimeout(500);
    const seqH = [d1], seqG = [];
    for (let k = 0; k < S.ids.length + 2; k++) {
      const ok = await waitVis(host.page, "#advance-btn", 15000).then(() => true, () => false);
      if (!ok) break;
      const id = await shown(host.page); seqH.push(id);
      await tap(host.page, "#advance-btn");
      await guest.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 });
      seqG.push(id);
      if (k === 0) {
        const look = pg => pg.evaluate(a => { const b = document.getElementById("battle-daimon"); return { later: !!b.querySelector(".daimon-later"), leak: a.length >= 2 && [...b.querySelectorAll(".daimon-fold")].some(e => !e.classList.contains("daimon-later") && e.textContent.includes(a)) }; }, S.a0);
        const lh = await look(host.page), lg = await look(guest.page);
        check("K2 次は " + S.ids[1] + "・前の小問の欄で(1)は「あとでもう一度出ます」だけ（ホスト・ゲスト）", id === S.ids[1] && lh.later && lg.later && !lh.leak && !lg.leak, JSON.stringify({ lh, lg }));
        await shot(host.page, "K2_host"); await shot(guest.page, "K2_guest");
      }
      // ★2026-10-08 二人のときのホストの答えはゲストの〇✕で開く（ホストの「こたえを見る」は無い）
      await tap(guest.page, "#answer-reveal-btn");
      await waitVis(guest.page, "#judge-row", 15000); await tap(guest.page, "#judge-ok");
      await waitVis(host.page, "#judge-row", 15000); await tap(host.page, "#judge-ok");
      await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
      await tap(host.page, "#next-btn"); await host.page.waitForTimeout(400);
      if (await host.page.evaluate(() => document.getElementById("screen-result").classList.contains("active"))) break;
    }
    const want = S.ids.concat([S.ids[0]]);
    check("K3 (1)は大問の残りの小問のあとにもう一度（" + seqH.join(" ") + "）・ゲストも同じ", JSON.stringify(seqH) === JSON.stringify(want) && JSON.stringify(seqG) === JSON.stringify(want.slice(1)), seqG.join(" "));
    const h2 = await statOf(host.page, d1), g2 = await statOf(guest.page, d1);
    check("K4 出し直しで答えてもホストの記録は✕1のまま・ゲストはふつうに〇1", h2 && h2.wrong === 1 && (h2.correct || 0) === 0 && g2 && g2.correct === 1, JSON.stringify({ h2, g2 }));
    check("画面のエラー 0", host.errs.length + guest.errs.length === 0, host.errs.concat(guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
