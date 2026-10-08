// 記号で答える問題の選択肢を、出すたびに入れかえる（2026-10-08 ユーザー「記号問題で問題を読まずに丸暗記してるので、なんとかしてください」）
// 本物の Chrome・390x844・まねごとの待ち合わせ先（本物には触らない）。使い方: node tools/mikaku/choice_shuffle_probe.mjs
// スクショは tools/mikaku/shots_choice_shuffle/（コミットしない）
// 見ること:
//   C1 一人: r6m60（問いの中に「(ア) …」が並ぶ型）が、出るたびに「本文 → (ア)〜(エ) を1行ずつ」で、選択肢は元の4つの並べかえ。
//      答えは「入れかえ後の記号（中身）」、解説の「(ア) 肺静脈には…」も入れかえ後の記号
//   C2 一人: 同じ問題を5回（5つの回で）出すと、並びが少なくとも1回は変わる
//   C3 一人: 大問のリード文に選択肢が並ぶ型（r3 要点チェック 問2）。リード文が入れかえた並びで、3つの小問とも同じ並び、
//      答え（「イ・カ」など）は入れかえ後の記号で、記号の順に並び、中身つき
//   C4 一人: 答えが2つ（r4k301「イ・カ」）も入れかえ後の記号・記号の順・中身つき
//   C5 図・地図の中に記号がある問題は、問い・答えとも data のまま（r6m52「図1の（ア）〜（エ）」・g6d108「（地図）のア〜カ」）
//   C6 二人: ホストとゲストで、r6m60 と大問（リード文の型）の並び・答えが同じ
//   C7 記録: 正解の記録は元の問題 id（r6m60・r3y021…）に付く。ほかの名前の記録は増えない
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_choice_shuffle"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "1c1fe4f";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "cshuf" });
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
// ids だけを「まだ正解していない」にし、ほかは全部おぼえ済み（3日正解）にする。単元は ids の問題が入っている単元
const SEED = (arg) => {
  const [mig, ids, subj] = arg;
  const now = Date.now(), days = [0, 1, 2].map(k => new Date(now - (k + 10) * 864e5).toISOString().slice(0, 10));
  const known = { correct: 3, wrong: 0, box: 3, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8, correctDays: days }, st = {};
  QA_DATA.forEach(d => { if (d.kind !== "daimon" && !ids.includes(d.id)) st[d.id] = Object.assign({}, known); });
  const units = new Set();
  DAIMON_DATA.forEach(h => h.items.forEach(it => { if (!ids.includes(it.id)) st[it.id] = Object.assign({}, known); else { const e = QA_DATA.find(d => d.kind === "daimon" && d.id === h.key); if (e) units.add(e.u); } }));
  QA_DATA.forEach(d => { if (ids.includes(d.id)) units.add(d.u); });
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  const u = Array.from(units);
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: subj, unitsBySubject: { [subj]: u }, units: u, count: 30, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 10, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  return u;
};
// ---- 期待する見え方（テスト側で独立に組み立てる） ----
const K = "アイウエオカキクケコ";
// 出た文の選択肢の行を読む: 「(ア) 中身」「ア　中身」。本文のあとに1行ずつ
function readLines(shown, stem) {
  const s = String(shown || "");
  if (!s.startsWith(stem + "\n")) return null;
  const lines = s.slice(stem.length + 1).split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:\((.)\) |（(.)）|(.)　)([\s\S]+)$/.exec(lines[i]);
    if (!m || (m[1] || m[2] || m[3]) !== K[i]) return null;
    out.push(m[4].trim());
  }
  return out;
}
// 元の問い（「…\n(ア) A　(イ) B…」）から本文と選択肢
function origChoices(q) {
  const re = /\(([ア-コ])\) ?|（([ア-コ])）|(?:^|[\s　])([ア-コ])[　 ]/g; const marks = []; let m;
  while ((m = re.exec(q))) { const after = q.slice(m.index + m[0].length, m.index + m[0].length + 1); if (/[〜~～]/.test(after) || /[〜~～]/.test(q.slice(m.index - 1, m.index))) continue; marks.push({ i: m.index + (m[0].match(/^[\s　]/) ? 1 : 0), e: m.index + m[0].length }); }
  return { stem: q.slice(0, marks[0].i).replace(/[\s　]+$/, ""), choices: marks.map((x, k) => q.slice(x.e, k + 1 < marks.length ? marks[k + 1].i : q.length).trim()) };
}
const isPerm = (shownCh, choices) => !!shownCh && shownCh.length === choices.length && shownCh.slice().sort().join("\u0001") === choices.slice().sort().join("\u0001");
// 答え「イ・カ」→ 出た並びでの「キ（塩酸）・ク（炭酸水）」（記号の順）
function wantAnswer(a, choices, shownCh) {
  const labs = a.split("・");
  return labs.map(l => { const c = choices[K.indexOf(l)]; return { k: shownCh.indexOf(c), c }; }).sort((x, y) => x.k - y.k).map(x => K[x.k] + "（" + x.c + "）").join("・");
}
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x).slice(0, 400) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const solo = await mk(), host = await mk(), guest = await mk();
  // ひとりで1回まわす（全部〇）。出た問題ごとに 問い・答え・解説・リード文
  let lastBefore = {};
  const soloRound = async (ids, subj, shotName) => {
    const pg = solo.page;
    await pg.evaluate(SEED, [MIG, ids, subj]); await pg.reload(); await pg.waitForTimeout(700);
    lastBefore = await pg.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"));
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(300);
    const seen = [];
    for (let t = 0; t < 12; t++) {
      if (!(await pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active")))) break;
      await waitVis(pg, "#solo-reveal-btn", 15000);
      const id = await pg.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, ""));
      await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(150);
      const v = await pg.evaluate(() => ({ q: document.getElementById("solo-q").textContent, a: document.getElementById("solo-a").textContent,
        sol: document.getElementById("solo-sol").textContent, lead: ((document.querySelector("#solo-daimon .daimon-lead-text") || {}).textContent) || "" }));
      if (shotName && t === 0) await shot(pg, shotName);
      seen.push(Object.assign({ id }, v));
      await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(250);
    }
    return seen;
  };
  try {
    const D = await solo.page.evaluate(() => { const m = {}; QA_DATA.forEach(d => { if (d.kind !== "daimon") m[d.id] = { q: d.q, a: d.a, sol: d.sol || "" }; });
      DAIMON_DATA.forEach(g => g.items.forEach(it => { m[it.id] = { q: it.q, a: it.a, sol: it.sol || "", lead: g.lead || "", key: g.key }; })); return m; });
    // ===== C1・C2・C5(r6m52)・C7 =====
    const r60 = origChoices(D.r6m60.q);
    const orders = [], c1bad = [];
    let statsOk = true, statsX = "";
    for (let r = 0; r < 5; r++) {
      const seen = await soloRound(["r6m60", "r6m52"], "理科", r === 0 ? "C1_solo" : null);
      const before = lastBefore;
      const after = await solo.page.evaluate(() => JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"));
      const s60 = seen.find(x => x.id === "r6m60");
      const ch = s60 && readLines(s60.q, r60.stem);
      const wantA = ch && wantAnswer(D.r6m60.a, r60.choices, ch);
      // 解説の「(ア) 肺静脈には動脈血…」→ 入れかえ後の記号
      const labOf = c => ch ? "(" + K[ch.indexOf(c)] + ")" : "?";
      const wantSol = "表で1つずつ確かめる。" + labOf(r60.choices[0]) + " 肺静脈には動脈血が流れる（表2）。" + labOf(r60.choices[2]) + " 肺からもどった血液が入るのは左心房（表2）。" + labOf(r60.choices[3]) + " 腎静脈のほうが不要物が少ない（表5）。";
      if (!(s60 && isPerm(ch, r60.choices) && s60.a === wantA && s60.sol === wantSol)) c1bad.push(JSON.stringify({ r, s60, wantA, wantSol }));
      if (ch) orders.push(ch.join("|"));
      const s52 = seen.find(x => x.id === "r6m52");
      if (r === 0) check("C5 図の記号の問題 r6m52 は、問い・答えとも data のまま", s52 && s52.q === D.r6m52.q && s52.a === D.r6m52.a, JSON.stringify(s52));
      const newKeys = Object.keys(after).filter(k => !(k in before));
      if (!(after.r6m60 && after.r6m60.correct === ((before.r6m60 || {}).correct || 0) + 1 && newKeys.every(k => k === "r6m60" || k === "r6m52"))) { statsOk = false; statsX = JSON.stringify({ newKeys, r6m60: after.r6m60 }); }
    }
    check("C1 一人: r6m60 が出るたびに (ア)〜(エ) の並べかえ・答えは入れかえ後の記号（中身）・解説の記号も入れかえ後", orders.length === 5 && c1bad.length === 0, c1bad[0]);
    check("C2 一人: 同じ問題を5回出すと並びが変わる（" + new Set(orders).size + " 通り）", new Set(orders).size >= 2, orders.join(" / "));
    check("C7 記録: 正解は元の id（r6m60）に付く・ほかの名前の記録は増えない", statsOk, statsX);
    // ===== C3 大問のリード文の型 =====
    const leadIds = ["r3y021", "r3y022", "r3y023"];
    const L3 = origChoices(D.r3y021.lead);
    const c3bad = [], leadOrders = [];
    for (let r = 0; r < 2; r++) {
      const seen = await soloRound(leadIds, "理科", r === 0 ? "C3_solo_lead" : null);
      const leads = new Set();
      leadIds.forEach(id => {
        const s = seen.find(x => x.id === id);
        const ch = s && readLines(s.lead, L3.stem);
        if (s) leads.add(s.lead);
        const wantA = ch && wantAnswer(D[id].a, L3.choices, ch);
        if (!(s && isPerm(ch, L3.choices) && s.q === D[id].q && s.a === wantA)) c3bad.push(JSON.stringify({ r, id, s, wantA }));
      });
      if (leads.size !== 1) c3bad.push("リード文が小問ごとにちがう: " + Array.from(leads).join(" ## "));
      leadOrders.push(Array.from(leads)[0]);
    }
    check("C3 一人: リード文の選択肢が入れかわり（3つの小問で同じ並び）、答えは入れかえ後の記号・記号の順・中身つき", c3bad.length === 0, c3bad[0]);
    // ===== C4 答えが2つ =====
    {
      const seen = await soloRound(["r4k301"], "理科", "C4_solo_multi");
      const s = seen.find(x => x.id === "r4k301");
      const o = origChoices(D.r4k301.q);
      const ch = s && readLines(s.q, o.stem);
      const wantA = ch && wantAnswer(D.r4k301.a, o.choices, ch);
      check("C4 一人: 答えが2つ（r4k301「" + D.r4k301.a + "」）も入れかえ後の記号・記号の順・中身つき", s && isPerm(ch, o.choices) && s.a === wantA && /^.（.+）・.（.+）$/.test(s.a), JSON.stringify({ s, wantA }));
    }
    // ===== C5 地図の記号（社会の大問 g6d108） =====
    {
      const seen = await soloRound(["g6d108"], "社会", null);
      const s = seen.find(x => x.id === "g6d108");
      check("C5 地図の記号の問題 g6d108 は、問い・答えとも data のまま", s && s.q === D.g6d108.q && s.a === D.g6d108.a, JSON.stringify(s));
    }
    // ===== C6 二人 =====
    const bIds = ["r6m60"].concat(leadIds);
    for (const p of [host.page, guest.page]) { await p.evaluate(SEED, [MIG, bIds, "理科"]); await p.reload(); await p.waitForTimeout(800); }
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    const bs = {};
    const one = pg2 => pg2.evaluate(() => ({ q: document.getElementById("battle-q").textContent, a: document.getElementById("battle-a").textContent,
      lead: ((document.querySelector("#battle-daimon .daimon-lead-text") || {}).textContent) || "", sol: document.getElementById("battle-sol").textContent }));
    for (let k = 0; k < bIds.length; k++) {
      await waitVis(host.page, "#advance-btn", 30000);
      const id = await host.page.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
      await tap(host.page, "#advance-btn");
      await guest.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 });
      await host.page.waitForTimeout(300);
      bs[id] = { h: await one(host.page), g: await one(guest.page) };
      if (id === "r6m60") { await shot(host.page, "C6_host"); await shot(guest.page, "C6_guest"); }
      await waitVis(guest.page, "#answer-reveal-btn", 20000).catch(() => {}); await tap(guest.page, "#answer-reveal-btn").catch(() => {});
      await waitVis(guest.page, "#judge-row", 15000); await tap(guest.page, "#judge-ok");
      await waitVis(host.page, "#judge-row", 15000); await tap(host.page, "#judge-ok");
      if (k < bIds.length - 1) { await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 }); await tap(host.page, "#next-btn"); }
    }
    const b60 = bs.r6m60, ch60 = b60 && readLines(b60.h.q, r60.stem);
    const bLead = leadIds.map(id => bs[id]);
    const chL = bLead[0] && readLines(bLead[0].h.lead, L3.stem);
    check("C6 二人: r6m60 の並び・答え・解説がホストとゲストで同じ（並べかえ・記号が合う）",
      b60 && isPerm(ch60, r60.choices) && b60.g.q === b60.h.q && b60.h.a === wantAnswer(D.r6m60.a, r60.choices, ch60) && b60.g.a === b60.h.a && b60.g.sol === b60.h.sol, JSON.stringify(b60));
    check("C6 二人: リード文の大問（3つの小問）も、ホストとゲストで同じ並び・同じ答え",
      bLead.every(Boolean) && isPerm(chL, L3.choices) && bLead.every((x, i) => x.h.lead === bLead[0].h.lead && x.g.lead === x.h.lead && x.g.a === x.h.a && x.h.a === wantAnswer(D[leadIds[i]].a, L3.choices, chL)), JSON.stringify(bLead));
    check("E 画面のエラー 0", solo.errs.length + host.errs.length + guest.errs.length === 0, [].concat(solo.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x && !c.ok ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
