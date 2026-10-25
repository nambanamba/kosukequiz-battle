// ★2026-10-26 一人の一問一答に「△ ぎりぎり　あしたもう一度」（ユーザー「ギリギリできた問題を、明日もやりたいけど今日はやりたくない。できたけど明日やる、という判定が欲しい」）
// 本物の Chrome・390x844・まねの GitHub API（記録の送り先と今日やること）。使い方: node tools/mikaku/giri_probe.mjs
// スクショは tools/mikaku/shots_giri/（コミットしない）
// 見ること:
//   G1 一人の一問一答: こたえを見ると ✕・△・〇 の3つ。△の文は「△ ぎりぎり」「あしたもう一度」
//   G2 △: この回では出し直さない（並びに二度と出ない）・点は〇（結果の〇の数・学習ログの〇の数）
//   G3 △の記録: 正解の数は+1・連続正解（box）は進まない・正解した日（定着の日）に今日を足さない・lastGiri＝lastAnswered
//      （correctDays が無い古い記録も、最終正答日の1日は残り、今日は増えない）。何も無いカードは「おぼえかけ」
//   G4 △を出さない: ✕で回ってきた2回目・大問の小問
//   G5 ひとつ前をやり直す: △の前の記録にまるごと戻る
//   G6 送る記録: session の q は r:"o" のまま g:1・body.giri・ほかの答えに g は付かない／snapshot の giri
//   G7 次の日（今日やること）: 前の日に△のカードは、その行の中で苦手より先に選ばれ、その教科のぶんの先頭に来る／今日△のカードはいちばんうしろ（定着より後）
//      △のあと〇で答えたカードは印が消える（ふつうの並び）／△を知らない行（印なし）は今までと同じ並び
//   G8 急いだ回の〇を外す: △は正解の数だけ引き、連続正解（box）は引かない（〇は今までどおり引く）
//   G9 対戦の画面に△は無い・画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_giri"); fs.mkdirSync(SHOTS, { recursive: true });
const BASE_COMMIT = "f82c17b";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "giri" });
// ★index.html の中身は module なので、試験のときだけ末尾に「中の名前を読む口」（window.__t）を足して出す（出すだけ・ファイルは変えない）
function withFakeRelay(s) { const i0 = s.indexOf("const RELAY_URLS = ["), i1 = s.indexOf("];", i0); s = s.slice(0, i0) + 'const RELAY_URLS = ["' + relay.url + '"' + s.slice(i1);
  const e = s.lastIndexOf("</script>"); return s.slice(0, e) + "\nwindow.__t = c => eval(c);\n" + s.slice(e); }
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" }); res.end(Buffer.from(withFakeRelay(SERVED), "utf8")); return; }
  if (rel === "sw.js") { res.writeHead(404).end(); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PAGE_URL = "http://127.0.0.1:" + server.address().port + "/index.html";
const TOKEN = "github_pat_TESTONLY_1234567890";
let SETS = {}, written = new Map();
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
      if (p.startsWith("plan/")) { if (!SETS[p]) return send(404, {}); return send(200, { sha: "x", content: Buffer.from(JSON.stringify(SETS[p]), "utf8").toString("base64") }); }
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
const DAY = 86400000;
const SEED = (arg) => {
  const [mig, cfg, st] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": ["第6回.鎌倉時代"] }, units: ["第6回.鎌倉時代"], count: 5, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 30, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
  if (cfg) localStorage.setItem("kq_battle_send_gh_v1", JSON.stringify(cfg));
  localStorage.setItem("kq_battle_stats_v1", JSON.stringify(st || {}));
};
const ymdOf = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

async function run(label, src) {
  SERVED = src; written = new Map(); SETS = {}; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", e => errs.push(String(e))); pg.on("dialog", d => d.accept().catch(() => {}));
  const vis = sel => pg.evaluate(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel);
  const tap = sel => pg.$eval(sel, e => e.click());
  const qid = () => pg.evaluate(() => (document.getElementById("solo-q-id").textContent || "").replace(/^No\./, ""));
  const statOf = id => pg.evaluate(id => (JSON.parse(localStorage.getItem("kq_battle_stats_v1") || "{}"))[id] || null, id);
  const shot = n => pg.screenshot({ path: path.join(SHOTS, label + "_" + n + ".png"), fullPage: false }).catch(() => {});
  const sec = async (name, f) => { try { await f(); } catch (e) { check(name + " が最後まで走った", false, String(e && e.message || e).split("\n")[0]); } };
  const now = Date.now(), today = ymdOf(now);
  try {
    await pg.goto(PAGE_URL);
    await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, {}]); await pg.reload(); await pg.waitForTimeout(1500);
    const ids = await pg.evaluate(() => QA_DATA.filter(d => d.subj === "社会" && d.u === "第6回.鎌倉時代" && d.kind !== "daimon" && d.kind !== "calc" && !window.__t("SPLIT_CARD").has(d.id)).slice(0, 20).map(d => d.id));
    check("前提: 社会 第6回のカード " + ids.length + " 枚", ids.length === 20);
    const [A, B, C, D] = ids;
    // A: 古い記録（correctDays あり・lastGiri なし）／B: correctDays が無い古い記録（苦手）／C: 記録なし
    const stA = { correct: 2, wrong: 0, box: 1, correctDays: [ymdOf(now - 3 * DAY)], lastCorrectAt: now - 3 * DAY, lastAnswered: now - 3 * DAY };
    const stB = { correct: 1, wrong: 1, box: 0, lastCorrectAt: now - 5 * DAY, lastAnswered: now - 5 * DAY };
    const stD = { correct: 1, wrong: 0, box: 1, correctDays: [ymdOf(now - 2 * DAY)], lastCorrectAt: now - 2 * DAY, lastAnswered: now - 2 * DAY };
    await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, { [A]: stA, [B]: stB, [D]: stD }]); await pg.reload(); await pg.waitForTimeout(1500);

    await sec("G1〜G4", async () => {
      await pg.evaluate(q => window.__t("startSoloWithIds")(q, null), [A, B, C]); await pg.waitForTimeout(300);
      check("G1 1問目が " + A, (await qid()) === A, await qid());
      await tap("#solo-reveal-btn"); await pg.waitForTimeout(200);
      const btns = await pg.evaluate(() => [...document.querySelectorAll("#solo-judge-row .judge-btn")].filter(b => getComputedStyle(b).display !== "none").map(b => b.innerText.replace(/\s+/g, " ").trim()));
      await shot("G1_buttons");
      check("G1 こたえを見ると ✕・△・〇 の3つ（左から）", btns.length === 3 && /^✕/.test(btns[0]) && /^△/.test(btns[1]) && /^〇/.test(btns[2]), JSON.stringify(btns));
      check("G1 △の文は「△ ぎりぎり」「あしたもう一度」", /△ ぎりぎり/.test(btns[1] || "") && /あしたもう一度/.test(btns[1] || ""), btns[1]);
      const box = await pg.evaluate(() => { const r = document.getElementById("solo-judge-row").getBoundingClientRect(); return [...document.querySelectorAll("#solo-judge-row .judge-btn")].filter(b => getComputedStyle(b).display !== "none").map(b => { const x = b.getBoundingClientRect(); return { w: Math.round(x.width), h: Math.round(x.height), r: Math.round(x.right), row: Math.round(r.right) }; }); });
      check("G1 3つとも画面の幅に入る（はみ出さない・はば 80px 以上）", box.length === 3 && box.every(b => b.w >= 80 && b.r <= 390), JSON.stringify(box));
      await tap("#solo-judge-giri"); await pg.waitForTimeout(250);
      const q1 = await pg.evaluate(() => ({ q: window.__t("quizQueue").slice(), pos: window.__t("quizPos") }));
      check("G2 △のあと次の問題（" + B + "）へ・" + A + " はうしろに回らない", (await qid()) === B && q1.q.filter(x => x === A).length === 1, JSON.stringify(q1));
      const sA = await statOf(A);
      check("G3 △の記録: 正解の数 2→3・box 1 のまま・正解した日に今日を足さない・lastGiri＝lastAnswered",
        sA && sA.correct === 3 && sA.box === 1 && JSON.stringify(sA.correctDays) === JSON.stringify([ymdOf(now - 3 * DAY)]) && sA.lastGiri > 0 && sA.lastGiri === sA.lastAnswered && sA.wrong === 0, JSON.stringify(sA));
      // B: ✕（うしろに回る）
      await tap("#solo-reveal-btn"); await pg.waitForTimeout(150);
      check("G1 2問目（" + B + "・correctDays の無い古い記録）でも△が出る", await vis("#solo-judge-giri"));
      await tap("#solo-judge-ng"); await pg.waitForTimeout(250);
      check("G2 ✕は今までどおりうしろに回る", (await pg.evaluate(() => window.__t("quizQueue").slice())).filter(x => x === B).length === 2);
      // C: △（記録なし）
      check("G2 3問目が " + C, (await qid()) === C, await qid());
      await tap("#solo-reveal-btn"); await pg.waitForTimeout(150);
      await tap("#solo-judge-giri"); await pg.waitForTimeout(250);
      const sC = await statOf(C);
      const tC = await pg.evaluate(id => window.__t("tierOfStat")(window.__t("stats")[id]), C);
      check("G3 記録の無いカードに△: 正解1・正解した日は0日・おぼえかけ（段3）", sC && sC.correct === 1 && Array.isArray(sC.correctDays) && sC.correctDays.length === 0 && !(sC.box > 0) && tC === 3, JSON.stringify(sC) + " 段" + tC);
      // B の2回目: △は出さない
      check("G4 ✕で回ってきた2回目（" + B + "）", (await qid()) === B, await qid());
      await tap("#solo-reveal-btn"); await pg.waitForTimeout(150);
      check("G4 ✕で回ってきた2回目には△を出さない（〇✕だけ）", !(await vis("#solo-judge-giri")) && (await vis("#solo-judge-ok")));
      await tap("#solo-judge-ok"); await pg.waitForTimeout(800);
      const res = await pg.evaluate(() => { const T = window.__t, L = T("studyLog"); const s = L.sessions[L.sessions.length - 1]; return { sum: T("studyLogSummary")(s), q: s.q, ok: T("quizResults").filter(r => r.correct && !r.norecord).length }; });
      check("G2 結果: △2つは〇に数える（1回目の〇 2・✕ 1・学習ログの〇 2）", res.ok === 2 && res.sum.ok === 2 && res.sum.ng === 1, JSON.stringify(res.sum) + " ok=" + res.ok);
      const eA = res.q.find(e => e[0] === A), eC = res.q.find(e => e[0] === C), eB = res.q.filter(e => e[0] === B);
      check("G6 学習ログ: △は r「o」のまま7つ目に 1・ほかの答えは今までの形", eA && eA[2] === "o" && eA[6] === 1 && eC && eC[6] === 1 && eB.every(e => e.length <= 4), JSON.stringify(res.q));
      const sB = await statOf(B);
      check("G3 " + B + "（✕・やり直しで〇）は今までどおり（✕が1つ増え・lastGiri なし）", sB && sB.wrong === 2 && !sB.lastGiri, JSON.stringify(sB));
    });

    await sec("G6 送る記録", async () => {
      let sess = null, snap = null;
      for (let k = 0; k < 40 && !(sess && snap); k++) {
        await pg.waitForTimeout(250);
        for (const [p, w] of written) { if (p.startsWith("battle/session/") && w.content.q && w.content.q.some(x => x.id === A)) sess = w.content; if (p.startsWith("battle/snapshot/")) snap = w.content; }
      }
      check("G6 送った session がある", !!sess, [...written.keys()].join(" "));
      if (sess) {
        const qa = sess.q.find(x => x.id === A), qb = sess.q.filter(x => x.id === B);
        check("G6 session の q: △は r:\"o\"・g:1（ほかの欄は今までどおり）", qa && qa.r === "o" && qa.g === 1 && qa.re === 0 && qa.mode === "", JSON.stringify(qa));
        check("G6 session の q: △でない答えに g は付かない", qb.length === 2 && qb.every(x => !("g" in x)), JSON.stringify(qb));
        check("G6 session の giri＝[" + A + "," + C + "]", JSON.stringify(sess.giri) === JSON.stringify([A, C]), JSON.stringify(sess.giri));
        check("G6 session の summary の〇の数は △ を〇として数える（正解数 2）", String(sess.summary["正解数"]) === "2", "正解数 " + sess.summary["正解数"]);
      }
      check("G6 snapshot の giri に " + A + "・" + C + "（最後の答えが△）・" + B + " は無い", snap && snap.giri && snap.giri[A] > 0 && snap.giri[C] > 0 && !snap.giri[B], snap ? JSON.stringify(snap.giri) : "snapshot なし");
    });

    await sec("G4 大問・G5 やり直し", async () => {
      const dk = await pg.evaluate(() => DAIMON_DATA.find(h => h.subj !== "理科" || true).key);
      await pg.evaluate(k => window.__t("startSoloWithIds")([k], null), dk); await pg.waitForTimeout(300);
      await tap("#solo-reveal-btn"); await pg.waitForTimeout(150);
      check("G4 大問の小問（" + (await qid()) + "）には△を出さない", !(await vis("#solo-judge-giri")) && (await vis("#solo-judge-ok")));
      const before = await statOf(D);
      await pg.evaluate(q => window.__t("startSoloWithIds")(q, null), [D, ids[4]]); await pg.waitForTimeout(300);
      await tap("#solo-reveal-btn"); await pg.waitForTimeout(150);
      await tap("#solo-judge-giri"); await pg.waitForTimeout(250);
      const mid = await statOf(D);
      await tap("#solo-undo-link"); await pg.waitForTimeout(250);
      const after = await statOf(D);
      check("G5 △をひとつ前にもどすと、記録は△の前と同じ（" + D + "）", mid && mid.lastGiri && JSON.stringify(after) === JSON.stringify(before) && (await qid()) === D, JSON.stringify({ before, mid, after }));
      const ent = await pg.evaluate(() => { const L = window.__t("studyLog"); return L.sessions[L.sessions.length - 1].q.length; });
      check("G5 学習ログからも△の1件が消える", ent === 0, "件数 " + ent);
    });

    await sec("G7 次の日", async () => {
      // P1 前の日に△（おぼえかけ） P2〜P5 苦手 P6 今日△ P7 前の日に△のあと今日〇 P8 定着 P9〜P11 まだ（記録なし）
      const P = ids.slice(5, 16);
      const st = {};
      const gy = now - DAY;   // 前の日の同じ時刻
      st[P[0]] = { correct: 2, wrong: 0, box: 1, correctDays: [ymdOf(now - 4 * DAY)], lastCorrectAt: gy, lastAnswered: gy, lastGiri: gy };
      [1, 2, 3, 4].forEach((k, j) => { st[P[k]] = { correct: 1, wrong: 1, box: 0, correctDays: [ymdOf(now - (10 + j) * DAY)], lastCorrectAt: now - (10 + j) * DAY, lastAnswered: now - 2 * DAY }; });
      st[P[5]] = { correct: 1, wrong: 1, box: 0, correctDays: [ymdOf(now - 20 * DAY)], lastCorrectAt: now - 60000, lastAnswered: now - 60000, lastGiri: now - 60000 };
      st[P[6]] = { correct: 3, wrong: 0, box: 2, correctDays: [ymdOf(now - 4 * DAY), today], lastCorrectAt: now - 60000, lastAnswered: now - 60000, lastGiri: gy };
      st[P[7]] = { correct: 3, wrong: 0, box: 3, correctDays: [ymdOf(now - 9 * DAY), ymdOf(now - 6 * DAY), ymdOf(now - 3 * DAY)], lastCorrectAt: now - 3 * DAY, lastAnswered: now - 3 * DAY };
      SETS = { "plan/index.json": { sets: [1] }, "plan/0001.json": { no: 1, label: "あしたのぶん", items: [
        { subj: "社会", title: "朝：R1 苦手", ids: [P[1], P[2]], order: "weak", count: 2 },
        { subj: "社会", title: "朝：R2", ids: [P[3], P[4], P[5], P[6], P[0]], order: "weak", count: 2 },
        { subj: "社会", title: "朝：R3", ids: [P[5], P[7]], order: "weak", count: 1 },
        { subj: "社会", title: "朝：R4 印なし", ids: [P[10], P[8], P[9]], order: "weak", count: 3 } ] } };
      await pg.evaluate(SEED, [MIG, { token: TOKEN, api: API_URL }, st]); await pg.reload(); await pg.waitForTimeout(2000);
      const rows = await pg.evaluate(() => { const T = window.__t; const s = T("planSetOf")(1); return s ? s.items.map((it, i) => T("planRowPick")(it, 1, i).ids) : null; });
      check("G7 今日やることが読めた", !!rows, JSON.stringify(rows));
      if (rows) {
        check("G7 R1（△の印なし）は今までどおり 苦手の古い順（" + P[2] + "," + P[1] + "）", JSON.stringify(rows[0]) === JSON.stringify([P[2], P[1]]), JSON.stringify(rows[0]));
        check("G7 R2: 前の日に△の " + P[0] + " が苦手より先に選ばれる（" + P[0] + "," + P[4] + "）", JSON.stringify(rows[1]) === JSON.stringify([P[0], P[4]]), JSON.stringify(rows[1]));
        check("G7 R2: 今日△の " + P[5] + "・△のあと〇の " + P[6] + " は選ばれない", !rows[1].includes(P[5]) && !rows[1].includes(P[6]));
        check("G7 R3: 今日△の " + P[5] + " は定着の " + P[7] + " よりうしろ（定着が選ばれる）", JSON.stringify(rows[2]) === JSON.stringify([P[7]]), JSON.stringify(rows[2]));
        check("G7 R4（△の印なし・まだ）は今までどおり id の順（" + [P[10], P[8], P[9]].join(",") + "）", JSON.stringify(rows[3]) === JSON.stringify([P[10], P[8], P[9]]), JSON.stringify(rows[3]));
      }
      await pg.evaluate(() => { const r = [...document.querySelectorAll("#plan-cur .plan-kid-row")].find(x => x.dataset.subj === "社会"); r.querySelector('.plan-kid-btn[data-kind="solo"]').click(); });
      await pg.waitForTimeout(400);
      const qq = await pg.evaluate(() => window.__t("quizQueue").slice());
      check("G7 子どもの「一人で」: 前の日に△の " + P[0] + " が社会のぶんの先頭・数は 2+2+1+3＝8", qq[0] === P[0] && qq.length === 8 && new Set(qq).size === 8, JSON.stringify(qq));
      check("G7 子どもの「一人で」: 残りの並びは行の順のまま", JSON.stringify(qq.slice(1)) === JSON.stringify([P[2], P[1], P[4], P[7], P[10], P[8], P[9]]), JSON.stringify(qq.slice(1)));
    });

    await sec("G8 急いだ回", async () => {
      const r = await pg.evaluate(([H1, H2, now, DAY, ymd3, ymd2]) => {
        const stats = window.__t("stats"), hurriedDiscount = window.__t("hurriedDiscount");
        stats[H1] = { correct: 3, wrong: 0, box: 2, correctDays: [ymd3, ymd2], lastCorrectAt: now - 500, lastAnswered: now - 500, lastGiri: now - 500 };
        stats[H2] = { correct: 3, wrong: 0, box: 2, correctDays: [ymd3, ymd2], lastCorrectAt: now - 2 * DAY, lastAnswered: now - 2 * DAY };
        const s = { id: "sH", k: "solo", m: "一問一答", st: now - 1000, en: now, q: [[H1, 1, "o", 0, "", 0, 1], [H2, 1, "o"]] };
        hurriedDiscount(s, [], []);
        return [stats[H1], stats[H2]];
      }, [ids[16], ids[17], now, DAY, ymdOf(now - 3 * DAY), ymdOf(now - 2 * DAY)]);
      check("G8 △は正解の数だけ引く（3→2）・box は 2 のまま・正解した日はそのまま", r[0].correct === 2 && r[0].box === 2 && r[0].correctDays.length === 2, JSON.stringify(r[0]));
      check("G8 〇は今までどおり（3→2・box 2→1）", r[1].correct === 2 && r[1].box === 1, JSON.stringify(r[1]));
    });

    await sec("G9", async () => {
      const g = await pg.evaluate(() => [...document.querySelectorAll(".judge-btn.giri")].map(b => b.closest("section") && b.closest("section").id));
      check("G9 △のボタンは一人の画面の1つだけ（対戦・大問の画面に無い）", g.length === 1 && g[0] === "screen-solo", JSON.stringify(g));
    });
    check("G9 画面のエラー 0", errs.length === 0, errs.join(" | "));
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
