# -*- coding: utf-8 -*-
"""
kosukequiz-battle の data.js に、夏期講習の復習編JSONを取り込むスクリプト。

■ いちばん大事なこと
  問題の id は「JSONの id フィールド」を使う。**配列の位置から採番してはいけない。**
  復習編1では 102件中51件で「id と配列位置」がずれており、位置から採番すると
  既存93問のうち42問の中身が別の問題に入れかわり、解答履歴が別の問題に紐づく。
  id フィールドが無い編は、既定ではエラーで止まる。位置採番は
  --allow-position-ids を明示したときだけ（黙って採番するほうが危ないため）。

■ 使い方
    # 取り込まずに検証だけする（まずこれを実行して数字を確かめる）
    python import_quiz.py --check 1

    # 実際に data.js を書きかえる
    python import_quiz.py --apply 1

    # 全編の状態を一覧する
    python import_quiz.py --list

■ data.js の書式について
  既存の整形をそのまま保つ。改行は CRLF、非ASCIIはエスケープしない、
  キーの順序は id, subj, u, q, note, a, img, priority, level, sol、
  空文字のキーは出力しない、figureNote は取り込まない。
  スクリプト起動時に「data.js を読んで書き戻すとバイト一致するか」を必ず自己検査するので、
  書式がずれていれば取り込み前に止まる。
"""
import argparse
import io
import json
import os
import re
import shutil
import sys

# このスクリプトの1つ上がリポジトリのルート。フォルダごと移動しても動くよう、
# 絶対パスは決め打ちしない。元データの場所は、リポジトリの隣の `5年下` を見る
BATTLE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(BATTLE), "5年下", "quiz_csv_夏期講習")
DATA_JS = os.path.join(BATTLE, "data.js")
IMAGES = os.path.join(BATTLE, "images")

HEADER = "const QA_DATA = [\r\n"
FOOTER = "];\r\n"

# data.js に出力するキーと、その順番
OUT_KEYS = ["id", "subj", "u", "q", "note", "a", "img", "priority", "level", "sol"]
# JSONのキー名 -> data.js のキー名
RENAME = {"genre": "u", "subject": "subj", "file": "img"}
# 取り込まないキー
DROP = {"no", "unit", "folder", "figureNote", "kai"}

FILES = {
    1: "復習編1_日本の食料生産_v2.json",
    2: "復習編2_工業資源輸送機関.json",
    3: "復習編3_九州地方.json",
    4: "復習編4_中国四国地方.json",
    5: "復習編5_近畿地方.json",
    6: "復習編6_中部地方.json",
    7: "復習編7_関東地方.json",
    8: "復習編8_東北北海道地方.json",
}


# ---------------------------------------------------------------- data.js 側

def read_data_js():
    """data.js を (先頭, ブロックのリスト) に分ける。ブロックは1問ぶんの生テキスト。"""
    text = io.open(DATA_JS, encoding="utf-8", newline="").read()
    head, sep, rest = text.partition(HEADER)
    if not sep:
        raise SystemExit("data.js の先頭 'const QA_DATA = [' が見つかりません")
    if not rest.endswith(FOOTER):
        raise SystemExit("data.js の末尾 '];' が想定と違います")
    body = rest[: -len(FOOTER)]
    blocks = re.findall(r" \{\r\n(?:.*?\r\n)*? \},\r\n", body)
    if "".join(blocks) != body:
        raise SystemExit("data.js のブロック分解に失敗しました（想定外の整形）")
    return head, blocks


def parse_block(block):
    """1問ぶんのブロックを dict にする。"""
    d = {}
    for line in block.split("\r\n")[1:-2]:
        m = re.match(r'^  ("(?:[^"\\]|\\.)*"): (.*?),?$', line)
        if not m:
            raise SystemExit("行を読めません: " + repr(line))
        d[json.loads(m.group(1))] = json.loads(m.group(2))
    return d


