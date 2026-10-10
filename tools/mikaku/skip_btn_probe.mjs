// スキップボタンを大きく・となりのボタンからはなす（2026-10-06 ユーザー「スキップボタンが小さくて、押し間違えが多発してる
//   そうです。ぼたんをはなして、スキップボタンを大きくしてください」）
// 本物の Chrome・まねごとの待ち合わせ先。スマホ 390x844 と 子どものタブレット 800x1280 の両方で見る。
// 使い方: node tools/mikaku/skip_btn_probe.mjs   スクショは tools/mikaku/shots_skipbtn/（コミットしない）
// 見ること（画面ごと: 一人の一問一答・一人の大問の小問・二人のホスト）:
//   ・スキップの高さが「こたえを見る」以上・60px 以上、幅は「こたえを見る」と同じくらい
//   ・スキップと、いっしょに出ているほかのボタン（こたえを見る・わかった！・ヒント・〇✕）との間が 40px 以上
//   ・押すとこれまでどおりスキップになる（一人: 答えが開いて✕で記録／二人: スキップの知らせ）
// 2026-10-10 追記: 二人のホストには「わかった！」「こたえを見る」が出なくなったので、待つ相手を #skip-btn に変えた（となりはヒントだけ）
// 自己テスト: 直す前（BASE_COMMIT）で鳴る（間が 14px しかない）
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_skipbtn"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "db96466";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "skipbtn" });
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
const U = "第6回.鎌倉時代";
// ids だけ答える（ほかの社会 第6回の一問一答と大問の小問は全部おぼえ済み）
const SEED = (arg) => {
  const [mig, ids, o] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }, st = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.kind !== "daimon" && !ids.includes(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { if (!ids.includes(it.id)) st[it.id] = Object.assign({}, known); }));
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [o.unit] }, units: [o.unit], count: o.count || ids.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
};
const DAIMON_IDS = ["g6d110", "g6d111", "g6d112", "g6d113", "g6d114"];   // 練習2
const VIEWS = [{ n: "phone390", w: 390, h: 844 }, { n: "tablet800", w: 800, h: 1280 }];
// 見えているボタンの位置。skip と、ほかの見えているボタンとの縦の間（重なっていれば負）
const MEASURE = (arg) => {
  const [skipSel, others] = arg;
  const vis = e => !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null);
  const sk = document.querySelector(skipSel);
  if (!vis(sk)) return { skip: null };
  const r = sk.getBoundingClientRect();
  const res = { skip: { h: Math.round(r.height), w: Math.round(r.width) }, gaps: {}, sizes: {} };
  others.forEach(sel => {
    const e = document.querySelector(sel); if (!vis(e)) return;
    const o = e.getBoundingClientRect();
    res.sizes[sel] = { h: Math.round(o.height), w: Math.round(o.width) };
    res.gaps[sel] = Math.round(o.top >= r.bottom ? o.top - r.bottom : (r.top >= o.bottom ? r.top - o.bottom : -1));
  });
  return res;
};
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const errs = [];
  for (const V of VIEWS) {
    const mk = async () => { const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h } }); const page = await ctx.newPage();
      page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page }; };
    const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + V.n + "_" + n + ".png"), fullPage: true }).catch(() => {});
    const judge = (name, m, refSel) => {
      if (!m || !m.skip) { check(V.n + " " + name + ": スキップが出ている", false, JSON.stringify(m)); return; }
      const ref = m.sizes[refSel] || { h: 0, w: 0 };
      const gaps = Object.values(m.gaps);
      const minGap = gaps.length ? Math.min(...gaps) : 999;
      check(V.n + " " + name + ": スキップの高さ " + m.skip.h + "px（" + refSel + " " + ref.h + "px 以上・60px 以上）・幅 " + m.skip.w + "px",
        m.skip.h >= 60 && m.skip.h >= ref.h && m.skip.w >= ref.w * 0.95, JSON.stringify(m.sizes));
      check(V.n + " " + name + ": となりのボタンとの間が 40px 以上（いちばん近いもの " + minGap + "px）", minGap >= 40, JSON.stringify(m.gaps));
    };
    const solo = await mk(), host = await mk(), guest = await mk();
    try {
      // ===== 一人の一問一答（図のある問 g6r48 → ヒントも出る）=====
      let pg = solo.page;
      await pg.evaluate(SEED, [MIG, ["g6r48"], { unit: U }]); await pg.reload(); await pg.waitForTimeout(800);
      await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(400);
      const m1 = await pg.evaluate(MEASURE, ["#solo-skip-btn", ["#solo-reveal-btn", "#solo-hint-btn", "#solo-judge-ng", "#solo-judge-ok"]]);
      await shot(pg, "1_solo_qa");
      judge("一人・一問一答", m1, "#solo-reveal-btn");
      await tap(pg, "#solo-skip-btn"); await pg.waitForTimeout(300);
      const st = await pg.evaluate(() => (JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"))["g6r48"] || null);
      const open = await pg.evaluate(() => document.getElementById("solo-a-block").classList.contains("show"));
      check(V.n + " 一人・一問一答: 押すとこれまでどおり（答えが開いて✕で記録）", open && st && st.wrong === 1, JSON.stringify(st));
      // ===== 一人の大問の小問 =====
      await pg.evaluate(SEED, [MIG, DAIMON_IDS, { unit: U, count: DAIMON_IDS.length }]); await pg.reload(); await pg.waitForTimeout(800);
      await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(400);
      const m2 = await pg.evaluate(MEASURE, ["#solo-skip-btn", ["#solo-reveal-btn", "#solo-hint-btn", "#solo-judge-ng", "#solo-judge-ok"]]);
      await shot(pg, "2_solo_daimon");
      judge("一人・大問の小問", m2, "#solo-reveal-btn");
      // ===== 二人のホスト（考えている間: わかった！・スキップ・ヒント）=====
      for (const p of [host.page, guest.page]) { await p.evaluate(SEED, [MIG, ["g6r48"], { unit: U }]); await p.reload(); await p.waitForTimeout(800); }
      await tap(host.page, "#create-btn");
      await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
      const code = await host.page.$eval("#room-code-display", e => e.textContent);
      await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
      await waitVis(host.page, "#start-together-btn", 60000);
      await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
      // ★2026-10-10 ホストの「わかった！」「こたえを見る」はなくした（問題は両方に同時に出る）。いっしょに出るのはヒントだけ
      await waitVis(host.page, "#skip-btn", 30000); await host.page.waitForTimeout(300);
      const m3 = await host.page.evaluate(MEASURE, ["#skip-btn", ["#advance-btn", "#battle-hint-btn", "#answer-reveal-btn"]]);
      await shot(host.page, "3_battle_host");
      judge("二人・ホスト", m3, "#answer-reveal-btn");   // 「こたえを見る」は二人では出ない（高さ0扱い＝60px 以上だけを見る）
      await tap(host.page, "#skip-btn"); await host.page.waitForTimeout(400);
      const enc = await host.page.evaluate(() => { const e = document.getElementById("skip-encourage"); return e && getComputedStyle(e).display !== "none" ? e.textContent : ""; });
      check(V.n + " 二人・ホスト: 押すとこれまでどおりスキップ", /あとでもう一度/.test(enc), enc);
    } catch (e) { check(V.n + " 最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
    finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
  }
  check("画面のエラー 0", errs.length === 0, errs.join(" | "));
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
