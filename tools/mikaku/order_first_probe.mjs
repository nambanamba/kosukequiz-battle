// 年表（社会）・表（理科）を先に出す（2026-10-05・ユーザー「いきなり細かいので年表からクリアしていきませんか？」案B／「理科も同じように」）
// 本物の Chrome・390x844・まねごとの待ち合わせ先。使い方: node tools/mikaku/order_first_probe.mjs
// 見ること:
//   O1 社会・出題順どおり・段を絞らない: 選んだ単元の年表の問が先頭にまとまり、残りは前と同じ順
//   O2 社会・出題順どおり・「まだ正解していない」だけ: 同じく年表が先
//   O3 理科・出題順どおり: 表の問が先頭にまとまり、残りは前と同じ順（大問は今までどおりの位置関係）
//   O4 ★最優先を付けた問は、年表よりさらに前（親の指定が勝つ）
//   O5 ランダム順では年表を先にしない（年表が先頭にまとまらない）
//   O6 一人・二人で同じ並び（一人の1問目＝ホストの1問目＝ゲストの1問目）
// 自己テスト: 直す前（BASE_COMMIT）で鳴る
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { startFakeRelay } from "./fake_relay.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_COMMIT = "86ba415";
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const CURRENT = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const BASELINE = execSync("git show " + BASE_COMMIT + ":index.html", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const relay = await startFakeRelay({ broadcast: true, label: "orderfirst" });
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
// 判定（アプリと同じ式。検査の側でも独立に書く）
const NEN = q => q.subj === "社会" && /^【演習年表/.test(q.q || "");
const HYO = q => q.subj === "理科" && q.kind !== "calc" && /^【[^】]*表[^】]*】/.test(q.q || "");
const SETTINGS = (subj, unit, shuffle, tiers, star) => ({ subj, unit, shuffle, tiers, star });
const seed = (arg) => {
  const [mig, o] = arg;
  localStorage.clear();
  localStorage.setItem("kq_battle_migrations_v1", JSON.stringify(mig));
  localStorage.setItem("kq_battle_daimon_merged_v1", "1");
  if (o.star) localStorage.setItem("kq_battle_priority_v1", JSON.stringify([o.star]));
  const s = { subject: o.subj, unitsBySubject: { [o.subj]: [o.unit] }, units: [o.unit], count: "all", shuffle: o.shuffle, filterUnmastered: false, filterWeak: false, fairMode: false,
    headStartSec: 1, answerTimeSec: 60, judgeTimeSec: 600, nextTimeSec: 600, skipNextTimeSec: 600 };
  if (o.tiers) s.tiers = o.tiers;
  localStorage.setItem("kq_battle_settings_v1", JSON.stringify(s));
};
// 出題の並びは画面から読む（アプリの関数はページの外から呼べない）。「チェックのみ」で記録を付けずに最後までめくる
const QMAP = new Map(new Function(fs.readFileSync(path.join(ROOT, "data.js"), "utf8").replace(/^const /gm, "var ") + "\nreturn QA_DATA;")().map(q => [q.id, q]));
async function orderOf(page, o) {
  await page.evaluate(seed, [MIG, o]); await page.reload(); await page.waitForTimeout(700);
  const on = await page.evaluate(() => document.getElementById("review-mode-toggle").classList.contains("on"));
  if (!on) await page.$eval("#review-mode-toggle", e => e.click());
  if (!(await page.evaluate(() => document.getElementById("review-mode-toggle").classList.contains("on")))) throw new Error("チェックのみに切りかわらない");
  await page.$eval("#solo-start-btn", e => e.click()); await page.waitForTimeout(400);
  const ids = [];
  for (let k = 0; k < 400; k++) {
    const onSolo = await page.evaluate(() => document.getElementById("screen-solo").classList.contains("active"));
    if (!onSolo) break;
    const id = await page.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, ""));
    if (ids[ids.length - 1] === id) break;
    ids.push(id);
    await page.$eval("#solo-review-next-btn", e => e.click()); await page.waitForTimeout(40);
  }
  await page.$eval("#review-mode-toggle", e => { if (e.classList.contains("on")) e.click(); }).catch(() => {});
  return ids.map(id => QMAP.get(id) || { id, subj: "", q: "", kind: "daimon-item" });
}
async function run(label, src, base) {
  SERVED = src; const out = [];
  const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
  await page.goto(PAGE_URL); await page.waitForTimeout(500);
  const res = {};
  try {
    const headOk = (arr, pred) => { const n = arr.filter(pred).length; return { n, ok: n > 0 && arr.slice(0, n).every(pred) }; };
    const restSame = (arr, pred, baseArr) => JSON.stringify(arr.filter(x => !pred(x)).map(x => x.id)) === JSON.stringify(baseArr.filter(x => !pred(x)).map(x => x.id));
    const s1 = await orderOf(page, SETTINGS("社会", "第6回.鎌倉時代", false)); res.s1 = s1;
    const h1 = headOk(s1, NEN);
    check("O1 社会 第6回・出題順どおり: 年表 " + h1.n + "問が先頭（" + s1.slice(0, 3).map(x => x.id).join(" ") + " …）・残りは前と同じ順", h1.ok && (!base || restSame(s1, NEN, base.s1)), s1.slice(0, 18).map(x => x.id).join(" "));
    const s2 = await orderOf(page, SETTINGS("社会", "第3回.奈良時代", false, [0]));
    const h2 = headOk(s2, NEN);
    check("O2 社会 第3回・「まだ正解していない」だけ: 年表 " + h2.n + "問が先頭", h2.ok, s2.slice(0, 18).map(x => x.id).join(" "));
    const s3 = await orderOf(page, SETTINGS("理科", "第6回.ヒトと動物の呼吸・循環", false)); res.s3 = s3;
    const h3 = headOk(s3, HYO);
    check("O3 理科 第6回・出題順どおり: 表 " + h3.n + "問が先頭・残り（大問をふくむ）は前と同じ順", h3.ok && (!base || restSame(s3, HYO, base.s3)), s3.slice(0, 22).map(x => x.id).join(" "));
    const starId = s1.find(x => !NEN(x)).id;
    const s4 = await orderOf(page, SETTINGS("社会", "第6回.鎌倉時代", false, null, starId));
    check("O4 ★最優先（" + starId + "）は年表よりさらに前", s4[0].id === starId && NEN(s4[1]), s4.slice(0, 3).map(x => x.id).join(" "));
    let together = 0;
    for (let t = 0; t < 5; t++) { const s5 = await orderOf(page, SETTINGS("社会", "第6回.鎌倉時代", true)); const n = s5.filter(NEN).length; if (s5.slice(0, n).every(NEN)) together++; }
    check("O5 ランダム順では年表を先頭にまとめない（5回中 " + together + " 回まとまった）", together === 0);
    // O6 一人・二人で同じ
    await page.evaluate(seed, [MIG, SETTINGS("社会", "第6回.鎌倉時代", false)]); await page.reload(); await page.waitForTimeout(700);
    await page.$eval("#solo-start-btn", e => e.click()); await page.waitForTimeout(500);
    const soloFirst = await page.$eval("#solo-q-id", e => e.textContent.replace(/^No\./, ""));
    const mk = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); p.on("dialog", d => d.accept().catch(() => {})); await p.goto(PAGE_URL); await p.waitForTimeout(500);
      await p.evaluate(seed, [MIG, SETTINGS("社会", "第6回.鎌倉時代", false)]); await p.reload(); await p.waitForTimeout(700); return { c, p }; };
    const H = await mk(), G = await mk();
    await H.p.$eval("#create-btn", e => e.click());
    await H.p.waitForFunction(() => /^\d{4}$/.test(document.getElementById("room-code-display").textContent), null, { timeout: 30000 });
    const code = await H.p.$eval("#room-code-display", e => e.textContent);
    await G.p.$eval("#go-join", e => e.click()); await G.p.fill("#join-code-input", code); await G.p.$eval("#join-btn", e => e.click());
    await H.p.waitForFunction(() => getComputedStyle(document.getElementById("start-together-btn")).display !== "none", null, { timeout: 60000 });
    await H.p.$eval("#start-together-btn", e => e.click()); await G.p.$eval("#join-start-together-btn", e => e.click());
    await H.p.waitForFunction(() => getComputedStyle(document.getElementById("advance-btn")).display !== "none", null, { timeout: 30000 });
    const hostFirst = await H.p.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
    await H.p.$eval("#advance-btn", e => e.click());
    await G.p.waitForFunction(() => /^No\./.test(document.getElementById("battle-q-id").textContent) && getComputedStyle(document.getElementById("battle-view")).display !== "none", null, { timeout: 20000 });
    const guestFirst = await G.p.$eval("#battle-q-id", e => e.textContent.replace(/^No\./, ""));
    await H.c.close(); await G.c.close();
    check("O6 一人・ホスト・ゲストの1問目が同じ（" + soloFirst + " / " + hostFirst + " / " + guestFirst + "）・年表", soloFirst === hostFirst && hostFirst === guestFirst && soloFirst === s1[0].id && NEN(s1[0]));
    check("画面のエラー 0", errs.length === 0, errs.join(" | "));
  } catch (e) { check("最後まで走った", false, String(e && e.message || e).split("\n")[0]); }
  finally { await ctx.close(); }
  out.res = res;
  return out;
}
function report(t, out) { console.log("\n── " + t + " ──"); let ng = 0; for (const c of out) { console.log("  " + (c.ok ? "✔" : "✘") + " " + c.n + (c.x ? " … " + c.x : "")); if (!c.ok) ng++; } return ng; }
const done = async c => { await browser.close(); server.close(); relay.close(); process.exit(c); };
// 各回の数（データから）
{
  const Q = new Function(fs.readFileSync(path.join(ROOT, "data.js"), "utf8").replace(/^const /gm, "var ") + "\nreturn QA_DATA;")();
  const by = {}; Q.forEach(q => { if (NEN(q) || HYO(q)) by[q.subj + " " + q.u.split(".")[0]] = (by[q.subj + " " + q.u.split(".")[0]] || 0) + 1; });
  console.log("先に出す問の数: " + Object.entries(by).map(([k, v]) => k + " " + v).join(" ／ "));
}
console.log("■ 自己テスト: 直す前 " + BASE_COMMIT + " … ★鳴るのが正しい");
const B = await run("base", BASELINE, null);
const ngB = report("対照 " + BASE_COMMIT, B);
console.log(ngB > 0 ? "  → ✔ 自己テスト合格（" + ngB + " 件で鳴った）" : "  → ✘ 自己テスト不合格");
if (ngB === 0) await done(3);
const ng = report("いまの index.html", await run("now", CURRENT, B.res));
console.log(ng === 0 ? "\n✔ 全部通りました" : "\n✘ " + ng + " 件ひっかかりました");
await done(ng ? 1 : 0);
