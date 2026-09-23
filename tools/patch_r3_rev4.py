# -*- coding: utf-8 -*-
"""
理科 第3回「横ぐし改訂4」を data.js にピンポイントで入れる。

■ なぜ import_rika.py を使わないか
  import_rika.py は丸ごと再取り込みの道具で、memo を r3m01 から歯抜けなしに
  振り直す。いまの data.js は 78問で id が r3m01〜r3m91（欠番13。2026-09-13 の
  改訂3で消した分）なので、走らせると 78問すべての id が動き、お子さんの
  解答履歴が別の問題に付けかわる（確認ポイント C-5）。

■ この道具がすること（これだけ）
  1. r3m81〜r3m91 の 11問の q・note・a を元データに合わせる
  2. 新規11問を r3m92〜r3m102 として r3m91 の直後に差し込む
  ほかの行は1バイトも触らない。

■ id の決め方（実測して確かめた規則）
  id番号 = no − それより前にある calc の数
  ★「memo だけの並び順の連番」ではない。消した13問の no の穴を、id 側も
  欠番として残しているため。改訂3の元データと問題文で照合して 67/67 一致。
  改訂4の元データでも、問題文が変わっていない67問で規則と一致を確認ずみ。

■ 使い方
    python tools/patch_r3_rev4.py --check --sha <宣言された sha256>
    python tools/patch_r3_rev4.py --apply --sha <宣言された sha256>
"""

# ============================================================================
# ★★2026-09-23 司令塔の指示で、この道具は走らせないことにしました。
#   消していません。記録として残してあります。中身を読むのは自由です。
# ============================================================================
import sys as _sys
_sys.exit(
    """✖ 一度きりの道具です。2026-09-23 以降、id は元データが持ちます。
  この道具は no から id を組み立てる（136行目 `"r%dm%02d" % (KAI, r["no"] - calc_before)`）ため、走らせると記録が別の問題に移ります。
  取り込みは tools/import_rika.py を使ってください（元データの id をそのまま使います）。"""
)
# ============================================================================

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import sys

# Windows の既定のコンソールは cp932 で、★ や ✔ が出せずに落ちる
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BATTLE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(BATTLE), "5年下", "quiz_csv_理科",
                   "第3回_水溶液の中和.json")
DATA_JS = os.path.join(BATTLE, "data.js")
KAI = 3
OUT_KEYS = ["id", "subj", "u", "q", "note", "a", "img", "kai", "kind",
            "priority", "level", "sol"]
RENAME = {"subject": "subj", "genre": "u", "file": "img"}
DROP = {"no", "unit", "folder", "figureNote"}
FIELDS = ["q", "note", "a"]        # 上書きする欄はこの3つだけ
NEW_FROM = 92                      # 新規の id はここから


def die(msg):
    print("✖ " + msg)
    sys.exit(1)


def rows_of(text):
    head_mark = "const QA_DATA = [\r\n"
    start = text.index(head_mark) + len(head_mark)
    end = text.rindex("];\r\n")
    parts = re.split(r"(?<=\r\n \},\r\n)", text[start:end])
    parts = [p for p in parts if p.strip()]
    return text[:start], parts, text[end:]


def obj_of(part):
    s = part.strip()
    if s.endswith(","):
        s = s[:-1]
    return json.loads(s)


def fmt_row(rec):
    """import_rika.py と同じ書式で1問を文字列にする。"""
    lines = [" {\r\n"]
    keys = [k for k in OUT_KEYS if k in rec and rec[k] != "" and rec[k] is not None]
    for i, k in enumerate(keys):
        comma = "," if i < len(keys) - 1 else ""
        lines.append('  "%s": %s%s\r\n' % (k, json.dumps(rec[k], ensure_ascii=False), comma))
    lines.append(" },\r\n")
    return "".join(lines)


