# -*- coding: utf-8 -*-
"""
理科の「大問」（テキスト通りの形）を daimon_data.js に書き出す。2026-09-27。
依頼書: 司令塔\\回答\\対戦_大問を丸ごと出す_依頼_2026-09-27.md

■ data.js には1文字も触らない
  大問は一問一答とは別の出し方。data.js（QA_DATA）に混ぜると、ホームの数字・単元・ランダムが
  大問のぶんで動く（依頼書の失敗4・6）。だから別ファイル daimon_data.js（DAIMON_DATA）にする。

■ ★週テストは既定では載せない
  司令塔（2026-09-27）:「週テストの40件は、私が名指しするまで公開に載せないでください」
  （ユーザー「週テストの取り込みは、テストが終わってからにしたい」）。
  載せるときは回を名指しして --weekly 3 のように付ける。

■ 元データの形（理科クイズ作成担当）
  { daimon:[{daimon, lead, file, ...}], items:[{id, daimon, label, q, a, form, file, sol, note, aFile?}] }
  ★小問の file は、大問の file より優先する（基本問題の大問1は小問ごとに図がちがう）。
    アプリでは「大問の図はリード文の下に1回」「小問の図はその小問の下」に出す。
    同じ図を大問と小問の両方が持っていたら、小問のほうは出さない（二重に出さない）。
  ★aFile は答え側にだけ出す図。アプリは「こたえを見る」を押すまで画面に入れない。

■ 使い方
    python tools/import_daimon.py            # 調べるだけ（書きこまない）
    python tools/import_daimon.py --apply    # daimon_data.js を書き、画像を images/ に置く
    python tools/import_daimon.py --apply --weekly 3   # 週テスト 第3回も載せる（名指しされたときだけ）
    ★2026-10-03 いま公開中の daimon_data.js には週テスト 第3・4回が入っている。
      書き直すときは必ず --weekly 3 --weekly 4 を付けること。付けないと週テストの大問が黙って消える
      （第6回の取り込みで1回やった。前後を node で比べて気づいた）。
      → python tools/import_daimon.py --apply --weekly 3 --weekly 4
"""
import argparse
import hashlib
import io
import json
import os
import re
import shutil
import struct
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

BATTLE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def _find_src(folder="quiz_csv_理科"):
    # git worktree（kosukequiz-battle/_wt/xxx）から動かしても元データを見つけられるよう、上へたどる
    d = BATTLE
    while True:
        cand = os.path.join(os.path.dirname(d), "5年下", folder)
        if os.path.isdir(cand):
            return cand
        if os.path.dirname(d) == d:
            return os.path.join(os.path.dirname(BATTLE), "5年下", folder)
        d = os.path.dirname(d)


SRC = _find_src()
IMG_SRC = os.path.join(SRC, "画像プレビュー")
# ★2026-10-04 社会の大問（ユーザー承認「社会の大問形式を入れます」）。形は理科と同じ。
#   元データは 5年下/quiz_csv/、画像は 5年下/quiz_csv/画像プレビュー/。大問の key は "g{回}_{本}_{大問}"、
#   書き出す大問には "subj": "社会" を付ける（付いていない大問は理科＝これまでどおり）
SRC_SHAKAI = _find_src("quiz_csv")
IMG_SRC_SHAKAI = os.path.join(SRC_SHAKAI, "画像プレビュー")
# (本の名前, 回) → ファイル名。★本番のファイルが来たらここに足す（いまは見本しか無いので空）
FILES_SHAKAI = {
    ("練習問題", 6): "練習問題_第6回.json",   # 2026-10-04 社会の大問のはじめ（練習1・練習2・発展）
}
IMG_DST = os.path.join(BATTLE, "images")
OUT = os.path.join(BATTLE, "daimon_data.js")
DATA_JS = os.path.join(BATTLE, "data.js")

