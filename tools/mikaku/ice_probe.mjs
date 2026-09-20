// 対戦がつながらないとき用。**本物の Chrome で ICE 候補を実際に集めて**、
// いま index.html に書いてある STUN/TURN が生きているかを見る。
//
// 使い方: node tools/mikaku/ice_probe.mjs
//
// ★この検査が見るもの / 見ないもの（C-4d・D-17）
//   見る  … ①STUN が返事をするか（srflx 候補が出るか）
//           ②TURN が中継を貸してくれるか（relay 候補が出るか＝生死と合いことばの両方）
//           ③どのURLがダメか（onicecandidateerror の番号と文）
//   見ない… **2台が実際につながるか**。ここは1台・1つの回線からしか見ていない。
//           自宅のWi-Fiから見て TURN が生きていても、**LTE側の回線で塞がれていれば別の話**。
//           そこは実機2台でしか分からない（B-12）。
//
// ★設定は index.html から**その場で抜き出す**。写して持たない（写すと古くなる）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const { execSync } = await import("node:child_process");
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return await import(pathToFileURL(path.join(root, "playwright", "index.mjs")).href);
}

// ---- index.html から RTC_CONFIG を抜き出す ----
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const m = html.match(/const RTC_CONFIG = (\{[\s\S]*?\n\});/);
if (!m) { console.error("✘ index.html の RTC_CONFIG が見つかりません（書き方が変わった？）"); process.exit(2); }
const RTC_CONFIG = JSON.parse(
  m[1].replace(/\/\/[^\n]*/g, "").replace(/([{,]\s*)(\w+):/g, '$1"$2":').replace(/,(\s*[}\]])/g, "$1")
);
const servers = RTC_CONFIG.iceServers;
const turns = servers.filter(s => /^turns?:/i.test(Array.isArray(s.urls) ? s.urls[0] : s.urls));
const stuns = servers.filter(s => /^stun:/i.test(Array.isArray(s.urls) ? s.urls[0] : s.urls));
console.log(`index.html の設定: STUN ${stuns.length}本 / TURN ${turns.length}本`);
if (turns.length === 0) { console.error("✘ TURN が1本もありません。この検査は意味を持ちません"); process.exit(2); }

// WebRTC は「安全なもと」でしか動かない（about:blank や file: では使えない）ので、
// 空のページを 127.0.0.1 で出すだけの小さなサーバを立てる
const http = await import("node:http");
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<!doctype html><title>ice probe</title>");
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/";

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: "load" });

// 1回ぶんの候補集め。policy が "relay" なら中継しか使わない
async function gather(iceServers, policy, ms = 15000) {
  return await page.evaluate(async ({ iceServers, policy, ms }) => {
    const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: policy });
    const cands = [], errs = [];
    pc.onicecandidateerror = e => errs.push({
      url: e.url, code: e.errorCode, text: e.errorText, address: e.address, port: e.port
    });
    pc.createDataChannel("probe");
    const done = new Promise(res => {
      pc.onicecandidate = e => { if (e.candidate) cands.push(e.candidate.candidate); else res("complete"); };
      setTimeout(() => res("timeout"), ms);
    });
    await pc.setLocalDescription(await pc.createOffer());
    const how = await done;
    const types = {};
    for (const c of cands) {
      const t = (c.match(/ typ (\w+)/) || [])[1] || "?";
      const proto = (c.match(/^candidate:\S+ \d+ (\w+)/) || [])[1] || "?";
      const key = t + (t === "relay" ? "/" + proto : "");
      types[key] = (types[key] || 0) + 1;
    }
    pc.close();
    return { how, n: cands.length, types, errs };
  }, { iceServers, policy, ms });
}

const label = s => (Array.isArray(s.urls) ? s.urls.join(",") : s.urls);
let ng = 0;

// ---- ① いまの設定そのままで集める ----
console.log("\n── ① index.html の設定そのまま（ふだん使われる形）──");
{
  const r = await gather(servers, "all");
  console.log(`  集め終わり: ${r.how} / 候補 ${r.n}件 ${JSON.stringify(r.types)}`);
  if (!r.types.srflx) { console.log("  ⚠️ srflx が0件。STUN が効いていない（自分の外から見える住所が分からない）"); ng++; }
  if (!Object.keys(r.types).some(k => k.startsWith("relay"))) {
    console.log("  ✘ relay が0件。**中継が1本も借りられていない**＝TURN は効いていない"); ng++;
  } else console.log("  ✔ relay あり。中継は借りられている");
  for (const e of r.errs) console.log(`    · error ${e.code} ${e.url} — ${e.text}`);
}

// ---- ② TURN 1本ずつ（中継だけを使う設定で、生きている本数を数える）----
console.log("\n── ② TURN を1本ずつ（中継だけ・どれが生きているか）──");
const alive = [];
for (const s of turns) {
  const r = await gather([s], "relay", 12000);
  const ok = Object.keys(r.types).some(k => k.startsWith("relay"));
  console.log(`  ${ok ? "✔" : "✘"} ${label(s)} → ${r.n}件 ${JSON.stringify(r.types)}`);
  for (const e of r.errs) console.log(`      · error ${e.code} — ${e.text}`);
  if (ok) alive.push(label(s));
}
console.log(`  生きている TURN: ${alive.length} / ${turns.length}`);
if (alive.length === 0) ng++;

// ---- ③ この検査自体が鳴るかを確かめる（D-17）----
//   でたらめな TURN を1本だけ渡して、「✘」と言えることを見る。
//   ここが ✔ になったら、上の結果は信用できない。
console.log("\n── ③ この検査が本当に鳴るか（わざと壊した設定を渡す）──");
{
  const fake = [{ urls: "turn:127.0.0.1:3478", username: "x", credential: "x" }];
  const r = await gather(fake, "relay", 6000);
  const ok = Object.keys(r.types).some(k => k.startsWith("relay"));
  if (ok) { console.log("  ✘✘ でたらめな TURN で relay が出た。**この検査は壊れている**"); ng++; }
  else console.log("  ✔ でたらめな TURN では relay が0件。検査は鳴る");
}

await browser.close();
console.log(ng === 0 ? "\n✔ 通信の足まわりに問題は見つからなかった" : `\n✘ ${ng}件、気になる点あり`);
process.exit(ng === 0 ? 0 : 1);
