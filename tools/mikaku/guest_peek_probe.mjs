// ゲスト（親）が先に答えを見られる／子ども（ホスト）が答えを見た時点をゲストに出す（2026-10-03・ユーザー）
//   ユーザー原文「答えを子供が読み上げてるときに覚えてられないので、前言ったことと違うと思うんですが、私（ゲスト）が
//   答えを見るを押したら、子供が答えを見るを押してなくても見たいです。でも子供側が答えをいつ見たのかはゲストがわかるようにしたいです。」
// 本物の Chrome 2枚（390x844）＋まねごとの待ち合わせ先。一問一答（社会）と大問の小問（理科）の両方
// 使い方: node tools/mikaku/guest_peek_probe.mjs   スクショは tools/mikaku/shots_guest_peek/（コミットしない）
// 見ること（一問一答・小問それぞれ）:
//   ★2026-10-10 二人の流れが変わった（NEW_FLOW）: 問題は両方の画面に同時に出る。ホストには「わかった！」「こたえを見る」が
//   出ない。ゲスト（親）は問題が出た瞬間から答えと〇✕が出ている（「こたえを見る」は押せない）。ホストの答えは親が〇✕を
//   押したときだけ開く。ホストは判定しない。記録はホストだけに1回付く（ゲストは自分の記録を付けない）。それに合わせて:
//   G1 問題が出た瞬間、ゲストの画面だけ答えと〇✕が出ている。ホストは開かず、ホストに「こたえを見る」「わかった！」は出ない
//      （旧: ゲストが「こたえを見る」を押す → 押せなくなったので「最初から出ている」に変えた）
//   G2 ゲストのふだは「まだ答えを見ていません」。時間がたっても自動〇にならず、ホストも開かない
//   G3 ゲストが〇を押す → ホストの答えがすぐ開く → ゲストのふだが「あなたの判定で…（◯秒後）」に変わる
//      （旧: ホストが「こたえを見る」を押す → ホストは押せなくなったので、ゲストの〇✕で開くことを見る）
//   G4 記録はホストに1回だけ（〇+1）。ゲストの端末には付かない（+0）。ホストに判定ボタンは出ず、次の問題へが出る
//   G5 判定の時間が切れてもホストは開かない・ゲストに〇✕を促す → 親が〇を押すと開いてふだが変わる（自動〇にならない）
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
    // ===== 1問目: 問題は両方に同時に出る。ゲストは最初から答えと〇✕が見える =====
    await waitVis(host.page, "#skip-btn", 30000);
    await waitVis(guest.page, "#judge-row", 20000);
    const id1 = await qid(host.page);
    const h0 = await statOf(host.page, id1), g0 = await statOf(guest.page, id1);
    await guest.page.waitForTimeout(500);
    const b0 = await badge(guest.page);
    const g1 = { guestOpen: await aOpen(guest.page), guestJudge: await vis(guest.page, "#judge-row"), guestRevealBtn: await vis(guest.page, "#answer-reveal-btn"),
      hostOpen: await aOpen(host.page), hostReveal: await vis(host.page, "#answer-reveal-btn"), hostAdvance: await vis(host.page, "#advance-btn"), hostJudge: await vis(host.page, "#judge-row") };
    check("G1 問題が出た瞬間、ゲストだけ答えと〇✕が出ている・ホストは開かず「こたえを見る」「わかった！」「判定」も出ない",
      g1.guestOpen && g1.guestJudge && !g1.guestRevealBtn && !g1.hostOpen && !g1.hostReveal && !g1.hostAdvance && !g1.hostJudge, JSON.stringify(g1));
    // 判定の帯は考える時間ぶん。それより短く待つ（切れた後は G5 で見る）
    await guest.page.waitForTimeout(kind === "qa" ? 1500 : 2500);
    const g2 = { badge: await badge(guest.page), judgeVis: await vis(guest.page, "#judge-row"), banner: await guest.page.$eval("#status-banner", e => e.classList.contains("show") ? e.textContent : ""), hostOpen: await aOpen(host.page) };
    check("G2 ゲストのふだ「まだ見ていません」（開始時: " + b0 + "）", /まだ/.test(b0) && /まだ/.test(g2.badge), g2.badge);
    check("G2 時間がたっても自動〇にならず、ホストも開かない", g2.judgeVis && !/判定しました/.test(g2.banner) && !g2.hostOpen, JSON.stringify(g2));
    await shot(guest.page, "G2_guest_peek"); await shot(host.page, "G2_host_waiting");
    // ゲストの〇でホストの画面が開く
    await tap(guest.page, "#judge-ok"); await host.page.waitForTimeout(800);
    const g3 = { hostOpen: await aOpen(host.page), badge: await badge(guest.page) };
    check("G3 ゲストの〇でホストがすぐ開き、ゲストのふだが「あなたの判定で…（◯秒後）」", g3.hostOpen && /あなたの判定で.*（\d+秒後）/.test(g3.badge), JSON.stringify(g3));
    await shot(guest.page, "G3_guest_badge_seen");
    await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
    const hostJudgeAfter = await vis(host.page, "#judge-row");
    const h1 = await statOf(host.page, id1), gg1 = await statOf(guest.page, id1);
    const inc = (a, b) => ((b && b.correct) || 0) - ((a && a.correct) || 0);
    check("G4 記録はホストに1回だけ（ホスト〇+" + inc(h0, h1) + "・ゲスト〇+" + inc(g0, gg1) + "）・ホストに判定ボタンは出ない", inc(h0, h1) === 1 && inc(g0, gg1) === 0 && !hostJudgeAfter, JSON.stringify(h1) + " / " + JSON.stringify(gg1) + " / hostJudge=" + hostJudgeAfter);
    // ===== 2問目: だれも押さない（時間切れでもホストは開かない）=====
    await tap(host.page, "#next-btn");
    await host.page.waitForFunction(i => document.getElementById("battle-q-id").textContent.replace(/^No\./, "") !== i, id1, { timeout: 30000 });
    await waitVis(guest.page, "#judge-row", 20000);
    await guest.page.waitForFunction(() => /まだ/.test((document.getElementById("host-seen-badge") || {}).textContent || ""), null, { timeout: 10000 });
    const b2 = await badge(guest.page);
    // 考える時間（判定の帯）が切れても、ホストは開かない・自動〇にならない（促しが出るだけ）
    await guest.page.waitForFunction(() => { const e = document.getElementById("guest-judge-prompt"); return e && getComputedStyle(e).display !== "none"; }, null, { timeout: 30000 });
    await guest.page.waitForTimeout(1500);
    const g5w = { hostOpen: await host.page.evaluate(() => document.getElementById("battle-a-block").classList.contains("show")),
      guestJudge: await guest.page.evaluate(() => getComputedStyle(document.getElementById("judge-row")).display !== "none") };
    check("G5 判定の時間が切れてもホストは開かない・ゲストに〇✕が残る", !g5w.hostOpen && g5w.guestJudge, JSON.stringify(g5w));
    await tap(guest.page, "#judge-ok");
    await host.page.waitForFunction(() => document.getElementById("battle-a-block").classList.contains("show"), null, { timeout: 20000 });
    await guest.page.waitForTimeout(800);
    const b3 = await badge(guest.page);
    check("G5 そのあと親が〇を押すと開き、ふだが変わる（前: " + b2 + "）", /まだ/.test(b2) && /あなたの判定で/.test(b3), b3);
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
