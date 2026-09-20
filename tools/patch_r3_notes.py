# -*- coding: utf-8 -*-
"""
理科 第3回（水溶液の中和）の `note` だけを、id ごとにピンポイントで直す。

■ ★なぜ import_rika.py を使わないのか（C-5）
  第3回は元データに calc が18問あり、data.js には memo 89問だけが入っている。
  import_rika.py は memo を r3m01 から歯抜けなしに振り直すので、id が全部ずれる。
  id がずれると、お子さんの解答履歴 `stats[id]` が別の問題に付けかわる。

■ ★対応づけは「問題文（q）」で行う。位置でも番号でもない
  位置照合は禁止（確認ポイント 2-4。復習編1で51件ずれた実績）。
  2026-09-20 に実測したところ、data.js の r3m の id 番号は
    ・元データの `no` と一致しない（89問中70問しか当たらない）
    ・memo だけの連番とも一致しない（89問中76問）
  実際の規則は **id番号 = no −（それより前にある calc の数）**（patch_r3_rev4.py の申し送り）。
  この道具は q で対応づけたうえで、**その規則が成り立つことを独立の検算として確かめる**。
  さらに **答え（a）の一致**も対応づけの証拠として要求する。どれか1つでも崩れたら止まる。

■ 書きかえるもの
  `note` だけ。★`id`・`q`・`a`・`img`・`kai`・`kind`・`sol` には触らない。
  ★書きかえは「いま入っている note の文字列リテラルを、そのまま新しいリテラルに置きかえる」形。
  リテラルが1件ちょうど見つからなければ止まる（＝あいまいな置換をしない）。

■ 使い方
    python tools/patch_r3_notes.py --check
    python tools/patch_r3_notes.py --apply
    python tools/patch_r3_notes.py --selftest
  ★--check / --apply でも、先に自己テストが走る（確認ポイント 4-6）。
  　落ちたら data.js を読まずに止まる。**信用できない数字を出さないため。**

■ ★この道具が見ていないもの（確認ポイント 4-2）
  - **note の中身が教材として正しいか**は見ていない（作成担当の持ち場）
  - **答えの露出（A-1 / A-2b）** は見ていない
  - **画面で解けるか（B-12）** は見ていない。実機で見ること
  - 社会・ほかの回は対象外
"""
import argparse
import hashlib
import io
import json
import os
import re
import shutil
import sys

# Windows の既定のコンソールは cp932 で、★ や ✖ が出せずに落ちる
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BATTLE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(BATTLE), "5年下", "quiz_csv_理科",
                   "第3回_水溶液の中和.json")
DATA_JS = os.path.join(BATTLE, "data.js")

# ★納品のたびに書きかえる。宣言値と合わなければ止まる（C-4c-2）
SHA = "f368d4c88719808b9b6ff2792d0f11e9a3d987b4244d490a430d147a4ef6b741"

BLOCK_RE = r'\{\s*"id":\s*"(r3m\d+)"[\s\S]*?\n \}'


def parse_blocks(text):
    """data.js から r3m のブロックを取り出す。値は json.loads で読む（自前の
    エスケープ処理を書かないため。書きかえも json.dumps のリテラル一致で行う）。"""
    out = []
    for m in re.finditer(BLOCK_RE, text):
        try:
            rec = json.loads(m.group(0))
        except ValueError as e:
            sys.exit("✘ %s のブロックが JSON として読めません: %s" % (m.group(1), e))
        out.append((m.group(1), m.span(), m.group(0), rec))
    return out