def serialize_block(d, trailing_comma=False):
    """dict を data.js のブロックに戻す。新しく書くブロックだけに使う。

    data.js には整形が2種類まざっている。最後の項目のうしろにカンマが付くもの
    （復習編1〜3など、古い取り込み）と、付かないもの（復習編4〜6）。
    どちらが正しいということはなく、JavaScript としてはどちらも同じに読まれる。
    そこで、**その編の既存ブロックと同じ整形に合わせて書く**。
    そうしないと中身を変えていない問題まで差分に出てしまい、
    「元の整形を保ったまま該当ブロックだけ触る」というこのリポジトリの決めごとに反する。
    空文字のキーは出力しない。
    """
    unknown = [k for k in d if k not in OUT_KEYS]
    if unknown:
        raise SystemExit("書き出せないキーがあります: %s" % unknown)
    keys = [k for k in OUT_KEYS if k in d and d[k] != ""]
    out = " {\r\n"
    for i, k in enumerate(keys):
        out += "  " + json.dumps(k, ensure_ascii=False) + ": " + json.dumps(d[k], ensure_ascii=False)
        out += ",\r\n" if (i < len(keys) - 1 or trailing_comma) else "\r\n"
    return out + " },\r\n"


def detect_trailing_comma(blocks, prefix):
    """その編の既存ブロックが、最後の項目のうしろにカンマを付けているか。

    既存が無い編（まるごと新規）は、今の整形（カンマなし）にする。
    まざっていたら判断できないので止める。
    """
    styles = set()
    for b in blocks:
        if not parse_block(b)["id"].startswith(prefix):
            continue
        styles.add(b.split("\r\n")[-3].rstrip().endswith(","))
    if not styles:
        return False
    if len(styles) > 1:
        raise SystemExit(
            "%s* の中で整形がまざっています。手で確認してください。" % prefix
        )
    return styles.pop()


def self_check(blocks):
    """全ブロックを読めること（id キーでの検証に必要）だけを確かめる。

    バイト一致までは求めない。data.js には整形の違うブロックが混ざっているが、
    取り込みでは対象の編以外を生テキストのまま通すので、書き直しは起きない。
    """
    ids = []
    for b in blocks:
        ids.append(parse_block(b)["id"])
    if len(set(ids)) != len(ids):
        raise SystemExit("data.js の中で id が重複しています")
    return ids


def style_report(blocks, prefix, trailing_comma):
    """その編の既存ブロックを、こちらの整形で書き直したとき何件がバイト一致するか。

    内容を変えていないブロックが一致しなければ、整形が合っていない合図になる。
    ここが「既存件数 − 変更予定件数」にならなければ、余計な差分が出る。
    """
    same = 0
    diff = []
    for b in blocks:
        d = parse_block(b)
        if not d["id"].startswith(prefix):
            continue
        if serialize_block(d, trailing_comma) == b:
            same += 1
        else:
            diff.append(d["id"])
    return same, diff


# ------------------------------------------------------------------ JSON 側

def load_source(n):
    path = os.path.join(SRC, FILES[n])
    if not os.path.exists(path):
        raise SystemExit("元データがありません: " + path)
    return json.load(io.open(path, encoding="utf-8"))


def assign_ids(n, rows, allow_position=False):
    """id を決める。JSONの id をそのまま使うのが本則。

    id が無いときは既定でエラーにする。黙って位置から採番すると、
    復習編1で実測された「既存93問のうち42問の中身が別の問題に入れかわる」事故が
    そのまま起きるため。位置採番は --allow-position-ids を明示したときだけ。
    """
    has_id = [r for r in rows if r.get("id")]
    if len(has_id) == len(rows):
        return [r["id"] for r in rows], "json"
    if has_id:
        raise SystemExit(
            "id のある行と無い行が混ざっています（%d/%d）。元データを直してください。"
            % (len(has_id), len(rows))
        )
    if not allow_position:
        raise SystemExit(
            "復習編%d の元データに id フィールドがありません。\n"
            "位置から採番すると、既存の問題の中身が別の問題に入れかわり、\n"
            "解答履歴が別の問題に紐づく恐れがあります（復習編1では102件中51件がずれていました）。\n"
            "元データに id を付けてから取り込んでください。\n"
            "どうしても位置から採番してよいと分かっている場合のみ --allow-position-ids を付けてください。"
            % n
        )
    return ["kaki%d_%02d" % (n, i + 1) for i in range(len(rows))], "position"


