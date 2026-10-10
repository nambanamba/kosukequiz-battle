# -*- coding: utf-8 -*-
"""
data.js の「演習年表」の問（g1r*〜g5r*）を、単元ごとに紙面の順（行目の順）に並べ替える。

■ なぜ要るか（2026-09-27 司令塔からの依頼）
  社会の演習年表を「1行＝1問」に作り直したとき、空欄1つの行は元の id のまま、
  まとめた行（2〜4個の空欄を1問にした行）は新しい id を単元の末尾に追加した。
  そのため data.js の並びが「1,2,4,6,7,12,13,14,15行目 → 3,5,8,9,10,11行目」のように
  ばらばらになった。index.html の orderByTiers は1段目を data.js の並び順で出すため、
  年表がばらばらに出題される。

■ 何をするか
  - 各単元（第1〜5回）の演習年表の問を集め、元データ（quiz_csv の JSON）の並び順
    （＝紙面の行の順）に並べ替える
  - 並べ替えた問のかたまりは、その単元の年表の問が data.js の中で最初に出てくる
    位置にまとめて置く
  - ★id・問題文・答え・その他の欄は1文字も変えない。問の数も変えない。
    中身は一切いじらない。位置を並べ替えるだけ

■ 検査
  - 並べ替え前後で id の集合が完全に一致する
  - 並べ替え前後で各 id の中身（1行のテキスト）がバイト一致する
  - 演習年表の問が、単元ごとに「行目の順」（第5回は紙面の順）になっている
"""
import io
import json
import os
import re
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
BATTLE = os.path.dirname(HERE)
def _find_src():
    # git worktree（kosukequiz-battle/_wt/xxx）から動かしても元データを見つけられるよう、上へたどる
    d = BATTLE
    while True:
        cand = os.path.join(os.path.dirname(d), "5年下", "quiz_csv")
        if os.path.isdir(cand):
            return cand
        if os.path.dirname(d) == d:
            return os.path.join(os.path.dirname(BATTLE), "5年下", "quiz_csv")
        d = os.path.dirname(d)
DATA_JS = os.path.join(BATTLE, "data.js")
SRC = _find_src()

FILES = {
    1: "第1回_旧石器縄文弥生.json",
    2: "第2回_古墳飛鳥.json",
    3: "第3回_奈良時代.json",
    4: "第4回_平安時代.json",
    5: "第5回_総合.json",
    6: "第6回_鎌倉時代.json",   # 2026-10-03 追加（import_g.py の FILES と同じにしておく。無いと取り込みの最後で止まる）
    7: "第7回_室町時代.json",   # 2026-10-10 追加
}


def read_data_js():
    with io.open(DATA_JS, "rb") as f:
        raw = f.read()
    text = raw.decode("utf-8")
    if "\r\n" not in text:
        raise SystemExit("data.js の改行が CRLF ではありません。書式が想定と違います。")
    return text


def rows_of(text):
    start = text.index("const QA_DATA = [\r\n") + len("const QA_DATA = [\r\n")
    end = text.rindex("];\r\n")
    body = text[start:end]
    parts = re.split(r"(?<=\r\n \},\r\n)", body)
    parts = [p for p in parts if p.strip()]
    return text[:start], parts, text[end:]


def id_of(part):
    m = re.search(r'"id": "([^"]+)"', part)
    return m.group(1) if m else None


def q_of(part):
    m = re.search(r'"q": ("(?:[^"\\]|\\.)*")', part)
    return json.loads(m.group(1)) if m else None


def desired_order_for(kai):
    """その回の演習年表の問の id を、元データ（＝紙面）の並び順で返す。"""
    path = os.path.join(SRC, FILES[kai])
    with io.open(path, encoding="utf-8") as f:
        rows = json.load(f)
    order = []
    for r in rows:
        q = r.get("q", "")
        if "演習年表" in q:
            order.append("g%dr%d" % (kai, int(r["no"])))
    return order


def run(kais=None, write=True, backup=True):
    """演習年表を紙面の順に並べ替える。

    kais … 対象にする回のリスト（None なら第1〜5回すべて）。
    import_g.py から「いま取り込んだ回だけ直す」ために呼べるよう関数化した。
    ★他の回の並びには一切触らない（対象外の回は data.js の並びをそのまま保つ）。
    戻り値: {kai: 並べ替えた問数} のうち、実際に動いた回だけ。
    """
    kais = list(FILES) if kais is None else list(kais)
    text = read_data_js()
    head, parts, tail = rows_of(text)
    if head + "".join(parts) + tail != text:
        raise SystemExit("data.js を切って貼り直すと元に一致しません。")

    before_ids = [id_of(p) for p in parts]
    if len(before_ids) != len(set(before_ids)):
        raise SystemExit("data.js の中に id の重複があります。")
    id_to_part_before = {id_of(p): p for p in parts}

    groups = {}       # kai -> [id,...] 紙面の順
    id_to_kai = {}
    for kai in kais:
        order = desired_order_for(kai)
        present = [i for i in order if i in id_to_part_before]
        missing = [i for i in order if i not in id_to_part_before]
        if missing:
            raise SystemExit("第%d回: data.js に無い演習年表の id があります: %s"
                              % (kai, missing))
        groups[kai] = present
        for i in present:
            id_to_kai[i] = kai

    group_id_set = set(id_to_kai)

    out = []
    inserted = set()
    for p in parts:
        i = id_of(p)
        if i in group_id_set:
            k = id_to_kai[i]
            if k in inserted:
                continue  # このかたまりは既に挿入ずみ
            for gid in groups[k]:
                out.append(id_to_part_before[gid])
            inserted.add(k)
        else:
            out.append(p)

    # ---- 検査1: 件数・id集合が完全一致 ----
    after_ids = [id_of(p) for p in out]
    if len(after_ids) != len(before_ids):
        raise SystemExit("問の数が変わりました: %d -> %d" % (len(before_ids), len(after_ids)))
    if set(after_ids) != set(before_ids):
        raise SystemExit("id の集合が変わりました。")

    # ---- 検査2: 各id の中身がバイト一致 ----
    after_map = {id_of(p): p for p in out}
    for i in before_ids:
        if after_map[i] != id_to_part_before[i]:
            raise SystemExit("id=%s の中身が変わりました。" % i)

    # ---- 検査3: 各単元の演習年表の問が、紙面の順になっているか ----
    for kai, order in groups.items():
        idxs = [after_ids.index(i) for i in order]
        if idxs != sorted(idxs):
            raise SystemExit("第%d回: 並べ替え後も紙面の順になっていません。" % kai)

    if not write:
        return {kai: len(v) for kai, v in groups.items()}

    if out == parts:
        return {}  # ★もう並んでいるので data.js を書きかえない（差分を作らない）

    result = head + "".join(out) + tail
    if backup:
        shutil.copyfile(DATA_JS, DATA_JS + ".bak")
    with io.open(DATA_JS, "wb") as f:
        f.write(result.encode("utf-8"))

    return {kai: len(v) for kai, v in groups.items()}


def main():
    moved = run()
    total_moved = sum(moved.values())
    print("OK: 演習年表 %d問 を %d単元ぶん並べ替えました（id・中身は変更なし）。"
          % (total_moved, len(moved)))
    for kai in sorted(moved):
        print("  第%d回: %d問" % (kai, moved[kai]))


if __name__ == "__main__":
    main()
