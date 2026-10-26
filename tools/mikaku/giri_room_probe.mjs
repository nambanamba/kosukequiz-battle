// ★2026-10-27 二人（親が〇✕を付ける流れ）の「△ ぎりぎり　あしたもう一度」
//   ユーザー「昨日やった、今日は出さないけど明日もだす（やりなおししないけど正解にもしない）のボタン、親の画面に出てないんですが。」
// 本物の Chrome 2枚＋まねごとの待ち合わせ先（fake_relay）。使い方: node tools/mikaku/giri_room_probe.mjs
//   REAL=1 … 本物の待ち合わせ先（RELAY_URLS をそのまま）で R1〜R6 だけ1回（自己テスト・版ちがいはしない。relay を叩きすぎないため）
// スクショは tools/mikaku/shots_giri_room/（コミットしない）
// 見ること:
//   R1 親（ゲスト）の画面: 答えと ✕・△・〇（左から）。子ども（ホスト）の画面には△は出ない
//   R2 親が△ → 子どもの端末の記録が一人の△と同じ: 正解の数+1・box そのまま・正解した日に今日を足さない・lastGiri＝lastAnswered。
//      学習ログは r "o" のまま7つ目に 1。この回では出し直さない（うしろに回らない）。子どもの画面は「△ ぎりぎり」・次の問題へ進む
//   R3 ✕で回ってきた2回目には△を出さない
//   R4 △のあと「やっぱり ✕ に直す」→ 子どもの記録は△の前に戻して✕（lastGiri なし）・学習ログの△の印も外れる
//   R5 理科・社会の大問の小問にも△が出る。押すと小問の記録は box 0 のまま（＝次も答える小問のまま＝あしたもう一度）
//   R6 最後まで進み、両方の画面のエラー 0
//   V1 ★版ちがい: 古い版の子ども（BASE）＋新しい版の親 → 親が△を押しても止まらず、子どもはふつうの〇で記録・最後まで進む
//   V2 ★版ちがい: 新しい版の子ども＋古い版の親（△のボタンが無い）→ ふつうの〇✕のまま最後まで進む
//   F1 公平モード（こどもどうし）の判定には△を出さない
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_giri_room"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "54682b2";   // 直す前（一人の△だけ）
const REAL = !!process.env.REAL;
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const SRC = { now: CURRENT, base: BASELINE };
const relay = await startFakeRelay({ broadcast: true, label: "giriroom" });
function prep(s) {
  if (!REAL) { const i0 = s.indexOf("const RELAY_URLS = ["), i1 = s.indexOf("];", i0); if (i0 < 0) throw new Error("RELAY_URLS"); s = s.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + s.slice(i1); }
  const e = s.lastIndexOf("</script>"); return s.slice(0, e) + "\nwindow.__t = c => eval(c);\n" + s.slice(e);
}
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const [p0, qs] = req.url.split("?");
  const rel = decodeURIComponent(p0).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { const v = /(?:^|&)v=(\w+)/.exec(qs || ""); res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(prep(SRC[v ? v[1] : "now"]), "utf8")); return; }
  if (rel === "sw.js") { res.writeHead(404).end(); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const DAY = 86400000;
const ymdOf = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const SEED = ([fair, st]) => {
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1, "tiers-from-modes": 1 }));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_merge_all_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": ["第6回.鎌倉時代"] }, units: ["第6回.鎌倉時代"], count: 5, shuffle: false, fairMode: !!fair,
    tiers: [0, 1, 2], headStartSec: 3, answerTimeSec: 3, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st || {}));
};
async function mk(ver) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e).split("\n")[0])); page.on("dialog", d => d.accept().catch(() => {}));
  await page.goto(PAGE_URL + "?v=" + ver); await page.waitForTimeout(400);
  return { ctx, page, errs, ver };
}
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const vis = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 15000 });
const txt = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, n + ".png"), fullPage: true }).catch(() => {});
const statOf = (pg, id) => pg.evaluate(id => (JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"))[id] || null, id);
const logOf = (pg, id) => pg.evaluate(id => { const L = window.__t("studyLog"); const s = L.sessions.filter(x => x.k === "battle").pop(); return s ? (s.q || []).filter(e => e[0] === id) : null; }, id);
const qidOf = pg => pg.evaluate(() => (document.getElementById("battle-q-id").textContent || "").replace(/^No\./, ""));

// 部屋を作って二人で開始する。ホストは startBattleWithIds（今日やることの「二人で」と同じ入り口）で ids を出す
async function meet(hostVer, guestVer, fair, hostStats, pickIds) {
  const host = await mk(hostVer), guest = await mk(guestVer);
  await host.page.evaluate(SEED, [fair, hostStats]); await guest.page.evaluate(SEED, [false, {}]);
  await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(1200); await guest.page.waitForTimeout(800);
  const ids = await host.page.evaluate(pickIds);
  await host.page.evaluate(q => window.__t("startBattleWithIds")(q, null), ids.start);
  await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
  const code = await txt(host.page, "#room-code-display");
  await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
  await waitVis(host.page, "#start-together-btn", REAL ? 90000 : 60000);
  await tap(host.page, "#start-together-btn"); await waitVis(guest.page, "#join-start-together-btn", 20000); await tap(guest.page, "#join-start-together-btn");
  return { host, guest, ids };
}
// 次の問題が両方に出るまで待つ（前と同じ id が続くこともあるので、ホストの添字で見る）
async function nextQ(host, guest, prevIdx) {
  await host.page.waitForFunction(p => document.getElementById("screen-battle").classList.contains("active") && window.__t("currentIndex") !== p, prevIdx, { timeout: 20000 });
  const idx = await host.page.evaluate(() => window.__t("currentIndex"));
  const q = await host.page.evaluate(() => window.__t("questionIds")[window.__t("currentIndex")]);
  await guest.page.waitForFunction(([i, q]) => window.__t("currentIndex") === i && window.__t("questionIds")[i] === q, [idx, q], { timeout: 10000 });
  await waitVis(guest.page, "#judge-ok", 10000);
  return { idx, q };
}
async function goNext(host) {
  await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 10000 });
  await tap(host.page, "#next-btn");
}
const endWait = async (host, guest) => {
  await host.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 15000 });
  await guest.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 15000 });
};
const now0 = Date.now();
const PICK = () => {
  const ids = QA_DATA.filter(d => d.subj === "社会" && d.u === "第6回.鎌倉時代" && d.kind !== "daimon" && d.kind !== "calc" && !window.__t("SPLIT_CARD").has(d.id) && !d.img).slice(0, 3).map(d => d.id);
  // 小問2〜3つ・図なしの大問（並びを短くするため）
  const dm = QA_DATA.find(d => d.kind === "daimon" && d.itemIds && d.itemIds.length >= 2 && d.itemIds.length <= 3);
  return { start: ids.concat(dm ? [dm.id] : []), cards: ids, daimon: dm ? dm.id : null, items: dm ? dm.itemIds.slice() : [] };
};

