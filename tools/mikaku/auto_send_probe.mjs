// 記録の自動送信（2026-10-06 ユーザー「記録の書き出しですが何とかもう少し自動化できませんか?」→「gitにpushとかどうですか？」）
// 送り先は GitHub の非公開リポジトリ nambanamba/kosuke-records（PUT /repos/{owner}/{repo}/contents/{path}）。
// ここでは本物の GitHub には書かず、まねの API サーバ（ローカルの http・CORS あり）で見る。本物の Chrome・390x844。
// 使い方: node tools/mikaku/auto_send_probe.mjs
// 見ること:
//   A0 鍵が空なら、練習を終えても何も送らない（今までどおり）
//   A1 鍵を貼って保存 → battle/snapshot/<日付>.json が書かれる（今の記録CSVと同じ見出し・同じ行数）
//   A2 1回の練習が終わると battle/session/<日付>/<回のID>.json が書かれる（学習ログの1回分・1問ごとの〇✕と秒）
//   A3 つながらないときはためておき、次に開いたときに書かれる・もう一度開いても PUT は増えない
//   A4 書けたのに返事が届かなかった回は、次に 422（もうある）→ 送れたとみなす＝ファイルは1つ・ためた分は空になる
//   A5 同じ日の snapshot は sha を付けて上書き（ファイルは1つ）
//   A6 「ためしに送る」で test/<日時>.json が書かれ「送れました」
//   A7 401（鍵の期限切れ）→ ホームに「記録の送り先の鍵を作り直してください」・ためた分は残る → 鍵を直すと送られて知らせが消える
//   A8 コードに鍵を書いていない
//   A9 検査用の api 差しかえは 127.0.0.1 / localhost だけ。外のアドレスを入れても github 以外に送らない
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "b548a5f";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(SERVED, "utf8")); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
// ---- まねの GitHub API（contents だけ）----
const TOKEN = "github_pat_TESTONLY_1234567890";
let files = new Map(), log = [], mode = "up";   // mode: up / down（つながらない）/ lostReply（書くが返事を切る）/ expired（401）
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version" };
const api = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  if (mode === "down") { req.socket.destroy(); return; }
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const m = /^\/repos\/nambanamba\/kosuke-records\/contents\/([^?]+)/.exec(req.url);
    const send = (st, o) => { res.writeHead(st, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify(o)); };
    if (!m) return send(404, { message: "Not Found" });
    const p = decodeURIComponent(m[1]);
    log.push({ method: req.method, path: p, body: b ? JSON.parse(b) : null });
    if (mode === "expired" || req.headers.authorization !== "Bearer " + TOKEN) return send(401, { message: "Bad credentials" });
    if (req.method === "GET") { const f = files.get(p); return f ? send(200, { sha: f.sha, path: p }) : send(404, { message: "Not Found" }); }
    if (req.method === "PUT") {
      const j = JSON.parse(b), f = files.get(p);
      if (f && !j.sha) return send(422, { message: "\"sha\" wasn't supplied." });
      if (f && j.sha !== f.sha) return send(409, { message: "conflict" });
      const sha = "sha" + Math.random().toString(16).slice(2);
      files.set(p, { sha, content: JSON.parse(Buffer.from(j.content, "base64").toString("utf8")), branch: j.branch });
      if (mode === "lostReply") { req.socket.destroy(); return; }
      return send(f ? 200 : 201, { content: { path: p, sha } });
    }
    send(405, {});
  });
});
await new Promise(r => api.listen(0, "127.0.0.1", r));
const API_URL = "http://127.0.0.1:" + api.address().port;
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
const U = "第6回.鎌倉時代";
const SEED = (arg) => {
  const [mig, ids, unit, apiUrl] = arg;
  const now = Date.now(), known = { correct: 2, wrong: 0, box: 2, lastCorrectAt: now - 9e8, lastAnswered: now - 9e8 }, st = {};
  QA_DATA.forEach(d => { if (d.subj === "社会" && d.kind !== "daimon" && !ids.includes(d.id)) st[d.id] = Object.assign({}, known); });
  DAIMON_DATA.forEach(h => h.items.forEach(it => { st[it.id] = Object.assign({}, known); }));
  localStorage.clear();
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st));
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [unit] }, units: [unit], count: ids.length, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  // ★検査用: まねの API に向ける（鍵はまだ入れない）
  localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify({ api: apiUrl }));
};
async function run(label, src) {
  SERVED = src; files = new Map(); log = []; mode = "up"; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }); const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  const tap = sel => pg.$eval(sel, e => e.click());
  const vis = sel => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const onSolo = () => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const practice = async () => { await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (!document.getElementById("screen-home").classList.contains("active") && h) h.click(); }); await pg.waitForTimeout(200);
    await tap("#solo-start-btn"); await pg.waitForTimeout(300);
    for (let k = 0; k < 5 && (await onSolo()); k++) { await tap("#solo-reveal-btn"); await pg.waitForTimeout(80); await tap(k === 1 ? "#solo-judge-ng" : "#solo-judge-ok");   /* ★2026-10-06 ✕の問は正解するまで回るので、2問目だけ✕ */ await pg.waitForTimeout(200); } };
  const sessFiles = () => [...files.keys()].filter(p => p.startsWith("battle/session/"));
  const puts = p => log.filter(l => l.method === "PUT" && l.path === p).length;
  const status = () => pg.$eval("#send-status", e => e.textContent).catch(() => "");
  try {
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, ["g6r1", "g6r2"], U, API_URL]); await pg.reload(); await pg.waitForTimeout(2200);
    // A0
    await practice(); await pg.waitForTimeout(2500);
    check("A0 鍵が空なら何も送らない", log.length === 0, JSON.stringify(log.map(l => l.method + " " + l.path)));
    // A1
    await pg.evaluate(() => document.getElementById("solo-result-home-btn").click()); await pg.waitForTimeout(300);
    await pg.fill("#send-token", TOKEN); await tap("#send-save-btn"); await pg.waitForTimeout(1500);
    const day = await pg.evaluate(() => { const d = new Date(), p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); });
    const snap = files.get("battle/snapshot/" + day + ".json");
    const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 5000 }), tap("#export-link")]);
    const lines = fs.readFileSync(await dl.path(), "utf8").replace(/^﻿/, "").split("\r\n");
    check("A1 保存すると battle/snapshot/" + day + ".json（記録CSVと同じ見出し・同じ行数 " + (lines.length - 1) + "）・main に",
      snap && snap.branch === "main" && snap.content.app === "battle" && snap.content.header.join(",") === lines[0] && snap.content.rows.length === lines.length - 1,
      snap ? JSON.stringify({ header: snap.content.header, n: snap.content.rows.length }) : JSON.stringify([...files.keys()]));
    // A2
    await practice(); await pg.waitForTimeout(1500);
    const s1 = sessFiles();
    const c1 = s1.length ? files.get(s1[0]).content : null;
    check("A2 練習が終わると battle/session/" + day + "/<回のID>.json（学習ログの1回分・1問ごとの〇✕と秒）",
      s1.length === 1 && s1[0] === "battle/session/" + day + "/" + c1.id + ".json" && c1.summary["回のID"] === c1.id && c1.q.length === 3 && c1.q[0].r === "o" && c1.q[1].r === "x" && c1.q[2].r === "o" && c1.q[2].re === 1 && typeof c1.q[0].sec === "number",
      JSON.stringify({ s1, q: c1 && c1.q }));
    // A3
    mode = "down";
    await practice(); await pg.waitForTimeout(1500);
    const whileDown = sessFiles().length;
    mode = "up";
    await pg.reload(); await pg.waitForTimeout(3000);
    const s2 = sessFiles(), newP = s2.find(p => !s1.includes(p));
    await pg.reload(); await pg.waitForTimeout(3000);
    check("A3 つながらない間はためて、次に開いたときに書かれる・もう一度開いても PUT は増えない（間 " + whileDown + "件 → " + s2.length + "件・PUT " + (newP ? puts(newP) : 0) + "回）",
      whileDown === 1 && s2.length === 2 && newP && puts(newP) === 1, JSON.stringify(s2));
    // A4
    mode = "lostReply";
    await practice(); await pg.waitForTimeout(1500);
    mode = "up";
    const s3 = sessFiles(), lostP = s3.find(p => !s2.includes(p));
    await pg.reload(); await pg.waitForTimeout(3000);
    const st4 = await status();
    check("A4 書けたのに返事が来なかった回は、次に 422 → 送れたとみなす（ファイル1つ・PUT " + (lostP ? puts(lostP) : 0) + "回・ためた分 0）",
      lostP && sessFiles().length === 3 && puts(lostP) === 2 && /まだ送れていない記録: 0件/.test(st4), st4);
    // A5
    const snapPuts0 = puts("battle/snapshot/" + day + ".json");
    await pg.evaluate(() => localStorage.removeItem("kq_battle_send_snapday_v1")); await pg.reload(); await pg.waitForTimeout(3000);
    const lastSnapPut = log.filter(l => l.method === "PUT" && l.path === "battle/snapshot/" + day + ".json").pop();
    check("A5 同じ日の snapshot は sha を付けて上書き（PUT " + snapPuts0 + "→" + puts("battle/snapshot/" + day + ".json") + "回・ファイルは1つ）",
      puts("battle/snapshot/" + day + ".json") === snapPuts0 + 1 && lastSnapPut && lastSnapPut.body.sha && [...files.keys()].filter(p => p.startsWith("battle/snapshot/")).length === 1);
    // A6
    await tap("#send-test-btn"); await pg.waitForTimeout(1500);
    const st6 = await status();
    check("A6 「ためしに送る」で test/<日時>.json・「送れました」", [...files.keys()].some(p => /^test\/\d{4}-\d\d-\d\d_\d{6}\.json$/.test(p)) && /送れました/.test(st6), st6);
    // A7
    mode = "expired";
    await practice(); await pg.waitForTimeout(1800);
    await pg.evaluate(() => document.getElementById("solo-result-home-btn").click()); await pg.waitForTimeout(300);
    const w = await vis("#send-auth-warn"), st7 = await status();
    mode = "up";
    await tap("#send-save-btn"); await pg.waitForTimeout(1800);
    const w2 = await vis("#send-auth-warn");
    check("A7 401 → 「鍵を作り直してください」・ためた分は残る → 直ると送られて知らせが消える", w && /まだ送れていない記録: 1件/.test(st7) && !w2 && sessFiles().length === 4, JSON.stringify({ w, st7, w2 }));
    // A9 検査用の api 差しかえは 127.0.0.1 / localhost だけ。外のアドレスを入れても github 以外に送らない（鍵をよそに送らない）
    const reqs = [];
    await ctx.route(/evil\.example|api\.github\.com/, r => { reqs.push(r.request().url()); r.abort(); });
    for (const bad of ["http://evil.example.test", "https://127.0.0.1.evil.example.test", "http://localhost.evil.example.test"]) {
      await pg.evaluate(a => localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify({ token: a[1], api: a[0], repo: "someone/other" })), [bad, TOKEN]);
      await pg.reload(); await pg.waitForTimeout(800);
      await tap("#send-test-btn"); await pg.waitForTimeout(1200);
    }
    const toEvil = reqs.filter(u => /evil\.example/.test(u)), toGh = reqs.filter(u => /^https:\/\/api\.github\.com\/repos\/nambanamba\/kosuke-records\//.test(u));
    check("A9 api に外のアドレスを入れても、github（nambanamba/kosuke-records）以外に送らない（よそ " + toEvil.length + "件・github " + toGh.length + "件）",
      toEvil.length === 0 && toGh.length >= 3, JSON.stringify(reqs.slice(0, 4)));
    // A8
    check("A8 コードに鍵を書いていない", !/github_pat_[A-Za-z0-9_]{20,}/.test(src) && !/ghp_[A-Za-z0-9]{20,}/.test(src));
    check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
