// 子どもの端末を別のスマホなどに移す（2026-10-12 依頼）。記録の置き場から記録を取り戻す・2台が上書きし合う事故の手当て
// 本物の Chrome・390x844・まねの GitHub API サーバ（本物の GitHub には触らない）。使い方: node tools/mikaku/restore_device_probe.mjs
// 材料は plan_pc_preview_probe と同じ（fixtures_pc_preview/）。端末A＝今のタブレット（記録あり）、端末B＝新しい端末（記録が空）
// 見ること:
//   D1 端末Aの snapshot に device・parts・manual が入る（header/rows の形は今までどおり）
//   D2 空の新端末Bは、起動しても置き場の snapshot を上書きしない
//   R1 Bで「記録を取り戻す」→ 記録（〇✕の回数）・正解した日・分けての部分が Aと同じ
//   R2 Bの今日やること 理科の行が選ぶ一覧・状態が、Aと同じ（order:weak の行）
//   K  記録のある端末で取り戻しても、回数・日・分けての部分が減らない（Bにだけある記録も残る）
//   O  ほかの端末が送った plan_pick を上書きするとき、画面に知らせる（送るのは止めない）／少ない snapshot で上書きしない
//   V  見るだけの端末では取り戻せない（記録は変わらない）
//   E  画面のエラー 0
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FX = path.join(ROOT, "tools", "mikaku", "fixtures_pc_preview");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const PLAN6 = JSON.parse(fs.readFileSync(path.join(FX, "plan_0006.json"), "utf8"));
const SNAP = JSON.parse(fs.readFileSync(path.join(FX, "snapshot_1012_r67.json"), "utf8"));
const SESS = JSON.parse(fs.readFileSync(path.join(FX, "session_1011_2100.json"), "utf8"));
const HOOK = "\nwindow.__t = { planSetOf, planRowPick, planTierLabel, get stats(){ return stats; }, get partStats(){ return partStats; } };\n";
const withHook = s => { const i = s.lastIndexOf("</script>"); return s.slice(0, i) + HOOK + s.slice(i); };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(Buffer.from(withHook(CURRENT), "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const TOKEN = "github_pat_TESTONLY_1234567890";
const FILES = { "plan/index.json": { sets: [6] }, "plan/0006.json": PLAN6 };
let written = new Map(), puts = [];
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version" };
const api = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const send = (st, o) => { res.writeHead(st, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify(o)); };
    const m = /^\/repos\/nambanamba\/kosuke-records\/contents\/([^?]*)/.exec(req.url);
    if (!m) return send(404, {});
    const p = decodeURIComponent(m[1]).replace(/\/+$/, "");
    if (req.headers.authorization !== "Bearer " + TOKEN) return send(401, { message: "Bad credentials" });
    if (req.method === "GET") {
      const w = written.get(p);
      if (w) return send(200, { sha: w.sha, content: Buffer.from(JSON.stringify(w.content), "utf8").toString("base64") });
      if (FILES[p]) return send(200, { sha: "x", content: Buffer.from(JSON.stringify(FILES[p]), "utf8").toString("base64") });
      // 一覧（ディレクトリ）
      const names = new Set();
      for (const k of written.keys()) if (k.startsWith(p + "/")) names.add(k.slice(p.length + 1).split("/")[0]);
      if (names.size) return send(200, [...names].map(n => ({ name: n })));
      return send(404, {});
    }
    if (req.method === "PUT") {
      const j = JSON.parse(b), w = written.get(p); if (w && j.sha !== w.sha) return send(409, {});
      const content = JSON.parse(Buffer.from(j.content, "base64").toString("utf8"));
      written.set(p, { sha: "s" + Math.random(), content }); puts.push(p); return send(w ? 200 : 201, { content: { sha: "s" } });
    }
    send(405, {});
  });
});
await new Promise(r => api.listen(0, "127.0.0.1", r));
const API_URL = "http://127.0.0.1:" + api.address().port;
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
function tabletStats() {
  const ts = ymd => ymd ? Date.parse(ymd + "T21:00:00+09:00") : 0;
  const st = {};
  for (const r of SNAP.rows) {
    if (!r.c && !r.w) continue;
    const o = { correct: r.c, wrong: r.w, box: r.box === "" ? 0 : r.box, lastAnswered: ts(r.la) };
    if (r.lc) o.lastCorrectAt = ts(r.lc);
    if (SNAP.correctDays[r.id]) o.correctDays = SNAP.correctDays[r.id];
    st[r.id] = o;
  }
  return st;
}
const SEED = (arg) => {
  const [mig, cfg, stats, parts, vonly] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
  if (vonly) localStorage.setItem("kq_battle_view_only_v1", "1");
  if (stats) localStorage.setItem("kq_battle_stats_v1", JSON.stringify(stats));
  if (parts) localStorage.setItem("kq_battle_parts_v1", JSON.stringify(parts));
};
async function open(ctx, stats, parts, vonly) {
  const pg = await ctx.newPage(); const errs = [], alerts = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => { alerts.push(d.message()); d.accept().catch(() => {}); });
  await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, stats, parts, vonly]); await pg.reload(); await pg.waitForTimeout(3500);
  return { pg, errs, alerts };
}
const snapOf = () => { const k = [...written.keys()].find(k => k.startsWith("battle/snapshot/")); return k ? written.get(k).content : null; };
// 端末の記録を丸ごと取り出す
const dump = pg => pg.evaluate(() => {
  const t = window.__t, st = {};
  Object.keys(t.stats).forEach(id => { const s = t.stats[id]; st[id] = [s.correct || 0, s.wrong || 0, s.box || 0, (s.correctDays || []).length, s.manualMastered ? 1 : 0]; });
  const parts = {}; Object.keys(t.partStats).forEach(id => { const s = t.partStats[id]; parts[id] = [s.correct || 0, s.wrong || 0, s.lastAnswered || 0]; });
  return { st, parts };
});
const picks = pg => pg.evaluate(() => {
  const t = window.__t, s = t.planSetOf(6);
  return s.items.map((it, i) => { const p = t.planRowPick(it, 6, i); return { order: it.order || "", ids: p.ids, tiers: p.ids.map(t.planTierLabel) }; });
});
const out = [], errs = [];
const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
const ctxs = [];
const ctx = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 } }); ctxs.push(c); return c; };
try {
  // ── A: 今のタブレット
  const A = await open(await ctx(), tabletStats(), SESS.parts, false);
  errs.push(...A.errs);
  const sA = snapOf();
  check("D1 端末Aの snapshot に device・parts・manual が入る（rows " + (sA && sA.rows.length) + "行）", sA && sA.device && Array.isArray(sA.parts) && sA.parts.length > 1 && Array.isArray(sA.manual) && Array.isArray(sA.header) && sA.header[0] === "ID", sA ? JSON.stringify({ d: sA.device, p: sA.parts && sA.parts.length }) : "snapshot なし");
  const pk = written.get("battle/plan_pick/0006.json");
  check("D1b plan_pick にも device が入る・端末Aと同じ", pk && sA && pk.content.device === sA.device, "");
  const dA = await dump(A.pg), pA = await picks(A.pg);
  const snapJson = JSON.stringify(sA);
  // ── B: 新しい端末（記録なし・鍵あり・見るだけでない）
  const B = await open(await ctx(), null, null, false);
  errs.push(...B.errs);
  check("D2 空の新端末Bは、起動しても置き場の snapshot を上書きしない", JSON.stringify(snapOf()) === snapJson, "");
  const before = await dump(B.pg);
  check("R0 Bは最初、記録が空", Object.keys(before.st).length === 0, Object.keys(before.st).length);
  await B.pg.evaluate(() => { document.getElementById("send-restore-btn").click(); });
  await B.pg.waitForTimeout(2500);
  const dB = await dump(B.pg), pB = await picks(B.pg);
  const sameSt = JSON.stringify(Object.keys(dA.st).sort().map(k => [k, dA.st[k]])) === JSON.stringify(Object.keys(dB.st).sort().map(k => [k, dB.st[k]]));
  const diffSt = Object.keys(dA.st).filter(k => JSON.stringify(dA.st[k]) !== JSON.stringify(dB.st[k])).slice(0, 4).map(k => k + " A" + JSON.stringify(dA.st[k]) + " B" + JSON.stringify(dB.st[k]));
  check("R1 Bで取り戻す→ 記録（回数・箱・正解した日の数）がAと同じ（" + Object.keys(dB.st).length + "問）", sameSt, diffSt.join(" / "));
  check("R1b 分けての部分の記録がAと同じ（" + Object.keys(dB.parts).length + "部分）", Object.keys(dA.parts).length > 0 && JSON.stringify(dA.parts) === JSON.stringify(dB.parts), "A" + Object.keys(dA.parts).length + " B" + Object.keys(dB.parts).length);
  const weakIdx = pA.map((p, i) => p.order === "weak" ? i : -1).filter(i => i >= 0);
  const pickSame = weakIdx.length > 0 && weakIdx.every(i => JSON.stringify(pA[i]) === JSON.stringify(pB[i]));
  check("R2 Bの今日やること（order:weak の " + weakIdx.length + " 行）が選ぶ一覧・状態がAと同じ", pickSame, weakIdx.filter(i => JSON.stringify(pA[i]) !== JSON.stringify(pB[i])).map(i => i + ":A" + pA[i].ids.slice(0, 4) + " B" + pB[i].ids.slice(0, 4)).join(" / "));
  check("R3 戻した件数を画面に出す", B.alerts.some(a => /取り戻しました/.test(a) && /問/.test(a)), B.alerts.join(" || ").slice(0, 200));
  errs.push(...B.errs);
  // ── K: 記録のある端末（Aより進んでいる記録と、Aに無い記録）
  const rich = tabletStats(); const ids = Object.keys(rich);
  rich[ids[0]] = Object.assign({}, rich[ids[0]], { correct: rich[ids[0]].correct + 5, wrong: rich[ids[0]].wrong + 3, correctDays: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-12"], manualMastered: 1 });
  rich["zz_only_here"] = { correct: 2, wrong: 1, box: 1, lastAnswered: Date.now() };
  const richParts = Object.assign({}, SESS.parts); const pid = Object.keys(richParts)[0];
  if (pid) richParts[pid] = Object.assign({}, richParts[pid], { correct: (richParts[pid].correct || 0) + 9, lastAnswered: Date.now() });
  const K = await open(await ctx(), rich, richParts, false);
  const kb = await dump(K.pg);
  await K.pg.evaluate(() => { document.getElementById("send-restore-btn").click(); });
  await K.pg.waitForTimeout(2500);
  const ka = await dump(K.pg);
  const shrunk = Object.keys(kb.st).filter(k => !ka.st[k] || ka.st[k][0] < kb.st[k][0] || ka.st[k][1] < kb.st[k][1] || ka.st[k][3] < kb.st[k][3] || ka.st[k][4] < kb.st[k][4]);
  const partShrunk = Object.keys(kb.parts).filter(k => !ka.parts[k] || ka.parts[k][0] < kb.parts[k][0]);
  check("K1 記録のある端末で取り戻しても、回数・正解した日・手で定着が減らない（" + Object.keys(kb.st).length + "→" + Object.keys(ka.st).length + "問）", shrunk.length === 0 && Object.keys(ka.st).length >= Object.keys(kb.st).length, shrunk.slice(0, 3).join(","));
  check("K2 その端末にだけある記録（zz_only_here）も残る", !!ka.st["zz_only_here"], "");
  check("K3 分けての部分も減らない", partShrunk.length === 0, partShrunk.join(","));
  errs.push(...K.errs);
  // ── O: ほかの端末が送ったものを上書きするとき知らせる／少ない snapshot で上書きしない
  const snapBeforeO = JSON.stringify(snapOf());
  const O = await open(await ctx(), Object.fromEntries(Object.entries(tabletStats()).slice(0, 3)), null, false);
  await O.pg.waitForTimeout(1500);
  const warn = await O.pg.evaluate(() => { const e = document.getElementById("send-other-warn"); return { shown: e.style.display !== "none", t: e.textContent }; });
  check("O1 ほかの端末が送った plan_pick/snapshot を上書きしそうなとき、画面で知らせる", warn.shown && /ほかの端末/.test(warn.t), warn.t.slice(0, 80));
  check("O2 少ない記録の端末は、記録の多い snapshot を上書きしない", JSON.stringify(snapOf()) === snapBeforeO, "");
  check("O3 plan_pick の送りは止めない（上書きした）", written.get("battle/plan_pick/0006.json") && written.get("battle/plan_pick/0006.json").content.device !== sA.device, "");
  errs.push(...O.errs);
  // ── V: 見るだけでは取り戻せない
  const V = await open(await ctx(), null, null, true);
  await V.pg.evaluate(() => { document.getElementById("send-restore-btn").click(); });
  await V.pg.waitForTimeout(800);
  const vd = await dump(V.pg);
  check("V 見るだけの端末では取り戻せない（記録は空のまま）", Object.keys(vd.st).length === 0 && V.alerts.some(a => /見るだけ/.test(a)), V.alerts.join("|").slice(0, 100));
  errs.push(...V.errs);
  check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" ")); }
for (const c of ctxs) await c.close().catch(() => {});
let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; }
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await browser.close(); server.close(); api.close(); process.exit(ng ? 1 : 0);
