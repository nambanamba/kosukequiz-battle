# -*- coding: utf-8 -*-
"""
index.html の IMG_SIZES を、images/ の実物の寸法にそろえる。

■ IMG_SIZES は何のためにあるか
  <img> に width/height を付けて、画像の読み込み中に文字が飛ぶのを防ぐ表。
  **値がまちがっていると、読み込み後にその分だけ画面がずれる。**

■ ★なぜ専用の道具が要るか（C-4b）
  「足りないものを足す」だけでは足りない。**画像を差し替えて寸法が変わったとき、
  登録されている値が古いまま残る。**
  登録されているのに実物とちがう状態は、未登録より悪い:
    - 未登録 … width/height が付かないだけ。ずれるが、嘘はつかない
    - 古い値 … ブラウザが古い寸法で場所を取り、読み込み後にずれる
  実例: 2026-09-12、`kai3_05.jpg`(2408×1775) を `kai3_06.jpg`(1988×1222) に
  差し替えた。足すだけの道具では、縦横比の違う枠が確保されていた。

■ 使い方
    python tools/sync_img_sizes.py            # 調べるだけ
    python tools/sync_img_sizes.py --apply    # index.html を直す

■ 何を報告するか
  - 足りない … data.js が参照しているのに IMG_SIZES に無い
  - ★ちがう … 登録されているが実物と寸法がちがう（いちばん危ない）
  - 参照なし … IMG_SIZES にあるが data.js が参照していない
      → **消さない。**旧画像は配信中の版が参照していることがある（C-3）。
        報告だけして残す
  - 実物なし … 参照しているのにファイルが無い（これは失敗として止める）
"""
import argparse
import io
import json
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BATTLE = os.path.dirname(HERE)
INDEX = os.path.join(BATTLE, "index.html")
DATA_JS = os.path.join(BATTLE, "data.js")
IMAGES = os.path.join(BATTLE, "images")


def jpeg_png_size(path):
    """JPEG/PNG の幅・高さを、外部ライブラリなしで読む。"""
    with io.open(path, "rb") as f:
        d = f.read()
    if d[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", d[16:24])
        return int(w), int(h)
    if d[:2] == b"\xff\xd8":
        i = 2
        while i < len(d) - 9:
            if d[i] != 0xFF:
                i += 1
                continue
            m = d[i + 1]
            if m in (0xD8, 0xD9) or 0xD0 <= m <= 0xD7 or m == 0xFF:
                i += 2
                continue
            seg = struct.unpack(">H", d[i + 2:i + 4])[0]
            # SOF0/1/2/3, SOF5-7, SOF9-11, SOF13-15（プログレッシブ等も拾う）
            if m in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                     0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", d[i + 5:i + 9])
                return int(w), int(h)
            i += 2 + seg
    raise ValueError("寸法が読めません: " + path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    html = io.open(INDEX, "rb").read().decode("utf-8")
    m = re.search(r"const IMG_SIZES = (\{.*?\});", html, re.S)
    if not m:
        sys.exit("✖ index.html の IMG_SIZES が見つかりません")
    sizes = json.loads(m.group(1))

    js = io.open(DATA_JS, "rb").read().decode("utf-8")
    referenced = sorted(set(re.findall(r'"img": "([^"]+)"', js)))

    missing_file, wrong, missing_entry, unreferenced = [], [], [], []
    for name in referenced:
        p = os.path.join(IMAGES, name)
        if not os.path.exists(p):
            missing_file.append(name)
            continue
        try:
            w, h = jpeg_png_size(p)
        except ValueError as e:
            missing_file.append(name + "（" + str(e) + "）")
            continue
        if name not in sizes:
            missing_entry.append((name, w, h))
        elif list(sizes[name]) != [w, h]:
            wrong.append((name, sizes[name], [w, h]))
    for name in sizes:
        if name not in referenced:
            unreferenced.append(name)

    print("data.js が参照している画像: %d種 / IMG_SIZES の登録: %d件"
          % (len(referenced), len(sizes)))
    print("\n★実物が無い（解答不能になる）: %d件 %s"
          % (len(missing_file), " ".join(missing_file)))
    print("足りない: %d件" % len(missing_entry))
    for n, w, h in missing_entry:
        print("    %s  → %dx%d" % (n, w, h))
    print("★ちがう（登録が古い）: %d件" % len(wrong))
    for n, old, new in wrong:
        print("    %s  登録 %dx%d → 実物 %dx%d" % (n, old[0], old[1], new[0], new[1]))
    print("参照なし（消さずに残す・C-3）: %d件 %s"
          % (len(unreferenced), " ".join(sorted(unreferenced))))

    if missing_file:
        sys.exit("\n✖ 参照している画像の実物がありません。取り込みが未完了です。")

    if not missing_entry and not wrong:
        print("\n✅ そろっています。直すところはありません。")
        return
    if not a.apply:
        print("\n（--apply を付けると index.html を直します）")
        return

    for n, w, h in missing_entry:
        sizes[n] = [w, h]
    for n, _old, new in wrong:
        sizes[n] = new
    # 既存の書式に合わせる: キー順ソート・空白なし・非ASCIIはそのまま
    body = "{" + ",".join('"%s":[%d,%d]' % (k, sizes[k][0], sizes[k][1])
                          for k in sorted(sizes)) + "}"
    out = html[:m.start(1)] + body + html[m.end(1):]
    io.open(INDEX, "wb").write(out.encode("utf-8"))
    print("\n✅ index.html を直しました（足した %d件 / 直した %d件）"
          % (len(missing_entry), len(wrong)))


if __name__ == "__main__":
    main()
