# -*- coding: utf-8 -*-
"""
社会 第4回の no.116・117 だけを、元データに合わせて直す（2026-09-18・一度きり）。

■ なぜ import_g.py を使わないのか
  import_g.py は第4回を丸ごと入れ直す。既存の行を作り直すので、**id はそのままでも
  差分が大きくなり**、取り違えの危険がある。今回は2問の `note` と `sol` だけなので、
  ★その2行のその欄だけを書きかえる。ほかの行は1バイトも触らない。

■ ★気をつけたこと
  - data.js の社会の行には **`sol` がまだ1件も無い**（import_g.py が捨てているため）。
    今回は新しく足すので、キーの並びは import_g.py の OUT_KEYS に合わせて **level のうしろ**に置く。
  - 行の最後のキーにはカンマが付かない書式なので、足すときにカンマの付け替えが要る。
  - 元データの sha256 を、書く前と書いたあとに照合する。

■ 使い方
    python tools/patch_g4_sol_note.py --check
    python tools/patch_g4_sol_note.py --apply
"""
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

BATTLE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(BATTLE, "data.js")
SRC = os.path.join(os.path.dirname(BATTLE), "5年下", "quiz_csv", "第4回_平安時代.json")
EXPECT_SHA = "959d50c582530ce81b1b91d95ca529e03f34bcb93498fadb05a16565beff1a2d"
TARGET_NOS = [116, 117]        # 既定。--nos で変えられる（2026-09-18: 残り5問の sol を入れるため）
FIELDS = ["note", "sol"]          # 直してよい欄はこの2つだけ
LAST_KEY = "level"                # sol を足す位置（この欄のうしろ）


def die(msg):
    print("✖ " + msg)
    sys.exit(1)


