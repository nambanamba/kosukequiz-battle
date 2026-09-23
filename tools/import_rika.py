# -*- coding: utf-8 -*-
"""
kosukequiz-battle の data.js に、理科の回別JSONを取り込むスクリプト。

■ ★いちばん大事なこと（2026-09-23 に直した）
  問題の id は「**元データの `id` フィールド**」を使う。**並び順から採番してはいけない。**
  id が無い行があったら、黙って採番せずに**止まる**。逃げ道はありません。

  ★ **id は元データに必ず持たせてください。**このスクリプトは id を作りません。
  （社会・夏期講習の import_quiz.py には `--allow-position-ids` という逃げ道がありますが、
    理科にはそれを置きません。2026-09-23 に司令塔の指示で外しました。理由は
    「data.js にその回が1問でもあれば、どのみち止めなければならない」＝**使える場面が無い**のに、
    名前だけ見ると使えそうに見えて、次の人が押そうとして時間を溶かすからです。）

  これは import_quiz.py（社会・夏期講習）と同じやり方です。同じ形にそろえてあります。

  ⚠️ **2026-09-23 まで、このスクリプトは「memo だけを取り出した並び順」に連番を振っていました。**
  そのため **真ん中の問題を1つ消すと、それより後ろの id が全部くり上がりました。**
    - 実測（理科クイズ作成担当・2026-09-23）: 第4回から12問消すと **73/77問**の id がずれる
    - 実測（このスクリプト・2026-09-23）: 第3回は data.js の id が **r3m102 まで飛び番**（13個の欠番）なのに、
      元データの memo は 89問。連番を振ると **89問すべてが r3m01〜r3m89 に振り直される**
  ★ **id はお子さんの記録（`stats[id]`）のキーです。**ずれると、別の問題の記録に化けます。

■ ★calc は取り込まない
  計算問題は別アプリ `keisan-print-app` の持ち物（2026-09-07 にユーザーの依頼で分離）。
  第1回の calc 7問・第2回の calc 70問は、いま keisan-print-app/data.js に
  r1c01〜07・r2c01〜70 として入っている。こちらへ入れると二重になる。
  → **id を要求するのは memo 行だけ**です。calc 行の id は見ません。

■ ★入口の自己テスト（確認ポイント 4-6）
  `--check` / `--apply` のどちらを打っても、**先に自己テストが走ります。**
  1つでも落ちたら、**数字を出さずに終了コード3で止まります。**
      (a) id を持つ偽の元データ      → id が元データと1件ずつ一致する      … 通るべき
      (b) ★真ん中の1行を消した元データ → 残った問の id が1つも変わらない     … 通るべき
      (b2) その (b) が、昔の位置採番なら鳴ることの確認                       … 鳴るべき
      (c) id の無い行がまじった元データ → 止まる                            … 止まるべき
      (c2) id が1つも無い元データ      → 止まる                            … 止まるべき
      (d) id が重複した元データ        → 止まる                            … 止まるべき
      (e) 別の回の id がまじった元データ → 止まる                            … 止まるべき
  偽の元データは**実物のJSONから組み立てます**（回や番号を決め打ちしない・4-6b）。
  単体で走らせるなら: `python tools/import_rika.py --selftest`

■ 使い方
    python tools/import_rika.py --selftest      # 自己テストだけ
    python tools/import_rika.py --verify-ids    # ★全回、元データの id と data.js の id を突き合わせる
    python tools/import_rika.py --check 3       # 取り込まずに数字と対応表を出す
                                                #   ★id は元データに必ず持たせる。無ければ止まります
    python tools/import_rika.py --apply 3       # data.js を書きかえる

■ data.js の書式（既存に合わせる。ずれていれば取り込み前に止まる）
  改行は CRLF、非ASCIIはエスケープしない、`{`/`}` は1字下げ・キーは2字下げ、
  キーの順序は id, subj, u, q, note, a, img, kai, kind, priority, level, sol、
  空文字のキーは出力しない、no/unit/folder/figureNote/subject/genre/file は変換または破棄。
"""
import argparse
import copy
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
    4: "第4回_ヒトと動物の消化吸収.json",
}