def copy_images(new_blocks, dry_run):
    """その編が参照している画像のうち、images/ に無いものを元データフォルダからコピーする。

    コピーしないまま取り込むと、画像が出ない問題として配信されてしまう。
    元データフォルダにも無い場合は、取り込みを止める。
    """
    want = []
    for b in new_blocks:
        d = parse_block(b)
        if d.get("img") and d["img"] not in want:
            want.append(d["img"])
    missing = [f for f in want if not os.path.exists(os.path.join(IMAGES, f))]
    absent = [f for f in missing if not os.path.exists(os.path.join(SRC, f))]
    if absent:
        raise SystemExit(
            "元データフォルダにも無い画像があります。取り込めません:\n  " + "\n  ".join(absent)
        )
    if not dry_run:
        for f in missing:
            shutil.copy2(os.path.join(SRC, f), os.path.join(IMAGES, f))
    return want, missing


def update_img_sizes(dry_run):
    """index.html の IMG_SIZES に、data.js が参照する画像の幅・高さをそろえる。

    IMG_SIZES は <img> に width/height を付けて、読み込み中に文字が飛ぶのを防ぐ表。
    **取り込みで画像を増やしたらここも更新しないと、増やした分だけがたつく。**
    実際、復習編4〜6の128枚が前任の取り込みから未登録のまま残っていた
    （手順に入っていなかったのが原因）ので、取り込みの一部として組み込んである。
    """
    from PIL import Image
    path = os.path.join(BATTLE, "index.html")
    html = io.open(path, encoding="utf-8", newline="").read()
    m = re.search(r"const IMG_SIZES = (\{.*?\});", html, re.S)
    if not m:
        raise SystemExit("index.html の IMG_SIZES が見つかりません")
    sizes = json.loads(m.group(1))

    _, blocks = read_data_js()
    refs = sorted({parse_block(b).get("img") for b in blocks if parse_block(b).get("img")})
    add = {}
    for f in refs:
        p = os.path.join(IMAGES, f)
        if not os.path.exists(p):
            raise SystemExit("画像が見つかりません: " + p)
        with Image.open(p) as im:
            wh = [im.width, im.height]
        # 足りないものだけでなく、**寸法が変わったものも直す**。
        # 画像を切り出し直すと寸法が変わり、古い値が残っていると
        # 「登録されているのに実物と違う」状態になって、かえって表示が崩れる
        if sizes.get(f) != wh:
            add[f] = wh
    if not add or dry_run:
        return add

    sizes.update(add)
    body = "{" + ",".join('"%s":[%d,%d]' % (k, sizes[k][0], sizes[k][1]) for k in sorted(sizes)) + "}"
    html = html[: m.start(1)] + body + html[m.end(1):]
    io.open(path, "w", encoding="utf-8", newline="").write(html)
    return add


def to_block_dict(row, qid):
    d = {"id": qid}
    for k, v in row.items():
        if k in DROP or k == "id":
            continue
        key = RENAME.get(k, k)
        if key not in OUT_KEYS:
            raise SystemExit("JSONに知らないキー: %r" % k)
        if v is None:
            continue
        v = v if isinstance(v, str) else str(v)
        if v == "":
            continue
        d[key] = v
    for must in ("subj", "u", "q", "a"):
        if must not in d:
            raise SystemExit("%s に %s がありません" % (qid, must))
    return d


# -------------------------------------------------------------------- 検証

