// ホームの「二人で始める」を途中でやめたら、次は残りから（2026-10-11）
// ユーザー「トップの2人で始めるボタンなんですが、途中までやって止めたら、残りができるようにしてほしいです。とめるとまた20問から始まります」
// 本物の Chrome 2枚・390x844・まねの待ち合わせ先（本物には触らない）。使い方: node tools/mikaku/resume_two_probe.mjs
// 見ること:
//   R0 はじめは「二人で始める（5問）」
//   R1 5問で始め、2問答えて「中断」→ ホームの「二人で始める」が「前回の残り3問」になる
//   R2 押すと、問題の並びは残りの3問ちょうど（答えた2問は入らない）・実際に始めると1問目は残りの先頭
//   R3 残りを最後まで終えると、ふつうの「二人で始める（5問）」にもどる（また残りが出ない）
//   R4 「おわる」で途中終了しても、次は残りから（1問答えて おわる → 残り4問）
//   R5 閉じた（開き直した）ときも残りから（残りで始めて1問答えて reload → 残り3問）
//   R6 ✕にした問題はぐるぐるで後ろへ回るが、残りには数えない
//   E  画面のエラー 0
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "0862d66";   // 直す前
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let SERVED = CURRENT;
const relay = await startFakeRelay({ broadcast: true, label: "resume_two" });
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
const U = "第6回.鎌倉時代";
const browser = await chromium.launch({ channel: "chrome" });
const MIG = { "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 };
const SEED = (arg) => {
  const [mig, unit] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify({ subject: "社会", unitsBySubject: { "社会": [unit] }, units: [unit], count: 5, shuffle: false, tiers: [0, 1, 2],
    filterUnmastered: false, filterWeak: false, fairMode: false, headStartSec: 60, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600, speedLevel: 2 }));
};
async function run(label, src) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {})); await page.goto(PAGE_URL); await page.waitForTimeout(400); return { ctx, page, errs }; };
  const tap = (pg, sel) => pg.$eval(sel, e => e.click());
  const waitVis = (pg, sel, ms) => pg.waitForFunction(s => { const e = document.querySelector(s); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); }, sel, { timeout: ms || 25000 });
  const qid = pg => pg.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
  const label2 = pg => pg.$eval("#create-btn", e => e.textContent);
  const ids = pg => pg.evaluate(() => { try { return JSON.parse(localStorage.getItem("kq_battle_host_session_v1")).questionIds.slice(); } catch (e) { return []; } });   // index.html の中身は module で外から見えない→保存した対戦から読む
  const H = (await mk()), G = (await mk());
  const seedBoth = async () => {
    for (const x of [H, G]) { await x.page.evaluate(SEED, [MIG, U]); await x.page.reload(); await x.page.waitForTimeout(1200); }
  };
  // 「二人で始める」を押し、ゲストを入れ、二人とも開始まで
  const reloadHost = async () => { await H.page.evaluate(() => localStorage.removeItem("kq_battle_last_code_v1")); await H.page.reload(); await H.page.waitForTimeout(1500); };   // 同じ番号の部屋を同じ画面で作り直すと偽の待ち合わせ先で出会えないので、開き直す（残りは保存から読む）
  const startRoom = async () => {
    await tap(H.page, "#create-btn");
    await H.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await H.page.$eval("#room-code-display", e => e.textContent);
    await H.page.waitForTimeout(2500);   // 部屋ができあがるまで（前回と同じ番号を使い回すため）
    await G.page.reload(); await G.page.waitForTimeout(800);
    await tap(G.page, "#go-join"); await G.page.fill("#join-code-input", code); await tap(G.page, "#join-btn");
    await waitVis(H.page, "#start-together-btn", 60000);
    await tap(H.page, "#start-together-btn"); await tap(G.page, "#join-start-together-btn");
    await H.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 30000 });
    await H.page.waitForTimeout(400);
  };
  // 1問答える（ゲストが判定。古い手順にも対応）
  const answerOne = async (ok) => {
    await H.page.waitForFunction(() => ["#skip-btn", "#advance-btn"].some(s => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== "none" && e.offsetParent !== null; }), null, { timeout: 30000 }).catch(() => {});
    const legacy = await H.page.evaluate(() => { const e = document.querySelector("#advance-btn"); return !!(e && getComputedStyle(e).display !== "none" && e.offsetParent !== null); });
    const id = await qid(H.page);
    if (legacy) await tap(H.page, "#advance-btn");
    await G.page.waitForFunction(i => document.getElementById("battle-q-id").textContent === "No." + i && getComputedStyle(document.getElementById("battle-view")).display !== "none", id, { timeout: 20000 }).catch(() => {});
    await G.page.waitForTimeout(300);
    if (legacy) await tap(G.page, "#answer-reveal-btn").catch(() => {});
    await waitVis(G.page, "#judge-row", 15000).catch(() => {});
    await tap(G.page, ok ? "#judge-ok" : "#judge-ng").catch(() => {});
    if (legacy) { await waitVis(H.page, "#judge-row", 15000).catch(() => {}); await tap(H.page, "#judge-ok").catch(() => {}); }
    await H.page.waitForFunction(() => document.getElementById("next-btn").classList.contains("show"), null, { timeout: 25000 }).catch(() => {});
    return id;
  };
  const next = async () => { await tap(H.page, "#next-btn").catch(() => {}); await H.page.waitForTimeout(600); };
  const home = async () => { await H.page.evaluate(() => { const b = document.getElementById("result-home-btn"); if (b) b.click(); }); await H.page.waitForTimeout(1200); };
  try {
    await seedBoth();
    const l0 = await label2(H.page);
    check("R0 はじめは「二人で始める（5問）」", /5問/.test(l0) && !/残り/.test(l0), l0);
    // ===== R1・R6 中断 =====
    await startRoom();
    const a1 = await answerOne(false);
    const all = (await ids(H.page)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);   // 1問目の答えで保存される並び（先頭5問）
    await next();     // 1問目 ✕（ぐるぐるで後ろへ回る）
    const a2 = await answerOne(true); await next();      // 2問目 〇
    const midIds = await ids(H.page);
    await tap(H.page, "#battle-pause-btn"); await H.page.waitForTimeout(1200);
    const l1 = await label2(H.page);
    check("R1 5問で始めて2問答えて「中断」→「二人で始める（前回の残り3問）」", /前回の残り3問/.test(l1), JSON.stringify({ l1, all, a1, a2, midIds }));
    check("R6 ✕にした問題（" + a1 + "）はうしろへ回る（並びは" + midIds.length + "件）が、残りには数えない（3問のまま）", /残り3問/.test(l1) && midIds.length > 5, JSON.stringify({ midIds }));
    // ===== R2 押すと残りの並び =====
    await reloadHost();
    await tap(H.page, "#create-btn");
    await H.page.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const want = all.filter(i => i !== a1 && i !== a2);
    const code = await H.page.$eval("#room-code-display", e => e.textContent);
    await H.page.waitForTimeout(2500);   // 部屋ができあがるまで（前回と同じ番号を使い回すため）
    await G.page.reload(); await G.page.waitForTimeout(800);
    await tap(G.page, "#go-join"); await G.page.fill("#join-code-input", code); await tap(G.page, "#join-btn");
    await waitVis(H.page, "#start-together-btn", 60000);
    await tap(H.page, "#start-together-btn"); await tap(G.page, "#join-start-together-btn");
    await H.page.waitForFunction(() => document.getElementById("screen-battle").classList.contains("active"), null, { timeout: 30000 });
    await H.page.waitForTimeout(500);
    // ===== R3 残りを最後まで（出た順を控える）=====
    const asked = [];
    for (let k = 0; k < 3; k++) { asked.push(await answerOne(true)); await next(); await H.page.waitForTimeout(300); }
    check("R2 押すと残りの3問ちょうど・この順で出る（答えた2問は出ない）", JSON.stringify(asked) === JSON.stringify(want), JSON.stringify({ asked, want }));
    await H.page.waitForFunction(() => document.getElementById("screen-result").classList.contains("active"), null, { timeout: 30000 }).catch(() => {});
    await home();
    const l3 = await label2(H.page);
    await reloadHost();
    check("R3 残りを最後まで終えると「二人で始める（5問）」にもどる", !/残り/.test(l3) && /問/.test(l3), l3);
    // ===== R4 おわる =====
    await startRoom();
    const b1 = await answerOne(true); await next();
    await tap(H.page, "#battle-end-btn"); await H.page.waitForTimeout(1000);
    await home();
    const l4 = await label2(H.page);
    await reloadHost();
    check("R4 1問答えて「おわる」→ 次は残り（4問）から", /前回の残り4問/.test(l4), JSON.stringify({ l4, b1 }));
    // ===== R5 閉じる =====
    await reloadHost();
    await startRoom();
    await answerOne(true); await next();
    await H.page.reload(); await H.page.waitForTimeout(1500);
    const l5 = await label2(H.page);
    check("R5 残り4問で始めて1問答えて閉じた（開き直した）→ 残り3問", /前回の残り3問/.test(l5), l5);
    check("E 画面のエラー 0", H.errs.length + G.errs.length === 0, [].concat(H.errs, G.errs).join(" | "));
  } catch (e) { await H.page.screenshot({ path: path.join(ROOT, "tools", "mikaku", "shots", "resume_two_H.png") }).catch(() => {}); await G.page.screenshot({ path: path.join(ROOT, "tools", "mikaku", "shots", "resume_two_G.png") }).catch(() => {}); check("（途中で止まった）", false, e && e.stack || e); }
  finally { await H.ctx.close(); await G.ctx.close(); }
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
if (!process.env.NOW_ONLY) {
  console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
  const outB = await run("base", BASELINE);
  const ngB = report("対照 " + BASE_COMMIT, outB);
  const must = ["R1"].filter(t => !outB.some(c => !c.ok && c.n.startsWith(t)));
  console.log(must.length === 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格（鳴らなかった: " + must.join(" ") + "）");
  if (must.length) await done(3);
}
const ng = report("いまの index.html", await run("now", CURRENT));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
