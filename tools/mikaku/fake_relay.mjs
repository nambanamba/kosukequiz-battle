// ★こちらで中身を決められる、ちいさな「待ち合わせ先」（nostr relay のまねごと）。
//
// なぜ要るか（2026-09-20）:
//   本物の relay が切れる場面は、こちらから起こせない。
//   **「相手から切られる」を再現しないと、実際に起きた壊れ方を試したことにならない**
//   （確認ポイント 4-1「作るきっかけになった実例そのものを、まず仕込んで鳴らす」）。
//
// できること:
//   - `REQ` には `EOSE` を返す／`EVENT` には `OK` を返す（それだけ。中身は見ない）
//   - `closeAfterMs` たったら、**こちら（相手側）から接続を切る**
//   - **何回つなぎに来たか**を数える ← 張り直したかどうかの証拠になる
//
// ★見ていないもの: nostr の仕様として正しいかどうか。**つながって切れる**ところだけを作っている。
import http from "node:http";
import crypto from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// サーバ→クライアントのフレーム（マスクなし）
function frame(opcode, payload) {
  const buf = Buffer.from(payload || "", "utf8");
  const head = buf.length < 126 ? Buffer.from([0x80 | opcode, buf.length])
    : Buffer.concat([Buffer.from([0x80 | opcode, 126]), (() => { const b = Buffer.alloc(2); b.writeUInt16BE(buf.length); return b; })()]);
  return Buffer.concat([head, buf]);
}

// クライアント→サーバのフレームを取り出す（マスクあり・1フレーム＝1メッセージ前提）
function* frames(buf) {
  let i = 0;
  while (i + 2 <= buf.length) {
    const opcode = buf[i] & 0x0f;
    const masked = (buf[i + 1] & 0x80) !== 0;
    let len = buf[i + 1] & 0x7f, j = i + 2;
    if (len === 126) { len = buf.readUInt16BE(j); j += 2; }
    else if (len === 127) { len = Number(buf.readBigUInt64BE(j)); j += 8; }
    let mask = null;
    if (masked) { mask = buf.slice(j, j + 4); j += 4; }
    if (j + len > buf.length) return;           // まだ届いていない
    const data = buf.slice(j, j + len);
    if (mask) for (let k = 0; k < data.length; k++) data[k] ^= mask[k % 4];
    yield { opcode, text: data.toString("utf8") };
    i = j + len;
  }
}

// ★broadcast: true を渡すと、**受け取った告知を、ほかのつなぎ先にも配る**（2026-09-23 に追加）。
//   これが無いと「相手の名乗りを受けた」を、本物の relay を使わずに試せない。
//   配る相手は、**同じ目印（タグ）を購読している接続だけ**。
//   ⚠️ 全員に配ると「別の部屋なのに受け取った」ことになり、検査の意味が消える
export async function startFakeRelay({ closeAfterMs = 0, label = "fake", rejectWith = null, broadcast = false } = {}) {
  const state = { connects: 0, closes: 0, urls: [], lastMsgs: [], events: 0, delivered: 0 };
  const peers = new Set();   // { sock, subs: Map<subId, Set<タグの値>> }
  const server = http.createServer((_, res) => res.writeHead(426).end());
  server.on("upgrade", (req, sock) => {
    state.connects++;
    const key = req.headers["sec-websocket-key"];
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
               "Sec-WebSocket-Accept: " + accept + "\r\n\r\n");
    const me = { sock, subs: new Map() };
    peers.add(me);
    sock.on("close", () => peers.delete(me));
    let buf = Buffer.alloc(0);
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      for (const f of frames(buf)) {
        if (f.opcode === 0x8) { sock.end(); return; }          // 相手から閉じた
        if (f.opcode === 0x9) { sock.write(frame(0xA, "")); continue; }
        if (f.opcode !== 0x1) continue;
        state.lastMsgs.push(f.text.slice(0, 120));
        try {
          const m = JSON.parse(f.text);
          if (m[0] === "REQ") {
            if (broadcast) {
              // 購読の目印（"#x" などのタグ）を控える
              const tags = new Set();
              m.slice(2).forEach(f => Object.keys(f || {}).forEach(k => {
                if (k.charAt(0) === "#") (f[k] || []).forEach(v => tags.add(String(v)));
              }));
              me.subs.set(m[1], tags);
            }
            sock.write(frame(0x1, JSON.stringify(["EOSE", m[1]])));
          }
          // ★`rejectWith` を渡すと、告知を**断る**（Trystero はこれで relay を切り捨てる）
          else if (m[0] === "EVENT") {
            state.events++;
            sock.write(frame(0x1, rejectWith
              ? JSON.stringify(["OK", m[1] && m[1].id, false, rejectWith])
              : JSON.stringify(["OK", m[1] && m[1].id, true, ""])));
            if (broadcast && !rejectWith) {
              const ev = m[1] || {};
              const evTags = new Set((ev.tags || []).map(t => String(t[1])));
              for (const p of peers) {
                if (p === me) continue;   // ★自分には返さない（本物とちがうが、ここは相手に届くかを見る道具）
                for (const [subId, tags] of p.subs) {
                  let hit = tags.size === 0;
                  for (const t of tags) if (evTags.has(t)) hit = true;
                  if (!hit) continue;
                  try { p.sock.write(frame(0x1, JSON.stringify(["EVENT", subId, ev]))); state.delivered++; } catch {}
                  break;
                }
              }
            }
          }
        } catch {}
      }
      buf = Buffer.alloc(0);
    });
    sock.on("error", () => {});
    if (closeAfterMs > 0) {
      setTimeout(() => {
        // ★これが本題。**こちら（待ち合わせ先）から切る**
        state.closes++;
        try { sock.write(frame(0x8, "")); sock.end(); } catch {}
      }, closeAfterMs);
    }
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const url = `ws://127.0.0.1:${server.address().port}`;
  state.url = url;
  // ★つないでいる相手が購読している「目印（タグ）」を集める（2026-09-23）
  const subTags = () => {
    const out = new Set();
    for (const p of peers) for (const [, tags] of p.subs) for (const t of tags) out.add(t);
    return Array.from(out);
  };
  // ★★**よその名乗りを1つ差しこむ**（2026-09-23）。
  //   「相手の名乗りを受けた」の数え方を、ブラウザを2つ開かずに試すために要る。
  //   2つ開くと**実際に出会ってしまい**、診断パネルがそもそも出ない（出会えなかったときの画面なので）
  const injectEvent = (ev) => {
    let n = 0;
    for (const p of peers) {
      for (const [subId, tags] of p.subs) {
        const evTags = new Set((ev.tags || []).map(t => String(t[1])));
        let hit = tags.size === 0;
        for (const t of tags) if (evTags.has(t)) hit = true;
        if (!hit) continue;
        try { p.sock.write(frame(0x1, JSON.stringify(["EVENT", subId, ev]))); n++; } catch {}
        break;
      }
    }
    return n;
  };
  return { url, state, close: () => server.close(), label, subTags, injectEvent };
}