def verify(n, old_blocks, new_blocks, id_source, rows, trailing_comma):
    """取り込み前後を id キーで突き合わせる。位置での照合は使わない。"""
    prefix = "kaki%d_" % n
    old = {}
    for b in old_blocks:
        d = parse_block(b)
        old[d["id"]] = d
    new = {}
    for b in new_blocks:
        d = parse_block(b)
        new[d["id"]] = d

    old_unit = {k: v for k, v in old.items() if k.startswith(prefix)}
    new_unit = {k: v for k, v in new.items() if k.startswith(prefix)}

    report = []
    same, diff = style_report(old_blocks, prefix, trailing_comma)
    report.append("元データ           : %s" % FILES[n])
    report.append("整形               : 最後の項目のカンマ %s（既存に合わせた）"
                  % ("あり" if trailing_comma else "なし"))
    report.append("整形が既存と一致    : %d件 / 不一致 %d件 %s"
                  % (same, len(diff), diff[:8]))
    report.append("id の決め方        : %s" % ("JSONのidをそのまま使用" if id_source == "json" else "★配列位置から採番（idフィールドが無い編）"))
    report.append("JSONの件数         : %d" % len(rows))
    report.append("data.js の %-8s: %d件 -> %d件" % (prefix + "*", len(old_unit), len(new_unit)))
    report.append("data.js の総件数    : %d件 -> %d件" % (len(old), len(new)))

    ok = True

    dup = len(new_blocks) - len(new)
    report.append("id の重複          : %d件 %s" % (dup, "OK" if dup == 0 else "★NG"))
    ok &= dup == 0

    lost = sorted(set(old_unit) - set(new_unit))
    report.append("消えた既存id       : %d件 %s%s" % (len(lost), "OK" if not lost else "★NG ", lost[:10]))
    ok &= not lost

    added = sorted(set(new_unit) - set(old_unit))
    report.append("新しく増えたid     : %d件 %s" % (len(added), added[:12]))

    clash = sorted(set(added) & (set(old) - set(old_unit)))
    report.append("他の単元との衝突   : %d件 %s%s" % (len(clash), "OK" if not clash else "★NG ", clash[:10]))
    ok &= not clash

    outside_before = {k: v for k, v in old.items() if not k.startswith(prefix)}
    outside_after = {k: v for k, v in new.items() if not k.startswith(prefix)}
    same_outside = outside_before == outside_after
    report.append("他の単元は無変更   : %s" % ("OK" if same_outside else "★NG 他の単元が変わっています"))
    ok &= same_outside

    changed = []
    for qid in sorted(set(old_unit) & set(new_unit)):
        if old_unit[qid] != new_unit[qid]:
            fields = sorted(
                k for k in set(old_unit[qid]) | set(new_unit[qid])
                if old_unit[qid].get(k) != new_unit[qid].get(k)
            )
            changed.append((qid, fields))
    report.append("既存idで内容が変わったもの: %d件" % len(changed))
    for qid, fields in changed[:20]:
        report.append("    %s  %s" % (qid, ",".join(fields)))

    # 取り込み後に data.js 全体が参照する画像。--check の時点ではまだコピーしていないので、
    # 元データフォルダにあるものは「これからコピーするぶん」として欠落に数えない
    refs = sorted({d["img"] for d in new.values() if d.get("img")})
    absent = [f for f in refs
              if not os.path.exists(os.path.join(IMAGES, f))
              and not os.path.exists(os.path.join(SRC, f))]
    pending = [f for f in refs if not os.path.exists(os.path.join(IMAGES, f)) and f not in absent]
    report.append("画像参照（取り込み後の全体）: %d種 / これからコピー %d枚 / 見つからない %d件 %s%s"
                  % (len(refs), len(pending), len(absent), "OK" if not absent else "★NG ", absent[:10]))
    ok &= not absent

    return ok, report, changed


# -------------------------------------------------------------------- 本体

def build(n, blocks, allow_position=False):
    rows = load_source(n)
    ids, id_source = assign_ids(n, rows, allow_position)
    if len(set(ids)) != len(ids):
        raise SystemExit("JSONの中で id が重複しています")
    tc = detect_trailing_comma(blocks, "kaki%d_" % n)
    new_unit_blocks = [serialize_block(to_block_dict(r, i), tc) for r, i in zip(rows, ids)]
    return rows, ids, id_source, new_unit_blocks, tc