# data.js に出力するキーと、その順番（既存の理科の行と同じ並び）
OUT_KEYS = ["id", "subj", "u", "q", "note", "a", "img", "kai", "kind",
            "priority", "level", "sol"]
# 元データのキー名 -> data.js のキー名
RENAME = {"subject": "subj", "genre": "u", "file": "img"}
# 取り込まないキー
DROP = {"no", "unit", "folder", "figureNote"}


class Stop(Exception):
    """取り込みを止める。自己テストはこれを捕まえて『止まるべきものが止まったか』を見る。"""


def die(msg):
    raise Stop(msg)


def id_pattern(kai):
    """その回の id の形。r<回>m<番号>。番号は桁数を決めない（第3回に r3m102 がある）。"""
    return re.compile(r"^r%dm(\d+)$" % kai)


# ---------------------------------------------------------------- id の決め方

def ids_of(memo, kai):
    """memo 行の id を決める。**元データの id をそのまま使う。それ以外の道はない。**

    id が無いときは止める。黙って並び順から採番すると、
    2026-09-23 に実測された「第4回で 72/76問がずれる」事故がそのまま起きるため。
    ★逃げ道（位置採番のオプション）は置いていません。**id は元データに持たせてください。**
    """
    has = [r for r in memo if str(r.get("id", "")).strip()]
    if len(has) == len(memo) and memo:
        ids = [r["id"] for r in memo]
    elif has:
        die("元データに、id のある行と無い行がまざっています（%d/%d）。\n"
            "  id の無い行の no: %s\n"
            "  元データを直してから取り込んでください。"
            % (len(has), len(memo),
               ", ".join(str(r.get("no")) for r in memo if not str(r.get("id", "")).strip())[:200]))
    else:
        die("第%d回の元データ（memo %d問）に id フィールドがありません。\n"
            "  ★並び順から採番すると、真ん中の1問を消しただけで後ろの id が全部くり上がり、\n"
            "    お子さんの記録が別の問題に紐づきます（第4回で 72/76問がずれると実測ずみ）。\n"
            "  ★このスクリプトは id を作りません。**元データに id を付けてから**取り込んでください。"
            % (kai, len(memo)))

    # --- ここから先は「元データの id を使う」場合の検査 ---
    pat = id_pattern(kai)
    bad = [i for i in ids if not pat.match(str(i))]
    if bad:
        die("第%d回の元データに、この回の形（r%dm<番号>）でない id があります: %s\n"
            "  ★別の回の id がまじっていると、取り込みで他の回の問題を壊します。"
            % (kai, kai, ", ".join(map(str, bad[:10]))))
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        die("第%d回の元データの中で id が重複しています: %s" % (kai, ", ".join(dup[:10])))
    return ids


def convert(src_rows, kai):
    """元データの memo 行を data.js の1問に変換する。"""
    memo = [r for r in src_rows if r.get("kind") == "memo"]
    if not memo:
        die("第%d回の元データに memo 行がありません。" % kai)
    ids = ids_of(memo, kai)

    out = []
    mapping = []
    for r, qid in zip(memo, ids):
        rec = {}
        for k, v in r.items():
            if k in DROP or k == "id":
                continue
            key = RENAME.get(k, k)
            if key not in OUT_KEYS:
                die("元データに知らないキーがあります: %r（no.%s）" % (k, r.get("no")))
            rec[key] = v
        rec["id"] = qid
        rec["kai"] = kai
        rec["kind"] = "memo"
        for must in ("subj", "u", "q", "a"):
            if not str(rec.get(must, "")).strip():
                die("no.%s（%s）の %s が空です。" % (r.get("no"), qid, must))
        out.append(rec)
        mapping.append((qid, r.get("no")))
    return out, mapping, memo


# ------------------------------------------------------------- data.js 側

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


def id_of(part):
    m = re.search(r'"id": "([^"]+)"', part)
    return m.group(1) if m else None


