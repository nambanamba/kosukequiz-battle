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

# ============================================================================
# ★★2026-09-23 司令塔の指示で、この道具は走らせないことにしました。
#   消していません。記録として残してあります。中身を読むのは自由です。
# ============================================================================
import sys as _sys
_sys.exit(
    """✖ 一度きりの道具です。2026-09-23 以降、id は元データが持ちます。
  この道具は no から id を組み立てる（69行目 `"r4m%02d" % q["no"]`）ため、走らせると記録が別の問題に移ります。
  取り込みは tools/import_rika.py を使ってください（元データの id をそのまま使います）。"""
)
# ============================================================================

import argparse, hashlib, io, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "..", "5年下", "quiz_csv_理科", "第4回_ヒトと動物の消化吸収.json")
DATA = os.path.join(ROOT, "data.js")
# ★納品のたびに書きかえる。宣言値と合わなければ止まる
SHA = "f5d02d74e27f630d9114d68641a198984d8ccffd91c4ebdc268d2938c8b17348"  # 2026-09-20 夜 納品（47288B・79問）
# ★司令塔が名指しした「図が付く id」。実測と突き合わせて**書き忘れと区別する**（推測では区別できない）
#   ★2026-09-20 夜、差分（外れる id）ではなく **最終状態**（付いている id）で見る形に変えた。
#   理由: data.js 側に前回ぶんが既に当たっていると「外れる差分 0 件」になり、
#   差分で見る検査は**状態しだいで意味が変わる**＝鳴らない検査になる（確認ポイント 4-1）。
DECLARED_IMG_IDS = "r4m43 r4m44 r4m46 r4m47 r4m48 r4m49 r4m65 r4m66 r4m67 r4m75".split()

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
    #   ★差分ではなく「元データの最終状態」で見る（data.js が既に一部当たっていても意味が変わらない）
    src_img = sorted("r4m%02d" % q["no"] for q in src if q.get("file"))
    if src_img != sorted(DECLARED_IMG_IDS):
        sys.exit("✘ 元データで図が付く id が、申告と違います。止まります\n"
                 "  申告 %s\n  実物 %s" % (sorted(DECLARED_IMG_IDS), src_img))
    print("★元データで図が付くのは %d 件。申告どおり" % len(src_img))
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

    # ★書いたあと、data.js を読み直して**最終状態**を確かめる
    #   （「書いた」を「効いている」の証拠にしない・確認ポイント 0-3）
    after = io.open(DATA, encoding="utf-8").read()
    got_img = []
    for q in src:
        qid = "r4m%02d" % q["no"]
        body = re.search(r'\{\s*"id":\s*"%s"[\s\S]*?\n \}' % qid, after).group(0)
        if re.search(r'"img":\s*"', body):
            got_img.append(qid)
    if sorted(got_img) != sorted(DECLARED_IMG_IDS):
        sys.exit("✘ 書いたあとの data.js で img を持つ id が、申告と違います\n"
                 "  申告 %s\n  実物 %s" % (sorted(DECLARED_IMG_IDS), sorted(got_img)))
    print("★書いたあとの data.js で img を持つのは %d 件。申告どおり" % len(got_img))
    print("\n✅ data.js を直しました（控え: data.js.bak）")
    print("★このあと必ず: sync_img_sizes.py / verify_data / smoke-test / 実機で目視（B-12）")

main()
