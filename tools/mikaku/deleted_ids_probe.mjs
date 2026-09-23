// 取り込みで問題を消したあと、実機（本物のChrome・スマホ幅390px）で回を頭から通しに出題して、
// ★消した問が出ないこと と ★残った問の並び・中身が変わっていないこと を画面から確かめる（B-12）。
//
// mikaku_check2.mjs は「名指しした数問を見に行く」道具。
// こちらは「★その回を全部出して、data.js と1問ずつ突き合わせる」道具です。
// 消したあとの確認では、**出てほしくないものが出ない**ことを見る必要があり、
// 数問だけ見に行く作りでは「出なかった」が確かめられないため、別に用意しました。
//
//   使い方: node tools/mikaku/deleted_ids_probe.mjs r4m --gone r4m05,... --before data.js.bak
//     第1引数  … 通しに出題する id の接頭辞（回）。★回の名前ではなくデータから単元を引きます
//     --gone   … 消したはずの id。1つでも画面に出たら失敗
//     --before … ★消す前の data.js。**同じ手順で2回出題して、並びを突き合わせます**
//
// ⚠️ **出題の並びは data.js の並びとは違います**（★最優先・未クリアなどで前に出る問があるため）。
//    はじめ data.js の並びと比べて「ちがう」と出ましたが、**壊れていたのはこの道具の期待のほう**でした。
//    → 正しい比べ方は「**消す前に同じ手順で出したときの並び**から、消した分だけ抜けているか」です（4-6c）。
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url"; import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "tools", "mikaku", "shots_deleted");
fs.mkdirSync(SHOTS, { recursive: true });

const args = process.argv.slice(2);
const PREFIX = args[0];
const gi = args.indexOf("--gone");
const GONE = gi >= 0 ? args[gi + 1].split(",").map(s => s.trim()).filter(Boolean) : [];
const si = args.indexOf("--shoot");
const SHOOT = si >= 0 ? args[si + 1].split(",").map(s => s.trim()).filter(Boolean) : [];  // 写真を残したい id
const bi = args.indexOf("--before");
const BEFORE = bi >= 0 ? args[bi + 1] : null;   // ★消す前の data.js（比べる相手を固定する）
if (!PREFIX) { console.error("id の接頭辞を渡してください（例: r4m）"); process.exit(2); }

const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = await import(pathToFileURL(path.join(gRoot, "playwright", "index.mjs")).href);

const MIME = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".jpg":"image/jpeg",".png":"image/png"};
let dataJsOverride = null;   // ★ここに入れた版を data.js として出す（実物は書きかえない）
const server = http.createServer((req,res)=>{
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/,"") || "index.html";
  const file = (rel === "data.js" && dataJsOverride) ? dataJsOverride : path.join(ROOT, rel);
  if (!path.resolve(file).startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e,b)=> e ? res.writeHead(404).end()
    : (res.writeHead(200,{"content-type":MIME[path.extname(file).toLowerCase()]||"application/octet-stream"}), res.end(b)));
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const BASE = "http://127.0.0.1:"+server.address().port+"/index.html";

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e=>errs.push("JSエラー: "+e.message));
page.on("console", m=>{ if(m.type()==="error") errs.push("consoleエラー: "+m.text()); });
page.on("requestfailed", r=>errs.push("取得できず: "+r.url()));
page.on("response", r=>{ if(r.status()>=400) errs.push("HTTP"+r.status()+": "+r.url()); });
await page.goto(BASE); await page.waitForTimeout(900);

// ★出題する単元を、回の名前ではなく**データから**引く（4-6b: 名指しにしない）
const plan = await page.evaluate(p => {
  const rows = QA_DATA.filter(q => q.id.startsWith(p));
  const subj = [...new Set(rows.map(r => r.subj))];
  const units = [...new Set(rows.map(r => r.u))];
  return { subj, units, expect: rows.map(r => ({ id: r.id, q: r.q })) };
}, PREFIX);
if (plan.subj.length !== 1 || plan.units.length !== 1) {
  console.error("★この道具は「1科目・1単元にまとまった回」を想定しています: " + JSON.stringify(plan.subj) + " " + JSON.stringify(plan.units));
  await browser.close(); server.close(); process.exit(2);
}
const SUBJ = plan.subj[0], UNIT = plan.units[0];
console.log("対象: " + SUBJ + " / " + UNIT + "  （data.js では " + plan.expect.length + "問）");

