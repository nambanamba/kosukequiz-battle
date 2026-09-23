# -*- coding: utf-8 -*-
"""
理科第3回「水溶液の横ぐし」の取り込み（2026-09-13・一度きり）。

■ なぜ import_rika.py を使わないのか
  import_rika.py は第3回を「丸ごと入れ直す」。id は memo だけの並び順で振り直すので、
  途中の問題を消すと r3m04 以降の id がすべて別の問題に付け替わり、解答記録が別の問題を指す。
  ★今回は「消す問題だけ消して、残りの id は1つも動かさない（欠番のまま）」が必要なので、
  　ピンポイントで書きかえる。

■ やること（依頼書 司令塔\回答\理科第3回_水溶液の横ぐし問題_依頼_2026-09-13.md の改訂3）
  1. data.js から DELETE の13個を削除（ユーザー了承ずみ:
     「こういうきき方ですでに知識を確認できている問題は削除してください」
     「においの個別の問題も削除してください」「1個目は消します、あとは残します」）
  2. 残りの r3m の id は動かさない
  3. 元データの no.99〜109（新しい横ぐしの11問）を r3m81〜r3m91 で、いちばん後ろの理科の行の直後に足す
  4. no.24・27・60 の note だけ、元データの新しい文に直す

■ 安全のために止まるところ
  - 元データの sha256 が EXPECT_SHA と違う（★同期の遅れでも違う。まず開き直すこと）
  - 残す問題が、元データの行と「問題文＋答え」でちょうど1対1に対応しない
  - 消す問題が、元データにまだ残っている
  - 残す問題で、note 以外の欄（または NOTE_NOS 以外の note）が元データと違う
  - 書式を作り直すと元の行とバイト一致しない（note を直す行）

■ 使い方
    python tools/import_rika3_yokogushi.py --check   # 何をするかを出すだけ
    python tools/import_rika3_yokogushi.py --apply   # data.js を書きかえる（data.js.bak を残す）
"""