# (本の名前, 回, ファイル名)。並びがそのまま一覧の並び（回 → 本 → 大問）
BOOKS = ["要点チェック", "基本問題", "練習問題", "週テスト"]
FILES = {
    ("要点チェック", 3): "要点チェック_第3回.json",
    ("要点チェック", 4): "要点チェック_第4回.json",
    ("基本問題", 3): "基本問題_第3回.json",
    ("基本問題", 4): "基本問題_第4回.json",
    ("練習問題", 3): "練習問題_第3回.json",
    ("練習問題", 4): "練習問題_第4回.json",
    ("要点チェック", 6): "要点チェック_第6回.json",   # 2026-10-03 追加（第5回は無い・週テスト第6回も無い）
    ("基本問題", 6): "基本問題_第6回.json",
    ("練習問題", 6): "練習問題_第6回.json",
    ("週テスト", 3): "週テスト_第3回_bc.json",
    ("週テスト", 4): "週テスト_第4回_bc.json",
}


def die(msg):
    print("✘ " + msg)
    sys.exit(2)


def jpeg_size(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        seg = struct.unpack(">H", data[i + 2:i + 4])[0]
        i += 2 + seg
    die("画像の寸法が読めません: " + path)


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--weekly", type=int, action="append", default=[],
                    help="載せる週テストの回（名指しされたときだけ）")
    ap.add_argument("--extra", action="append", default=[],
                    help="★調べるだけ: 登録していない社会の大問を読む「社会:本:回:パス」（--apply とは使えない）")
    args = ap.parse_args()
    if args.extra and args.apply:
        die("--extra は調べるだけです。書き出すときは FILES_SHAKAI に登録してください")

    with open(DATA_JS, encoding="utf-8") as f:
        qa_ids = set(re.findall(r'"id":\s*"([^"]+)"', f.read()))
    if len(qa_ids) < 1000:
        die("data.js の id が読めていません（" + str(len(qa_ids)) + "件）。読み方を疑うこと")

    groups, seen_ids, images, srcinfo = [], set(), {}, []
    # ★読むもの（科目, 本, 回, ファイル, 画像の場所）。理科を先に、社会をあとに（並びがそのまま一覧の並び）
    jobs = []
    for kai in (3, 4, 6):
        for book in BOOKS:
            if book == "週テスト" and kai not in args.weekly:
                continue
            if (book, kai) not in FILES:   # ★第6回は週テストが無い。名指しされても無いものは止める
                die("元データの登録がありません: %s 第%d回" % (book, kai))
            jobs.append(("理科", book, kai, os.path.join(SRC, FILES[(book, kai)]), IMG_SRC))
    for (book, kai), fn in sorted(FILES_SHAKAI.items(), key=lambda x: (x[0][1], BOOKS.index(x[0][0]) if x[0][0] in BOOKS else 9)):
        jobs.append(("社会", book, kai, os.path.join(SRC_SHAKAI, fn), IMG_SRC_SHAKAI))
    for ex in args.extra:
        parts = ex.split(":", 3)
        if len(parts) != 4 or parts[0] != "社会":
            die("--extra の書き方は 社会:本:回:パス です: " + ex)
        jobs.append(("社会", parts[1], int(parts[2]), parts[3], IMG_SRC_SHAKAI))
    for subj, book, kai, path, img_src in jobs:
            fn = os.path.basename(path)
            if not os.path.exists(path):
                die("元データがありません: " + fn)
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
            srcinfo.append((fn, sha(path)[:12], len(d["daimon"]), len(d["items"])))
            by_dm = {}
            for it in d["items"]:
                by_dm.setdefault(str(it["daimon"]), []).append(it)
            known = {str(x["daimon"]) for x in d["daimon"]}
            for it in d["items"]:
                # ★id は英小文字と数字だけ（見本の「（案）g6d101」のような下書きの id は止める）
                if not re.fullmatch(r"[a-z0-9]+", str(it.get("id", ""))):
                    die(fn + ": 小問の id が正しくありません（英小文字と数字だけ）: " + str(it.get("id")))
                if str(it["daimon"]) not in known:
                    die(fn + ": 小問 " + it["id"] + " の大問 " + str(it["daimon"]) + " がありません")
                if it["id"] in seen_ids:
                    die("id が重なっています: " + it["id"])
                if it["id"] in qa_ids:
                    die("一問一答（data.js）と id が重なっています: " + it["id"])
                if int(it.get("kai", kai)) != kai:
                    die(fn + ": 小問 " + it["id"] + " の回が " + str(it.get("kai")))
                seen_ids.add(it["id"])
            for dm in d["daimon"]:
                key = ("g" if subj == "社会" else "r") + "%d_%s_%s" % (kai, book, dm["daimon"])
                its = by_dm.get(str(dm["daimon"]), [])
                if not its:
                    die(fn + ": 大問 " + str(dm["daimon"]) + " に小問が1つもありません")
                g = {"key": key, "kai": kai, "book": book, "daimon": str(dm["daimon"]),
                     "lead": dm.get("lead", ""), "file": dm.get("file", ""), "items": []}
                if subj == "社会":
                    g["subj"] = "社会"   # ★理科の大問には書かない（書き出しの1文字も変えないため）
                # ★依頼書「理科_大問を紙で出す」: 大問に paper/paperReason が付いていたら、そのまま通す。
                #   ここ以外の欄には触らない。paper は true のときだけ書く（false は書かない＝今までどおり）
                if dm.get("paper") is True:
                    g["paper"] = True
                    if dm.get("paperReason"):
                        g["paperReason"] = str(dm["paperReason"])
                for it in its:
                    x = {"id": it["id"], "label": it.get("label", ""), "q": it["q"], "a": it["a"],
                         "form": it.get("form", ""), "file": it.get("file", ""),
                         "aFile": it.get("aFile", ""), "sol": it.get("sol", ""), "note": it.get("note", "")}
                    # ★大問と同じ図は小問に重ねて出さない
                    if x["file"] and x["file"] == g["file"]:
                        x["file"] = ""
                    g["items"].append({k: v for k, v in x.items() if v != ""})
                for name in [g["file"]] + [i.get("file", "") for i in g["items"]] + [i.get("aFile", "") for i in g["items"]]:
                    if name:
                        images.setdefault(name, img_src)
                groups.append({k: v for k, v in g.items() if v != ""})

    # 画像: 実物から寸法を測る（写さない）。既存と中身がちがえば止める（上書きしない）
    sizes, new_imgs = {}, []
    for name in sorted(images):
        s = os.path.join(images[name], name)
        if not os.path.exists(s):
            die("画像がありません: " + name)
        sizes[name] = list(jpeg_size(s))
        dst = os.path.join(IMG_DST, name)
        if os.path.exists(dst):
            if sha(dst) != sha(s):
                die("images/ に同じ名前の別の画像があります（上書きしません）: " + name)
        else:
            new_imgs.append(name)

    n_items = sum(len(g["items"]) for g in groups)
    print("■ 元データ")
    for fn, h, nd, ni in srcinfo:
        print("  %s  sha256 %s…  大問%d・小問%d" % (fn, h, nd, ni))
    n_paper = sum(1 for g in groups if g.get("paper"))
    print("■ 書き出し: 大問 %d（うち紙 %d） ／ 小問 %d ／ 画像 %d枚（うち新しく置く %d枚）" % (len(groups), n_paper, n_items, len(sizes), len(new_imgs)))
    print("  週テスト: " + ("第" + "・".join(map(str, args.weekly)) + "回を載せる" if args.weekly else "★載せない（名指しされていない）"))
    for n in new_imgs:
        print("    新: %s %dx%d" % (n, sizes[n][0], sizes[n][1]))
    if not args.apply:
        print("（--apply なしなので書きこんでいません）")
        return

    for n in new_imgs:
        shutil.copyfile(os.path.join(images[n], n), os.path.join(IMG_DST, n))   # ★科目ごとの画像の場所から（2026-10-04）
    body = json.dumps(groups, ensure_ascii=False, indent=1)
    head = ("// 理科の大問（テキスト通りの形）。tools/import_daimon.py が書き出す。★手で直さないこと。\r\n"
            "// ★一問一答（data.js の QA_DATA）とは別。ホームの数字・単元・ランダムには入らない。\r\n")
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        f.write(head + "const DAIMON_DATA = " + body.replace("\n", "\r\n") + ";\r\n"
                + "const DAIMON_IMG_SIZES = " + json.dumps(sizes, ensure_ascii=False) + ";\r\n")
    print("✅ daimon_data.js を書きました。画像 %d枚を images/ に置きました" % len(new_imgs))


if __name__ == "__main__":
    main()