// ---- 同じ手順で1回ぶん通しに出題して、出た id と問題文を持ちかえる ----
//      tag は写真の名前に付けるだけ。★手順は before / after でまったく同じにすること
async function walk(tag, overridePath) {
  dataJsOverride = overridePath;
  await page.evaluate(()=>localStorage.clear());
  await page.reload(); await page.waitForTimeout(900);
  await page.click(SUBJ === "理科" ? "#subject-science" : "#subject-social");
  await page.waitForTimeout(400);
  for (let k = 0; k < 8; k++) {
    const shut = await page.$$(".unit-group-header:not(.open)");
    if (!shut.length) break;
    for (const el of shut) { try { await el.click(); } catch {} }
    await page.waitForTimeout(200);
  }
  await page.click('#unit-choices .choice[data-unit="ALL"]'); await page.waitForTimeout(200);
  await page.click(`#unit-choices .choice[data-unit="${UNIT}"]`); await page.waitForTimeout(250);
  // ★「出題順どおり」にする。**`#order-toggle` は checkbox ではなく div.toggle** なので、
  //   `o.checked` を見ると**常に undefined で、一度も切りかわらない**。
  //   ★これを見落として、ランダム順のまま「並びが変わった」と誤報した（2026-09-23）。
  //   （`mikaku_check2.mjs` にも同じ書き方があります。あちらは名指しの数問を探す道具なので実害は出ていません）
  // 「出題順どおり」はたたんだパネル（#battle-settings-panel）の中にあるので、先に開く
  if (await page.evaluate(() => document.querySelector("#battle-settings-panel")?.hidden)) {
    await page.click("#battle-settings-open"); await page.waitForTimeout(300);
  }
  const orderOn = await page.evaluate(() => document.querySelector("#order-toggle")?.classList.contains("on"));
  if (!orderOn) { await page.click("#order-toggle"); await page.waitForTimeout(200); }
  const nowOn = await page.evaluate(() => document.querySelector("#order-toggle")?.classList.contains("on"));
  if (!nowOn) { console.error("★「出題順どおり」にできませんでした。並びの確かめはできません"); process.exit(2); }
  await page.evaluate(() => {
    const c = document.querySelector('.count-choice[data-count="all"]');
    if (c && !c.classList.contains("on")) c.click();
  });
  await page.waitForTimeout(200);

  // ホームの数字（消した問の記録が数に混ざらないかを見るため）
  const homeTotal = (await page.textContent("#stat-total").catch(()=>"?") || "").trim();
  const homeUnmastered = (await page.textContent("#stat-unmastered").catch(()=>"?") || "").trim();
  // data.js からの期待（その版に入っている、その回の問）
  const expect = await page.evaluate(p => QA_DATA.filter(q => q.id.startsWith(p)).map(q => ({id:q.id, q:q.q})), PREFIX);

  await page.click("#solo-start-btn"); await page.waitForTimeout(900);

  const shown = [];
  for (let i = 0; i < 500; i++) {
    // ★「出題中か」を先に見る。あとで見ると、最後の1問を2回数えてしまう
    //   （実際に 77問のはずが 78問と出た。数えかたのほうが壊れていた）
    const btn = await page.$("#solo-reveal-btn");
    if (!btn || !(await btn.isVisible())) break;
    const raw = (await page.textContent("#solo-q-id").catch(()=>null) || "").trim();
    const id = (raw.match(/[A-Za-z][A-Za-z0-9_]*$/) || [""])[0];
    if (!id) break;
    const q = (await page.evaluate(()=>document.querySelector("#solo-q")?.innerText || "")).trim();
    const hasImg = await page.evaluate(()=>!!document.querySelector("#solo-img-wrap")?.offsetParent);
    shown.push({ id, q, hasImg });
    if (shown.length <= 2 || GONE.includes(id) || SHOOT.includes(id)) {
      await page.screenshot({ path: path.join(SHOTS, tag + "_" + String(shown.length).padStart(3,"0") + "_" + id + ".png"), fullPage: true });
    }
    await page.click("#solo-reveal-btn"); await page.waitForTimeout(70);
    const ok = await page.$("#solo-judge-ok");
    if (!ok || !(await ok.isVisible())) break;
    await page.click("#solo-judge-ok"); await page.waitForTimeout(90);
  }
  await page.screenshot({ path: path.join(SHOTS, tag + "_last.png"), fullPage: true });
  return { shown, expect, homeTotal, homeUnmastered };
}

