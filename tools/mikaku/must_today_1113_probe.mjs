// ★2026-11-13 表の問題 g11t1〜t3 を 11-13 の社会に必ず入れる・11-13 に1回だけ つづきを消す の確かめ（今日 11-13 に回す）
//   M1 社会の行の「一人で」→ 最後まで答えて、出た問題に g11t1・t2・t3 が入る・数は行の数のまま
//   M2 理科の行には入らない
//   C1 前の日の つづき（社会 一人 4/12）を入れて開く → 行に「つづき」が出ない（消えた）。もう一度開いても消えたまま（印）
//   C2 消したあとに作った つづきは、開き直しても残る（1回だけ）
//   E  画面のエラー 0
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const server = http.createServer((req, res) => { const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html"; const file = path.join(ROOT, rel);
  fs.readFile(file, (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": rel.endsWith(".html") ? "text/html; charset=utf-8" : rel.endsWith(".js") ? "text/javascript; charset=utf-8" : rel.endsWith(".png") ? "image/png" : "application/octet-stream" }), res.end(b))); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const URL0 = "http://127.0.0.1:" + server.address().port + "/index.html";
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: 1024, height: 1366 } })).newPage(); const errs = [];
page.on("pageerror", e => errs.push(String(e))); page.on("dialog", d => d.accept().catch(() => {}));
const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
const rows = () => page.evaluate(() => [...document.querySelectorAll("#plan-cur .plan-kid-row")].map(r => ({ s: r.dataset.subj, sub: r.querySelector(".plan-kid-sub").textContent })));
const fresh = async (extra) => { await page.goto(URL0); await page.waitForTimeout(600);
  await page.evaluate(x => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 })); localStorage.setItem("kq_battle_daimon_merged_v1", "1"); if (x) for (const k in x) localStorage.setItem(k, x[k]); }, extra || null);
  await page.reload(); await page.waitForTimeout(1200);
  for (const sj of ["#subject-science", "#subject-social"]) { await page.$eval(sj, e => e.click()); await page.waitForTimeout(200); await page.$eval('.count-choice[data-count="20"]', e => e.click()); await page.waitForTimeout(200); } };
const runAll = async (subj) => { await page.click(`#plan-cur .plan-kid-row[data-subj="${subj}"] button[data-kind="solo"]`); await page.waitForTimeout(800);
  const n = +(await page.$eval("#solo-counter", e => e.textContent)).split("/")[1]; const ids = [];
  for (let i = 0; i < n; i++) { ids.push(await page.$eval("#solo-q-id", e => e.textContent.trim())); await page.$eval("#solo-reveal-btn", e => e.click()); await page.waitForTimeout(80); await page.$eval("#solo-judge-ok", e => e.click()); await page.waitForTimeout(150); }
  return { n, ids }; };
try {
  await fresh();
  let r = await rows(); const nS = +(r[0].sub.match(/(\d+)問/) || [])[1];
  const a = await runAll("社会");
  const has = ["g11t1", "g11t2", "g11t3"].map(id => a.ids.some(x => x.includes(id.replace("g11", "")) || x.includes(id)));
  check("M1 社会の一人で（行 " + nS + "問・出た " + a.n + "問）に 表の3枚 " + has.join(","), a.n === nS && has.every(Boolean), a.ids.join(" "));
  // M3 同じ答え（同じ語）が2回出ない
  const dup = await page.evaluate(ids => { const W = a => { let s = String(a || "").trim().replace(/です。?$/, ""); if (s.startsWith("（")) s = [...s.matchAll(/（([^）]*)）/g)].map(m => m[1]).join(" "); s = s.replace(/[（）()「」『』]/g, " "); return new Set(s.split(/[\s　、，,・→／/…。]+/).map(w => w.replace(/^[①-⑳㉑-㉟]/, "").trim()).filter(w => w && !(w.length === 1 && !/[一-龥]/.test(w)))); };
    const by = new Map(QA_DATA.map(d => [d.id, d])), seen = new Map(), out = [];
    ids.map(x => x.replace(/^No\./, "")).forEach(id => { const d = by.get(id); if (!d) return; W(d.a).forEach(w => { if (seen.has(w) && seen.get(w) !== id) out.push(w + ":" + seen.get(w) + "/" + id); seen.set(w, id); }); });
    return out; }, a.ids);
  check("M3 社会の回に同じ答えが2回出ない", dup.length === 0, dup.join(" "));
  await fresh();
  const b = await runAll("理科");
  check("M2 理科には入らない", !b.ids.some(x => /t[123]/.test(x) && /11/.test(x) && /g/.test(x)), b.ids.slice(0, 5).join(" "));
  // C1
  await fresh(); await page.click('#plan-cur .plan-kid-row[data-subj="社会"] button[data-kind="solo"]'); await page.waitForTimeout(800);
  for (let i = 0; i < 3; i++) { await page.$eval("#solo-reveal-btn", e => e.click()); await page.waitForTimeout(80); await page.$eval("#solo-judge-ok", e => e.click()); await page.waitForTimeout(150); }
  await page.$eval("#solo-back", e => e.click()); await page.waitForTimeout(800);
  const keep = await page.evaluate(() => ({ f: localStorage.getItem("kq_battle_free_keep_v1"), s: localStorage.getItem("kq_battle_solo_session_v1") }));
  const r0 = await rows();
  await page.evaluate(() => localStorage.removeItem("kq_battle_clear_keep_1113_v1")); await page.reload(); await page.waitForTimeout(1200);
  const r1 = await rows(); await page.reload(); await page.waitForTimeout(1000); const r2 = await rows();
  check("C1 つづき［" + r0[0].sub + "］→ 11-13 に開く → ［" + r1[0].sub + "］・もう一度［" + r2[0].sub + "］", /つづき/.test(r0[0].sub) && !/つづき/.test(r1[0].sub) && !/つづき/.test(r2[0].sub), JSON.stringify({ keep: (keep.f || "").slice(0, 60) }));
  await page.click('#plan-cur .plan-kid-row[data-subj="社会"] button[data-kind="solo"]'); await page.waitForTimeout(800);
  for (let i = 0; i < 2; i++) { await page.$eval("#solo-reveal-btn", e => e.click()); await page.waitForTimeout(80); await page.$eval("#solo-judge-ok", e => e.click()); await page.waitForTimeout(150); }
  await page.$eval("#solo-back", e => e.click()); await page.waitForTimeout(800); await page.reload(); await page.waitForTimeout(1200);
  const r3 = await rows();
  check("C2 消したあとの つづきは 開き直しても残る［" + r3[0].sub + "］", /つづき/.test(r3[0].sub));
  check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x.slice(0, 400) : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました");
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
