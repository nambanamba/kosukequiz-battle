// ★2026-10-04 社会の大問が入ったので、この検査は理科の大問だけを見る（DAIMON_DATA を subj で絞る）
// 大問の不具合2件（2026-10-03・ユーザー）。本物の Chrome・390x844・まねごとの待ち合わせ先（trystero は本物）
//   1) 「大問：第6回 基本問題 大問3（小問13）（図4）は… まだ正解していない（答える小問 13問・前回○ 0問）— 図がなくないですか？」
//      → この文言が出るのは「問題一覧」の大問の行。そこに図が1枚も出ていなかった
//   2) 「大問で時間切れになると、またでるよ、ってならなくて、わかったと同じ扱いになる」
//      → 対戦で小問の考える時間が切れると doAdvance（＝わかった！）になり、判定の時間切れの自動〇で○が付いていた
// 使い方: node tools/mikaku/daimon_fix1003_probe.mjs   スクショは tools/mikaku/shots_daimon_fix1003/（コミットしない）
// 見ること:
//   L1 問題一覧の 第6回 基本問題 大問3 の行に、大問の図（r6k_3.jpg）が出て、読み込めている
//   L2 図を押すと画面いっぱいに開く
//   L3 図を持つ大問の行には、全部その図が出る（第3・4・6回）。答えの図（aFile）は出さない
//   ★2026-10-03 夜 ユーザー「時間切れはスキップして答えも出さずにあとで出し直しじゃないんでしたっけ？」→ 一問一答の時間切れと同じ扱いに
//   T1 対戦で小問の考える時間が切れても、その場では記録が付かない
//   T2 ホスト・ゲストに「時間切れ…あとでもう一度出てきます」。答えは見せない
//   T5 次の小問の画面で、後ろに回った小問は答えを出さない（前の小問の欄に「あとでもう一度出ます」）
//   T3 出し直しは同じ大問の残りの小問のあと（大問がばらけない）。ゲストも同じ並び
//   T4 出し直しで答えたときに、ふつうに1回だけ記録が付く
// 2026-10-10 追記: 「わかった！」をなくし、二人の考える時間の時間切れで後ろへ回る動きもなくした。T1〜T5 は
//   「切れても何も起きない（記録なし・同じ小問のまま・答えは開かない・並びは変わらない）→ ゲストの〇でホストに1回だけ記録」に変えた
//   （直す前の 6a35823 は時間切れで後ろへ回すので、これらが鳴る）
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_daimon_fix1003"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "6a35823";   // 直す前＝時間切れを✕で記録していた版（図の直しは入っている）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "daimonfix" });
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
// 対戦用: 第6回 基本問題 大問3 だけが「答える」状態。ほかの理科は全部おぼえ済み
const SEED = (mig) => {
  const now = Date.now();
  const g = DAIMON_DATA.filter(g => g.subj !== "社会").find(g => g.key === "r6_基本問題_3");
  if (!g) return { err: "r6_基本問題_3 がありません" };
  const units = [...new Set(QA_DATA.filter(d => d.subj === "理科").map(d => d.u))];
  const known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 };
  const st = {};
  QA_DATA.forEach(d => { if (d.subj === "理科" && d.kind !== "daimon") st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.filter(g => g.subj !== "社会").forEach(h => { if (h !== g) h.items.forEach(it => { st[it.id] = Object.assign({}, known); }); });
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({
    subject: "理科", unitsBySubject: { "理科": units }, units: units, count: g.items.length, shuffle: false, tiers: [0],
    filterUnmastered: false, filterWeak: false, fairMode: false, reviewAllUnits: true,
    headStartSec: 1, answerTimeSec: 1, judgeTimeSec: 1, nextTimeSec: 600, skipNextTimeSec: 600 }));
  return { ids: g.items.map(i => i.id) };
};

