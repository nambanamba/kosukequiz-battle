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

export async function startFakeRelay({ closeAfterMs = 0, label = "fake" } = {}) {
  const state = { connects: 0, closes: 0, urls: [], lastMsgs: [] };
  const server = http.createServer((_, res) => res.writeHead(426).end());
  server.on("upgrade", (req, sock) => {
    state.connects++;
    const key = req.headers["sec-websocket-key"];
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
               "Sec-WebSocket-Accept: " + accept + "\r\n\r\n");
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
          if (m[0] === "REQ") sock.write(frame(0x1, JSON.stringify(["EOSE", m[1]])));
          else if (m[0] === "EVENT") sock.write(frame(0x1, JSON.stringify(["OK", m[1] && m[1].id, true, ""])));
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
  return { url, state, close: () => server.close(), label };
}
