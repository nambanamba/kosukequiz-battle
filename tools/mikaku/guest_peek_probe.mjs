// ゲスト（親）が先に答えを見られる／子ども（ホスト）が答えを見た時点をゲストに出す（2026-10-03・ユーザー）
//   ユーザー原文「答えを子供が読み上げてるときに覚えてられないので、前言ったことと違うと思うんですが、私（ゲスト）が
//   答えを見るを押したら、子供が答えを見るを押してなくても見たいです。でも子供側が答えをいつ見たのかはゲストがわかるようにしたいです。」
// 本物の Chrome 2枚（390x844）＋まねごとの待ち合わせ先。一問一答（社会）と大問の小問（理科）の両方
// 使い方: node tools/mikaku/guest_peek_probe.mjs   スクショは tools/mikaku/shots_guest_peek/（コミットしない）
// 見ること（一問一答・小問それぞれ）:
//   ★2026-10-08 から二人のときのホストには「こたえを見る」が出ない（ゲストの〇✕で開く）。G1・G3・G5 をそれに合わせた
//   G1 ゲストが「こたえを見る」→ ゲストの画面だけ答えが開く。ホストの画面は開かない（ホストのボタンは「相手は準備OK」）
//   G2 ゲストのふだは「まだ答えを見ていません」。判定ボタンは出るが、判定の時計は始まらない（時間がたっても自動〇にならない）
//   G3 ホストが「こたえを見る」→ ホストはすぐ開く（ゲストが押しているので）→ ゲストのふだが「見ました（◯秒後）」
//   G4 判定すると記録はふつうに1回だけ（ホスト・ゲストとも〇1）
//   G5 だれも押さずに時間切れで開いたときも、ゲストのふだは「見ました」になる
//      ★2026-10-10 からゲスト（親）の判定の時間切れは自動〇にならない（押すまで待つ）。G5 は
//      「時間が切れてもホストは開かない・ゲストに〇✕を促す → 親が〇を押すと開いてふだが変わる」を見る
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_guest_peek"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "ecc0c45";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "guestpeek" });
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
    // ===== 1問目: ゲストが先に見る =====
    await waitVis(host.page, "#advance-btn", 30000);
    const id1 = await qid(host.page);
    const h0 = await statOf(host.page, id1), g0 = await statOf(guest.page, id1);
    await tap(host.page, "#advance-btn");
    await waitVis(guest.page, "#answer-reveal-btn", 20000);
    const b0 = await badge(guest.page);
    await tap(guest.page, "#answer-reveal-btn"); await guest.page.waitForTimeout(600);
    // ★2026-10-08 から二人のときのホストには「こたえを見る」が出ない（親の〇✕で開く・reveal_by_judge_probe）
    const g1 = { guestOpen: await aOpen(guest.page), hostOpen: await aOpen(host.page), hostBtn: await vis(host.page, "#answer-reveal-btn") };
    check("G1 ゲストが押すと、ゲストの画面だけ答えが開く・ホストは開かない（ホストに「こたえを見る」は出ない）", g1.guestOpen && !g1.hostOpen && !g1.hostBtn, JSON.stringify(g1));
    // 判定の時計（1秒、小問は2秒）より長く待つ。ホストの答えの時間（4秒、小問は8秒）よりは短く
    await guest.page.waitForTimeout(kind === "qa" ? 2500 : 4500);
    const g2 = { badge: await badge(guest.page), judgeVis: await vis(guest.page, "#judge-row"), banner: await guest.page.$eval("#status-banner", e => e.classList.contains("show") ? e.textContent : ""), hostOpen: await aOpen(host.page) };
    check("G2 ゲストのふだ「まだ見ていません」（押す前: " + b0 + "）", /まだ/.test(b0) && /まだ/.test(g2.badge), g2.badge);
    check("G2 判定ボタンは出るが、時間がたっても自動〇にならない（判定の時計は始まっていない）", g2.judgeVis && !/判定しました/.test(g2.banner) && !g2.hostOpen, JSON.stringify(g2));
    await shot(guest.page, "G2_guest_peek"); await shot(host.page, "G2_host_waiting");
    // ★2026-10-08 ホストは自分で開かない。ゲストの〇でホストの画面が開く
    await tap(guest.page, "#judge-ok"); await host.page.waitForTimeout(800);
    const g3 = { hostOpen: await aOpen(host.page), badge: await badge(guest.page) };
    check("G3 ゲストの〇でホストがすぐ開き、ゲストのふだが「あなたの判定で…（◯秒後）」", g3.hostOpen && /あなたの判定で.*（\d+秒後）/.test(g3.badge), JSON.stringify(g3));
    await shot(guest.page, "G3_guest_badge_seen");
    await waitVis(host.page, "#judge-row", 15000);
    await tap(host.page, "#judge-ok");
    await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
    const h1 = await statOf(host.page, id1), gg1 = await statOf(guest.page, id1);
    const inc = (a, b) => ((b && b.correct) || 0) - ((a && a.correct) || 0);
    check("G4 記録はふつうに1回だけ（ホスト〇+" + inc(h0, h1) + "・ゲスト〇+" + inc(g0, gg1) + "）", inc(h0, h1) === 1 && inc(g0, gg1) === 1, JSON.stringify(h1) + " / " + JSON.stringify(gg1));
    // ===== 2問目: だれも押さない（時間切れで開く）=====
    await tap(host.page, "#next-btn");
    await waitVis(host.page, "#advance-btn", 30000);
    await tap(host.page, "#advance-btn");
    await waitVis(guest.page, "#answer-reveal-btn", 20000);
    const b2 = await badge(guest.page);
    // ★2026-10-10 だれも押さないとき: ゲストの答える時間（4秒）と判定の時間（1秒）が切れても、ホストは開かない
    await guest.page.waitForFunction(() => { const e = document.getElementById("guest-judge-prompt"); return e && getComputedStyle(e).display !== "none"; }, null, { timeout: 20000 });
    await guest.page.waitForTimeout(1500);
    const g5w = { hostOpen: await host.page.evaluate(() => document.getElementById("battle-a-block").classList.contains("show")),
      guestJudge: await guest.page.evaluate(() => getComputedStyle(document.getElementById("judge-row")).display !== "none") };
    check("G5 判定の時間が切れてもホストは開かない・ゲストに〇✕が残る", !g5w.hostOpen && g5w.guestJudge, JSON.stringify(g5w));
    await tap(guest.page, "#judge-ok");
    await host.page.waitForFunction(() => document.getElementById("battle-a-block").classList.contains("show"), null, { timeout: 20000 });
    await guest.page.waitForTimeout(800);
    const b3 = await badge(guest.page);
    check("G5 そのあと親が〇を押すと開き、ふだが変わる（前: " + b2 + "）", /まだ/.test(b2) && /出しました/.test(b3), b3);
    const hb = await badge(host.page);
    check("ホストの画面にはふだを出さない", hb === "", hb);
    check("画面のエラー 0", host.errs.length + guest.errs.length === 0, host.errs.concat(guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); await shot(host.page, "ERR_host"); await shot(guest.page, "ERR_guest"); }
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
