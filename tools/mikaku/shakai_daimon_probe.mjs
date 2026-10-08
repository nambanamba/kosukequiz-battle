// 社会の大問（2026-10-04・ユーザー承認「社会の大問形式を入れます」）。本物の Chrome・390x844・まねごとの待ち合わせ先
// 使い方: node tools/mikaku/shakai_daimon_probe.mjs [社会の大問JSON]
//   ★daimon_data.js に本番の社会の大問（subj 社会）があればそれを使う。無いときだけ見本を使う
//   既定は見本 5年下/quiz_csv/大問_下書き/社会_大問_見本_第6回_練習問題1.json（id の「（案）」を外し、未作成の図は kai6_01.jpg で代用）
//   ★daimon_data.js の写しに社会の大問を足して配る（本物の daimon_data.js は書かない）。足し方は import_daimon.py と同じ
// 見ること:
//   S1 社会の単元えらびの「第6回.鎌倉時代」に大問の小問が数に入る（一問一答の数＋小問の数）。理科の数は変わらない
//   S2 一人: 社会の大問が出る（リード文・図・小問の見出し）。答えると前の小問が1行にたたまれ、「図を見る」がある。記録は小問の id に付く
//   S3 一覧: 社会・種類「大問」に社会の大問の行が出て、図が出る
//   S4 二人: 社会の大問の小問がホスト・ゲストに出て、判定でホストの記録が付く
//   S5 紙で出す: 社会の大問に紙の印を付けた写しで、社会のときだけ紙の一覧に出る（理科の紙の一覧には出ない）
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_shakai_daimon"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "e877b0b";
const SAMPLE = process.argv[2] || path.join(ROOT, "..", "..", "..", "5年下", "quiz_csv", "大問_下書き", "社会_大問_見本_第6回_練習問題1.json");
const SAMPLE2 = fs.existsSync(SAMPLE) ? SAMPLE : path.join(ROOT, "..", "5年下", "quiz_csv", "大問_下書き", "社会_大問_見本_第6回_練習問題1.json");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const DAIMON_SRC = fs.readFileSync(path.join(ROOT, "daimon_data.js"), "utf8");

// ★2026-10-04 本番の社会の大問が daimon_data.js に入ったら、それをそのまま使う（見本は使わない）
const DD = new Function(DAIMON_SRC.replace(/^const /gm, "var ") + "\nreturn {D: DAIMON_DATA, Z: DAIMON_IMG_SIZES};")();
const REAL = DD.D.filter(g => g.subj === "社会");
// 見本を import_daimon.py と同じ形にする（本番が無いときだけ）
const fixImg = n => (n && !fs.existsSync(path.join(ROOT, "images", n))) ? "kai6_01.jpg" : n;
const BOOK = "練習問題", KAI = 6;
function fromSample() {
  const src = JSON.parse(fs.readFileSync(SAMPLE2, "utf8"));
  return src.daimon.map(dm => {
    const g = { key: "g" + KAI + "_" + BOOK + "_" + dm.daimon, kai: KAI, book: BOOK, daimon: String(dm.daimon), lead: dm.lead || "", file: fixImg(dm.file || ""), subj: "社会", items: [] };
    for (const it of src.items.filter(x => String(x.daimon) === String(dm.daimon))) {
      const x = { id: String(it.id).replace("（案）", ""), label: it.label || "", q: it.q, a: it.a, form: it.form || "", file: fixImg(it.file || ""), aFile: it.aFile || "", sol: it.sol || "", note: it.note || "" };
      if (x.file && x.file === g.file) x.file = "";
      g.items.push(Object.fromEntries(Object.entries(x).filter(([, v]) => v !== "")));
    }
    return Object.fromEntries(Object.entries(g).filter(([, v]) => v !== ""));
  });
}
const groups = REAL.length ? REAL : fromSample();
const ITEM_IDS = groups.flatMap(g => g.items.map(i => i.id));
function patchedDaimon(paper) {
  const gs = paper ? groups.map(g => Object.assign({}, g, { paper: true, paperReason: "（検査用の印）" })) : groups;
  const base = DD.D.filter(g => g.subj !== "社会");
  const Z = Object.assign({ "kai6_01.jpg": [1189, 1858] }, DD.Z);
  return "const DAIMON_DATA = " + JSON.stringify(base.concat(gs)) + ";\nconst DAIMON_IMG_SIZES = " + JSON.stringify(Z) + ";\n";
}
const relay = await startFakeRelay({ broadcast: true, label: "shakaidaimon" });
let SERVED = CURRENT, SERVED_D = patchedDaimon(false);
function withFakeRelay(s) { const i0 = s.indexOf("const RELAY_URLS = ["), i1 = s.indexOf("];", i0); return s.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + s.slice(i1); }
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(withFakeRelay(SERVED), "utf8")); return; }
  if (rel === "daimon_data.js") { res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-store" }); res.end(Buffer.from(SERVED_D, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
// 社会 第6回の一問一答は全部おぼえ済み → 出るのは社会の大問だけ
const SEED = (arg) => {
  const [mig, ids] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 };
  const u = "第6回.鎌倉時代", st = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.u === u && d.kind !== "daimon") st[d.id] = Object.assign({}, known); });
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [u] }, units: [u], count: ids.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 1, answerTimeSec: 30, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600 }));
};