def build_plan(text, memo):
    """q で対応づけ、note が違うものだけを返す。対応づけが怪しければ止まる。"""
    blocks = parse_blocks(text)
    if len(blocks) != len(memo):
        sys.exit("✘ 件数が合いません。data.js %d 件 / 元データ memo %d 件" % (len(blocks), len(memo)))

    qs_data = [r["q"] for _, _, _, r in blocks]
    qs_src = [q["q"] for q in memo]
    if len(set(qs_data)) != len(qs_data):
        sys.exit("✘ data.js 側の問題文に重複があります。q を鍵にできません")
    if len(set(qs_src)) != len(qs_src):
        sys.exit("✘ 元データ側の問題文に重複があります。q を鍵にできません")

    by_q = {r["q"]: (qid, span, body, r) for qid, span, body, r in blocks}
    calc_nos = None  # 検算用にあとで使う

    plan = []
    for q in memo:
        if q["q"] not in by_q:
            sys.exit("✘ 元データ no.%s の問題文が data.js にありません。止まります" % q["no"])
        qid, span, body, rec = by_q[q["q"]]
        # ★対応づけの独立した証拠その1: 答えが一致すること
        if rec.get("a") != q.get("a"):
            sys.exit("✘ %s（no.%s）の答えが元データと違います。対応づけが怪しいので止まります"
                     % (qid, q["no"]))
        # ★対応づけの独立した証拠その2: 画像が一致すること（今回 img の変更は無い納品）
        if (rec.get("img") or None) != (q.get("file") or None):
            sys.exit("✘ %s（no.%s）の img が元データと違います（%r / %r）。止まります"
                     % (qid, q["no"], rec.get("img"), q.get("file")))
        if (rec.get("note") or None) != (q.get("note") or None):
            plan.append((qid, q["no"], span, body, rec.get("note"), q.get("note")))
    return blocks, by_q, plan


def check_id_rule(memo, src_all, by_q):
    """★独立検算: id番号 == no −（それより前にある calc の数）が全件成り立つか。
    q で作った対応づけとは別の道すじなので、両方が合えば対応づけの裏づけになる。"""
    calc_nos = sorted(q["no"] for q in src_all if q.get("kind") == "calc")
    bad = []
    for q in memo:
        qid = by_q[q["q"]][0]
        want = q["no"] - sum(1 for c in calc_nos if c < q["no"])
        if int(qid[3:]) != want:
            bad.append((qid, q["no"], want))
    return calc_nos, bad


def selftest():
    """★確認ポイント 4-1 / 4-3: 壊していないものが通り、壊したものが鳴ることを
    両方たしかめる。1つ通ったことを全部の証拠にしない（型ごとに用意する）。"""
    src_all = [
        {"no": 1, "kind": "memo", "q": "問1", "a": "答1", "note": "出典1"},
        {"no": 2, "kind": "calc", "q": "計算", "a": "9"},
        {"no": 3, "kind": "memo", "q": "問3", "a": "答3", "note": "出典3new", "file": "x.jpg"},
    ]
    memo = [q for q in src_all if q["kind"] == "memo"]
    base = ('const X = [\n'
            ' {\n  "id": "r3m01",\n  "q": "問1",\n  "note": "出典1",\n  "a": "答1"\n },\n'
            ' {\n  "id": "r3m02",\n  "q": "問3",\n  "note": "出典3old",\n  "a": "答3",\n'
            '  "img": "x.jpg"\n }\n];\n')

    results = []

    # ① 基準: 壊していない → note の差は 1件（r3m02）だけのはず
    _, by_q, plan = build_plan(base, memo)
    ok = [p[0] for p in plan] == ["r3m02"]
    results.append(("① 基準（壊していない）: 差は r3m02 の1件だけ", ok))

    # ② id の規則の検算が通ること（r3m02 は no.3 − 前にある calc 1件 = 2）
    _, bad = check_id_rule(memo, src_all, by_q)
    results.append(("② id の規則の検算が通る", bad == []))

    # ③ 書きかえが効くこと（＋効いたあと差が0件になること）
    after = apply_plan(base, plan)
    _, _, plan2 = build_plan(after, memo)
    results.append(("③ 当てたあと差が 0件になる", plan2 == []))

    # ④ ★答えを壊したら鳴るか
    results.append(("④ 答えを壊すと止まる", _expect_exit(base.replace('"答3"', '"別の答え"'), memo)))

    # ⑤ ★問題文を壊したら鳴るか（対応がつかなくなる）
    results.append(("⑤ 問題文を壊すと止まる", _expect_exit(base.replace('"問3"', '"別の問"'), memo)))

    # ⑥ ★img を壊したら鳴るか
    results.append(("⑥ img を壊すと止まる", _expect_exit(base.replace('"x.jpg"', '"別.jpg"'), memo)))

    # ⑦ ★件数が合わなければ鳴るか
    short = base.replace(' {\n  "id": "r3m02",\n  "q": "問3",\n  "note": "出典3old",\n  "a": "答3",\n  "img": "x.jpg"\n }\n', '')
    results.append(("⑦ 件数が合わないと止まる", _expect_exit(short, memo)))

    print("── 自己テスト ──")
    for name, ok in results:
        print("  %s %s" % ("✔" if ok else "✖", name))
    if not all(ok for _, ok in results):
        sys.exit("✘ 自己テストが落ちました。**数字を出さずに止まります**（確認ポイント 4-6）")
    print("  自己テスト 7/7 通過\n")