const after = await walk("after", null);
const before = BEFORE ? await walk("before", path.resolve(ROOT, BEFORE)) : null;

// ------------------------------------------------------------------ 突き合わせ
const norm = s => s.replace(/\s+/g, "");
const gotIds = after.shown.map(r => r.id);
const wantIds = after.expect.map(r => r.id);
const dup = gotIds.filter((v,i)=>gotIds.indexOf(v) !== i);
const leaked = GONE.filter(g => gotIds.includes(g));
const missing = wantIds.filter(i => !gotIds.includes(i));
const extra = gotIds.filter(i => !wantIds.includes(i));
const byId = new Map(after.expect.map(r => [r.id, r.q]));
// 画面の問題文は data.js の q を「そのまま含む」はず（【図】などの飾りは画面では消える）
const textBad = after.shown.filter(r => {
  const w = byId.get(r.id);
  if (w === undefined) return true;
  return !norm(r.q).includes(norm(w).replace(/【[^】]*】/g, ""));
});

console.log("\n===== 結果（" + PREFIX + "）=====");
console.log("data.js の問数            : " + wantIds.length);
console.log("実機で出題された問数       : " + gotIds.length + (dup.length ? "  ★同じ問が2回: " + dup.join(",") : ""));
console.log("★消した問が画面に出たか    : " + (leaked.length ? "★出た " + leaked.join(",") : GONE.length + "問とも出ていない"));
console.log("出題されなかった問         : " + (missing.length ? "★" + missing.join(",") : "0件"));
console.log("data.js に無いのに出た問   : " + (extra.length ? "★" + extra.join(",") : "0件"));
console.log("★問題文が data.js と合うか : " + (textBad.length ? "★ちがう " + textBad.length + "件 " + textBad.slice(0,5).map(r=>r.id).join(",") : "全問一致"));
console.log("画像が出ている問           : " + after.shown.filter(r=>r.hasImg).length + "問");
console.log("ホームの数字               : 全問題数 " + after.homeTotal + " / 未クリア " + after.homeUnmastered);

let orderOk = true;
if (before) {
  // ★「消す前に同じ手順で出したときの並び」と比べる。
  //   足された問もあるので、**両方に在る問だけを取り出して**並びを見る（消えた分・増えた分を除く）
  const b = before.shown.map(r=>r.id), a = gotIds;
  const both = new Set(b.filter(i => a.includes(i)));
  const bs = b.filter(i => both.has(i)), as = a.filter(i => both.has(i));
  orderOk = JSON.stringify(bs) === JSON.stringify(as);
  console.log("\n--- 消す前（" + BEFORE + "）と比べる ---");
  console.log("消す前に出た問数           : " + b.length + "  → いま " + a.length);
  console.log("消えた問                   : " + b.filter(i=>!a.includes(i)).length + "問");
  console.log("増えた問                   : " + a.filter(i=>!b.includes(i)).length + "問");
  console.log("★残った " + bs.length + "問の出る順が変わっていないか: " + (orderOk ? "変わっていない" : "★変わった"));
  if (!orderOk) {
    const d = bs.findIndex((v,i)=>as[i] !== v);
    console.log("   はじめて食いちがう所: " + d + "番目  消す前=" + bs[d] + " いま=" + as[d]);
  }
  console.log("消す前のホームの数字       : 全問題数 " + before.homeTotal + " / 未クリア " + before.homeUnmastered);
}

console.log("JSエラー                  : " + (errs.length ? errs.join(" | ") : "0件"));
console.log("画面の写真                : " + SHOTS);

const ng = leaked.length || dup.length || missing.length || extra.length || textBad.length || !orderOk || errs.length;
console.log("\n" + (ng ? "★NG" : "✔ 問題なし"));
await browser.close(); server.close();
process.exit(ng ? 1 : 0);