async function run(label, src) {
  SERVED = src; SERVED_D = patchedDaimon(false); const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(500); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: true }).catch(() => {});
  const statOf = (pg, id) => pg.evaluate(i => (JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"))[i] || null, id);
  const solo = await mk(), host = await mk(), guest = await mk();
  try {
    // ===== S1 単元の数 =====
    const pg = solo.page;
    await pg.evaluate(SEED, [MIG, ITEM_IDS]); await pg.reload(); await pg.waitForTimeout(900);
    await tap(pg, "#subject-social"); await pg.waitForTimeout(300);
    const u6 = await pg.evaluate(() => { const e = [...document.querySelectorAll("#unit-choices .choice")].find(x => x.textContent.includes("第6回.鎌倉時代")); return e ? e.textContent.replace(/\s+/g, " ") : ""; });
    const qa6 = await pg.evaluate(() => QA_DATA.filter(q => q.subj === "社会" && q.u === "第6回.鎌倉時代" && q.kind !== "daimon").length);
    check("S1 社会の 第6回.鎌倉時代 の数＝一問一答 " + qa6 + "＋小問 " + ITEM_IDS.length, u6.includes((qa6 + ITEM_IDS.length) + "問"), u6);
    await shot(pg, "S1_units");
    // ===== S2 一人 =====
    await tap(pg, "#solo-start-btn"); await pg.waitForTimeout(600);
    const first = await pg.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, "")).catch(() => "");
    const blk = await pg.evaluate(() => { const b = document.getElementById("solo-daimon"); return b ? { shown: getComputedStyle(b).display !== "none", title: (b.querySelector(".battle-daimon-title") || {}).textContent || "", img: !!b.querySelector(".daimon-fig img"), fig: !!b.querySelector(".daimon-fig-btn") } : null; });
    check("S2 一人: 社会の大問の1つめの小問 " + ITEM_IDS[0] + " が大問の形で出る（" + (blk && blk.title) + "）", first === ITEM_IDS[0] && blk && blk.shown && /大問/.test(blk.title) && blk.img && blk.fig, first + " " + JSON.stringify(blk));
    await shot(pg, "S2_solo_first");
    await tap(pg, "#solo-reveal-btn"); await pg.waitForTimeout(150); await waitVis(pg, "#solo-judge-ok", 5000); await tap(pg, "#solo-judge-ok"); await pg.waitForTimeout(400);
    const second = await pg.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, "")).catch(() => "");
    const folds = await pg.evaluate(() => document.querySelectorAll("#solo-daimon .daimon-fold").length);
    const st1 = await statOf(pg, ITEM_IDS[0]);
    check("S2 答えると次の小問・前の小問は1行にたたまれ、記録は小問の id に付く", second === ITEM_IDS[1] && folds === 1 && st1 && st1.correct === 1, second + " folds=" + folds + " " + JSON.stringify(st1));
    await shot(pg, "S2_solo_second");
    // ===== S3 一覧 =====
    await pg.reload(); await pg.waitForTimeout(800);
    await tap(pg, "#subject-social"); await pg.waitForTimeout(300);
    await tap(pg, "#list-btn"); await pg.waitForTimeout(500);
    await pg.click('#list-kind-row .toggle[data-list-kind="daimon"]').catch(() => {}); await pg.waitForTimeout(300);
    await pg.$eval('.list-filter-toggle[data-tier="0"]', e => e.click()); await pg.waitForTimeout(1200);
    const row = await pg.evaluate(k => { const r = document.querySelector('#list-items [data-daimon-key="' + k + '"]'); return r ? { img: !!r.querySelector(".list-img-wrap img"), subs: r.querySelectorAll(".daimon-sub").length } : null; }, groups[0].key);
    check("S3 一覧（社会・大問）に社会の大問の行が出て、図と小問の行がある", row && row.img && row.subs === groups[0].items.length, JSON.stringify(row));
    await shot(pg, "S3_list");
    // ===== S4 二人 =====
    await host.page.evaluate(SEED, [MIG, ITEM_IDS]); await guest.page.evaluate(SEED, [MIG, ITEM_IDS]);
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
    const gb = await guest.page.evaluate(() => { const b = document.getElementById("battle-daimon"); return !!b && getComputedStyle(b).display !== "none" && /大問/.test(b.textContent); });
    await shot(guest.page, "S4_guest"); await shot(host.page, "S4_host");
    // ★2026-10-08 二人のときのホストの答えはゲストの〇✕で開く（ホストの「こたえを見る」は無い）
    await tap(guest.page, "#answer-reveal-btn");
    await waitVis(guest.page, "#judge-row", 30000); await tap(guest.page, "#judge-ok");
    await waitVis(host.page, "#judge-row", 30000); await tap(host.page, "#judge-ok");
    await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
    const hs = await statOf(host.page, b1);
    check("S4 二人: 社会の大問の小問 " + b1 + " がホスト・ゲストに大問の形で出て、ホストの記録が付く", b1 === ITEM_IDS[0] && gb && hs && hs.correct === 1, b1 + " guest=" + gb + " " + JSON.stringify(hs));
    // ===== S6 二人: 社会の大問の小問で時間切れ → 答えを見せず・記録せず・あとで出し直す =====
    await tap(host.page, "#next-btn");
    await waitVis(host.page, "#advance-btn", 30000);
    const t1 = await host.page.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
    await host.page.waitForTimeout(5000);   // 考える時間 1秒×2 が切れる
    const tmsg = await host.page.evaluate(() => { const e = document.getElementById("skip-encourage"); return e && getComputedStyle(e).display !== "none" ? e.textContent : ""; });
    const tst = await statOf(host.page, t1);
    if (await host.page.evaluate(() => getComputedStyle(document.getElementById("skip-continue-btn")).display !== "none")) { await tap(host.page, "#skip-continue-btn"); await host.page.waitForTimeout(800); }
    await waitVis(host.page, "#advance-btn", 15000).catch(() => {});
    const t2 = await host.page.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
    await tap(host.page, "#advance-btn").catch(() => {});
    await guest.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i, t2, { timeout: 20000 }).catch(() => {});
    const later = await guest.page.evaluate(() => !!document.querySelector("#battle-daimon .daimon-later"));
    await shot(guest.page, "S6_guest_after_timeup");
    check("S6 社会の小問 " + t1 + " の時間切れ: 「あとでもう一度」・記録なし・次は " + t2 + "・ゲストの前の小問の欄に「あとでもう一度出ます」",
      t1 === ITEM_IDS[1] && /あとでもう一度/.test(tmsg) && tst === null && t2 === ITEM_IDS[2] && later, JSON.stringify({ tmsg, tst, t2, later }));
    // ===== S5 紙で出す =====
    SERVED_D = patchedDaimon(true);
    await pg.reload(); await pg.waitForTimeout(900);
    await tap(pg, "#subject-social"); await pg.waitForTimeout(300);
    const btnS = await pg.evaluate(() => getComputedStyle(document.getElementById("paper-open-btn")).display !== "none");
    let keysS = [];
    if (btnS) { await tap(pg, "#paper-open-btn"); await pg.waitForTimeout(400); keysS = await pg.evaluate(() => [...document.querySelectorAll("#paper-list-body .paper-row")].map(e => e.dataset.key)); await shot(pg, "S5_paper_shakai"); await tap(pg, "#paper-list-back"); await pg.waitForTimeout(300); }
    await tap(pg, "#subject-science"); await pg.waitForTimeout(300);
    await tap(pg, "#paper-open-btn"); await pg.waitForTimeout(400);
    const keysR = await pg.evaluate(() => [...document.querySelectorAll("#paper-list-body .paper-row")].map(e => e.dataset.key));
    check("S5 紙で出す: 社会のときは社会の紙の大問だけ・理科の紙の一覧には社会が出ない（社会 " + keysS.length + "・理科 " + keysR.length + "）",
      btnS && keysS.length === groups.length && keysS.every(k => /^g/.test(k)) && keysR.length > 0 && keysR.every(k => /^r/.test(k)), JSON.stringify({ keysS, nR: keysR.length }));
    check("画面のエラー 0", solo.errs.length + host.errs.length + guest.errs.length === 0, [].concat(solo.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await solo.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
console.log("社会の大問（検査用）: " + groups.map(g => g.key + "（小問" + g.items.length + "）").join(" ") + " ／ もと: " + (REAL.length ? "daimon_data.js（本番）" : path.basename(SAMPLE2)));
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
