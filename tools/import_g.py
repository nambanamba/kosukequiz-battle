# -*- coding: utf-8 -*-
"""
kosukequiz-battle の data.js に、社会（通常回）の回別JSONを取り込むスクリプト。

■ なぜ別のスクリプトなのか
  - `import_quiz.py` … 夏期講習（復習編1〜8）専用。元データの `id` を使う
  - `import_rika.py` … 理科専用。`kai`・`kind` を残し、memo だけを取り込む
  - `import_g.py`（これ）… 社会の通常回専用。`kai`・`kind`・`sol` を持たない

■ ★通常回の id の決まり（2026-09-12 に既存データから実測して確認した）
  id = "g" + 回 + "r" + no    （例: 第2回の no.114 → `g2r114`。ゼロ詰めしない）
  **通常回の元データには `id` 欄が無く、`no` 欄が id の番号そのものになっている。**
  理科とはちがい、こちらは `no` と id が一致する（calc のような抜けが無いため）。
  → 理科は「memo だけの並び順」で、通常回は「no そのもの」。**混同しないこと。**

■ 使い方
    python tools/import_g.py --check 2      # 取り込まずに差分を出す
    python tools/import_g.py --apply 2 3    # 第2回と第3回を取り込む

■ 何を確かめるか（C-1 / C-5 / C-6）
  - **既存の問は上書き更新。append ではない**（C-1）
  - **既存の id を1つも動かさない**（C-5）。並び順も変えない
  - --check で「増える問・中身が変わる問・元データから消えた問」を分けて表示する。
    ★消えた問があれば既定で止まる（履歴が宙に浮くため）
"""
import argparse
import io
import json
import os
import re
import shutil
import sys
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ir", os.path.join(HERE, "import_rika.py"))
ir = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ir)

BATTLE = os.path.dirname(HERE)
SRC = os.path.join(os.path.dirname(BATTLE), "5年下", "quiz_csv")

FILES = {
    1: "第1回_旧石器縄文弥生.json",
    2: "第2回_古墳飛鳥.json",
    3: "第3回_奈良時代.json",
    4: "第4回_平安時代.json",
}

# 通常回は kai / kind / sol を持たない
OUT_KEYS = ["id", "subj", "u", "q", "note", "a", "img", "priority", "level"]
RENAME = {"subject": "subj", "genre": "u", "file": "img"}
DROP = {"no", "unit", "folder", "figureNote", "sol"}


def fmt_row(rec):
    lines = [" {\r\n"]
    keys = [k for k in OUT_KEYS if k in rec and rec[k] != "" and rec[k] is not None]
    for i, k in enumerate(keys):
        comma = "," if i < len(keys) - 1 else ""
        lines.append('  "%s": %s%s\r\n' % (k, json.dumps(rec[k], ensure_ascii=False), comma))
    lines.append(" },\r\n")
    return "".join(lines)


def convert(src_rows, kai):
    out = []
    for r in src_rows:
        rec = {}
        for k, v in r.items():
            if k in DROP:
                continue
            rec[RENAME.get(k, k)] = v
        rec["id"] = "g%dr%d" % (kai, int(r["no"]))
        for must in ("subj", "u", "q", "a"):
            if not str(rec.get(must, "")).strip():
                ir.die("no.%s の %s が空です。" % (r.get("no"), must))
        # ★空の欄は落とす。data.js は空のキーを書かないので、落とさずに比べると
        #   中身が同じでも「変わった」と判定してしまう（img="" と img無しのちがい）
        rec = {k: v for k, v in rec.items()
               if k in OUT_KEYS and v != "" and v is not None}
        out.append(rec)
    return out


def id_of(part):
    m = re.search(r'"id": "([^"]+)"', part)
    return m.group(1) if m else None


