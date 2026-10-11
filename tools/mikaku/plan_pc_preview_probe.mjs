// PC（記録が無い・PAT で GitHub を読む）の「中身を見る」と、タブレット（こうすけ君の端末）で実際に出る問題（2026-10-12 依頼）
// 本物の Chrome・390x844・まねの GitHub API サーバ（本物の GitHub には触らない）。使い方: node tools/mikaku/plan_pc_preview_probe.mjs
// 材料（kosuke-records を読むだけで写したもの。fixtures_pc_preview/）:
//   plan_0006.json … 本物のセット6（10-12 朝の理科「第7回の苦手・まだの問題から15問」）
//   snapshot_1012_r67.json … battle/snapshot/2026-10-12.json（10-11 21:58）の r6・r7 の行（カードの記録）
//   session_1011_2100.json … battle/session/2026-10-11/s1791720013842.json の分けての部分の記録（parts）
//   ★タブレットは 10-12 07:09 に二人でこの行を始め、1問目から r7m01 → r7m05 → r7m14（分けての①②）と出ている（battle/session/2026-10-12/s1791756569005.json）
// 見ること:
//   R0 タブレットを記録で作り直すと、始めた並びの頭が記録と同じ（r7m01 r7m05 r7m14~1）＝作り直しが本物と合っている
//   R1 ★再現: PC の「中身を見る」の一覧が、タブレットで実際に出る問題と違う（直す前もいまも、PC 自身の記録で選ぶ）
//   R2 ★再現: PC の一覧の「苦手／まだ／…」は PC の記録（空）で「まだ」ばかり
//   N  直したあと: タブレットが送った一覧（battle/plan_pick/0006.json）を、見るだけの PC が読み、その一覧と状態で出す
//        N1 タブレットは今日やることを出したとき、行ごとの一覧を送る（中身は始めたときと同じ）
//        N2 見るだけの PC の「中身を見る」の一覧＝タブレットで始めた問題・同じ順番、状態もタブレットの記録
//        N3 PC の子ども向けの行の数（◯問）もタブレットと同じ
//        N4 同じ一覧なら送り直さない（開くたびに書かない）
//        N5 タブレットの今日やることの選び方・始め方は何も変わらない（送るだけ）
//   E  画面のエラー 0
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FX = path.join(ROOT, "tools", "mikaku", "fixtures_pc_preview");
const BASE_COMMIT = "356ed36";   // 直す前（origin/master）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const PLAN6 = JSON.parse(fs.readFileSync(path.join(FX, "plan_0006.json"), "utf8"));
const SNAP = JSON.parse(fs.readFileSync(path.join(FX, "snapshot_1012_r67.json"), "utf8"));
const SESS = JSON.parse(fs.readFileSync(path.join(FX, "session_1011_2100.json"), "utf8"));
const REAL_HEAD = ["r7m01", "r7m05", "r7m14~1"];
let SERVED = CURRENT;
// 検査用: モジュールの中の関数を window.__t に出す（配る index.html は変えない。まねのサーバが足すだけ）
const HOOK = "\nwindow.__t = { planSetOf, planRowPick, planSubjGroups, planCurrentPart, planGroupIds, planTierLabel, get quizQueue(){ return quizQueue; } };\n";
function withHook(s) { const i = s.lastIndexOf("</script>"); return s.slice(0, i) + HOOK + s.slice(i); }
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(withHook(SERVED), "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
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
    const m = /^\/repos\/nambanamba\/kosuke-records\/contents\/([^?]+)/.exec(req.url);
    if (!m) return send(404, {});
    const p = decodeURIComponent(m[1]);
    if (req.headers.authorization !== "Bearer " + TOKEN) return send(401, { message: "Bad credentials" });
    if (req.method === "GET") {
      const w = written.get(p);
      if (w) return send(200, { sha: w.sha, content: Buffer.from(JSON.stringify(w.content), "utf8").toString("base64") });
      if (FILES[p]) return send(200, { sha: "x", content: Buffer.from(JSON.stringify(FILES[p]), "utf8").toString("base64") });
      return send(404, {});
    }
    if (req.method === "PUT") { const j = JSON.parse(b), w = written.get(p); if (w && j.sha !== w.sha) return send(409, {}); const sha = "s" + Math.random(); const content = JSON.parse(Buffer.from(j.content, "base64").toString("utf8")); written.set(p, { sha, content }); puts.push(p); return send(w ? 200 : 201, {}); }
    send(405, {});
  });
});
await new Promise(r => api.listen(0, "127.0.0.1", r));
const API_URL = "http://127.0.0.1:" + api.address().port;
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
// タブレットの記録: スナップショットの行（カード）＋ 10-11 21:00 の回の分けての部分
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
  const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, stats, parts, vonly]); await pg.reload(); await pg.waitForTimeout(2500);
  return { pg, errs };
}
// 親向けの0行目の「中身を見る」→ 一覧（ids・状態・数）
const peek0 = pg => pg.evaluate(async () => {
  const row = document.querySelectorAll("#plan-cur .plan-row")[0]; if (!row) return null;
  row.querySelector(".plan-peek-btn").click(); await new Promise(r => setTimeout(r, 200));
  const p = document.querySelectorAll("#plan-cur .plan-peek")[0];
  const out = { ids: [...p.querySelectorAll("li")].map(l => l.dataset.qid), tiers: [...p.querySelectorAll(".plan-peek-meta")].map(m => m.dataset.tier), count: (p.querySelector(".plan-peek-count") || {}).textContent || "", note: (p.querySelector(".plan-peek-src") || {}).textContent || "" };
  row.querySelector(".plan-peek-btn").click();
  return out;
});
const kidSub = pg => pg.evaluate(() => [...document.querySelectorAll("#plan-cur .plan-kid-row")].map(r => r.dataset.subj + ":" + ((r.querySelector(".plan-kid-sub") || {}).textContent || "")));
async function run(label, src) {
  SERVED = src; written = new Map(); puts = []; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctxT = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxP = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errs = [];
  try {
    // ── タブレット: 0行目だけで始めた並び（実際の 10-12 朝は理科の2行をまとめた子ども向けの行。頭は0行目の並び）
    const T = await open(ctxT, tabletStats(), SESS.parts, false);
    const tRow0 = await T.pg.evaluate(() => { const t = window.__t, s = t.planSetOf(6); return t.planRowPick(s.items[0], 6, 0).ids; });
    const tKid = await T.pg.evaluate(() => { const t = window.__t, s = t.planSetOf(6); const g = t.planSubjGroups(s, t.planCurrentPart(6))[0]; return t.planGroupIds(6, s, g); });
    const tKidSub = await kidSub(T.pg);
    await T.pg.waitForTimeout(800);
    const putsAfterOpen = puts.filter(p => p.includes("plan_pick")).length;
    // 子ども向けの理科「一人で」を押す → 出る並び（展開後）
    await T.pg.evaluate(() => document.querySelector('#plan-cur .plan-kid-row[data-subj="理科"] .plan-kid-btn[data-kind="solo"]').click());
    await T.pg.waitForTimeout(500);
    const tQueue = await T.pg.evaluate(() => window.__t.quizQueue.slice());
    check("R0 タブレットを記録で作り直すと、始めた並びの頭が本物の記録と同じ（" + tQueue.slice(0, 3).join(" ") + "）", tQueue.slice(0, 3).join(",") === REAL_HEAD.join(","), JSON.stringify(tQueue.slice(0, 6)));
    const tTiers = await T.pg.evaluate(ids => ids.map(window.__t.planTierLabel), tRow0);
    errs.push(...T.errs);
    // もう一度ホームを開き直す（同じ一覧なら送り直さない）
    await T.pg.reload(); await T.pg.waitForTimeout(2500);
    const putsAfterReopen = puts.filter(p => p.includes("plan_pick")).length;
    // ── PC: 記録なし・見るだけ・PAT
    const P = await open(ctxP, null, null, true);
    const pPeek = await peek0(P.pg);
    const pKidSub = await kidSub(P.pg);
    errs.push(...P.errs);
    const same = pPeek && pPeek.ids.join(",") === tRow0.join(",");
    console.log("    タブレット 0行目: " + tRow0.join(" ") + " ／ " + tTiers.join(" "));
    console.log("    PC 中身を見る  : " + (pPeek && pPeek.ids.join(" ")) + " ／ " + (pPeek && pPeek.tiers.join(" ")) + " ／ " + (pPeek && pPeek.count) + (pPeek && pPeek.note ? " ／ " + pPeek.note : ""));
    console.log("    子ども向けの行 タブレット " + tKidSub.join(" ") + " ／ PC " + pKidSub.join(" "));
    if (label === "base") {
      check("R1 ★再現: PC の一覧（" + (pPeek && pPeek.ids.length) + "枚）がタブレットで出る問題と違う", pPeek && !same, "");
      check("R2 ★再現: PC の一覧の状態は「まだ」ばかり（" + (pPeek && pPeek.tiers.filter(t => t === "まだ").length) + "/" + (pPeek && pPeek.tiers.length) + "）・タブレットでは「まだ」でないものがある", pPeek && pPeek.tiers.every(t => t === "まだ") && tTiers.some(t => t !== "まだ"), "");
      // 直す前は鳴る側（N）を見ない
    } else {
      const pk = written.get("battle/plan_pick/0006.json");
      check("N1 タブレットは今日やることを出したとき、行ごとの一覧を送る（0行目＝始めたときの一覧）", pk && pk.content && Array.isArray(pk.content.items) && pk.content.items[0] && pk.content.items[0].ids.join(",") === tRow0.join(","), JSON.stringify(pk && pk.content && pk.content.items && pk.content.items[0]).slice(0, 200));
      check("N2 見るだけの PC の「中身を見る」＝タブレットの一覧・同じ順番・状態もタブレットの記録", same && pPeek.tiers.join(",") === tTiers.join(",") && /こうすけ|子ども/.test(pPeek.note), JSON.stringify({ p: pPeek && pPeek.tiers, t: tTiers, note: pPeek && pPeek.note }));
      check("N3 PC の子ども向けの行の数もタブレットと同じ（" + pKidSub.join(" ") + "）", pKidSub.join("|") === tKidSub.join("|"), JSON.stringify({ tKidSub, pKidSub }));
      check("N4 同じ一覧なら送り直さない（開いたとき " + putsAfterOpen + " 回 → 開き直して " + putsAfterReopen + " 回）", putsAfterOpen === 1 && putsAfterReopen === 1, "");
      const tKidNoSend = tKid;   // 送る前と同じ関数で選んでいる（planGroupIds）。始めた並びの頭が記録と同じことは R0
      check("N5 タブレットの選び方は変わらない（子ども向けの理科 " + tKidNoSend.length + "枚・始めた頭 " + tQueue.slice(0, 3).join(" ") + "）", tQueue.slice(0, 3).join(",") === REAL_HEAD.join(","), "");
    }
    check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await ctxT.close(); await ctxP.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); process.exit(c); };
console.log("■ 直す前 " + BASE_COMMIT + "（再現。R は ✔ が「違うことを再現できた」）");
const ngB = report("直す前 " + BASE_COMMIT, await run("base", BASELINE));
if (process.env.BASE_ONLY) await done(ngB ? 1 : 0);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
