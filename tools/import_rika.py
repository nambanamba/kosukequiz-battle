# -*- coding: utf-8 -*-
"""
kosukequiz-battle の data.js に、理科の回別JSONを取り込むスクリプト。

■ なぜ import_quiz.py と別なのか
  import_quiz.py は夏期講習（`quiz_csv_夏期講習` の復習編1〜8）専用で、
  元データの `id` フィールドを使い、`kai` を落とす。理科の元データには
  `id` が無く、`kai` と `kind` を data.js に残す必要があるので別にした。

■ ★理科の id の決まり（2026-09-12 に既存データから実測して確認した）
  id は「memo だけを取り出した並び順」に連番で付ける。**`no` の値ではない。**
    第1回: memo 73問 → r1m01〜r1m73   （仮説「id番号=no」は 16/73 しか合わない）
    第2回: memo 17問 → r2m01〜r2m17   （同 4/17）
  つまり calc が間にはさまると `no` と id の番号はずれる。
  第3回では no.53 が calc なので、r3m53 は no.54、r3m54 は no.55 になる。

  ⚠️ **差し替えのときは、この「memo だけの並び順」で対応を取ること。**
  `no` から id を組み立てると、calc をまたいだ分だけ中身が別の問題に入れかわり、
  解答履歴が別の問題に紐づく（import_quiz.py が夏期講習で踏んだ事故と同じ型）。
  --check は毎回この対応表を表示するので、目で確かめてから --apply すること。

■ ★calc は取り込まない
  計算問題は別アプリ `keisan-print-app` の持ち物（2026-09-07 にユーザーの依頼で分離）。
  第1回の calc 7問・第2回の calc 70問は、いま keisan-print-app/data.js に
  r1c01〜07・r2c01〜70 として入っている。こちらへ入れると二重になる。

■ 使い方
    python tools/import_rika.py --check 3     # 取り込まずに数字と対応表を出す
    python tools/import_rika.py --apply 3     # data.js を書きかえる

■ data.js の書式（既存に合わせる。ずれていれば取り込み前に止まる）
  改行は CRLF、非ASCIIはエスケープしない、`{`/`}` は1字下げ・キーは2字下げ、
  キーの順序は id, subj, u, q, note, a, img, kai, kind, priority, level, sol、
  空文字のキーは出力しない、no/unit/folder/figureNote/subject/genre/file は変換または破棄。
"""
import argparse
import io
import json
import os
import re
import shutil
import sys

BATTLE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(BATTLE), "5年下", "quiz_csv_理科")
DATA_JS = os.path.join(BATTLE, "data.js")

FILES = {
    1: "第1回_生物のつながり.json",
    2: "第2回_てこ滑車輪軸.json",
    3: "第3回_水溶液の中和.json",
}

# data.js に出力するキーと、その順番（既存の理科の行と同じ並び）
OUT_KEYS = ["id", "subj", "u", "q", "note", "a", "img", "kai", "kind",
            "priority", "level", "sol"]
# 元データのキー名 -> data.js のキー名
RENAME = {"subject": "subj", "genre": "u", "file": "img"}
# 取り込まないキー
DROP = {"no", "unit", "folder", "figureNote"}


def die(msg):
    print("✖ " + msg)
    sys.exit(1)


def read_data_js():
    with io.open(DATA_JS, "rb") as f:
        raw = f.read()
    text = raw.decode("utf-8")
    if "\r\n" not in text:
        die("data.js の改行が CRLF ではありません。書式が変わっています。")
    return raw, text


def rows_of(text):
    """data.js を『行の塊』に切る。各要素は ' {\r\n  "id": ...\r\n },\r\n' の形。"""
    start = text.index("const QA_DATA = [\r\n") + len("const QA_DATA = [\r\n")
    end = text.rindex("];\r\n")
    body = text[start:end]
    # 行の区切りは「\r\n },\r\n」。最後の行だけ「\r\n }\r\n」のこともある
    parts = re.split(r"(?<=\r\n \},\r\n)", body)
    parts = [p for p in parts if p.strip()]
    return text[:start], parts, text[end:]


def fmt_row(rec):
    """1問を data.js の書式の文字列にする。"""
    lines = [" {\r\n"]
    keys = [k for k in OUT_KEYS if k in rec and rec[k] != "" and rec[k] is not None]
    for i, k in enumerate(keys):
        v = rec[k]
        dumped = json.dumps(v, ensure_ascii=False)
        comma = "," if i < len(keys) - 1 else ""
        lines.append('  "%s": %s%s\r\n' % (k, dumped, comma))
    lines.append(" },\r\n")
    return "".join(lines)