# ============================================================================
# ★★2026-09-23 司令塔の指示で、この道具は走らせないことにしました。
#   消していません。記録として残してあります。中身を読むのは自由です。
# ============================================================================
import sys as _sys
_sys.exit(
    """✖ 一度きりの道具です。2026-09-23 以降、id は元データが持ちます。
  この道具は 並び順から id を組み立てる（244行目 `"r3m%02d" % (FIRST_NEW + n)`）ため、走らせると記録が別の問題に移ります。
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

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import import_rika as ir  # noqa: E402  書式の切り方・行の作り方は取り込みの道具と同じものを使う

EXPECT_SHA = "29dd2555dbbe307a6eee2ff26448972c1c9ac10ad2d3a9f965bbc292b2c8c3dc"
SRC = os.path.join(ir.SRC, ir.FILES[3])
DELETE = ["r3m04", "r3m05", "r3m06", "r3m08", "r3m15", "r3m35", "r3m36", "r3m37",
          "r3m39", "r3m55", "r3m56", "r3m57", "r3m58"]
NEW_NOS = list(range(99, 110))      # 新しい横ぐしの11問
NOTE_NOS = {24, 27, 60}             # note だけ新しくなった3問
FIRST_NEW = 81                      # r3m81 から
CMP_KEYS = ["subj", "u", "q", "a", "img", "kai", "kind", "priority", "level", "sol", "note"]


def die(msg):
    print("✖ " + msg)
    sys.exit(1)


def sha256_of(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def id_of(part):
    m = re.search(r'"id": "([^"]+)"', part)
    return m.group(1) if m else None


def parse_part(part):
    # ★data.js には、最後のキーのあとにカンマが付く行が混ざっている（g1r*・kaki1_* など。取り込んだ時期の書式）。
    #   json.loads はそれで落ちるので、閉じかっこ直前のカンマだけ外して読む（2026-09-13 に一度これで落ちた）
    s = part.strip().rstrip(",")
    s = re.sub(r",(\s*)\}$", r"\1}", s)
    return json.loads(s)


def to_record(r):
    """元データの1行を data.js の形の辞書にする（import_rika.convert と同じ変換。id は付けない）"""
    rec = {}
    for k, v in r.items():
        if k in ir.DROP:
            continue
        rec[ir.RENAME.get(k, k)] = v
    rec["kai"] = 3
    rec["kind"] = "memo"
    return rec


def norm(v):
    return None if v in ("", None) else v


def verify(parts_before, parts_after, note_ids, new_ids):
    """書く前と書いたあとを id キーで照合する（B-8）。
    ★残した行は「1バイトも変わっていない」ことまで見る（note を直す約束の行だけは note 以外が同じか）。
    ★行の中身を JSON として読むのは note を直した行だけ。ほかは行の文字列どうしで比べる"""
    ids_after = [id_of(p) for p in parts_after]
    if len(ids_after) != len(set(ids_after)):
        die("id が重複しました。data.js.bak から戻してください。")
    before = {id_of(p): p for p in parts_before}
    after = {id_of(p): p for p in parts_after}
    vanished = sorted(set(before) - set(after))
    appeared = sorted(set(after) - set(before))
    if vanished != sorted(DELETE):
        die("消えた id が想定と違います: %s" % vanished)
    if appeared != sorted(new_ids):
        die("増えた id が想定と違います: %s" % appeared)
    changed = [k for k in before if k in after and before[k] != after[k]]
    bad = [k for k in changed if k not in note_ids]
    if bad:
        die("書きかえる約束のない行が変わりました（1バイトでも）: %s" % bad[:10])
    for k in changed:
        b, x = parse_part(before[k]), parse_part(after[k])
        if {kk: v for kk, v in b.items() if kk != "note"} != {kk: v for kk, v in x.items() if kk != "note"}:
            die("%s で note 以外が変わりました。" % k)
    kept_before = [i for i in (id_of(p) for p in parts_before) if i not in DELETE]
    kept_after = [i for i in ids_after if i not in new_ids]
    if kept_before != kept_after:
        die("残した行の並び順が変わりました。")
    r3_after = [i for i in ids_after if i.startswith("r3m")]
    print("\n  照合: 前 %d問 → 後 %d問（−%d +%d）" % (len(parts_before), len(parts_after), len(vanished), len(appeared)))
    print("  ★消えた id: %s" % " ".join(vanished))
    print("  ★増えた id: %s〜%s（%d個）" % (appeared[0], appeared[-1], len(appeared)))
    print("  ★残した %d問（r3m 以外もふくむ）は1バイトも変わっていない／並び順も同じ／書きかえた note: %d件／id重複: 0" % (
        len(kept_before), len(changed)))
    print("  r3m はいま %d問" % len(r3_after))


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--apply", action="store_true")
    g.add_argument("--verify", action="store_true", help="data.js.bak（書く前）と data.js（書いたあと）を照合するだけ")
    a = ap.parse_args()

    if a.verify:
        bak = ir.DATA_JS + ".bak"
        if not os.path.exists(bak):
            die("data.js.bak がありません。")
        with io.open(bak, "rb") as f:
            text_b = f.read().decode("utf-8")
        _, parts_b, _ = ir.rows_of(text_b)
        _, text_a = ir.read_data_js()
        _, parts_a, _ = ir.rows_of(text_a)
        verify(parts_b, parts_a, set(), ["r3m%02d" % n for n in range(FIRST_NEW, FIRST_NEW + len(NEW_NOS))])
        return

    # ---- 元データ ----
    got = sha256_of(SRC)
    if got != EXPECT_SHA:
        die("元データの sha256 が違います。\n  期待 %s\n  実際 %s\n"
            "  ★同期の遅れでも違います。まず開き直し、それでも違えば作成担当に確かめてください。" % (EXPECT_SHA, got))
    with io.open(SRC, encoding="utf-8") as f:
        src_rows = json.load(f)
    memo = [r for r in src_rows if r.get("kind") == "memo"]
    new_src = sorted([r for r in memo if r.get("no") in NEW_NOS], key=lambda r: r["no"])
    old_src = [r for r in memo if r.get("no") not in NEW_NOS]
    if len(new_src) != len(NEW_NOS):
        die("元データの新しい問題が %d 問です（%d 問のはず）。" % (len(new_src), len(NEW_NOS)))

    # ---- data.js ----
    raw, text = ir.read_data_js()
    head, parts, tail = ir.rows_of(text)
    if head + "".join(parts) + tail != text:
        die("data.js を切って貼り直すと元に一致しません。")
    r3 = [(i, p, parse_part(p)) for i, p in enumerate(parts) if (id_of(p) or "").startswith("r3m")]
    r3_ids = [x[2]["id"] for x in r3]
    missing = [d for d in DELETE if d not in r3_ids]
    if missing:
        die("消すはずの id が data.js にありません: " + ", ".join(missing))
    keep = [x for x in r3 if x[2]["id"] not in DELETE]
    gone = [x for x in r3 if x[2]["id"] in DELETE]

    print("=== 理科第3回 横ぐしの取り込み ===")
    print("  元データ: %d件（memo %d・calc %d）  sha256 一致" % (len(src_rows), len(memo),
                                                             len(src_rows) - len(memo)))
    print("  data.js の r3m: %d問 → 消す %d問・残す %d問・足す %d問 → %d問" % (
        len(r3), len(gone), len(keep), len(new_src), len(keep) + len(new_src)))
    if len(old_src) != len(keep):
        die("残す問題 %d 問と、元データの既存の問題 %d 問の数が合いません。" % (len(keep), len(old_src)))

    # ---- 残す問題 ↔ 元データ を「問題文＋答え」で1対1に対応づける ----
    by_qa = {}
    for r in old_src:
        by_qa.setdefault((r["q"], r["a"]), []).append(r)
    used = set()
    pairs = []
    for i, p, rec in keep:
        hits = by_qa.get((rec["q"], rec["a"]), [])
        if len(hits) != 1:
            die("%s が元データの行と1対1に対応しません（%d件）: %s" % (rec["id"], len(hits), rec["q"][:40]))
        if id(hits[0]) in used:
            die("%s の対応先が二重に使われています。" % rec["id"])
        used.add(id(hits[0]))
        pairs.append((i, p, rec, hits[0]))
    for i, p, rec in gone:
        if (rec["q"], rec["a"]) in by_qa:
            die("消すはずの %s が、元データにまだ残っています: %s" % (rec["id"], rec["q"][:40]))

    # ---- 残す問題の中身の食いちがい（note 3件だけのはず）----
    note_updates = {}
    for i, p, rec, src in pairs:
        conv = to_record(src)
        diffs = [k for k in CMP_KEYS if norm(rec.get(k)) != norm(conv.get(k))]
        if not diffs:
            continue
        if diffs == ["note"] and src["no"] in NOTE_NOS:
            note_updates[rec["id"]] = (i, rec, conv["note"], src["no"])
            continue
        die("%s（no.%s）が元データと %s で違います。note 3件以外は変えない約束です。" % (rec["id"], src["no"], diffs))
    # ★NOTE_NOS の note は、作成担当の見立てでは「元データのほうが新しい」だったが、
    #   2026-09-13 に実際に照合すると data.js にもう入っていた（直す件数 0）。
    #   すでに一致しているなら書きかえる必要はないので止めない。どれが一致ずみかを出す
    already_same = sorted(src["no"] for i, p, rec, src in pairs
                          if src["no"] in NOTE_NOS and rec["id"] not in note_updates)
    if already_same:
        print("  note: no.%s は data.js と元データですでに一致（書きかえない）" % "・".join(str(n) for n in already_same))
    for qid, (i, rec, new_note, no) in note_updates.items():
        if ir.fmt_row(rec) != parts[i]:
            die("%s の行を作り直すと元の行とバイト一致しません。書式が想定と違います。" % qid)

    # ---- 足す問題 ----
    new_recs = []
    for n, r in enumerate(new_src):
        rec = to_record(r)
        rec["id"] = "r3m%02d" % (FIRST_NEW + n)
        for must in ("subj", "u", "q", "a"):
            if not str(rec.get(must, "")).strip():
                die("no.%s の %s が空です。" % (r["no"], must))
        new_recs.append((r["no"], rec))
    existing_ids = set(id_of(p) for p in parts)
    clash = [rec["id"] for _, rec in new_recs if rec["id"] in existing_ids]
    if clash:
        die("足す id が既にあります: " + ", ".join(clash))

    print("\n  --- 消す13問 ---")
    for i, p, rec in gone:
        print("    %s  %s" % (rec["id"], rec["q"][:50]))
    print("\n  --- note だけ直す3問 ---")
    for qid, (i, rec, new_note, no) in sorted(note_updates.items()):
        print("    %s（no.%s）" % (qid, no))
    print("\n  --- 足す11問 ---")
    for no, rec in new_recs:
        print("    %s = no.%s  %s" % (rec["id"], no, rec["q"][:30]))

    if a.check:
        print("\n（--check なので data.js は変えていません）")
        return

    # ---- 書きかえ ----
    out_parts = []
    for i, p in enumerate(parts):
        qid = id_of(p)
        if qid in DELETE:
            continue
        if qid in note_updates:
            rec = dict(note_updates[qid][1])
            rec["note"] = note_updates[qid][2]
            out_parts.append(ir.fmt_row(rec))
            continue
        out_parts.append(p)
    idxs = [k for k, p in enumerate(out_parts) if re.match(r"^r\d+m", id_of(p) or "")]
    at = max(idxs) + 1
    out_parts = out_parts[:at] + [ir.fmt_row(rec) for _, rec in new_recs] + out_parts[at:]
    if sha256_of(SRC) != EXPECT_SHA:
        die("取り込みの途中で元データが変わりました。data.js は書きかえていません。")
    shutil.copyfile(ir.DATA_JS, ir.DATA_JS + ".bak")
    with io.open(ir.DATA_JS, "wb") as f:
        f.write((head + "".join(out_parts) + tail).encode("utf-8"))

    # ---- 書いたあとの照合（id キー）----
    _, text2 = ir.read_data_js()
    _, parts2, _ = ir.rows_of(text2)
    verify(parts, parts2, set(note_updates), [rec["id"] for _, rec in new_recs])
    print("  元データの sha256: 取り込みの前後で一致")
    print("  控え: data.js.bak")


if __name__ == "__main__":
    main()