async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
    await page.goto(PAGE_URL); await page.waitForTimeout(500);
    return { ctx, page, errs };
  };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const shot = (pg, n, full) => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: full !== false }).catch(() => {});
  const a = await mk(), host = await mk(), guest = await mk();
  try {
    // ===== 1) 問題一覧 =====
    const pg = a.page;
    await pg.evaluate(mig => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig)); localStorage.setItem("kq_battle_daimon_merged_v1", "1"); }, MIG);
    await pg.reload(); await pg.waitForTimeout(800);
    await tap(pg, "#subject-science"); await pg.waitForTimeout(300);
    await tap(pg, "#list-btn"); await pg.waitForTimeout(800);
    await pg.click('#list-kind-row .toggle[data-list-kind="daimon"]').catch(() => {}); await pg.waitForTimeout(300);
    // 一覧は「単元か絞りこみを選んでください」から始まるので、状態「まだ正解していない」を選ぶ（記録なし＝全部ここ）
    await pg.$eval('.list-filter-toggle[data-tier="0"]', e => e.click()); await pg.waitForTimeout(1500);
    await pg.waitForFunction(() => !!document.querySelector('#list-items [data-daimon-key="r6_基本問題_3"]'), null, { timeout: 15000 });
    const row = await pg.evaluate(() => {
      const r = document.querySelector('#list-items [data-daimon-key="r6_基本問題_3"]');
      r.scrollIntoView({ block: "start" });
      const im = r.querySelector(":scope > .list-img-wrap img");
      return { text: r.querySelector(".daimon-list-tiers").textContent, src: im ? im.getAttribute("src") : null };
    });
    await pg.waitForTimeout(800);
    const loaded = await pg.evaluate(() => { const im = document.querySelector('#list-items [data-daimon-key="r6_基本問題_3"] > .list-img-wrap img'); return !!(im && im.complete && im.naturalWidth > 0); });
    check("L1 一覧の 第6回 基本問題 大問3 の行に図 r6k_3.jpg が出て読み込めている（行: " + row.text + "）", row.src === "images/r6k_3.jpg" && loaded, row.src);
    await shot(pg, "L1_list_r6k3", false);
    if (row.src) {
      await pg.$eval('#list-items [data-daimon-key="r6_基本問題_3"] > .list-img-wrap img', e => e.click()); await pg.waitForTimeout(300);
      const lb = await pg.evaluate(() => ({ show: document.getElementById("lightbox-overlay").classList.contains("show"), src: document.getElementById("lightbox-img").getAttribute("src") || "" }));
      check("L2 図を押すと画面いっぱいに開く", lb.show && /r6k_3\.jpg$/.test(lb.src), JSON.stringify(lb));
      await pg.$eval("#lightbox-close", e => e.click()).catch(() => {}); await pg.waitForTimeout(200);
    } else check("L2 図を押すと画面いっぱいに開く", false, "図が無い");
    const all = await pg.evaluate(() => {
      // 一覧は少しずつ描くので、全部描けてから数える
      const want = DAIMON_DATA.filter(g => g.subj !== "社会").filter(g => !g.paper && g.file).map(g => g.key);
      const miss = [], aImg = [];
      for (const k of want) { const r = document.querySelector('#list-items [data-daimon-key="' + k + '"]'); if (!r) { miss.push(k + "(行なし)"); continue; }
        const g = DAIMON_DATA.filter(g => g.subj !== "社会").find(x => x.key === k);
        const srcs = [...r.querySelectorAll(".list-img-wrap img")].map(i => i.getAttribute("src"));
        if (!srcs.includes("images/" + g.file)) miss.push(k);
        g.items.forEach(it => { if (it.aFile && srcs.includes("images/" + it.aFile)) aImg.push(it.id); }); }
      return { n: want.length, miss, aImg };
    });
    check("L3 図を持つ大問 " + all.n + " 題の行に全部図が出る・答えの図は出ない", all.miss.length === 0 && all.aImg.length === 0, JSON.stringify(all));

    // ===== L4: 消えた小問（2026-10-03 その3 で42個）の記録が端末に残っていても壊れない =====
    await pg.evaluate(mig => {
      const old = { correct: 1, wrong: 1, box: 0, lastAnswered: Date.now() - 864e5 };
      localStorage.setItem("kq_battle_stats_v1", JSON.stringify({ r4k102: old, r4r410: old, r6k313: old, r6r504: old }));
    }, MIG);
    await pg.reload(); await pg.waitForTimeout(800);
    await tap(pg, "#subject-science"); await pg.waitForTimeout(300);
    await tap(pg, "#list-btn"); await pg.waitForTimeout(500);
    await pg.click('#list-kind-row .toggle[data-list-kind="daimon"]').catch(() => {}); await pg.waitForTimeout(300);
    await pg.$eval('.list-filter-toggle[data-tier="0"]', e => e.click()); await pg.waitForTimeout(1200);
    await pg.$eval("#list-back", e => e.click()).catch(() => {}); await pg.waitForTimeout(300);
    await pg.$eval("#export-link", e => e.click()).catch(() => {}); await pg.waitForTimeout(500);
    await pg.$eval("#daimon-open-btn", e => e.click()).catch(() => {}); await pg.waitForTimeout(500);
    const l4 = await pg.evaluate(() => ({ scr: (document.querySelector(".screen.active") || {}).id, rows: document.querySelectorAll("#daimon-list-body .daimon-row").length }));
    check("L4 消えた小問の記録が残っていても、ホーム・一覧・書き出し・大問の一覧でエラーが出ない（" + l4.rows + "題）", a.errs.length === 0 && l4.scr === "screen-daimon-list" && l4.rows > 0, a.errs.join(" | ") + " " + JSON.stringify(l4));

    // ===== 2) 対戦の時間切れ =====
    const S = await host.page.evaluate(SEED, MIG);
    if (S.err) throw new Error(S.err);
    await guest.page.evaluate(mig => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig)); localStorage.setItem("kq_battle_daimon_merged_v1", "1"); }, MIG);
    await host.page.reload(); await guest.page.reload(); await host.page.waitForTimeout(800); await guest.page.waitForTimeout(600);
    await tap(host.page, "#create-btn");
    await host.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await host.page.$eval("#room-code-display", e => e.textContent);
    await tap(guest.page, "#go-join"); await guest.page.fill("#join-code-input", code); await tap(guest.page, "#join-btn");
    await waitVis(host.page, "#start-together-btn", 60000);
    await tap(host.page, "#start-together-btn"); await tap(guest.page, "#join-start-together-btn");
    // ★2026-10-10 「わかった！」と二人の時間切れ（後ろへ回る）はなくした。問題は両方に同時に出て、考える時間が切れても何も起きない
    await waitVis(host.page, "#skip-btn", 30000);
    const first = await host.page.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
    // ホストは何も押さない（考える時間 1秒×2 が切れるのを待つ）
    await host.page.waitForTimeout(9000);
    const statOf = (pg, id) => pg.evaluate(i => (JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"))[i] || null, id);
    const hs = await statOf(host.page, first), gs = await statOf(guest.page, first);
    check("T1 小問 " + first + " の考える時間が切れても、記録は付かない（ホスト・ゲストとも）", hs === null && gs === null, JSON.stringify(hs) + " / " + JSON.stringify(gs));
    const hView = await host.page.evaluate(() => ({ msg: (() => { const e = document.getElementById("skip-encourage"); return e && getComputedStyle(e).display !== "none" ? e.textContent : ""; })(),
      aShown: document.getElementById("battle-a-block").classList.contains("show"), id: document.getElementById("battle-q-id").textContent.replace(/^No\./, ""),
      skipVis: getComputedStyle(document.getElementById("skip-btn")).display !== "none" }));
    const gText = await guest.page.evaluate(() => document.getElementById("screen-battle").innerText);
    check("T2 切れても「時間切れ」は出ない・後ろに回らない（同じ小問のまま）・ホストの答えは開かない・スキップは残る／ゲストにも時間切れの知らせは出ない",
      !/時間切れ/.test(hView.msg) && hView.id === first && !hView.aShown && hView.skipVis && !/相手が時間切れ/.test(gText),
      JSON.stringify(hView) + " ／ ゲスト: " + ((gText.match(/[^\n]*時間切れ[^\n]*/) || [""])[0]));
    await shot(host.page, "T2_host_timeup"); await shot(guest.page, "T2_guest_timeup");
    // 残りを全部まわす（ゲストの〇で進める）。出た順を両方で記録する
    const seqH = [], seqG = [];
    const ans0 = await host.page.evaluate(id => { for (const g of DAIMON_DATA) for (const it of g.items) if (it.id === id) return it.a; return ""; }, first);
    let leak = null, prev = null;
    for (let k = 0; k < S.ids.length + 2; k++) {
      const ok = await host.page.waitForFunction(p => { const e = document.getElementById("skip-btn"); return document.getElementById("battle-q-id").textContent !== "No." + p && !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, prev, { timeout: 15000 }).then(() => true, () => false);
      if (!ok) break;
      const id = await host.page.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
      seqH.push(id); prev = id;
      await guest.page.waitForFunction(i => (document.getElementById("battle-q-id").textContent || "") === "No." + i
        && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 });
      seqG.push(id);
      if (k === 1) {
        // T5: 時間切れで後ろへ回さないので、前の小問の欄に「あとでもう一度出ます」は出ない（両方）
        const look = async pg => pg.evaluate(() => { const b = document.getElementById("battle-daimon"); return { later: !!b.querySelector(".daimon-later"), html: b.innerHTML }; });
        const lh = await look(host.page), lg = await look(guest.page);
        leak = { host: !lh.later, guest: !lg.later };
        await shot(host.page, "T5_host_next"); await shot(guest.page, "T5_guest_next");
      }
      await waitVis(guest.page, "#judge-row", 30000); await tap(guest.page, "#judge-ok");
      await host.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 });
      await tap(host.page, "#next-btn"); await host.page.waitForTimeout(400);
      if (await host.page.evaluate(() => document.getElementById("screen-result").classList.contains("active"))) break;
    }
    check("T5 次の小問の画面で、前の小問の欄に「あとでもう一度出ます」は出ない（切れても後ろへ回らないので・ホスト・ゲスト）", !!leak && leak.host && leak.guest, JSON.stringify(leak));
    const want = S.ids.slice();
    check("T3 時間切れで並びは変わらない（並び: " + seqH.join(" ") + "）", JSON.stringify(seqH) === JSON.stringify(want), "期待 " + want.join(" "));
    check("T3 ゲストも同じ並びで出る", JSON.stringify(seqG) === JSON.stringify(want), seqG.join(" "));
    const hs2 = await statOf(host.page, first), gs2 = await statOf(guest.page, first);
    check("T4 ゲストの〇で、ホストにふつうに1回だけ記録が付く（ホスト〇1・ゲストの端末には記録なし）", hs2 && hs2.correct === 1 && (hs2.wrong || 0) === 0 && !(gs2 && (gs2.correct || gs2.wrong)), JSON.stringify(hs2) + " / " + JSON.stringify(gs2));
    check("画面のエラー 0", a.errs.length + host.errs.length + guest.errs.length === 0, [].concat(a.errs, host.errs, guest.errs).join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
  finally { await a.ctx.close(); await host.ctx.close(); await guest.ctx.close(); }
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