def sha256_of(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def row_block(text, qid):
    """data.js から、その問題の『行のかたまり』を切り出す"""
    m = re.search(r'\{\r\n  "id": "%s",\r\n(?:.*?\r\n)*? \},\r\n' % re.escape(qid), text)
    if not m:
        die("data.js に %s の行が見つかりません。" % qid)
    return m.group(0)


def parse_block(block):
    s = block.strip().rstrip(",")
    s = re.sub(r",(\s*)\}$", r"\1}", s)
    return json.loads(s)


def set_field(block, key, value):
    """かたまりの中の1つの欄だけを書きかえる。無ければ level のうしろに足す"""
    dumped = json.dumps(value, ensure_ascii=False)
    if ('"%s":' % key) in block:
        return re.sub(r'(  "%s": )(".*?")(,?)\r\n' % re.escape(key),
                      lambda m: m.group(1) + dumped + m.group(3) + "\r\n", block, count=1)
    # 足す: いまの最後のキー（level）にカンマを付け、その下に入れる
    m = re.search(r'  "%s": (".*?")\r\n \},\r\n$' % re.escape(LAST_KEY), block)
    if not m:
        die("行の最後が「%s」ではありません。書式が想定と違います。" % LAST_KEY)
    return block[:m.start()] + '  "%s": %s,\r\n  "%s": %s\r\n },\r\n' % (LAST_KEY, m.group(1), key, dumped)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--apply", action="store_true")
    ap.add_argument("--nos", help="直す問題の no をカンマ区切りで（既定: 116,117）")
    a = ap.parse_args()

    global TARGET_NOS
    if a.nos:
        TARGET_NOS = [int(x) for x in a.nos.split(",") if x.strip()]

    got = sha256_of(SRC)
    if got != EXPECT_SHA:
        die("元データの sha256 が違います。\n  期待 %s\n  実際 %s\n"
            "  ★同期の遅れでも違います。まず開き直し、それでも違えば作成担当に確かめてください。" % (EXPECT_SHA, got))
    with io.open(SRC, encoding="utf-8") as f:
        src_rows = json.load(f)
    with io.open(DATA_JS, "rb") as f:
        text = f.read().decode("utf-8")

    print("=== 社会 第4回 no.%s の %s を直す ===" % ("・".join(map(str, TARGET_NOS)), "・".join(FIELDS)))
    print("  元データ: %d問  sha256 一致" % len(src_rows))

    # ★まず「ほかの問題は本当に変わっていないか」を、全121問で確かめる
    others = []
    sol_gap = []          # ★もとから data.js に入っていない sol（import_g.py が落としているため）
    for r in src_rows:
        qid = "g4r%d" % r["no"]
        cur = parse_block(row_block(text, qid))
        for k, v in (("q", r.get("q")), ("a", r.get("a"))):
            if (cur.get(k) or "") != (v or ""):
                others.append("%s の %s" % (qid, k))
        if r["no"] not in TARGET_NOS:
            if (cur.get("note") or "") != (r.get("note") or ""):
                others.append("%s の note" % qid)
            if (r.get("sol") or "") and not (cur.get("sol") or ""):
                sol_gap.append(qid)      # 今回の依頼の範囲外。報告だけする
            elif (cur.get("sol") or "") != (r.get("sol") or ""):
                others.append("%s の sol" % qid)
    if others:
        die("no.116・117 以外にも食いちがいがあります（今回の範囲外）: %s" % ", ".join(others[:10]))
    print("  ★ほかの119問は q・a・note とも元データと同じ（食いちがい0件）")
    if sol_gap:
        print("  ⚠️ もとから data.js に入っていない sol: %d問（%s）" % (len(sol_gap), "・".join(sol_gap)))
        print("     → import_g.py が sol を落とす作りのため。今回の依頼は no.116・117 だけなので、ここは触らない")

    plan = []
    new_text = text
    for no in TARGET_NOS:
        qid = "g4r%d" % no
        r = next(x for x in src_rows if x["no"] == no)
        block = row_block(new_text, qid)
        cur = parse_block(block)
        changed = []
        nb = block
        for k in FIELDS:
            want = r.get(k) or ""
            have = cur.get(k) or ""
            if want == have:
                continue
            if not want:
                die("%s の %s を空にする変更は、今回は受けません。" % (qid, k))
            nb = set_field(nb, k, want)
            changed.append("%s（%s → %d字）" % (k, "なし" if not have else "%d字" % len(have), len(want)))
        if changed:
            plan.append((qid, changed))
            new_text = new_text.replace(block, nb, 1)
        # 直したあとの姿を検算（q・a・priority などが変わっていないこと）
        after = parse_block(row_block(new_text, qid))
        for k in cur:
            if k not in FIELDS and cur[k] != after.get(k):
                die("%s の %s が変わってしまいました。" % (qid, k))
        for k in FIELDS:
            if (after.get(k) or "") != (r.get(k) or ""):
                die("%s の %s が元データと一致しません。" % (qid, k))

    for qid, changed in plan:
        print("  %s: %s" % (qid, " / ".join(changed)))
    if not plan:
        print("  直すところはありません（もう同じです）。")

    if a.check:
        print("\n（--check なので data.js は変えていません）")
        return

    if sha256_of(SRC) != EXPECT_SHA:
        die("途中で元データが変わりました。data.js は書きかえていません。")
    shutil.copyfile(DATA_JS, DATA_JS + ".bak")
    with io.open(DATA_JS, "wb") as f:
        f.write(new_text.encode("utf-8"))

    # 書いたあと: 変わった行が2つだけで、中身も想定どおりかを見る
    with io.open(DATA_JS, "rb") as f:
        after_text = f.read().decode("utf-8")
    before_rows = re.findall(r'\{\r\n  "id": "[^"]+",\r\n(?:.*?\r\n)*? \},\r\n', text)
    after_rows = re.findall(r'\{\r\n  "id": "[^"]+",\r\n(?:.*?\r\n)*? \},\r\n', after_text)
    if len(before_rows) != len(after_rows):
        die("行の数が変わりました。data.js.bak から戻してください。")
    diff = [i for i, (b, c) in enumerate(zip(before_rows, after_rows)) if b != c]
    ids = [re.search(r'"id": "([^"]+)"', after_rows[i]).group(1) for i in diff]
    # ★もう元データと同じだった問題は変わらない。だから「直す予定だった行」と突き合わせる
    #   （TARGET_NOS と比べると、直すところが無い問題を混ぜたときに落ちる。2026-09-18 に実際に踏んだ）
    if sorted(ids) != sorted(qid for qid, _ in plan):
        die("変わった行が想定と違います: %s（直す予定だった行: %s）" % (ids, [q for q, _ in plan]))
    print("\n  ★変わった行: %s の%d行だけ（ほかは1バイトも変わっていない）" % ("・".join(ids), len(ids)))
    print("  行の数: %d（変わらず）／元データの sha256: 前後で一致" % len(after_rows))
    print("  控え: data.js.bak")


if __name__ == "__main__":
    main()