def q_of(part):
    m = re.search(r'"q": ("(?:[^"\\]|\\.)*")', part)
    return json.loads(m.group(1)) if m else None


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


# ------------------------------------------------------------- 自己テスト

def _pick_selftest_source():
    """自己テストに使う実物のJSONを、**条件で**選ぶ（4-6b: 回を決め打ちしない）。

    選ぶ条件（4-6e: 分岐が両方通るもの）:
      ・memo が4問以上ある
      ・calc が memo の途中にはさまっている（＝ no と並び順がずれる回）
    当てはまるものが複数あれば、はさまった calc がいちばん多い回。
    1つも無ければ**止める**（黙って素通りさせない・4-6d）。
    """
    best = None
    for kai in sorted(FILES):
        path = os.path.join(SRC, FILES[kai])
        if not os.path.exists(path):
            continue
        rows = json.load(io.open(path, encoding="utf-8"))
        kinds = [r.get("kind") for r in rows]
        if "memo" not in kinds:
            continue
        last_memo = len(kinds) - 1 - kinds[::-1].index("memo")
        inner_calc = sum(1 for i, k in enumerate(kinds) if k == "calc" and i < last_memo)
        n_memo = kinds.count("memo")
        if n_memo >= 4 and inner_calc >= 1:
            if best is None or inner_calc > best[2]:
                best = (kai, rows, inner_calc, n_memo)
    if best is None:
        die("自己テストに使える元データがありません"
            "（memo 4問以上・calc が途中にはさまる回が1つも無い）。")
    return best[0], best[1]


def _fake_source(kai, rows):
    """実物から偽の元データを作る。**id は飛び番で付ける。**

    飛び番にするのは、位置採番との違いが必ず出るようにするため。
    実物の第3回も飛び番（r3m102 まであって欠番13）なので、作り話ではありません。
    """
    fake = copy.deepcopy(rows)
    n = 0
    for r in fake:
        if r.get("kind") == "memo":
            n += 1
            r["id"] = "r%dm%02d" % (kai, n * 2 - 1)   # 1, 3, 5, ... の飛び番
    return fake


def _memo_ids(rows):
    return [r["id"] for r in rows if r.get("kind") == "memo"]