def convert(src_rows, kai):
    """元データの memo 行を data.js の1問に変換する。"""
    out = []
    mapping = []
    memo = [r for r in src_rows if r.get("kind") == "memo"]
    for i, r in enumerate(memo, start=1):
        rec = {}
        for k, v in r.items():
            if k in DROP:
                continue
            rec[RENAME.get(k, k)] = v
        rec["id"] = "r%dm%02d" % (kai, i)
        rec["kai"] = kai
        rec["kind"] = "memo"
        for must in ("subj", "u", "q", "a"):
            if not str(rec.get(must, "")).strip():
                die("no.%s の %s が空です。" % (r.get("no"), must))
        out.append(rec)
        mapping.append((rec["id"], r.get("no")))
    return out, mapping, memo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", type=int)
    ap.add_argument("--apply", type=int)
    a = ap.parse_args()
    kai = a.check or a.apply
    if not kai:
        die("--check か --apply に回の数字を渡してください。")
    if kai not in FILES:
        die("第%d回のファイルを知りません。" % kai)

    path = os.path.join(SRC, FILES[kai])
    if not os.path.exists(path):
        die("元データが見つかりません: " + path)
    with io.open(path, encoding="utf-8") as f:
        src_rows = json.load(f)

    n_calc = len([r for r in src_rows if r.get("kind") == "calc"])
    new_rows, mapping, memo = convert(src_rows, kai)

    raw, text = read_data_js()
    head, parts, tail = rows_of(text)

    # 自己検査: 切って貼り直すとバイト一致するか
    if head + "".join(parts) + tail != text:
        die("data.js を切って貼り直すと元に一致しません。書式が想定と違います。")

    def id_of(part):
        m = re.search(r'"id": "([^"]+)"', part)
        return m.group(1) if m else None

    existing = [id_of(p) for p in parts]
    pre = "r%dm" % kai
    already = [i for i in existing if i and i.startswith(pre)]

    print("=== 第%d回 %s ===" % (kai, FILES[kai]))
    print("  元データ: %d問（memo %d / calc %d）" % (len(src_rows), len(memo), n_calc))
    print("  ★calc %d問は取り込みません（keisan-print-app の持ち物）" % n_calc)
    print("  取り込む: %d問  id: %s〜%s" % (len(new_rows), new_rows[0]["id"], new_rows[-1]["id"]))
    print("  data.js のいまの総数: %d問" % len(parts))
    print("  data.js にある %s*: %d問 %s" % (pre, len(already), "（上書き更新）" if already else "（新規追加）"))

    # id の重複チェック
    dup = set(existing) & set(r["id"] for r in new_rows)
    if dup and not already:
        die("新規追加のはずなのに id が既にあります: " + ", ".join(sorted(dup)))

    print("\n  --- id と no の対応（★no と番号がずれる所を確かめる）---")
    shifted = [(i, n) for i, n in mapping if int(i[len(pre):]) != n]
    for i, n in mapping:
        mark = "  ← ★no とずれている" if int(i[len(pre):]) != n else ""
        if mark or n <= 3 or n >= len(src_rows) - 2:
            print("    %s = no.%s%s" % (i, n, mark))
    print("    （ずれている問: %d件。calc をまたいだ分）" % len(shifted))

    if a.check:
        print("\n（--check なので data.js は変えていません）")
        return

    # 既にある分は入れかえ、無ければ最後の r*m の直後に差し込む
    new_text_rows = [fmt_row(r) for r in new_rows]
    if already:
        keep = [p for p in parts if not (id_of(p) or "").startswith(pre)]
        at = min(i for i, p in enumerate(parts) if (id_of(p) or "").startswith(pre))
        parts = keep[:at] + new_text_rows + keep[at:]
    else:
        # 理科をまとめて置くため、いちばん後ろの r?m* の直後に入れる
        idxs = [i for i, p in enumerate(parts) if re.match(r"^r\d+m", id_of(p) or "")]
        at = (max(idxs) + 1) if idxs else len(parts)
        parts = parts[:at] + new_text_rows + parts[at:]

    out = head + "".join(parts) + tail
    shutil.copyfile(DATA_JS, DATA_JS + ".bak")
    with io.open(DATA_JS, "wb") as f:
        f.write(out.encode("utf-8"))

    # 書いたあとの自己検査
    raw2, text2 = read_data_js()
    _, parts2, _ = rows_of(text2)
    ids2 = [id_of(p) for p in parts2]
    print("\n  書きこみ後: %d問（%+d）" % (len(parts2), len(parts2) - len(parts) + len(new_rows) - len(new_rows)))
    print("  総数: %d問" % len(parts2))
    if len(ids2) != len(set(ids2)):
        die("id が重複しました。data.js.bak から戻してください。")
    print("  id重複: 0")
    print("  控え: data.js.bak")
    print("\n★このあと必ず: node tools/verify_data.mjs / smoke-test / 実機で第%d回を出題して目視（B-12）" % kai)


if __name__ == "__main__":
    main()
