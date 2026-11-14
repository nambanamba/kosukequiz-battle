// ★2026-11-14 ユーザー「同じ答えの暗記カードはセットにして1枚として進める。一通り終わって、復習や組み分け前には…セットの別な聞き方で問題を出す」
//   orderByLog（今日やることの選び方・11-15 から）を、同じ答えの組（pick.js の groupsOf "words"）で数える・出すのは前に出したカードの次の聞き方
// 使い方: node tools/mikaku/same_group_1114_probe.mjs（ページに orderByLog・answerGroups・学習ログの差しかえ口だけを足して呼ぶ）
// 見ること（社会 第11回のカード）:
//   G1 返すのは1組1枚（同じ組のカードが2枚出ない）
//   G2 組の1枚を前の回で ◎ → 組ごと後ろ（まだのカードの後）・出すのは次の聞き方
//   G3 組の1枚を前の回で ✕ → 組がいちばん先・同じカードでもう一度（覚えるまでは同じ聞き方。別の聞き方は ◎ のあとの復習）
//   G4 組の別のカードを答えても、組として数える（組の2枚目を ◎ → 1枚目も「まだ」には戻らない）
import fs from "node:fs"; import path from "node:path"; import http from "node:http";
import { execSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = await import(pathToFileURL(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright", "index.mjs")).href);
const SRC = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace("function orderByLog(list){", "window.__olb = l => orderByLog(l); window.__groups = l => answerGroups(l); window.__setLog = s => { studyLog.sessions = s; };\nfunction orderByLog(list){");
const server = http.createServer((req, res) => { const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  if (rel === "index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(SRC); return; }
  fs.readFile(path.join(ROOT, rel), (e, b) => e ? res.writeHead(404).end() : (res.writeHead(200, { "content-type": rel.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream" }), res.end(b))); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chrome" }); const page = await (await browser.newContext()).newPage(); const errs = [];
page.on("pageerror", e => errs.push(String(e)));
const out = []; const check = (n, ok, x) => out.push({ n, ok: !!ok, x: x == null ? "" : String(x) });
try {
  await page.clock.install({ time: new Date("2026-11-16T08:00:00+09:00") });
  await page.goto("http://127.0.0.1:" + server.address().port + "/index.html"); await page.waitForTimeout(800);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("kq_battle_migrations_v1", JSON.stringify({ "kaki1-4": 1, "kaki5-8": 1, "lastcorrect-backfill": 1 })); localStorage.setItem("kq_battle_daimon_merged_v1", "1"); });
  await page.reload(); await page.waitForFunction(() => !!window.__olb, null, { timeout: 30000 }); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const list = QA_DATA.map((d, i) => [d, i]).filter(([d]) => d.subj === "社会" && /^第11回\./.test(d.u) && d.kind !== "calc").map(([, i]) => i);
    const gs = window.__groups(list), G = gs.find(g => g.length >= 2), id = i => QA_DATA[i].id, gi = new Map(); gs.forEach((g, k) => g.forEach(i => gi.set(i, k)));
    const one = res => { const seen = new Set(); return res.every(i => { const k = gi.get(i); if (seen.has(k)) return false; seen.add(k); return true; }); };
    const day = d => new Date(d + "T19:00:00+09:00").getTime();
    const run = log => { window.__setLog(log); return window.__olb(list); };
    const ses = (d, q) => ({ id: "t" + d, st: day(d), k: "solo", role: "host", q });
    const out = { groups: gs.length, multi: gs.filter(g => g.length >= 2).length, G: G.map(id) };
    let res = run([]); out.g1 = one(res) && res.length === gs.length;
    res = run([ses("2026-11-15", [[id(G[0]), 2, "o"]])]); out.g2pos = res.indexOf(G[1]); out.g2has0 = res.includes(G[0]); out.g2n = res.length; out.g2 = res.includes(G[1]) && !res.includes(G[0]) && res.indexOf(G[1]) === res.length - 1;
    res = run([ses("2026-11-15", [[id(G[0]), 2, "x"]])]); out.g3 = res[0] === G[0] && !res.includes(G[1]);
    res = run([ses("2026-11-15", [[id(G[1]), 2, "o"]])]); out.g4show = id(res.find(i => gi.get(i) === gi.get(G[0]))); out.g4 = !res.slice(0, res.length - 1).some(i => gi.get(i) === gi.get(G[0]));
    return out; });
  check("G1 1組1枚（組 " + r.groups + "・2枚以上の組 " + r.multi + "）", r.g1, "");
  check("G2 組の1枚（" + r.G[0] + "）を前の回で ◎ → 組は最後・次の聞き方 " + r.G[1] + "（位置 " + r.g2pos + "/" + r.g2n + "）", r.g2, JSON.stringify(r));
  check("G3 前の回で ✕ → 組がいちばん先・同じカード " + r.G[0] + " でもう一度", r.g3, "");
  check("G4 組の2枚目（" + r.G[1] + "）を ◎ → 組として数える（まだ に戻らない・出すのは " + r.g4show + "）", r.g4, "");
  check("E 画面のエラー 0", errs.length === 0, errs.join(" | "));
} catch (e) { check("最後まで走った", false, String(e && e.message || e)); }
let ng = 0; for (const c of out) { console.log((c.ok ? "  ✔ " : "  ✘ ") + c.n + (c.x ? " … " + c.x.slice(0, 300) : "")); if (!c.ok) ng++; }
console.log(ng ? "\n✘ " + ng + " 件" : "\n✔ 全部通りました");
await browser.close(); server.close(); process.exit(ng ? 1 : 0);
