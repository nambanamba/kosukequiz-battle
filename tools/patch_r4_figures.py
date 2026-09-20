# -*- coding: utf-8 -*-
"""
理科 第4回に「図つき21問」を入れる。**id を指定して、そこだけ直す。**

■ ★なぜ `import_rika.py` を使わないのか（2026-09-20・理科担当と司令塔の申し送り）
  `import_rika.py` は **memo だけの並び順で id を振り直す**作りで、calc を落とす。
  第4回にそれを走らせると、**欠番が詰まって id がずれる**（前任 claude-1d の実測）。
  id がずれると、お子さんの解答履歴が別の問題に紐づく（C-5）。
  → **丸ごと入れ直しではなく、id ごとに、変わるキーだけを書きかえる。**

■ 何を書きかえるか
  `q` / `note` / `img`（元データの `file`）の3つだけ。
  ★`a`・`id`・`kai`・`kind`・`priority`・`level` には触らない。
  ★`figureNote` は data.js には入れない（`import_rika.py` と同じ扱い）。

■ 使い方
    python tools/patch_r4_figures.py --check
    python tools/patch_r4_figures.py --apply

■ 止まる条件（安全側に倒す）
  - 元データの sha256 が宣言値と違う
  - data.js に無い id がある／答え（`a`）が元データと1件でも食いちがう
  - 書きかえる問が21件でない
"""
import argparse, hashlib, io, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "..", "5年下", "quiz_csv_理科", "第4回_ヒトと動物の消化吸収.json")
DATA = os.path.join(ROOT, "data.js")
# ★納品のたびに書きかえる。宣言値と合わなければ止まる
SHA = "1f8f0744cfc5c09cea09c5559c6b3fbc217718b70b58d2698df9b5bb4a689aee"
# ★司令塔が「意図して img を外す」と名指しした id。
#   実測と突き合わせて、**書き忘れと区別する**（推測では区別できない）
DECLARED_IMG_REMOVED = "r4m15 r4m16 r4m17 r4m21 r4m22 r4m23 r4m30 r4m32 r4m33 r4m76 r4m77".split()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    # ★必ずバイナリで読む。この元データは CRLF で、テキストで読むと sha256 が合わない
    #   （「合わない＝誰かが書き換えた」ではない。CLAUDE.md 0d の3つ目の原因）
    raw = open(SRC, "rb").read()
    got = hashlib.sha256(raw).hexdigest()
    if got != SHA:
        sys.exit("✘ 元データの sha256 が宣言値と違います。止まります\n  宣言 %s\n  実物 %s" % (SHA, got))
    print("sha256 一致（%d バイト）" % len(raw))
    src = json.loads(raw.decode("utf-8"))

    text = io.open(DATA, encoding="utf-8").read()
    plan = []
    for q in src:
        qid = "r4m%02d" % q["no"]
        m = re.search(r'\{\s*"id":\s*"%s"[\s\S]*?\n \}' % qid, text)
        if not m:
            sys.exit("✘ data.js に %s がありません。止まります" % qid)
        body = m.group(0)
        cur = lambda k: (re.search(r'"%s":\s*"((?:[^"]|\\")*)"' % k, body) or [None, None])[1]
        # ★答えが合っていることを、書きかえる前に必ず見る（対応づけが正しい証拠）
        if cur("a") != q["a"]:
            sys.exit("✘ %s の答えが元データと違います。対応づけが怪しいので止まります" % qid)
        want = {"q": q["q"], "note": q.get("note"), "img": q.get("file")}
        chg = {k: v for k, v in want.items() if (cur(k) or None) != (v or None)}
        if chg:
            plan.append((qid, m.span(), body, chg))

    print("書きかえる問: %d 件" % len(plan))
    for qid, _, _, chg in plan:
        print("  %s  %s" % (qid, " / ".join(sorted(chg))))

    # ★「img が外れる」は、意図して外したのか書き忘れなのかが**実物からは区別できない**。
    #   だから司令塔に名指しをもらい、ここで突き合わせる。
    removed = sorted(qid for qid, _, _, chg in plan if "img" in chg and not chg["img"])
    if removed != sorted(DECLARED_IMG_REMOVED):
        sys.exit("✘ img が外れる id が、申告と違います。止まります\n"
                 "  申告 %s\n  実物 %s" % (sorted(DECLARED_IMG_REMOVED), removed))
    print("★img が外れる %d 件は、申告どおり" % len(removed))
    if not a.apply:
        print("\n（--check なので data.js は変えていません）")
        return

    shutil.copyfile(DATA, DATA + ".bak")
    # ★うしろから書きかえる（前から直すと、あとの位置がずれる）
    for qid, (s0, s1), body, chg in reversed(plan):
        new = body
        for k, v in chg.items():
            # ★値が無い＝その鍵ごと消す（img を外すとき）
            if not v:
                new = re.sub(r'\n  "%s":\s*"(?:[^"]|\\")*",' % k, "", new, count=1)
                continue
            lit = json.dumps(v, ensure_ascii=False)
            if re.search(r'"%s":' % k, new):
                new = re.sub(r'"%s":\s*"(?:[^"]|\\")*"' % k, lambda _m: '"%s": %s' % (k, lit), new, count=1)
            elif k == "img":
                # 鍵の並びは id, subj, u, q, note, a, img, kai, … なので a の直後に入れる
                new = re.sub(r'("a":\s*"(?:[^"]|\\")*",?)',
                             lambda _m: _m.group(1).rstrip(",") + ',\n  "img": %s,' % lit, new, count=1)
            else:
                sys.exit("✘ %s に %s がありません。止まります" % (qid, k))
        text = text[:s0] + new + text[s1:]
    io.open(DATA, "w", encoding="utf-8").write(text)
    print("\n✅ data.js を直しました（控え: data.js.bak）")
    print("★このあと必ず: sync_img_sizes.py / verify_data / smoke-test / 実機で目視（B-12）")

main()