def content_of(part):
    """data.js の1行を辞書にして返す。

    ★書式ではなく中身で比べるために要る。data.js には取り込んだ時期ごとに
    2つの書式が混ざっており、最後のキーにカンマが付く行と付かない行がある
    （実測: g1r・g2r・kaki1_・s・simg は付く、ほかは付かない）。
    文字列のまま比べると、中身が同じでも「変わった」と判定してしまい、
    既存313問を無用に書きかえて巨大な差分を作る（競合の温床・ROLE.md 5）。
    """
    body = part.strip()
    if body.endswith(","):          # 行と行の区切りのカンマ
        body = body[:-1]
    body = body.rstrip()
    assert body.endswith("}"), body[-40:]
    inner = body[:-1].rstrip()      # 閉じカッコを外す
    if inner.endswith(","):         # 末尾キーのカンマ（付く書式のとき）
        inner = inner[:-1]
    return json.loads(inner + "}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", type=int, nargs="+")
    ap.add_argument("--apply", type=int, nargs="+")
    ap.add_argument("--allow-delete", action="store_true",
                    help="元データから消えた問を data.js からも消す（既定は止まる）")
    a = ap.parse_args()
    kais = a.check or a.apply
    if not kais:
        ir.die("--check か --apply に回の数字を渡してください。")

    raw, text = ir.read_data_js()
    head, parts, tail = ir.rows_of(text)
    if head + "".join(parts) + tail != text:
        ir.die("data.js を切って貼り直すと元に一致しません。書式が想定と違います。")

    total_before = len(parts)
    plan = []

    for kai in kais:
        if kai not in FILES:
            ir.die("第%d回のファイルを知りません。" % kai)
        path = os.path.join(SRC, FILES[kai])
        with io.open(path, encoding="utf-8") as f:
            src_rows = json.load(f)
        new_rows = convert(src_rows, kai)
        pre = "g%dr" % kai
        have = {id_of(p): p for p in parts if (id_of(p) or "").startswith(pre)}

        added, changed, same = [], [], 0
        for r in new_rows:
            if r["id"] not in have:
                added.append(r["id"])
            elif content_of(have[r["id"]]) != r:
                changed.append(r["id"])
            else:
                same += 1
        gone = [i for i in have if i not in set(r["id"] for r in new_rows)]

        print("=== 第%d回 %s ===" % (kai, FILES[kai]))
        print("  元データ %d問 / data.js に %d問" % (len(new_rows), len(have)))
        print("  増える: %d問 %s" % (len(added), " ".join(added) if added else ""))
        print("  中身が変わる: %d問 %s" % (len(changed), " ".join(changed[:20])))
        print("  変わらない: %d問" % same)
        print("  ★元データから消えた: %d問 %s" % (len(gone), " ".join(gone)))
        if gone and not a.allow_delete:
            ir.die("元データから消えた問があります。履歴が宙に浮くので止めました（C-5）。"
                   "意図した削除なら --allow-delete を付けてください。")
        plan.append((kai, pre, new_rows))

    if a.check:
        print("\n（--check なので data.js は変えていません）")
        return

    for kai, pre, new_rows in plan:
        byrec = {r["id"]: r for r in new_rows}
        out = []
        seen = set()
        for p in parts:
            i = id_of(p)
            if i in byrec:
                # 既存は同じ位置で入れかえる（並びを動かさない）。
                # ★中身が同じ行は元のまま残す（書式だけの差分を作らないため）
                out.append(p if content_of(p) == byrec[i] else fmt_row(byrec[i]))
                seen.add(i)
            else:
                out.append(p)
        # 新しく増えた分は、その回のいちばん後ろの直後に入れる
        rest = [fmt_row(byrec[i]) for i in (r["id"] for r in new_rows) if i not in seen]
        if rest:
            idxs = [n for n, p in enumerate(out) if (id_of(p) or "").startswith(pre)]
            at = (max(idxs) + 1) if idxs else len(out)
            out = out[:at] + rest + out[at:]
        parts = out

    result = head + "".join(parts) + tail
    shutil.copyfile(ir.DATA_JS, ir.DATA_JS + ".bak")
    with io.open(ir.DATA_JS, "wb") as f:
        f.write(result.encode("utf-8"))

    _, text2 = ir.read_data_js()
    _, parts2, _ = ir.rows_of(text2)
    ids2 = [id_of(p) for p in parts2]
    print("\n  総数: %d問（%+d）" % (len(parts2), len(parts2) - total_before))
    if len(ids2) != len(set(ids2)):
        ir.die("id が重複しました。data.js.bak から戻してください。")
    print("  id重複: 0")
    print("  控え: data.js.bak")
    print("\n★このあと必ず: node tools/verify_data.mjs / smoke-test / 実機で目視（B-12）")


if __name__ == "__main__":
    main()
