# -*- coding: utf-8 -*-
"""
おまけ「ペルー」（5年下\\quiz_csv\\おまけ_ペルー.json）を data.js に取り込む。2026-10-21
依頼書 = 5年下\\quiz_csv\\取り込み依頼_おまけ_ペルー_20261021.md（司令塔 claude-33 の手配）

■ import_g.py を使わない理由
  通常回の id は g{回}r{no} だが、このファイルは回が無い。★元データに id 欄（pe1〜pe15）があるので、それをそのまま使う。
  行の書き方・比べ方は import_g.py のもの（fmt_row・content_of）をそのまま使う（書式だけの差分を作らない）。

■ 使い方
    python tools/import_peru.py --check
    python tools/import_peru.py --apply
  ・sha256 を依頼書の値と比べ、ちがえば止まる（Google ドライブの同期の遅れのことがある。開き直してからもう一度）
  ・既存の pe* は同じ位置で入れかえ、増えた分は pe* の最後（無ければ data.js の最後）に足す。元データから消えた pe* があれば止まる
"""
import argparse, hashlib, io, json, os, re, shutil, sys, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ig", os.path.join(HERE, "import_g.py"))
ig = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ig)
ir = ig.ir

SRC_FILE = os.path.join(ig.SRC, "おまけ_ペルー.json")
SHA = "d656db125212f16c8557ff28e683cf75db080ea070a442902830a75519bf8c53"
UNIT = "おまけ.ペルー"


def convert(rows):
    out = []
    for r in rows:
        rec = {}
        for k, v in r.items():
            if k in ig.DROP:
                continue
            rec[ig.RENAME.get(k, k)] = v
        if not re.match(r"^pe\d+$", str(rec.get("id", ""))):
            rec["id"] = "pe%d" % int(r["no"])
        if rec.get("u") != UNIT:
            ir.die("%s の単元が %s ではありません: %s" % (rec["id"], UNIT, rec.get("u")))
        for must in ("subj", "u", "q", "a"):
            if not str(rec.get(must, "")).strip():
                ir.die("%s の %s が空です。" % (rec["id"], must))
        rec = {k: v for k, v in rec.items() if k in ig.OUT_KEYS and v != "" and v is not None}
        out.append(rec)
    ids = [r["id"] for r in out]
    if len(ids) != len(set(ids)):
        ir.die("元データの id が重複しています。")
    return out


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    raw_src = open(SRC_FILE, "rb").read()
    sha = hashlib.sha256(raw_src).hexdigest()
    if sha != SHA:
        ir.die("sha256 が依頼書とちがいます（%s）。同期の遅れかもしれません。開き直してからもう一度。それでもちがえば依頼元に聞く。" % sha)
    new_rows = convert(json.loads(raw_src.decode("utf-8")))

    raw, text = ir.read_data_js()
    head, parts, tail = ir.rows_of(text)
    if head + "".join(parts) + tail != text:
        ir.die("data.js を切って貼り直すと元に一致しません。")
    all_ids = [ig.id_of(p) for p in parts]
    have = {ig.id_of(p): p for p in parts if re.match(r"^pe\d+$", ig.id_of(p) or "")}
    clash = [r["id"] for r in new_rows if r["id"] in all_ids and r["id"] not in have]
    if clash:
        ir.die("id がほかの問とかぶります: " + " ".join(clash))
    added = [r["id"] for r in new_rows if r["id"] not in have]
    changed = [r["id"] for r in new_rows if r["id"] in have and ig.content_of(have[r["id"]]) != r]
    gone = [i for i in have if i not in set(r["id"] for r in new_rows)]
    print("=== おまけ.ペルー（sha256 一致）===")
    print("  元データ %d問 / data.js に %d問" % (len(new_rows), len(have)))
    print("  増える: %d問 %s" % (len(added), " ".join(added)))
    print("  中身が変わる: %d問 %s" % (len(changed), " ".join(changed)))
    print("  ★元データから消えた: %d問 %s" % (len(gone), " ".join(gone)))
    if gone:
        ir.die("元データから消えた問があります。履歴が宙に浮くので止めました。")
    if a.check:
        print("（--check なので data.js は変えていません）")
        return
    byrec = {r["id"]: r for r in new_rows}
    out = []
    for p in parts:
        i = ig.id_of(p)
        # 既存は同じ位置で入れかえる。中身が同じ行は元のまま（書式だけの差分を作らない）
        out.append(p if i not in byrec or ig.content_of(p) == byrec[i] else ig.fmt_row(byrec[i]))
    rest = [ig.fmt_row(byrec[i]) for i in added]
    if rest:
        idxs = [n for n, p in enumerate(out) if re.match(r"^pe\d+$", ig.id_of(p) or "")]
        at = (max(idxs) + 1) if idxs else len(out)
        if at == len(out) and out and not out[-1].rstrip().endswith(","):
            ir.die("data.js の最後の行にカンマがありません（書式が想定とちがう）。")
        out = out[:at] + rest + out[at:]
    result = head + "".join(out) + tail
    shutil.copyfile(ir.DATA_JS, ir.DATA_JS + ".bak")
    with io.open(ir.DATA_JS, "wb") as f:
        f.write(result.encode("utf-8"))
    _, text2 = ir.read_data_js()
    _, parts2, _ = ir.rows_of(text2)
    ids2 = [ig.id_of(p) for p in parts2]
    if len(ids2) != len(set(ids2)):
        ir.die("id が重複しました。data.js.bak から戻してください。")
    print("  総数: %d問（%+d）・id重複 0・控え data.js.bak" % (len(parts2), len(parts2) - len(parts)))
    print("★このあと: node tools/build_sw.mjs（機内用の一覧）/ node tools/verify_data.mjs / smoke-test")


if __name__ == "__main__":
    try:
        main()
    except ir.Stop as e:
        print("✖ " + str(e))
        sys.exit(1)
