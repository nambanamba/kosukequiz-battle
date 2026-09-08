# -*- coding: utf-8 -*-
"""夏期講習の復習編に置きかわった旧単元を data.js から消す。

引きつぎ表（build_map.py が作る mapping.json）とセットで使う。
先に index.html の KAKI_STATS_MIGRATION を差し替えてから、これを実行する。

使い方:
    python remove_old_units.py --check    # 消さずに、何が起きるかだけ出す
    python remove_old_units.py --apply    # 実際に消す
"""
import sys, os, io, json, shutil, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import import_quiz as iq

# 消す旧単元（build_map.py の PAIRS と同じ）
TARGET_UNITS = [
    "5.近畿地方", "6.中部地方", "7.関東地方", "8.東北地方", "8.北海道地方",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not (args.check or args.apply):
        ap.print_help()
        return

    head, blocks = iq.read_data_js()
    parsed = [iq.parse_block(b) for b in blocks]
    keep, drop = [], []
    for b, d in zip(blocks, parsed):
        (drop if d.get("u") in TARGET_UNITS else keep).append((b, d))

    print("消す旧単元:", " / ".join(TARGET_UNITS))
    from collections import Counter
    c = Counter(d["u"] for _, d in drop)
    for u in TARGET_UNITS:
        print("  %-14s %d問" % (u, c.get(u, 0)))
    print("消す合計: %d問" % len(drop))
    print("data.js: %d問 -> %d問" % (len(blocks), len(keep)))

    # 引きつぎ表との照合
    mp = json.load(io.open(os.path.join(HERE, "mapping.json"), encoding="utf-8"))
    drop_ids = {d["id"] for _, d in drop}
    keep_ids = {d["id"] for _, d in keep}
    not_dropped = [k for k in mp if k not in drop_ids]
    dangling = sorted({n for v in mp.values() for n in v if n not in keep_ids})
    print()
    print("引きつぎ表: %d件" % len(mp))
    print("  ★引きつぎ元が消えないもの   : %d件 %s" % (len(not_dropped), not_dropped[:5]))
    print("  ★引きつぎ先が残らないもの   : %d件 %s" % (len(dangling), dangling[:5]))
    print("  記録を捨てる旧問題           : %d件" % (len(drop) - len(mp)))
    if not_dropped or dangling:
        print("\n★引きつぎ表と消す対象が食い違っています。中止します。")
        sys.exit(1)

    # 消したあとに参照されなくなる画像
    imgs_keep = {d.get("img") for _, d in keep if d.get("img")}
    imgs_drop = {d.get("img") for _, d in drop if d.get("img")}
    now_unused = sorted(imgs_drop - imgs_keep)
    print("\n消したことで参照されなくなる画像: %d枚" % len(now_unused))
    print("  ※ C-3 のとおり削除しない（配信が行き渡るまで旧版が参照する）")

    if args.check:
        print("\n確認のみ（--check）。data.js は書きかえていません。")
        return

    backup = iq.DATA_JS + ".bak"
    shutil.copy2(iq.DATA_JS, backup)
    out = head + iq.HEADER + "".join(b for b, _ in keep) + iq.FOOTER
    with io.open(iq.DATA_JS, "w", encoding="utf-8", newline="") as f:
        f.write(out)

    _, blocks2 = iq.read_data_js()
    ids2 = [iq.parse_block(b)["id"] for b in blocks2]
    if len(blocks2) != len(keep) or len(set(ids2)) != len(ids2):
        shutil.copy2(backup, iq.DATA_JS)
        raise SystemExit("書き込み後の読み直しが合いません。元に戻しました。")
    print("\n消しました。data.js は %d問（控え: %s）" % (len(blocks2), backup))


if __name__ == "__main__":
    main()
