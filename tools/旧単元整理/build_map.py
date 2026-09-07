# -*- coding: utf-8 -*-
"""
旧単元（地方）を消すときの「正誤記録の引きつぎ表」を作る。

★ 前回（328af80）の失敗を繰り返さないための方針:
   前回は「答えの語の包含一致」で機械的に埋めたため、
   沖縄→近郊農業 / 「40」→「60」 / 沖合漁業→遠洋漁業 のような
   意味的に別物への紐づけが大量に発生した（完全一致は329件中95件だけ）。
   配信後は一度きり実行なので、いまも直せない。

   → **答えの完全一致のみを候補にする。包含一致は使わない。**
   → 対応がつかないものは、無理に紐づけず記録を捨てる。
      誤った紐づけは「苦手判定が実態とずれる」形で残り、しかも気づかれない。
"""
import sys, re, json, io, os
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import import_quiz as iq

# 消す旧単元 → 引きつぎ先の新単元
PAIRS = {
    "5.近畿地方":   "夏期講習 復習編5.近畿地方",
    "6.中部地方":   "夏期講習 復習編6.中部地方",
    "7.関東地方":   "夏期講習 復習編7.関東地方",
    "8.東北地方":   "夏期講習 復習編8.東北地方／北海道地方",
    "8.北海道地方": "夏期講習 復習編8.東北地方／北海道地方",
}

_, blocks = iq.read_data_js()
ds = [iq.parse_block(b) for b in blocks]
by_unit = defaultdict(list)
for d in ds:
    by_unit[d["u"]].append(d)


def answer_key(a):
    """答えの文から、比べるための語を取り出す。

    ★括弧の中だけでは足りない。実データを見ると、
      旧 t5-9   「大阪府に広がり，近郊農業がさかんな（⑨大阪）平野です。」
      新 kaki5_12「（大阪）平野です。」
      新 kaki5_13「（大阪）湾です。」    ← 括弧の中だけだと「大阪」で一致してしまう
    のように、**括弧の直後の語（平野・湾・盆地・都市…）まで見ないと別物を結んでしまう。**
    そこで「括弧の中 ＋ 直後に続く語」をキーにする。

    括弧の中の丸数字（①〜）は、旧問題だけに付いている出題位置の番号なので外す。

    ★さらに、括弧の切れ目が旧と新で違うことがある。
      旧 t8t-14「…日本一長い山脈は（奥羽山脈）です。」  → 括弧の中に「山脈」まで入っている
      新 kaki8_21「（奥羽）山脈です。」                  → 括弧の外に「山脈」がある
    どちらも同じ「奥羽山脈」なので、**括弧の中と直後の語をつないで1つの語にしてから**比べる。

    また、旧問題には「（地図で位置を確認）」のような注記が末尾に付くことがある。
    これは答えではないので落とす。
    """
    if not a:
        return ""
    s = a.strip().replace("　", "").replace(" ", "")
    # 答えではない注記を落とす
    s = re.sub(r"[（(](?:地図で位置を確認|位置を確認|地図で確認)[）)]", "", s)
    parts = []
    for m in re.finditer(r"[（(]([^）)]*)[）)]([^（(]*)", s):
        inner = re.sub(r"^[①-⑳㉑-㉟]+", "", m.group(1)).strip()   # 出題位置の丸数字を外す
        # 括弧の直後に続く語（平野・湾・山地…）だけを拾う。句読点や次の括弧の手前まで
        after = re.match(r"^[^、，。．]*", m.group(2)).group(0)
        after = re.sub(r"(です|でした|になります|である)$", "", after)[:8]
        if inner:
            parts.append(inner + after)   # 「奥羽」+「山脈」=「奥羽山脈」でそろえる
    if not parts:
        return s
    return "／".join(parts)


report = []
mapping = {}       # 旧id -> [新id, ...]
stats = {"旧問題": 0, "対応あり": 0, "対応なし": 0, "1対多で見送り": 0}
unmatched = []
matched_rows = []

for old_u, new_u in PAIRS.items():
    olds = by_unit.get(old_u, [])
    news = by_unit.get(new_u, [])
    # 新単元の答え -> id（同じ答えが複数あることもある）
    new_by_ans = defaultdict(list)
    for n in news:
        k = answer_key(n.get("a", ""))
        if k:
            new_by_ans[k].append(n)
    for o in olds:
        stats["旧問題"] += 1
        k = answer_key(o.get("a", ""))
        hits = new_by_ans.get(k, []) if k else []
        if not hits:
            stats["対応なし"] += 1
            unmatched.append((o["id"], old_u, o.get("a", "")[:40], o.get("q", "")[:50]))
            continue
        if len(hits) > 1:
            # ★1対多は採らない。実例を見ると「大阪|平野」と「大阪|湾」のように
            #   キーをそろえても複数当たる場合があり、そこには別物が混ざる。
            #   無理に紐づけるより、記録を捨てるほうがまし（C-7）
            stats["1対多で見送り"] += 1
            unmatched.append((o["id"], old_u, "【1対多】" + o.get("a", "")[:34], o.get("q", "")[:50]))
            continue
        stats["対応あり"] += 1
        mapping[o["id"]] = [n["id"] for n in hits]
        matched_rows.append({
            "旧id": o["id"], "旧単元": old_u, "答え": k,
            "新id": [n["id"] for n in hits],
            "旧問題文": o.get("q", ""), "新問題文": [n.get("q", "") for n in hits],
            "旧答え": o.get("a", ""), "新答え": [n.get("a", "") for n in hits],
        })

print("=== 引きつぎ表（答えの完全一致のみ）===")
for k, v in stats.items():
    print(f"  {k}: {v}")
print(f"  対応した割合: {stats['対応あり']}/{stats['旧問題']} = {stats['対応あり']*100//max(1,stats['旧問題'])}%")
print(f"  新id延べ: {sum(len(v) for v in mapping.values())}")

SP = os.path.dirname(os.path.abspath(__file__))
json.dump(mapping, io.open(SP + "/mapping.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(matched_rows, io.open(SP + "/matched.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(unmatched, io.open(SP + "/unmatched.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\n書き出し: mapping.json / matched.json / unmatched.json")
