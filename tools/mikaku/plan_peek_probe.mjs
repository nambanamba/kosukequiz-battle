// 今日やること「中身を見る」（2026-10-07 ユーザー「中身を見るをお願いします」）
// 本物の Chrome・390x844・まねの GitHub API サーバ（本物の GitHub には触らない）。使い方: node tools/mikaku/plan_peek_probe.mjs
// 見ること:
//   K1 各行に「中身を見る」→ その行で出す問題の一覧（単元・苦手／まだ／定着）。★はじめは答えをかくす（答えは画面（DOM）に無い）
//   F  ★各問題に図を小さく出す・タップで大きく（2026-10-08 ユーザー「中身を見るに、イラストや答えを出してほしい」）
//   P  ★親の合言葉は取り除いた。「答えを見る／答えをかくす」で答えを切りかえる（合言葉なし）・閉じて開き直すとまたかくす
//   D  大問は小問ごとに図と答え（答えの図は「答えを見る」のときだけ）
//   K2 order:"weak"＋count の行: 見た一覧＝出る問題・同じ順番（そのあと別の行で記録が変わって並びが変わっても、保存した一覧で出す）
//   K3 unit＋count（ランダム）の行: 見た一覧＝出る問題・同じ順番（二人でも同じ）
//   K4 その行を「できた」にしたら、保存した一覧は消える
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_plan_peek"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "b3f7f51";   // 直す前（親の合言葉があった。残っている合言葉で答えのボタンが出る）
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "plan" });
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
// D 用: 図つきの小問が2つ以上ある大問（紙・ロング編でないもの。答えの図があればそれを選ぶ）を、いまの daimon_data.js から選ぶ
const DM = await (async () => { const vm = await import("node:vm"); const c = {}; vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "daimon_data.js"), "utf8").replace(/^const /mg, "var "), c);
  const gs = (c.DAIMON_DATA || []).filter(g => !g.paper && !g.long && g.items.filter(i => i.file).length >= 2);
  return gs.find(g => g.items.some(i => i.aFile)) || gs[0]; })();