async function runMain(label, ver) {
  const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const stA = { correct: 2, wrong: 0, box: 1, correctDays: [ymdOf(now0 - 3 * DAY)], lastCorrectAt: now0 - 3 * DAY, lastAnswered: now0 - 3 * DAY };
  const stB = { correct: 1, wrong: 1, box: 0, lastCorrectAt: now0 - 5 * DAY, lastAnswered: now0 - 5 * DAY };
  let P = null;
  try {
    const pre = await mk(ver); const idsPre = await pre.page.evaluate(PICK); await pre.ctx.close();
    const [A, B, C] = idsPre.cards;
    check("前提: 社会 第6回のカード3枚と大問（" + idsPre.daimon + "・小問 " + idsPre.items.length + "）", idsPre.cards.length === 3 && !!idsPre.daimon);
    P = await meet(ver, ver, false, { [A]: stA, [B]: stB }, PICK);
    const { host, guest } = P;
    let prev = -1, seenB = 0, seenC = 0, firstItem = true, steps = 0;
    while (steps++ < 20) {
      const done = await host.page.evaluate(() => document.getElementById("screen-result").classList.contains("active"));
      if (done) break;
      const { idx, q } = await nextQ(host, guest, prev); prev = idx;
      const gGiri = await vis(guest.page, "#judge-giri");
      const hGiri = await vis(host.page, "#judge-giri");
      if (q === A) {
        const btns = await guest.page.evaluate(() => [...document.querySelectorAll("#judge-row .judge-btn")].filter(b => getComputedStyle(b).display !== "none").map(b => b.innerText.replace(/\s+/g, " ").trim()));
        await shot(guest.page, label + "_R1_parent"); await shot(host.page, label + "_R1_kid");
        check("R1 親の画面: ✕・△・〇 の3つ（左から）・△は「△ ぎりぎり」「あしたもう一度」", btns.length === 3 && /^✕/.test(btns[0]) && /△ ぎりぎり/.test(btns[1]) && /あしたもう一度/.test(btns[1]) && /^〇/.test(btns[2]), JSON.stringify(btns));
        const box = await guest.page.evaluate(() => [...document.querySelectorAll("#judge-row .judge-btn")].filter(b => getComputedStyle(b).display !== "none").map(b => { const x = b.getBoundingClientRect(); return { w: Math.round(x.width), r: Math.round(x.right) }; }));
        check("R1 3つとも画面の幅に入る（はば 80px 以上）", box.length === 3 && box.every(b => b.w >= 80 && b.r <= 390), JSON.stringify(box));
        check("R1 子どもの画面に△は出ない", !hGiri);
        if (!gGiri) throw new Error("親の画面に△が無い");
        await tap(guest.page, "#judge-giri");
        await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 10000 });
        await host.page.waitForTimeout(200);
        const sA = await statOf(host.page, A), lg = await logOf(host.page, A);
        check("R2 子どもの記録が△: 正解 2→3・box 1 のまま・正解した日に今日を足さない・lastGiri＝lastAnswered",
          sA && sA.correct === 3 && sA.box === 1 && JSON.stringify(sA.correctDays) === JSON.stringify([ymdOf(now0 - 3 * DAY)]) && sA.lastGiri > 0 && sA.lastGiri === sA.lastAnswered && sA.wrong === 0, JSON.stringify(sA));
        check("R2 子どもの学習ログ: r「o」のまま7つ目に 1", lg && lg.length === 1 && lg[0][2] === "o" && lg[0][6] === 1, JSON.stringify(lg));
        const qq = await host.page.evaluate(() => window.__t("questionIds").slice());
        check("R2 この回では出し直さない（" + A + " はうしろに回らない）", qq.filter(x => x === A).length === 1, JSON.stringify(qq));
        const hr = await txt(host.page, "#my-result"), gb = await txt(guest.page, "#status-banner"), gf = await txt(guest.page, "#judge-fix-note");
        check("R2 子どもの画面「△ ぎりぎり」・親の画面「ぎりぎり（あしたもう一度）と判定」・一個前を直すの文も△", /△ ぎりぎり/.test(hr || "") && /ぎりぎり/.test(gb || "") && /△ ぎりぎり/.test(gf || ""), JSON.stringify([hr, gb, gf]));
        await shot(host.page, label + "_R2_kid_after"); await shot(guest.page, label + "_R2_parent_after");
        const gStats = await guest.page.evaluate(() => localStorage.getItem("kq_battle_stats_v1"));
        check("R2 親の端末の記録は変わらない", gStats === "{}", gStats);
        await goNext(host);
      } else if (q === B) {
        seenB++;
        if (seenB === 1) { check("R1 2問目（" + B + "）でも親に△が出る", gGiri); await tap(guest.page, "#judge-ng"); }
        else { check("R3 ✕で回ってきた2回目（" + B + "）には△を出さない", !gGiri); await tap(guest.page, "#judge-ok"); }
        await goNext(host);
      } else if (q === C) {
        seenC++;
        if (seenC === 1) {
          const before = await statOf(host.page, C);
          await tap(guest.page, "#judge-giri");
          await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 10000 });
          const mid = await statOf(host.page, C);
          await waitVis(guest.page, "#judge-fix-btn", 5000);
          await tap(guest.page, "#judge-fix-btn");
          await guest.page.waitForFunction(() => /直しました/.test(document.getElementById("judge-fix-status").textContent || ""), null, { timeout: 10000 });
          const after = await statOf(host.page, C), lg = await logOf(host.page, C);
          check("R4 △のあと「やっぱり ✕」: 子どもの記録は△の前に戻して✕（正解 0・まちがい 1・lastGiri なし）", mid && mid.lastGiri && !before && after && after.correct === 0 && after.wrong === 1 && !after.lastGiri, JSON.stringify({ before, mid, after }));
          check("R4 学習ログは ✕・△の印は外れる", lg && lg.length === 1 && lg[0][2] === "x" && !lg[0][6], JSON.stringify(lg));
          await goNext(host);
        } else { check("R3 ✕に直して回ってきた " + C + " には△を出さない", !gGiri); await tap(guest.page, "#judge-ok"); await goNext(host); }
      } else if (P.ids.items.includes(q)) {
        if (firstItem) {
          firstItem = false;
          check("R5 大問の小問（" + q + "）にも親に△が出る", gGiri);
          await shot(guest.page, label + "_R5_parent_daimon");
          if (gGiri) {
            await tap(guest.page, "#judge-giri");
            await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 10000 });
            const s = await statOf(host.page, q);
            const ans = await host.page.evaluate(id => window.__t("answerItemIds")(QA_DATA.find(d => d.id === id)), P.ids.daimon);
            check("R5 小問の△: 正解1・box 0 のまま・lastGiri・次も答える小問のまま", s && s.correct === 1 && !(s.box > 0) && s.lastGiri > 0 && ans.includes(q), JSON.stringify(s) + " 答える小問 " + JSON.stringify(ans));
          } else await tap(guest.page, "#judge-ok");
        } else await tap(guest.page, "#judge-ok");
        await goNext(host);
      } else { await tap(guest.page, "#judge-ok"); await goNext(host); }
    }
    await endWait(host, guest);
    check("R6 最後まで進んだ（両方の終わりの画面）", true);
    check("R6 画面のエラー 0", host.errs.length + guest.errs.length === 0, host.errs.concat(guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); if (P) { await shot(P.host.page, label + "_ERR_host"); await shot(P.guest.page, label + "_ERR_guest"); } }
  finally { if (P) { await P.host.ctx.close(); await P.guest.ctx.close(); } }
  return out;
}
// 版ちがい・公平モード
async function runMixed() {
  const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const stA = { correct: 2, wrong: 0, box: 1, correctDays: [ymdOf(now0 - 3 * DAY)], lastCorrectAt: now0 - 3 * DAY, lastAnswered: now0 - 3 * DAY };
  const PICK2 = () => ({ start: QA_DATA.filter(d => d.subj === "社会" && d.u === "第6回.鎌倉時代" && d.kind !== "daimon" && d.kind !== "calc" && !window.__t("SPLIT_CARD").has(d.id) && !d.img).slice(0, 2).map(d => d.id) });
  for (const [hv, gv, name] of [["base", "now", "V1 古い子ども＋新しい親"], ["now", "base", "V2 新しい子ども＋古い親"]]) {
    let P = null;
    try {
      const pre = await mk("now"); const A = (await pre.page.evaluate(PICK2)).start[0]; await pre.ctx.close();
      P = await meet(hv, gv, false, { [A]: stA }, PICK2);
      const { host, guest } = P;
      let prev = -1, n = 0;
      while (n < 6) {
        if (await host.page.evaluate(() => document.getElementById("screen-result").classList.contains("active"))) break;
        const { idx, q } = await nextQ(host, guest, prev); prev = idx; n++;
        if (q === A) {
          if (gv === "now") {
            check(name + ": 親に△が出る", await vis(guest.page, "#judge-giri"));
            await tap(guest.page, "#judge-giri");
          } else {
            check(name + ": 古い親の画面には△のボタンが無い", !(await guest.page.evaluate(() => !!document.getElementById("judge-giri"))));
            await tap(guest.page, "#judge-ok");
          }
          await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 10000 });
          const s = await statOf(host.page, A);
          check(name + ": 子どもはふつうの〇で記録（正解 3・box 2・今日を足す・lastGiri なし）", s && s.correct === 3 && s.box === 2 && (s.correctDays || []).includes(ymdOf(Date.now())) && !s.lastGiri, JSON.stringify(s));
        } else await tap(guest.page, "#judge-ok");
        await goNext(host);
      }
      await endWait(host, guest);
      check(name + ": 止まらず最後まで進んだ", true);
      check(name + ": 画面のエラー 0", host.errs.length + guest.errs.length === 0, host.errs.concat(guest.errs).join(" | "));
    } catch (e) { check(name + ": 最後まで走った", false, String(e && e.message || e).split("\n")[0]); if (P) { await shot(P.host.page, "V_ERR_host_" + hv); await shot(P.guest.page, "V_ERR_guest_" + gv); } }
    finally { if (P) { await P.host.ctx.close(); await P.guest.ctx.close(); } }
  }
  // F1 公平モード
  let P = null;
  try {
    P = await meet("now", "now", true, {}, PICK2);
    const { host, guest } = P;
    await host.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 20000 });
    await guest.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 20000 });
    await guest.page.waitForTimeout(500);
    if (await vis(guest.page, "#answer-reveal-btn")) await tap(guest.page, "#answer-reveal-btn");
    await waitVis(guest.page, "#judge-ok");
    check("F1 公平モード: ゲストの判定に△は出ない", !(await vis(guest.page, "#judge-giri")));
    await tap(guest.page, "#judge-ok");
    await waitVis(host.page, "#judge-ok", 8000);
    check("F1 公平モード: ホストの判定に△は出ない", !(await vis(host.page, "#judge-giri")));
    check("F1 画面のエラー 0", host.errs.length + guest.errs.length === 0, host.errs.concat(guest.errs).join(" | "));
  } catch (e) { check("F1 最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { if (P) { await P.host.ctx.close(); await P.guest.ctx.close(); } }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
if (REAL) {
  console.log("■ REAL=1 本物の待ち合わせ先で1回だけ");
  const ng = report("いまの index.html（本物の待ち合わせ）", await runMain("real", "now"));
  console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
  await done(ng ? 1 : 0);
}
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await runMain("base", "base"));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng1 = report("いまの index.html", await runMain("now", "now"));
const ng2 = report("版ちがい・公平モード", await runMixed());
const ng = ng1 + ng2;
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
