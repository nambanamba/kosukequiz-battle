// ★2026-10-04 社会の大問が入ったので、この検査は理科の大問だけを見る（DAIMON_DATA を subj で絞る）
// 一覧の「大問の小問の行」で正誤を切り替えられるか（2026-10-02 ユーザー「理科の大問なんですが、一覧から正誤の切り替えができません」）
// 本物の Chrome・390px。★数は決め打ちしない（DAIMON_DATA / stats から数える）
// 見ること:
//   T1 小問の行がある（大問の行の中に、小問ごとの行と「定着」ボタン・＋－・日付がある）
//   T2 「定着」を押す→その小問の stats が一問一答と同じ形（box>=1・誤答0）になる／一覧の「◯問」が1減る
//   T3 ホームの総数・3段の合計が、stats から数えた「一問一答＋答える小問」と一致する
//   T4 「未実施」で記録が消える（元の数にもどる）／「正解数＋」「誤答数＋」も効く（adjustStat）
//   T5 他の小問の記録は変わらない・記録を大問の key には書かない・画面のエラー0
// 自己テスト（鳴るのが正しい）: (a) 小問の行のボタンを無視する ／(b) 描き直しで件数を更新しない ／(c) 記録を大問の key に書く
// 使い方: node tools/mikaku/list_daimon_toggle_probe.mjs [--only a|b|c|now]
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const lf = s => s.replace(/\r\n/g, "\n");
const CURRENT = lf(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"));
const cut = (src, needle, rep, what) => {
  const n = src.split(needle).length - 1;
  if (n !== 1) throw new Error("偽の実装を作れません（" + what + " が " + n + " 件）");
  return src.replace(needle, rep);
};
const FAKES = {
  a: ["小問の行のボタンを無視する", s => cut(s, '    const item = e.target.closest("[data-qid]");   // 一問一答の行、または大問の小問の行', '    const item = e.target.closest(".list-item[data-qid]");  /* ★偽の実装 */', "click 振り分け")],
  b: ["描き直しで件数を更新しない", s => cut(s, '    els["list-count"].textContent = sumWeight(listShownIndices)+"問";   // ★答える小問の数が変わるので件数も合わせる', "    /* ★偽の実装 */", "件数")],
  c: ["記録を大問の key に書く", s => cut(s, "    if(statusBtn){ setStatus(qid, statusBtn.dataset.status);", "    if(statusBtn){ setStatus(((DAIMON_ITEM.get(qid)||{}).g||{key:qid}).key, statusBtn.dataset.status);", "setStatus")]
};
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
let SERVED = CURRENT;
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(SERVED, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL0 = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const MIG_DONE = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };

async function run(label, src) {
  SERVED = src;
  const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(String(e)));
  p.on("dialog", d => d.accept().catch(() => {}));
  try {
    await p.goto(URL0); await p.waitForTimeout(400);
    // 仕込み: 一問一答に記録を少し、大問は記録なし（答える小問＝全部）
    const info = await p.evaluate(mig => {
      const now = Date.now(), st = {}; let k = 0;
      QA_DATA.forEach(q => { if (q.kind === "daimon") return; if (++k % 3 === 0) st[q.id] = { correct: 3, wrong: 0, box: 3, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }; });
      localStorage.clear();
      localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
      localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
      localStorage.setItem("kq_battle_daimon_merged_v1", "1");
      const g = DAIMON_DATA.filter(g => g.subj !== "社会").find(g => !g.paper && g.items.length >= 2);
      return { key: g.key, ids: g.items.map(i => i.id) };
    }, MIG_DONE);
    await p.reload(); await p.waitForTimeout(900);
    await p.click("#subject-science"); await p.waitForTimeout(300);
    const homeNums = () => p.evaluate(() => ["stat-total", "stat-stage1", "stat-stage2", "stat-stage3"].map(id => parseInt(document.getElementById(id).textContent, 10)));
    const expectTotal = () => p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("kq_battle_stats_v1"));
      const qa = QA_DATA.filter(d => d.subj === "理科" && d.kind !== "daimon" && d.kind !== "calc").length;
      const items = DAIMON_DATA.filter(g => g.subj !== "社会").filter(g => !g.paper).reduce((a, g) => a + g.items.filter(it => !((st[it.id] && st[it.id].box || 0) > 0)).length, 0);
      return qa + items;
    });
    const openList = async () => {
      await p.evaluate(() => document.getElementById("list-btn").click()); await p.waitForTimeout(400);
      await p.selectOption("#list-unit-select", "ALL").catch(() => {});
      await p.evaluate(() => document.getElementById("list-unit-select").dispatchEvent(new Event("change"))); await p.waitForTimeout(500);
      for (const t of [0, 1, 2]) { await p.click('#list-status-filters .list-filter-toggle[data-tier="' + t + '"]'); await p.waitForTimeout(100); }
      await p.click('#list-kind-row .toggle[data-list-kind="daimon"]'); await p.waitForTimeout(500);
      await p.waitForSelector('.daimon-list-item[data-daimon-key="' + info.key + '"]', { timeout: 8000 }).catch(() => {});
    };
    const listCount = () => p.evaluate(() => parseInt(document.getElementById("list-count").textContent, 10));
    const rec = id => p.evaluate(i => JSON.parse(localStorage.getItem("kq_battle_stats_v1"))[i] || null, id);
    const sub = id => '.daimon-sub[data-qid="' + id + '"]';

    const h0 = await homeNums(); const e0 = await expectTotal();
    check("T0 ホームの総数 ＝ 一問一答＋答える小問（切り替える前）", h0[0] === e0 && h0[1] + h0[2] + h0[3] === h0[0], h0.join(",") + " / " + e0);
    await openList();
    const c0 = await listCount();
    const hasSub = await p.evaluate(a => a.ids.every(id => { const r = document.querySelector('.daimon-sub[data-qid="' + id + '"]'); return r && r.querySelector(".status-btn.ok") && r.querySelector(".count-btn") && r.querySelector("[data-date-field]"); }), info);
    check("T1 大問の行の中に、小問ごとの行（定着ボタン・＋－・日付）がある（小問 " + info.ids.length + "）", hasSub);
    const [a, b] = info.ids;
    await p.click(sub(a) + " .status-btn.ok", { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(300);
    const ra = await rec(a);
    check("T2 「定着」を押すと、その小問の記録が一問一答と同じ形になる（box>=1・誤答0）", ra && ra.box >= 1 && !ra.wrong && !!ra.lastCorrectAt, JSON.stringify(ra));
    check("T2 一覧の「◯問」が1減る", (await listCount()) === c0 - 1, c0 + " → " + (await listCount()));
    check("T2 押した小問は「前回○」と出て、定着が選ばれている", await p.evaluate(x => { const r = document.querySelector('.daimon-sub[data-qid="' + x + '"]'); return !!r && r.textContent.includes("前回○") && r.querySelector(".status-btn.ok.active") != null; }, a));
    check("T5 ほかの小問は変わらない", (await rec(b)) === null);
    // ホーム
    await p.evaluate(() => document.querySelector("#screen-list .back, #list-back").click()); await p.waitForTimeout(400);
    const h1 = await homeNums(); const e1 = await expectTotal();
    check("T3 ホームの総数が1減り、stats から数えた数と一致し、3段の合計とも合う", h1[0] === h0[0] - 1 && h1[0] === e1 && h1[1] + h1[2] + h1[3] === h1[0], h1.join(",") + " / " + e1);
    await openList();
    check("T3 一覧を開き直した「◯問」も1減ったまま", (await listCount()) === c0 - 1, await listCount());
    // 未実施にもどす
    await p.click(sub(a) + " .status-btn.unseen", { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(300);
    check("T4 「未実施」で記録が消え、「◯問」が元にもどる", (await rec(a)) === null && (await listCount()) === c0, await listCount());
    // 誤答＋・正解＋
    await p.click(sub(b) + ' .count-btn[data-field="wrong"][data-delta="1"]', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(250);
    const rw = await rec(b);
    check("T4 「誤答数＋」が効く（誤答1・連続0）", rw && rw.wrong === 1 && !rw.box, JSON.stringify(rw));
    await p.click(sub(b) + ' .count-btn[data-field="correct"][data-delta="1"]', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(250);
    const rc = await rec(b);
    check("T4 「正解数＋」が効く（連続1・その小問が前回○で、「◯問」が1減る）", rc && rc.box === 1 && (await listCount()) === c0 - 1, JSON.stringify(rc));
    const keysNow = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("kq_battle_stats_v1"))).filter(k => DAIMON_DATA.filter(g => g.subj !== "社会").some(g => g.key === k)));
    check("T5 記録を大問の key には書いていない", keysNow.length === 0, keysNow.join(","));
    check("T5 画面のエラー0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("実行エラーなし", false, e.message); }
  await ctx.close();
  return { label, out, bad: out.filter(o => !o.ok) };
}

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
let fail = 0;
if (!only || only === "now") {
  const r = await run("いまの index.html", CURRENT);
  r.out.forEach(o => console.log((o.ok ? "  OK " : "  NG ") + o.name + (o.extra ? "  [" + o.extra + "]" : "")));
  console.log("本番: " + (r.out.length - r.bad.length) + "/" + r.out.length); fail += r.bad.length;
}
let rang = 0, sounded = 0;
for (const k of Object.keys(FAKES)) {
  if (only && only !== "now" && only !== k) continue;
  rang++;
  const r = await run(FAKES[k][0], FAKES[k][1](CURRENT));
  const rung = r.bad.length > 0; if (rung) sounded++;
  console.log("  自己テスト(" + k + ") " + FAKES[k][0] + ": " + (rung ? "鳴った " + r.bad.length + "件 OK" : "★鳴らなかった NG"));
  if (!rung) fail++;
}
if (rang) console.log("自己テスト: " + sounded + "/" + rang + " 鳴った");
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