def selftest(verbose=False):
    """入口の自己テスト。落ちたら (False, 明細) を返す。"""
    log = []
    ok = True

    def say(mark, name, detail):
        log.append("    %s %s … %s" % (mark, name, detail))

    kai, rows = _pick_selftest_source()
    fake = _fake_source(kai, rows)
    want = _memo_ids(fake)
    log.append("  自己テストに使った元データ: 第%d回（memo %d問・偽の id は飛び番）" % (kai, len(want)))

    # (a) id を持つ元データ → data.js に出る id が元データと1件ずつ一致する
    try:
        recs, _, memo = convert(fake, kai)
        got = [r["id"] for r in recs]
        qs_ok = all(r["q"] == m["q"] for r, m in zip(recs, memo))
        if got == want and qs_ok:
            say("✔", "(a) id が元データと1件ずつ一致", "%d問すべて一致（問題文も対応）" % len(got))
        else:
            ok = False
            say("✖", "(a) id が元データと1件ずつ一致",
                "食い違い %d件 / 問題文の対応=%s"
                % (sum(1 for g, w in zip(got, want) if g != w), qs_ok))
    except Stop as e:
        ok = False
        say("✖", "(a) id が元データと1件ずつ一致", "止まってしまった: %s" % e)

    # (b) ★真ん中の1行を消した元データ → 残った問の id が1つも変わらない
    memo_pos = [i for i, r in enumerate(fake) if r.get("kind") == "memo"]
    cut_at = memo_pos[len(memo_pos) // 2]          # 真ん中の memo（番号は決め打ちしない）
    cut_id = fake[cut_at]["id"]
    trimmed = [r for i, r in enumerate(fake) if i != cut_at]
    want_b = [i for i in want if i != cut_id]
    try:
        recs_b, _, _ = convert(trimmed, kai)
        got_b = [r["id"] for r in recs_b]
        moved = [(w, g) for w, g in zip(want_b, got_b) if w != g]
        if got_b == want_b:
            say("✔", "(b) ★真ん中を1問消しても id が変わらない",
                "%s を抜いた → 残り %d問の id はすべて元のまま" % (cut_id, len(got_b)))
        else:
            ok = False
            say("✖", "(b) ★真ん中を1問消しても id が変わらない",
                "%d問がずれた 例: %s" % (len(moved), moved[:3]))
    except Stop as e:
        ok = False
        say("✖", "(b) ★真ん中を1問消しても id が変わらない", "止まってしまった: %s" % e)

    # (b2) その (b) が、昔の位置採番なら鳴ることの確認（＝空っぽの検査になっていないか）
    #      「直す前の版」を再現する。★HEAD ではなく、式そのものを書いて固定する（4-6c）
    old_way = ["r%dm%02d" % (kai, i) for i in range(1, len(want_b) + 1)]
    n_shift = sum(1 for w, o in zip(want_b, old_way) if w != o)
    if n_shift > 0:
        say("✔", "(b2) 昔の位置採番なら (b) は鳴る",
            "直す前の式なら %d/%d問がずれる（検査は空っぽではない）" % (n_shift, len(want_b)))
    else:
        ok = False
        say("✖", "(b2) 昔の位置採番なら (b) は鳴る",
            "★位置採番でも同じ id になってしまう。この検査は何も守っていません")

    # (c) id の無い行がまじった元データ → 止まる
    holed = copy.deepcopy(fake)
    holed[cut_at].pop("id")
    try:
        convert(holed, kai)
        ok = False
        say("✖", "(c) id の無い行で止まる", "★止まらなかった（黙って採番された）")
    except Stop as e:
        say("✔", "(c) id の無い行で止まる", str(e).splitlines()[0])

    # (c2) id が1つも無い元データ → 止まる
    # ★実物のJSONをそのまま使わないこと。実物に id が焼き付いた日から、この枝は一度も通らなくなる。
    #   （2026-09-23 に実際そうなった。id を**こちらで全部はがした**偽の元データで確かめる）
    naked = copy.deepcopy(fake)
    for r in naked:
        r.pop("id", None)
    try:
        convert(naked, kai)
        ok = False
        say("✖", "(c2) id が1つも無い元データで止まる", "★止まらなかった")
    except Stop as e:
        say("✔", "(c2) id が1つも無い元データで止まる", str(e).splitlines()[0])

    # (d) id が重複した元データ → 止まる
    dupd = copy.deepcopy(fake)
    dupd[memo_pos[-1]]["id"] = dupd[memo_pos[0]]["id"]
    try:
        convert(dupd, kai)
        ok = False
        say("✖", "(d) id の重複で止まる", "★止まらなかった")
    except Stop as e:
        say("✔", "(d) id の重複で止まる", str(e).splitlines()[0])

    # (e) 別の回の id がまじった元データ → 止まる
    alien = copy.deepcopy(fake)
    alien[cut_at]["id"] = "r%dm01" % (kai + 1)
    try:
        convert(alien, kai)
        ok = False
        say("✖", "(e) 別の回の id で止まる", "★止まらなかった")
    except Stop as e:
        say("✔", "(e) 別の回の id で止まる", str(e).splitlines()[0])

    return ok, log


def run_selftest_or_exit(verbose=False):
    ok, log = selftest()
    if not ok or verbose:
        print("=== 入口の自己テスト ===")
        for line in log:
            print(line)
    if not ok:
        print("\n✖ 自己テストが落ちました。**数字は出しません。**検査そのものを直してください。")
        sys.exit(3)


# --------------------------------------------------- 元データ と data.js の突き合わせ

def verify_ids():
    """★全回について、元データの id と data.js の id を突き合わせる。data.js は書きかえない。"""
    _, text = read_data_js()
    _, parts, _ = rows_of(text)
    live = {}
    for p in parts:
        live[id_of(p)] = q_of(p)

    print("=== 元データの id と data.js の id の突き合わせ（書きかえません）===")
    total = {"match": 0, "mismatch": 0}
    for kai in sorted(FILES):
        path = os.path.join(SRC, FILES[kai])
        if not os.path.exists(path):
            print("  第%d回  元データが見つかりません: %s" % (kai, FILES[kai]))
            continue
        rows = json.load(io.open(path, encoding="utf-8"))
        memo = [r for r in rows if r.get("kind") == "memo"]
        pat = id_pattern(kai)
        here = {i: q for i, q in live.items() if i and pat.match(i)}

        no_id = [r.get("no") for r in memo if not str(r.get("id", "")).strip()]
        if no_id:
            print("  第%d回  ★元データに id がありません（%d/%d問）。まだ焼き付いていません"
                  % (kai, len(no_id), len(memo)))
            total["mismatch"] += len(no_id)
            continue

        src_ids = [r["id"] for r in memo]
        src_q = {r["id"]: r.get("q") for r in memo}
        same_id = sorted(set(src_ids) & set(here))
        only_src = sorted(set(src_ids) - set(here))
        only_js = sorted(set(here) - set(src_ids))
        q_diff = [i for i in same_id if src_q[i] != here[i]]

        ok_n = len(same_id) - len(q_diff)
        bad_n = len(q_diff) + len(only_src) + len(only_js)
        total["match"] += ok_n
        total["mismatch"] += bad_n
        print("  第%d回  一致 %d件 / 食い違い %d件"
              "（問題文が違う %d・元データにしかない %d・data.js にしかない %d）"
              % (kai, ok_n, bad_n, len(q_diff), len(only_src), len(only_js)))
        for i in q_diff[:5]:
            print("      ★%s 問題文が違う" % i)
            print("        元データ: %s" % str(src_q[i])[:60])
            print("        data.js : %s" % str(here[i])[:60])
        for i in only_src[:5]:
            print("      ・元データにしかない: %s" % i)
        for i in only_js[:5]:
            print("      ・data.js にしかない: %s  %s" % (i, str(here[i])[:40]))
    print("  ---- 合計  一致 %d件 / 食い違い %d件" % (total["match"], total["mismatch"]))
    return total


# -------------------------------------------------------------------- 本体

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", type=int)
    ap.add_argument("--apply", type=int)
    ap.add_argument("--selftest", action="store_true", help="入口の自己テストだけを走らせる")
    ap.add_argument("--verify-ids", action="store_true",
                    help="全回、元データの id と data.js の id を突き合わせる（書きかえない）")
    a = ap.parse_args()

    # ★どの入口からでも、まず自己テスト（4-6）。落ちたら数字を出さずに止まる
    run_selftest_or_exit(verbose=a.selftest)
    if a.selftest:
        print("\n✔ 自己テストはすべて通りました。")
        return
    if a.verify_ids:
        verify_ids()
        return

    kai = a.check or a.apply
    if not kai:
        die("--check か --apply に回の数字を渡してください（--selftest / --verify-ids もあります）。")
    if kai not in FILES:
        die("第%d回のファイルを知りません。" % kai)

    path = os.path.join(SRC, FILES[kai])
    if not os.path.exists(path):
        die("元データが見つかりません: " + path)
    with io.open(path, encoding="utf-8") as f:
        src_rows = json.load(f)

    raw, text = read_data_js()
    head, parts, tail = rows_of(text)
    n_before = len(parts)   # ★書きかえる前の問題数。あとで増減を出すのに使う

    # 自己検査: 切って貼り直すとバイト一致するか
    if head + "".join(parts) + tail != text:
        die("data.js を切って貼り直すと元に一致しません。書式が想定と違います。")

    existing = [id_of(p) for p in parts]
    existing_q = {id_of(p): q_of(p) for p in parts}
    pat = id_pattern(kai)
    already = [i for i in existing if i and pat.match(i)]

    n_calc = len([r for r in src_rows if r.get("kind") == "calc"])
    new_rows, mapping, memo = convert(src_rows, kai)

    print("=== 第%d回 %s ===" % (kai, FILES[kai]))
    print("  元データ: %d問（memo %d / calc %d）" % (len(src_rows), len(memo), n_calc))
    print("  ★calc %d問は取り込みません（keisan-print-app の持ち物）" % n_calc)
    print("  id の決め方: ★元データの id をそのまま使用（このスクリプトは id を作りません）")
    print("  取り込む: %d問  id: %s〜%s" % (len(new_rows), new_rows[0]["id"], new_rows[-1]["id"]))
    print("  data.js のいまの総数: %d問" % len(parts))
    print("  data.js にある %s*: %d問 %s"
          % ("r%dm" % kai, len(already), "（上書き更新）" if already else "（新規追加）"))

    # id の重複チェック（他の回とぶつかっていないか）
    dup = (set(existing) - set(already)) & set(r["id"] for r in new_rows)
    if dup:
        die("他の回の id とぶつかっています: " + ", ".join(sorted(dup)))

    # ★いま公開されている id との突き合わせ。ここが今回いちばん大事な数字
    new_ids = [r["id"] for r in new_rows]
    keep = sorted(set(already) & set(new_ids))
    lost = sorted(set(already) - set(new_ids))
    added = sorted(set(new_ids) - set(already))
    q_diff = [r["id"] for r in new_rows
              if r["id"] in existing_q and existing_q[r["id"]] != r.get("q")]
    print("\n  --- いまの data.js との突き合わせ（★id を鍵にする。位置では照合しない）---")
    print("    そのまま残る id : %d問" % len(keep))
    print("    消える id       : %d問 %s%s" % (len(lost), "" if not lost else "★ ", lost[:12]))
    print("    増える id       : %d問 %s" % (len(added), added[:12]))
    print("    同じ id で問題文が変わる: %d問" % len(q_diff))
    for qid in q_diff[:10]:
        print("      %s" % qid)
        print("        いま: %s" % str(existing_q[qid])[:60])
        print("        あと: %s" % str(next(r["q"] for r in new_rows if r["id"] == qid))[:60])
    if lost:
        print("    ⚠️ 消える id があります。**そのidで積んだ記録は行き先が無くなります。**"
              "消してよい問かを確かめてください")

    print("\n  --- id と no の対応（★no と番号がずれる所を確かめる）---")
    shifted = [(i, n) for i, n in mapping if int(pat.match(i).group(1)) != n]
    for i, n in mapping:
        mark = "  ← ★no とずれている" if int(pat.match(i).group(1)) != n else ""
        if mark or n <= 3 or n >= len(src_rows) - 2:
            print("    %s = no.%s%s" % (i, n, mark))
    print("    （ずれている問: %d件。calc をまたいだ分・飛び番の分）" % len(shifted))

    if a.check:
        print("\n（--check なので data.js は変えていません）")
        return

    # 既にある分は入れかえ、無ければ最後の r*m の直後に差し込む
    new_text_rows = [fmt_row(r) for r in new_rows]
    if already:
        keep_parts = [p for p in parts if not pat.match(id_of(p) or "")]
        at = min(i for i, p in enumerate(parts) if pat.match(id_of(p) or ""))
        parts = keep_parts[:at] + new_text_rows + keep_parts[at:]
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
    # ★以前はここの引き算が必ず 0 になっていた（parts は差し込んだあとの配列なので、
    #   それと引いても 0 にしかならない）。書きかえる前の数と比べる
    print("\n  書きこみ後: %d問 → %d問（%+d）" % (n_before, len(parts2), len(parts2) - n_before))
    print("  総数: %d問" % len(parts2))
    if len(ids2) != len(set(ids2)):
        die("id が重複しました。data.js.bak から戻してください。")
    print("  id重複: 0")
    print("  控え: data.js.bak")
    print("\n★このあと必ず: node tools/verify_data.mjs / smoke-test / 実機で第%d回を出題して目視（B-12）" % kai)


if __name__ == "__main__":
    try:
        main()
    except Stop as e:
        print("✖ " + str(e))
        sys.exit(1)