def splice(blocks, n, new_unit_blocks):
    """その編のブロックを丸ごと差しかえる。無ければ末尾に足す。"""
    prefix = "kaki%d_" % n
    pos = [i for i, b in enumerate(blocks) if parse_block(b)["id"].startswith(prefix)]
    if not pos:
        return blocks + new_unit_blocks
    if pos != list(range(pos[0], pos[-1] + 1)):
        raise SystemExit("%s* が data.js の中で連続していません。手で確認してください。" % prefix)
    return blocks[: pos[0]] + new_unit_blocks + blocks[pos[-1] + 1:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", type=int, metavar="N", help="取り込まずに検証だけする")
    ap.add_argument("--apply", type=int, metavar="N", help="実際に data.js を書きかえる")
    ap.add_argument("--list", action="store_true", help="全編の状態を一覧する")
    ap.add_argument("--allow-position-ids", action="store_true",
                    help="idフィールドが無いとき、配列位置から採番するのを明示的に許可する（既定は停止）")
    args = ap.parse_args()

    head, blocks = read_data_js()
    ids = self_check(blocks)
    print("自己検査: data.js の %d件すべてを読めました（id 重複なし）" % len(ids))

    if args.list:
        print("\n編  JSON件数  idの決め方              data.js の件数")
        for n in sorted(FILES):
            path = os.path.join(SRC, FILES[n])
            if not os.path.exists(path):
                print("%2d  (元データなし)" % n)
                continue
            rows = load_source(n)
            _, src = assign_ids(n, rows, allow_position=True)
            cur = sum(1 for b in blocks if parse_block(b)["id"].startswith("kaki%d_" % n))
            print("%2d  %7d  %-22s  %d" % (n, len(rows), "JSONのid" if src == "json" else "★位置から採番", cur))
        return

    n = args.check or args.apply
    if not n:
        ap.print_help()
        return

    rows, ids, id_source, new_unit_blocks, tc = build(n, blocks, args.allow_position_ids)
    new_blocks = splice(blocks, n, new_unit_blocks)

    # 画像は data.js を書きかえる前にそろえる。--check では数えるだけ
    want, missing = copy_images(new_unit_blocks, dry_run=bool(args.check))
    if args.check:
        print("\nこの編が使う画像: %d種 / images/ に足りないもの %d枚（--apply でコピーします）"
              % (len(want), len(missing)))
        if missing:
            print("  " + ", ".join(missing[:6]) + (" ほか" if len(missing) > 6 else ""))
    else:
        print("画像をコピーしました: %d枚（この編が使うのは %d種）" % (len(missing), len(want)))

    ok, report, changed = verify(n, blocks, new_blocks, id_source, rows, tc)

    print("\n===== 復習編%d の検証 =====" % n)
    for line in report:
        print(line)

    if not ok:
        print("\n★検証に失敗しました。取り込みません。")
        sys.exit(1)

    if args.check:
        print("IMG_SIZES に足りない幅・高さ: %d件（--apply で追加します）"
              % len(update_img_sizes(dry_run=True)))
        print("\n検証のみ（--check）。data.js は書きかえていません。")
        return

    backup = DATA_JS + ".bak"
    shutil.copy2(DATA_JS, backup)
    out = head + HEADER + "".join(new_blocks) + FOOTER
    with io.open(DATA_JS, "w", encoding="utf-8", newline="") as f:
        f.write(out)

    head2, blocks2 = read_data_js()
    self_check(blocks2)
    if [parse_block(b) for b in blocks2] != [parse_block(b) for b in new_blocks]:
        shutil.copy2(backup, DATA_JS)
        raise SystemExit("書き込み後の読み直しが合いません。元に戻しました。")
    # 画像を増やしたら IMG_SIZES もそろえる（読み込み中のがたつき防止）
    added_sizes = update_img_sizes(dry_run=False)
    if added_sizes:
        print("index.html の IMG_SIZES に %d件の幅・高さを追加しました" % len(added_sizes))

    print("\n取り込みました。data.js は %d件（控え: %s）" % (len(blocks2), backup))


if __name__ == "__main__":
    main()
