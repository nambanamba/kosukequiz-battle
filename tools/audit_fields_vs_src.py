# -*- coding: utf-8 -*-
"""
★元データにあるのに data.js に入っていない欄を、**全教科・全回**で洗い出す。

■ なぜ要るか（2026-09-18 と 2026-09-20）
  社会の `sol`（解説）が `import_g.py` の DROP に入っていて、
  **配信ずみのはずが一度も画面に出ていなかった**。
  ★**1つ見つかったら、同じ型が他にもあると疑う**（確認ポイント 0-2）。
  「この回を見た」ではなく「**全部の回で、欄ごとに数える**」形にしてある。

■ 対応づけ（位置照合はしない・確認ポイント 2-4）
  **問題文（q）の完全一致**で対応づける。両側とも q が一意であることを毎回確かめる。
  ★q が書きかわった回は対応がつかない。**つかなかった行は必ず数に出す**（黙って飛ばさない・4-1）。

■ ★出すもの
  - 元データの行数 / 対応がついた数 / ★つかなかった数（＋その kind の内わけ）
  - 欄ごとに「元データに値があるのに data.js に無い」件数
  - ★意図して落としている欄（下の EXPECTED）は、**落ちている理由つきで**別に出す

■ ★この道具が言えないこと（4-2）
  - **その欄が画面に出ているか**は見ていない（data.js に在るかどうかだけ）
  - **落ちているのが正しいかどうか**の判断はしない。数えて並べるだけ
  - q が書きかわった回の「つかなかった行」が、**本当に消えたのか名前が変わっただけか**は分からない

使い方:
    python tools/audit_fields_vs_src.py
"""
import io
import json
import os
import re
import sys
from collections import Counter

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BATTLE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GO = os.path.join(os.path.dirname(BATTLE), "5年下")
DATA_JS = os.path.join(BATTLE, "data.js")

FOLDERS = [
    ("社会(通常回)", os.path.join(GO, "quiz_csv")),
    ("社会(夏期講習)", os.path.join(GO, "quiz_csv_夏期講習")),
    ("理科", os.path.join(GO, "quiz_csv_理科")),
]

# ★意図して data.js に入れない欄と、その理由。
#   ここに書いてあるものは「落ちている」ではなく「落としている」として別枠で出す。
#   ⚠️ ここに書き足すときは、**理由を必ず書くこと。**理由の無い除外は、次の人には事故に見える。
EXPECTED = {
    "no": "id を作るための番号。data.js は id を持つので不要",
    "id": "元データ側の鍵。data.js は自前の id を使う",
    "file": "data.js では `img` という名前（別名なので落ちて見える）",
    "folder": "画像の置き場所。data.js は images/ 固定",
    "figureNote": "画面に出さないと決めた（2026-09-20 司令塔が実測で確認）",
    "kind": "理科のみ。data.js にも入るが、calc は取り込まない",
    "unit": "元データではほぼ空。回の名前は genre が持っている",
}
# 元データの名前 → data.js の名前（ちがうもの）
#   ★2026-09-20 実測で確かめた対応。**名前が違うだけのものを「欠け」と数えない**ため。
#     genre「第3回.奈良時代」→ u ／ subject「社会」→ subj ／ file「r4_01.jpg」→ img
RENAME = {"file": "img", "genre": "u", "subject": "subj"}


def load_data_blocks():
    text = io.open(DATA_JS, encoding="utf-8").read()
    out = []
    for m in re.finditer(r'\{\s*"id":\s*"([a-z0-9_]+)"[\s\S]*?\n \}', text):
        body = re.sub(r",(\s*\})", r"\1", m.group(0))
        try:
            out.append((m.group(1), json.loads(body)))
        except ValueError:
            sys.exit("✘ %s のブロックが JSON として読めません" % m.group(1))
    return out


def main():
    blocks = load_data_blocks()
    by_q = {}
    dup_q = 0
    for qid, rec in blocks:
        q = rec.get("q")
        if q in by_q:
            dup_q += 1
        by_q[q] = (qid, rec)
    print("data.js: %d 問（問題文が重複している: %d）\n" % (len(blocks), dup_q))

    grand_missing = Counter()
    grand_unmatched = 0

    for label, folder in FOLDERS:
        if not os.path.isdir(folder):
            print("── %s … ★フォルダが無い（%s）" % (label, folder))
            continue
        files = sorted(f for f in os.listdir(folder)
                       if f.endswith(".json") and not re.search(r"_calc_|_納品_|_bak", f))
        print("══ %s（%d ファイル）══" % (label, len(files)))
        for fn in files:
            try:
                src = json.load(io.open(os.path.join(folder, fn), encoding="utf-8"))
            except ValueError as e:
                print("  %-34s ★JSON が読めない: %s" % (fn[:34], e))
                continue
            if not isinstance(src, list):
                continue
            matched, unmatched = [], []
            for row in src:
                hit = by_q.get(row.get("q"))
                (matched if hit else unmatched).append((row, hit))
            missing = Counter()
            for row, hit in matched:
                rec = hit[1]
                for k, v in row.items():
                    if v in (None, "", []):
                        continue
                    dk = RENAME.get(k, k)
                    if rec.get(dk) in (None, "", []):
                        missing[k] += 1
            # 表示
            unmatched_kinds = Counter(r.get("kind") or "(kindなし)" for r, _ in unmatched)
            print("  %-34s 元 %3d / 対応 %3d / ★対応つかず %3d %s"
                  % (fn[:34], len(src), len(matched), len(unmatched),
                     ("  " + " ".join("%s:%d" % kv for kv in unmatched_kinds.items())) if unmatched else ""))
            real = {k: n for k, n in missing.items() if k not in EXPECTED}
            known = {k: n for k, n in missing.items() if k in EXPECTED}
            if real:
                print("        🚨 説明のつかない欠け: " +
                      " / ".join("%s %d件" % (k, n) for k, n in sorted(real.items())))
            if known:
                print("        （想定内: " +
                      " / ".join("%s %d件" % (k, n) for k, n in sorted(known.items())) + "）")
            for k, n in real.items():
                grand_missing[k] += n
            grand_unmatched += len(unmatched)
        print()

    print("══ まとめ ══")
    if grand_missing:
        print("  🚨 説明のつかない欠け（全教科・全回の合計）:")
        for k, n in sorted(grand_missing.items(), key=lambda kv: -kv[1]):
            print("     %-12s %d件" % (k, n))
    else:
        print("  ✔ 説明のつかない欠けは 0件")
    print("  ★対応がつかなかった行の合計: %d 行" % grand_unmatched)
    print("     （理科の calc は取り込まない決まりなので、ここに出るのが正常。"
          "★それ以外が出ていたら、問題文が書きかわっているか、取り込まれていない）")
    print("\n★この道具は「data.js に在るか」しか見ていません。"
          "**画面に出るか**は別（2026-09-18 の `sol` は、在ったのに出ていなかった）。")


main()