def _expect_exit(text, memo):
    """build_plan が止まる（SystemExit を出す）ことを期待する。止まらなければ False。"""
    try:
        build_plan(text, memo)
    except SystemExit:
        return True
    return False


def apply_plan(text, plan):
    """★うしろから書きかえる（前から直すと、あとの位置がずれる）。
    置きかえは「いまの note のリテラルそのもの」を狙う。1件ちょうどでなければ止まる。"""
    for qid, no, (s0, s1), body, old, new in reversed(plan):
        old_lit = '"note": ' + json.dumps(old, ensure_ascii=False)
        new_lit = '"note": ' + json.dumps(new, ensure_ascii=False)
        if body.count(old_lit) != 1:
            sys.exit("✘ %s の note のリテラルが %d 件見つかりました（1件でないと直せません）"
                     % (qid, body.count(old_lit)))
        text = text[:s0] + body.replace(old_lit, new_lit, 1) + text[s1:]
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()

    selftest()          # ★必ず先に走る（4-6）
    if a.selftest and not (a.check or a.apply):
        return

    # ★必ずバイナリで読む。この元データは CRLF で、テキストで読むと sha256 が合わない
    #   （「合わない＝誰かが書き換えた」ではない。確認ポイント 0-3 の4つ目）
    raw = open(SRC, "rb").read()
    got = hashlib.sha256(raw).hexdigest()
    if got != SHA:
        sys.exit("✘ 元データの sha256 が宣言値と違います。止まります\n  宣言 %s\n  実物 %s" % (SHA, got))
    print("sha256 一致（%d バイト）" % len(raw))

    src_all = json.loads(raw.decode("utf-8"))
    memo = [q for q in src_all if q.get("kind") == "memo"]
    print("元データ: %d 問（memo %d / calc %d）" % (len(src_all), len(memo), len(src_all) - len(memo)))

    text = io.open(DATA_JS, encoding="utf-8").read()
    blocks, by_q, plan = build_plan(text, memo)
    print("data.js の r3m: %d 件（q で 89/89 対応・答えと img も全件一致）" % len(blocks))

    calc_nos, bad = check_id_rule(memo, src_all, by_q)
    if bad:
        sys.exit("✘ id の規則（no − 前の calc 数）が成り立たない問があります: %s" % bad[:5])
    print("★独立検算: id番号 = no −（前にある calc %d 件）が %d 問すべてで成立"
          % (len(calc_nos), len(memo)))

    print("\nnote を直す問: %d 件" % len(plan))
    for qid, no, _, _, _, _ in plan:
        print("  %-8s (no.%s)" % (qid, no))

    if not a.apply:
        print("\n（--check なので data.js は変えていません）")
        return

    shutil.copyfile(DATA_JS, DATA_JS + ".bak")
    io.open(DATA_JS, "w", encoding="utf-8").write(apply_plan(text, plan))

    # ★書いたあと読み直して、差が 0件になったことを確かめる
    #   （「書いた」を「効いている」の証拠にしない・確認ポイント 0-3）
    after = io.open(DATA_JS, encoding="utf-8").read()
    _, _, plan2 = build_plan(after, memo)
    if plan2:
        sys.exit("✘ 当てたあとも差が %d 件残っています。止まります" % len(plan2))
    print("\n✅ data.js を直しました（控え: data.js.bak）。読み直して差 0件を確認")
    print("★このあと必ず: verify_rika_pointwise.mjs 3 / verify_data / smoke-test / 実機で目視（B-12）")


main()