def conv(src_row):
    rec = {}
    for k, v in src_row.items():
        if k in DROP:
            continue
        rec[RENAME.get(k, k)] = v
    rec["kai"] = KAI
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--sha", required=True, help="作成担当が宣言した sha256")
    a = ap.parse_args()
    if a.check == a.apply:
        die("--check か --apply のどちらか一方を渡してください。")

    # ★読む前に sha256 を照合する（C-4c-2）
    raw_src = io.open(SRC, "rb").read()
    sha = hashlib.sha256(raw_src).hexdigest()
    print("元データ: %s" % os.path.basename(SRC))
    print("  sha256: %s" % sha)
    if sha != a.sha:
        die("宣言された sha256 と違います。\n  宣言: %s\n  実物: %s\n"
            "  → まだ編集中か、同期が遅れている可能性があります。取り込まないでください。" % (a.sha, sha))
    print("  ✔ 宣言された sha256 と一致")
    src = json.loads(raw_src.decode("utf-8"))

    # id を決める: no − それより前の calc の数
    calc_before = 0
    mapping = []
    for r in src:
        if r.get("kind") == "calc":
            calc_before += 1
            continue
        mapping.append(("r%dm%02d" % (KAI, r["no"] - calc_before), r))
    if len(mapping) != len(set(i for i, _ in mapping)):
        die("作った id に重複があります。")

    text = io.open(DATA_JS, encoding="utf-8", newline="").read()
    if "\r\n" not in text:
        die("data.js の改行が CRLF ではありません。書式が変わっています。")
    head, parts, tail = rows_of(text)
    if head + "".join(parts) + tail != text:
        die("data.js を切って貼り直すと元に一致しません。書式が想定と違います。")

    at = {}
    for i, p in enumerate(parts):
        m = re.search(r'"id": "([^"]+)"', p)
        if m:
            at[m.group(1)] = i
    mine = sorted([k for k in at if re.match(r"^r%dm\d+$" % KAI, k)],
                  key=lambda s: int(s[3:]))
    print("\n  data.js: 全%d問 ／ r%dm* は %d問（%s〜%s）" %
          (len(parts), KAI, len(mine), mine[0], mine[-1]))
    print("  元データ: %d問（memo %d / calc %d）" %
          (len(src), len(mapping), len(src) - len(mapping)))

    # ★書式が忠実かを先に確かめる（往復検査）: 触らない行を読んで書き直したら元に戻るか
    bad = [i for i in mine if fmt_row(obj_of(parts[at[i]])) != parts[at[i]]]
    if bad:
        die("読んで書き直すと元に戻らない行があります（書式が想定と違う）: " + "・".join(bad[:5]))
    print("  ✔ 往復検査: r%dm* の %d問すべて、読んで書き直すと1バイト一致" % (KAI, len(mine)))

    updates, adds, orphan = [], [], []
    for new_id, r in mapping:
        rec = conv(r)
        if new_id in at:
            old = obj_of(parts[at[new_id]])
            ch = [f for f in FIELDS if str(old.get(f, "")) != str(rec.get(f, ""))]
            other = [k for k in OUT_KEYS if k not in FIELDS + ["id"]
                     and str(old.get(k, "")) != str(rec.get(k, ""))]
            if other:
                die("%s は q・note・a 以外も違います（%s）。この道具の想定外なので止めます。"
                    % (new_id, "・".join(other)))
            if ch:
                updates.append((new_id, r["no"], ch, rec))
        else:
            rec["id"] = new_id
            adds.append((new_id, r["no"], rec))
    for i in mine:
        if i not in [m[0] for m in mapping]:
            orphan.append(i)

    print("\n  ★変える既存: %d問  %s" % (len(updates), "・".join(u[0] for u in updates)))
    for u in updates:
        print("      %s (no.%s) の %s" % (u[0], u[1], "・".join(u[2])))
    print("  ★増やす: %d問  %s" % (len(adds), "・".join(x[0] for x in adds)))
    print("  ★消える／対応が無い既存: %d問 %s" % (len(orphan), "・".join(orphan)))
    if orphan:
        die("既存の id に対応が無いものがあります。id が動くので止めます。")
    if [x[0] for x in adds] != ["r%dm%02d" % (KAI, n) for n in
                                range(NEW_FROM, NEW_FROM + len(adds))]:
        die("新規の id が r%dm%d からの連番になっていません: %s"
            % (KAI, NEW_FROM, "・".join(x[0] for x in adds)))

    if a.check:
        print("\n（--check なので data.js は変えていません）")
        return

    # 書きかえる
    before_ids = [re.search(r'"id": "([^"]+)"', p).group(1) for p in parts]
    for new_id, no, ch, rec in updates:
        old = obj_of(parts[at[new_id]])
        for f in FIELDS:
            if rec.get(f, "") == "":
                old.pop(f, None)
            else:
                old[f] = rec[f]
        parts[at[new_id]] = fmt_row(old)
    ins = at[mine[-1]] + 1
    parts = parts[:ins] + [fmt_row(rec) for _, _, rec in adds] + parts[ins:]

    out = head + "".join(parts) + tail
    shutil.copyfile(DATA_JS, DATA_JS + ".bak")
    with io.open(DATA_JS, "wb") as f:
        f.write(out.encode("utf-8"))

    # 書いたあとの自己検査
    text2 = io.open(DATA_JS, encoding="utf-8", newline="").read()
    _, parts2, _ = rows_of(text2)
    ids2 = [re.search(r'"id": "([^"]+)"', p).group(1) for p in parts2]
    print("\n  書きこみ後: 全%d問（%+d）" % (len(parts2), len(parts2) - len(parts) + len(adds)))
    if len(ids2) != len(set(ids2)):
        die("id が重複しました。data.js.bak から戻してください。")
    gone = [i for i in before_ids if i not in set(ids2)]
    if gone:
        die("消えた id があります: " + "・".join(gone[:10]))
    changed = [i for i in before_ids
               if parts2[ids2.index(i)] != parts[[re.search(r'"id": "([^"]+)"', p).group(1)
                                                  for p in parts].index(i)]]
    print("  id重複: 0 ／ 消えた id: 0 ／ 全%d問 → %d問" % (len(before_ids), len(ids2)))
    print("  控え: data.js.bak")
    print("\n★このあと必ず: node tools/verify_rika_pointwise.mjs 3 --sha %s"
          " ／ smoke-test ／ 実機で目視（B-12）" % a.sha)


if __name__ == "__main__":
    main()
