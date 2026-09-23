# -*- coding: utf-8 -*-
"""
理科 第4回「消化の表」r4m80〜r4m89 の問題文（q）だけを、ヒント入りに書きかえる（2026-09-22）。
対応づけは【消化の表N】の見出しで取り、答え（a）と img の一致を独立の証拠にする。
ほかの欄・ほかの問には触らない。止まる条件: sha256 不一致／対応が10件でない／a か img が食いちがう。
    python tools/patch_r4_table_hints.py --apply
"""
# ★一度きりの道具。id は実在する値の直書き（`IDS`）で no を使わないため、2026-09-23 の id 方針変更の影響を受けない。
#   （元データは sha256 で固定してある。司令塔確認、止め木は不要）
import hashlib, io, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "..", "5年下", "quiz_csv_理科", "第4回_ヒトと動物の消化吸収.json")
DATA = os.path.join(ROOT, "data.js")
SHA = "eacb7c398082ae4515f964c3d67b759ec3d9567b8562e85127054b3c196cf6ff"  # 2026-09-22 納品（55465B・89問・CRLF）
IDS = ["r4m%02d" % n for n in range(80, 90)]

raw = open(SRC, "rb").read()  # ★バイナリで読む（CRLF）
if hashlib.sha256(raw).hexdigest() != SHA:
    sys.exit("✘ 元データの sha256 が宣言値と違います（同期の遅れ・編集中・別物のどれか）。止まります")
src = {}
for q in json.loads(raw.decode("utf-8")):
    m = re.match(r"【消化の表(.)】", q["q"])
    if m: src[m.group(1)] = q
text = io.open(DATA, encoding="utf-8", newline="").read()
changes = 0
for qid in IDS:
    m = re.search(r'\{\s*"id":\s*"%s"[\s\S]*?\n \}' % qid, text)
    body = m.group(0)
    cur = json.loads(body)
    label = re.match(r"【消化の表(.)】", cur["q"]).group(1)
    s = src[label]
    if s["a"].strip() != cur["a"] or s["file"] != cur["img"]:
        sys.exit("✘ %s の a/img が元データと食いちがいます。止まります" % qid)
    newq = s["q"].strip()
    if newq == cur["q"]: continue
    line = '  "q": %s,' % json.dumps(cur["q"], ensure_ascii=False)
    assert body.count(line) == 1
    nb = body.replace(line, '  "q": %s,' % json.dumps(newq, ensure_ascii=False))
    text = text[:m.start()] + nb + text[m.end():]
    print("%s: %s → %s" % (qid, cur["q"], newq)); changes += 1
if len(src) != 10: sys.exit("✘ 元データの消化の表が10件ではありません")
print("変更 %d 件" % changes)
if "--apply" in sys.argv:
    io.open(DATA, "w", encoding="utf-8", newline="").write(text); print("書きこみました")