const SETS = {
  "plan/index.json": { sets: [1] },
  "plan/0001.json": { no: 1, label: "10/8 のぶん", items: [
    { subj: "理科", title: "朝：②心臓と血管（2枚）", ids: ["r6p12", "r6p11"] },
    { subj: "理科", title: "夜：朝まちがえたのから2問", ids: ["r6p13", "r6p11", "r6p12", "r6p14"], order: "weak", count: 2 },
    { subj: "社会", title: "今週の回から3問", unit: "第6回.鎌倉時代", count: 3 },
    { subj: DM && DM.subj === "社会" ? "社会" : "理科", title: "大問（図）", ids: [DM ? DM.key : "none"] } ] }
};
const TOKEN = "github_pat_TESTONLY_1234567890";
let mode = "up", gets = 0, written = new Map();
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version" };
const api = http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  if (mode === "down") { req.socket.destroy(); return; }
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const send = (st, o) => { res.writeHead(st, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify(o)); };
    const m = /^\/repos\/nambanamba\/kosuke-records\/contents\/([^?]+)/.exec(req.url);
    if (!m) return send(404, {});
    const p = decodeURIComponent(m[1]);
    if (req.method === "GET" && p.startsWith("plan/")) gets++;
    if (req.headers.authorization !== "Bearer " + TOKEN) return send(401, { message: "Bad credentials" });
    if (req.method === "GET") {
      if (p.startsWith("plan/")) { if (mode === "missing" || !SETS[p]) return send(404, {}); return send(200, { sha: "x", content: Buffer.from(JSON.stringify(SETS[p]), "utf8").toString("base64") }); }
      const w = written.get(p); return w ? send(200, { sha: w.sha }) : send(404, {});
    }
    if (req.method === "PUT") { const j = JSON.parse(b), w = written.get(p); if (w && j.sha !== w.sha) return send(409, {}); const sha = "s" + Math.random(); written.set(p, { sha, content: JSON.parse(Buffer.from(j.content, "base64").toString("utf8")) }); return send(w ? 200 : 201, {}); }
    send(405, {});
  });
});
await new Promise(r => api.listen(0, "127.0.0.1", r));
const API_URL = "http://127.0.0.1:" + api.address().port;
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
const SEED = (arg) => {
  const [mig, cfg] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": ["第6回.鎌倉時代"] }, units: ["第6回.鎌倉時代"], count: 5, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (cfg) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
};
async function run(label, src) {
  SERVED = src; mode = "up"; gets = 0; written = new Map(); const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  const vis = sel => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const txt = sel => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : ""; }, sel);
  const qid = () => pg.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, "")).catch(() => "");
  const onSolo = () => pg.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
  const rows = sel => pg.evaluate(s => [...document.querySelectorAll(s + " .plan-row")].map(r => ({ t: r.querySelector(".plan-row-title").textContent, m: r.querySelector(".plan-mark").textContent })), sel);
  const head = sel => pg.evaluate(s => { const e = document.querySelector(s + " .plan-head"); return e ? e.textContent : ""; }, sel);
  const home = async () => { await pg.evaluate(() => { const h = document.getElementById("solo-result-home-btn"); if (h && document.getElementById("screen-solo-result").classList.contains("active")) h.click(); }); await pg.waitForTimeout(500); };
  const startRow = (sel, i, which) => pg.evaluate(a => document.querySelectorAll(a[0] + " .plan-row")[a[1]].querySelectorAll(".plan-start-btn")[a[2]].click(), [sel, i, which || 0]);
  // 1問ずつ答える。okOf(id, 何回目) が false なら✕
  const answerBy = async (okOf, max) => { const seen = []; for (let k = 0; k < (max || 10) && (await onSolo()); k++) { const id = await qid(); seen.push(id); const ok = okOf ? okOf(id, seen.filter(x => x === id).length) : true;
    await pg.$eval("#solo-reveal-btn", e => e.click()); await pg.waitForTimeout(80); await pg.$eval(ok ? "#solo-judge-ok" : "#solo-judge-ng", e => e.click()); await pg.waitForTimeout(180); } return seen; };
  const peek = async i => { await pg.evaluate(i => document.querySelectorAll("#plan-cur .plan-row")[i].querySelector(".plan-peek-btn").click(), i); await pg.waitForTimeout(200);
    return pg.evaluate(i => { const p = document.querySelectorAll("#plan-cur .plan-peek")[i]; return p ? { vis: getComputedStyle(p).display !== "none", ids: [...p.querySelectorAll("li")].map(l => l.dataset.qid), text: p.textContent, ansBtn: [...p.querySelectorAll(".plan-peek-ans-btn")].map(b => b.textContent).join("|"), tiers: [...p.querySelectorAll(".plan-peek-meta")].map(m => m.dataset.tier) } : null; }, i); };
  const firsts = arr => arr.filter((x, k) => arr.indexOf(x) === k);
  try {
    await pg.goto(PAGE_URL); await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }]); await pg.reload(); await pg.waitForTimeout(1800);
    const A = await pg.evaluate(() => Object.fromEntries(["r6p13", "r6p11", "r6p12", "r6p14"].map(id => [id, QA_DATA.find(d => d.id === id).a])));
    // K1
    const k1 = await peek(1);
    await pg.screenshot({ path: path.join(SHOTS, label + "_K1.png"), fullPage: true }).catch(() => {});
    const ansHidden = k1 && k1.ids.every(id => !k1.text.includes(A[id]));
    check("K1 「中身を見る」→ 一覧（" + (k1 && k1.ids.join(" ")) + "・" + (k1 && k1.tiers.join(" ")) + "）・はじめは答えをかくす（答えは画面に無い）・「" + (k1 && k1.ansBtn) + "」が出る",
      k1 && k1.vis && k1.ids.length === 2 && k1.tiers.every(t => t === "まだ") && ansHidden && k1.ansBtn === "答えを見る", JSON.stringify(k1 && k1.ids));
    // F: 図（2026-10-08 ユーザー「中身を見るに、イラストや答えを出してほしい」）。r6p11〜14 はどれも図つき
    const figs = await pg.evaluate(() => [...document.querySelectorAll("#plan-cur .plan-peek")[1].querySelectorAll("li")].map(l => [...l.querySelectorAll("img.plan-peek-fig")].map(i => i.getAttribute("src"))));
    const wantFig = await pg.evaluate(ids => ids.map(id => "images/" + QA_DATA.find(d => d.id === id).img), (k1 && k1.ids) || []);
    const lb = await pg.evaluate(() => { const i = document.querySelectorAll("#plan-cur .plan-peek")[1].querySelector("img.plan-peek-fig"); if (!i) return false; i.click(); const o = document.getElementById("lightbox-overlay"); const ok = o.classList.contains("show"); document.getElementById("lightbox-close").click(); return ok; });
    check("F 各問題に図が小さく出る・タップで大きく（" + JSON.stringify(figs) + "）", figs.length === 2 && figs.every((f, k) => f.length === 1 && f[0] === wantFig[k]) && lb, JSON.stringify({ wantFig, lb }));
    // P: 親の合言葉は取り除いた。答えは「答えを見る／答えをかくす」で切りかえる（合言葉なし）
    await pg.evaluate(() => localStorage.setItem("kq_battle_parent_pass_v1", "0123456789abcdef"));   // #25 のころの合言葉が残っていても関係ない
    const passBox = await pg.evaluate(() => !!(document.getElementById("parent-pass") || document.getElementById("parent-pass-box")));
    const clickTg = () => pg.evaluate(() => document.querySelectorAll("#plan-cur .plan-peek")[1].querySelector(".plan-peek-ans-btn").click());
    const panelNow = () => pg.evaluate(() => { const p = document.querySelectorAll("#plan-cur .plan-peek")[1]; return { text: p.textContent, btn: (p.querySelector(".plan-peek-ans-btn") || {}).textContent || "" }; });
    await clickTg(); await pg.waitForTimeout(100);
    const shown = await panelNow();
    await pg.screenshot({ path: path.join(SHOTS, label + "_P.png"), fullPage: true }).catch(() => {});
    await clickTg(); await pg.waitForTimeout(100);
    const hidden = await panelNow();
    await clickTg(); await pg.waitForTimeout(100);
    await pg.evaluate(() => document.querySelectorAll("#plan-cur .plan-row")[1].querySelector(".plan-peek-btn").click()); await pg.waitForTimeout(150);   // とじる
    const p2 = await peek(1);   // 開き直す
    const ids1 = (k1 && k1.ids) || [];
    check("P 合言葉の欄が無い・「答えを見る」で各問題の答えが出る →「答えをかくす」で消える",
      !passBox && shown.btn === "答えをかくす" && ids1.every(id => shown.text.includes(A[id])) && hidden.btn === "答えを見る" && ids1.every(id => !hidden.text.includes(A[id])) && !shown.text.includes("合言葉"),
      JSON.stringify({ passBox, b1: shown.btn, b2: hidden.btn }));
    check("P 一覧を閉じて開き直すと、また答えはかくれている", p2 && p2.ansBtn === "答えを見る" && p2.ids.every(id => !p2.text.includes(A[id])), JSON.stringify(p2 && p2.ansBtn));
    await pg.evaluate(() => document.querySelectorAll("#plan-cur .plan-row")[1].querySelector(".plan-peek-btn").click()); await pg.waitForTimeout(150);
    // D: 大問は小問ごとに図と答え（4行目＝図つきの大問1つ）
    await pg.evaluate(() => document.querySelectorAll("#plan-cur .plan-row")[3].querySelector(".plan-peek-btn").click()); await pg.waitForTimeout(200);
    const dm = await pg.evaluate(key => {
      const p = document.querySelectorAll("#plan-cur .plan-peek")[3];
      const d = QA_DATA.find(x => x.id === key);
      if (!p || !d) return null;
      const before = { items: p.querySelectorAll(".plan-peek-item").length, figs: [...p.querySelectorAll("img.plan-peek-fig")].map(i => i.getAttribute("src")), text: p.textContent };
      const b = p.querySelector(".plan-peek-ans-btn"); if (!b) return { before };
      b.click();
      const after = { text: p.textContent, figs: [...p.querySelectorAll("img.plan-peek-fig")].map(i => i.getAttribute("src")) };
      const g = d.daimon;
      return { id: d.id, n: g.items.length, before, after,
        wantQ: [g.file, ...g.items.map(it => it.file)].filter(Boolean).map(f => "images/" + f),
        wantA: g.items.map(it => it.a), aFiles: g.items.map(it => it.aFile).filter(Boolean).map(f => "images/" + f) };
    }, DM && DM.key);
    await pg.evaluate(() => document.querySelectorAll("#plan-cur .plan-row")[3].querySelector(".plan-peek-btn").click()); await pg.waitForTimeout(150);
    check("D 大問: 小問ごとに図・答えを見ると小問ごとの答え（" + (dm && dm.id) + "）",
      dm && !dm.none && dm.before.items === dm.n && JSON.stringify(dm.before.figs) === JSON.stringify(dm.wantQ) && dm.wantA.every(a => !dm.before.text.includes("こたえ：" + a))
        && dm.wantA.every(a => dm.after.text.includes("こたえ：" + a)) && dm.aFiles.every(f => dm.after.figs.includes(f) && !dm.before.figs.includes(f)),
      JSON.stringify(dm && { n: dm.n, items: dm.before && dm.before.items, figs: dm.before && dm.before.figs.length, want: dm.wantQ && dm.wantQ.length }));
    // K2: 朝の行で r6p12 を1回目✕ → 並べ替えなら r6p12 が先頭に来るはずだが、保存した一覧（見たもの）で出す
    await startRow("#plan-cur", 0); await pg.waitForTimeout(300);
    await answerBy((id, n) => !(id === "r6p12" && n === 1)); await home();
    await startRow("#plan-cur", 1); await pg.waitForTimeout(300);
    const s2 = firsts(await answerBy()); await home();
    check("K2 order:weak・count 2: 見た一覧＝出る問題・同じ順番（見た " + (k1 && k1.ids.join(" ")) + " → 出た " + s2.join(" ") + "）・あとで記録が変わっても保存した一覧",
      k1 && s2.join(",") === k1.ids.join(","), JSON.stringify(s2));
    // K4
    const k4 = await pg.evaluate(() => (JSON.parse(localStorage.getItem("kq_battle_plan_pick_v2") || "{}")[1] || {}));
    check("K4 その行を「できた」にしたら、保存した一覧は消える", !Object.keys(k4).some(k => k.startsWith("1:")), JSON.stringify(k4));
    // K3: unit＋count（ランダム）
    const k3 = await peek(2);
    await startRow("#plan-cur", 2); await pg.waitForTimeout(300);
    const s3 = firsts(await answerBy()); await home();
    check("K3 unit＋count（ランダム）: 見た一覧＝出る問題・同じ順番（" + (k3 && k3.ids.join(" ")) + " → " + s3.join(" ") + "）", k3 && k3.ids.length === 3 && s3.join(",") === k3.ids.join(","), JSON.stringify({ k3: k3 && k3.ids, s3 }));
    check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); api.close(); relay.close(); process.exit(c); };
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const ngB = report("対照 " + BASE_COMMIT, await run("base", BASELINE));
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
