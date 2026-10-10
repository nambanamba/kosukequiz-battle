// 考える時間の自動・速さ5段階・一問一答のスキップ・ホストの判定（×だけ）・親の判定で子の画面も開く（2026-10-05・ユーザー）
// 本物の Chrome・390x844・まねごとの待ち合わせ先。使い方: node tools/mikaku/speed_skip_probe.mjs   スクショは tools/mikaku/shots_speed/（コミットしない）
// 見ること:
//   T1 考える時間の式（基本10秒・ふつう・二人のホストの時計の秒で見る）: 年表の3つ答える問 g6r30＝26秒
//   T2 対戦中に速さを変えると次の問題から効く: 早く（×0.6）で表の問 g6r48＝9秒、ゆっくり（×1.6）で短い問 g6r1＝16秒
//   S1 ★一人では時間をはからない（2026-10-05 ユーザー「一人の時は時間制限なしでいいです」）: 時計が出ない・時間がたっても時間切れにならない
//   S2 一人の一問一答のスキップ: 答えを見せて✕で記録・うしろにもう一度・出し直しでは記録しない
//   S3 一人の結果に「スキップ1問・時間切れ1問」
//   B1 二人: ゲストが速さを変えるとホストにも反映（ホストの速さの行が変わる）
//   B4（2026-10-10 ユーザー「考える時間って子供の画面でも変えられます？変えられないようにしてください」）
//      二人のホスト（子ども）の画面には速さのボタンが出ない・押しても変わらない・ホームの設定の行も同じ。
//      ★同日 ユーザー「『少しゆっくり（相手が決めます）』の文字はいりません」→ 行ごと出さない（文字も無い）
//      ゲスト（親）は変えられる。一人の画面（S4）は今までどおりボタンが出る
//   B2 二人: ゲスト（親）が判定すると、ホスト（子）が「答えを見る」を押していなくてもホストの画面で答えが開く・ゲストのふだ「あなたの判定で…」
//   B3 二人: ホストの判定は ✕ が大きく〇が小さい・「何もしなければ〇」の一言。何もしなければ〇でゲストの記録が付き、次へ進める
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_speed"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "d1be5bf";   // 直す前（考える時間の自動・スキップの前）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "speed" });
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
// 答えるのは ids だけ（社会 第6回のほかの一問一答と大問は全部おぼえ済み）
const SEED = (arg) => {
  const [mig, ids, o] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }, st = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.kind !== "daimon" && !ids.includes(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { st[it.id] = Object.assign({}, known); }));
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify(Object.assign({ subject: "社会", unitsBySubject: { "社会": [o.unit] }, units: [o.unit], count: ids.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 10, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }, o.extra || {})));
};
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = (pg, p) => pg.$eval("#" + p + "-q-id", e => e.textContent.replace(/^No\./, ""));
  const statOf = (pg, id) => pg.evaluate(i => (JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"))[i] || null, id);
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const secShown = pg => pg.evaluate(() => { const e = document.getElementById("solo-think-timer"); return e && getComputedStyle(e).display !== "none" ? +e.dataset.sec : null; });
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    const pg = solo.page;
    // ===== S1〜S3 一人 =====
    await pg.evaluate(SEED, [MIG, ["g6r1", "g6r2", "g6r3"], { unit: U, extra: { headStartSec: 1, speedLevel: 2 } }]); await pg.reload(); await pg.waitForTimeout(800);
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(300);
    const first = await qid(pg, "solo");
    await pg.waitForTimeout(2500);   // 基本1秒でも、一人では時間切れにならない
    const s1 = { timer: await vis(pg, "#solo-think-timer"), note: await vis(pg, "#solo-timeup-note"), reveal: await vis(pg, "#solo-reveal-btn"), id: await qid(pg, "solo") };
    check("S1 一人では時間をはからない（時計なし・時間がたっても時間切れにならない）", !s1.timer && !s1.note && s1.reveal && s1.id === first, JSON.stringify(s1));
    await shot(pg, "S1_solo_notimer");
    await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250);
    const second = await qid(pg, "solo");
    await tap(pg, "#solo-skip-btn").catch(() => {}); await pg.waitForTimeout(300);
    const s2 = { ans: await pg.evaluate(() => document.getElementById("solo-a-block").classList.contains("show")), st: await statOf(pg, second) };
    check("S2 一問一答のスキップ（" + second + "）: 答えを見せて✕で記録", s2.ans && s2.st && s2.st.wrong === 1 && (s2.st.correct || 0) === 0, JSON.stringify(s2));
    await shot(pg, "S2_solo_skip");
    await tap(pg, "#solo-skip-next-btn").catch(() => {}); await pg.waitForTimeout(300);
    const seq = [first, second];
    for (let k = 0; k < 6; k++) {
      if (!(await pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active")))) break;
      const id = await qid(pg, "solo"); seq.push(id);
      if (await vis(pg, "#solo-timeup-next-btn")) { await tap(pg, "#solo-timeup-next-btn"); continue; }
      await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(100); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250);
    }
    const st2 = await statOf(pg, second), st1 = await statOf(pg, first);
    check("S2 スキップした問があとでもう一度出る（" + seq.join(" ") + "）・出し直しでは記録しない", seq.slice(2).includes(second) && st2 && st2.wrong === 1 && (st2.correct || 0) === 0 && st1 && st1.correct === 1, JSON.stringify({ st1, st2 }));
    const info = await pg.evaluate(() => (document.getElementById("solo-result-skipinfo") || {}).textContent || "");
    check("S3 一人の結果に「スキップ 1問」（一人では時間切れが無いので時間切れは出さない）", /スキップ 1問/.test(info) && !/時間切れ/.test(info), info);
    await shot(pg, "S3_solo_result");
    const s4 = await pg.evaluate(() => [...document.querySelectorAll(".speed-row")].map(r => !r.classList.contains("locked") && [...r.querySelectorAll(".speed-choice")].some(c => getComputedStyle(c).display !== "none")));
    check("S4 一人の画面では速さのボタンが今までどおり出る（変えられる）", s4.length >= 2 && s4.every(Boolean), JSON.stringify(s4));
    // ===== B 二人 =====
    for (const p of [host.page, guest.page]) { await p.evaluate(SEED, [MIG, ["g6r1", "g6r30", "g6r48"], { unit: U, extra: { judgeTimeSec: 3, answerTimeSec: 60 } }]); await p.reload(); await p.waitForTimeout(800); }
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    await waitVis(host.page, "#advance-btn", 30000);
    const b1 = await host.page.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
    const hostSec = () => host.page.evaluate(() => { const e = document.getElementById("think-timer"); return e && getComputedStyle(e).display !== "none" ? +e.dataset.sec : null; });
    const t1 = await hostSec();
    check("T1 二人・ふつう: 年表の3つ答える問 " + b1 + " の考える時間＝" + t1 + "秒（26秒）", b1 === "g6r30" && t1 === 26, t1);
    // B1 ゲストが速さを変える
    await guest.page.$eval('[data-speed-row="battle"] .speed-choice[data-speed="1"]', e => e.click()).catch(() => {});
    await host.page.waitForTimeout(800);
    const hostSpeed = await host.page.evaluate(() => { const e = document.querySelector('[data-speed-row="battle"] .speed-choice.on'); return e ? e.dataset.speed : null; });
    check("B1 ゲストが速さを「少しゆっくり」に → ホストにも反映", hostSpeed === "1", hostSpeed);
    const b4 = await host.page.evaluate(() => {
      const row = document.querySelector('[data-speed-row="battle"]'), home = document.querySelector('[data-speed-row="home"]');
      const shown = r => [...r.querySelectorAll(".speed-choice")].filter(c => c.offsetParent !== null).length;
      const rowVis = r => getComputedStyle(r).display !== "none";
      const title = document.querySelector(".speed-title");
      const lv = () => { const e = row.querySelector(".speed-choice.on"); return e ? +e.dataset.speed : null; };
      const before = lv();
      row.querySelector('.speed-choice[data-speed="4"]').click(); home.querySelector('.speed-choice[data-speed="0"]').click();
      return { battleShown: shown(row), homeShown: shown(home), homeLocked: home.classList.contains("locked"),
        battleRowVis: rowVis(row), homeRowVis: rowVis(home), titleVis: !!title && rowVis(title),
        text: document.getElementById("screen-battle") ? (document.getElementById("screen-battle").innerText.match(/相手が決めます/g) || []).join(",") : "", before, after: lv() };
    });
    const b4g = await guest.page.evaluate(() => { const row = document.querySelector('[data-speed-row="battle"]'); return [...row.querySelectorAll(".speed-choice")].filter(c => getComputedStyle(c).display !== "none").length; });
    check("B4 ホスト（子ども）には速さの行が出ない（ボタンも「相手が決めます」の文字も無い）・押しても変わらない・ホームの行と見出しも同じ／ゲストには出る",
      b4.battleShown === 0 && b4.homeShown === 0 && b4.homeLocked && !b4.battleRowVis && !b4.homeRowVis && !b4.titleVis && b4.text === "" && b4.before === 1 && b4.after === 1 && b4g === 5, JSON.stringify({ b4, b4g }));
    await shot(host.page, "B4_host_speed_locked");
    await tap(host.page, "#advance-btn");
    await guest.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", b1, { timeout: 20000 });
    await waitVis(guest.page, "#answer-reveal-btn", 15000);
    await tap(guest.page, "#answer-reveal-btn"); await guest.page.waitForTimeout(400);   // 親が先に見る
    const hOpen0 = await host.page.evaluate(() => document.getElementById("battle-a-block").classList.contains("show"));
    await tap(guest.page, "#judge-ng"); await host.page.waitForTimeout(1000);          // 親が子を✕
    const b2 = { hOpen0, hOpen: await host.page.evaluate(() => document.getElementById("battle-a-block").classList.contains("show")),
      badge: await guest.page.evaluate(() => (document.getElementById("host-seen-badge") || {}).textContent || "") };
    check("B2 親が判定すると、子が押していなくても子の画面で答えが開く・ゲストのふだ「あなたの判定で…」", !b2.hOpen0 && b2.hOpen && /あなたの判定で/.test(b2.badge), JSON.stringify(b2));
    await waitVis(host.page, "#judge-row", 10000).catch(() => {});
    const b3v = await host.page.evaluate(() => { const r = document.getElementById("judge-row"); const ng = document.getElementById("judge-ng").getBoundingClientRect(), ok = document.getElementById("judge-ok").getBoundingClientRect();
      const n = document.getElementById("host-judge-note"); return { cls: r.classList.contains("host-judge"), wide: ng.width > ok.width * 1.8, note: n && getComputedStyle(n).display !== "none" ? n.textContent : "" }; });
    await shot(host.page, "B3_host_judge"); await shot(guest.page, "B2_guest_badge");
    const g0 = await statOf(guest.page, b1);
    await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 15000 }).catch(() => {});   // ホストは何もしない（3秒で〇）
    const g1 = await statOf(guest.page, b1), h1 = await statOf(host.page, b1);
    check("B3 ホストの判定: ✕が大きく〇は小さい・「何もしなければ〇」・何もしなければゲストは〇・ホストは親の✕で記録", b3v.cls && b3v.wide && /何もしなければ〇/.test(b3v.note) && g0 === null && g1 && g1.correct === 1 && h1 && h1.wrong === 1, JSON.stringify({ b3v, g1, h1 }));
    // ===== T2 対戦中の速さの変更は次の問題から =====
    await guest.page.$eval('[data-speed-row="battle"] .speed-choice[data-speed="4"]', e => e.click()).catch(() => {});   // 早く
    await host.page.waitForTimeout(600);
    await tap(host.page, "#next-btn").catch(() => {});
    await waitVis(host.page, "#advance-btn", 30000);
    const b2id = await host.page.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, "")), t2 = await hostSec();
    // ★2026-10-10 からホストは速さを変えられないので、ゆっくりもゲストから
    await guest.page.$eval('[data-speed-row="battle"] .speed-choice[data-speed="0"]', e => e.click()).catch(() => {});      // ゆっくり（ゲストから）
    await host.page.waitForTimeout(600);
    await tap(host.page, "#advance-btn");
    await guest.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", b2id, { timeout: 20000 });
    // ★2026-10-08 から二人のときのホストの答えは、ゲストの〇✕で開く（ホストに「こたえを見る」は無い）
    await tap(guest.page, "#answer-reveal-btn");
    await waitVis(guest.page, "#judge-row", 15000); await tap(guest.page, "#judge-ok");
    await waitVis(host.page, "#judge-row", 15000); await tap(host.page, "#judge-ok");
    await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
    await tap(host.page, "#next-btn");
    await waitVis(host.page, "#advance-btn", 30000);
    const b3id = await host.page.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, "")), t3 = await hostSec();
    check("T2 速さを変えると次の問題から: 早くで表の問 " + b2id + "＝" + t2 + "秒（9秒）・ゆっくりで短い問 " + b3id + "＝" + t3 + "秒（16秒）", b2id === "g6r48" && t2 === 9 && b3id === "g6r1" && t3 === 16);
    check("画面のエラー 0", solo.errs.length + host.errs.length + guest.errs.length === 0, [].concat(solo.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
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
