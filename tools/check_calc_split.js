// ★2026-11-14 ユーザーの決まり（これからずっと）「一問一答で出るような問題は計算問題には出さない。計算問題に出るような問題は一問一答には出さない」
//   設計: 全体確認\新しいアプリ\設計\決まり_一問一答と計算を分ける_2026-11-14.md
// 理科の暗記カード（data.js）と、理科計算ステップ帳（rika-step\app\data_NN.js・dan.js）を照らして、同じ問題（同じ本・ページ・問題番号）を出す。
//   段（dan.js）が 1・2・3（式を立てて計算する）の小問と同じカード ＝ カードから外す候補。段 a（暗算・読むだけ）はカードに残す（ステップ帳からは外した）
//   あわせて「計算プリントと同じ問題」と書いたカード、答えが数で 何cm・何g などを聞くカード（計算らしい）も出す（人が見て決める）
// 使い方: node tools/check_calc_split.js [回]   （data.js は DATA=<data.js の場所> で変えられる。手元の master が古いときは origin の最新の写しを指す）
//         node tools/check_calc_split.js [回]   … 回を付けるとその回だけ（新しい回を入れるときは、入れたあとで必ず回す）
//   出たカードは、外す前にユーザーの OK を取る（今日の分・印刷ずみは変えない）
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), RS = path.resolve(ROOT, "..", "rika-step", "app");
const KAI = process.argv[2] ? +process.argv[2] : 0;
global.window = {}; eval(fs.readFileSync(process.env.DATA || path.join(ROOT, "data.js"), "utf8").replace(/^const /m, "var "));
const QA = (typeof QA_DATA !== "undefined" ? QA_DATA : window.QA_DATA).filter(x => x.subj === "理科" && (!KAI || new RegExp("^第" + KAI + "回\.").test(x.u)));
global.window = {}; for (const f of fs.readdirSync(RS).filter(f => /^data_\d+\.js$/.test(f))) eval(fs.readFileSync(path.join(RS, f), "utf8"));
eval(fs.readFileSync(path.join(RS, "dan.js"), "utf8"));
const KD = window.KAI_DATA, DAN = window.DAN;
const circ = s => { const c = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚"; const i = c.indexOf(s); return i >= 0 ? String(i + 1) : s; };
const keyRS = b => { let m;
  if (m = /^理科 p\.(\d+)(?:〜\d+)? (例題|要点チェック 問(\d+))/.exec(b)) return m[2] === "例題" ? ["Y", m[1], "例題", ""] : ["C", m[1], "問", m[3]];
  if (m = /^演習 p\.(\d+)(?:〜\d+)? (まとめてみよう|基本問題|練習問題)\s*([①-㉚]|\d+)?/.exec(b)) return ["E", m[1], m[2].replace("まとめてみよう", "まとめ"), m[3] ? circ(m[3]) : ""];
  return null; };
const keyQA = n => { let m; n = String(n || "");
  if (m = /予習シリーズ理科、(\d+)P、例題/.exec(n)) return ["Y", m[1], "例題", ""];
  if (m = /要点チェック、(\d+)P、問(\d+)/.exec(n)) return ["C", m[1], "問", m[2]];
  if (m = /演習問題集、(\d+)P、(まとめ|基本問題|練習問題)\s*([①-㉚]|\d+)?/.exec(n)) return ["E", m[1], m[2], m[3] ? circ(m[3]) : ""];
  return null; };
const isCalc = q => /\d/.test(String(q.a)) && /何(cm|g|m|秒|倍|℃|度|%|L|mL|個|回|kg|分|km|ルクス|本|枚)|何倍|求め|計算|いくら|何分の/.test(String(q.q));
const same = [];
for (const [k, K] of Object.entries(KD)) for (const u of K.units) for (const st of [...(u.steps || []), ...(u.extra || [])]) {
  const kr = keyRS(st.book || ""); if (!kr) continue; const dan = (DAN[k] || {})[st.id] || "";
  for (const q of QA) { const kq = keyQA(q.note); if (!kq || +(String(q.u).match(/^第(\d+)回/) || [])[1] !== +k) continue;
    if (kq[0] !== kr[0] || kq[1] !== kr[1] || kq[2] !== kr[2] || (kr[3] && kq[3] && kr[3] !== kq[3])) continue;
    const sm = /\((\d+)\)/.exec(String(q.note).replace(/^[^、]*、[^、]*、/, "")); let d = dan, sub = "";
    if (sm && st.subs) { const i = st.subs.indexOf("(" + sm[1] + ")"); if (i >= 0) { d = dan[i] || ""; sub = st.subs[i]; } }
    if (/[123]/.test(d)) same.push({ id: q.id, kai: +k, step: st.id + " " + st.no + (sub ? " " + sub : ""), dan: d, calc: isCalc(q), note: q.note, q: String(q.q).replace(/\s+/g, " ").slice(0, 70), a: String(q.a).slice(0, 30) }); } }
const ids = new Set(same.map(r => r.id));
const pr = QA.filter(q => /計算プリント/.test(q.note || "") && !ids.has(q.id)).map(q => ({ id: q.id, calc: isCalc(q), note: q.note, q: String(q.q).replace(/\s+/g, " ").slice(0, 70), a: String(q.a).slice(0, 30) }));
const lk = QA.filter(q => isCalc(q) && !ids.has(q.id) && !/計算プリント/.test(q.note || "")).map(q => ({ id: q.id, note: q.note, q: String(q.q).replace(/\s+/g, " ").slice(0, 70), a: String(q.a).slice(0, 30) }));
console.log(JSON.stringify({ same, print: pr, like: lk }, null, 1));
console.error("理科のカード " + QA.length + "・ステップ帳と同じで段1〜3 " + same.length + "（うち計算らしい " + same.filter(r => r.calc).length + "）・計算プリントと同じ " + pr.length + "・ほか計算らしい " + lk.length);
