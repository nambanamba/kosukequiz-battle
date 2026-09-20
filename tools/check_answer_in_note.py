# -*- coding: utf-8 -*-
"""
★「出典」に答えが書かれていないかを調べる。

■ なぜ要るか（2026-09-20 に実物で見つけた）
  `note`（出典）は、**答えを見る前から画面に出ている**（`index.html` の `solo-source-tag`）。
  ところが `note` は編集の経緯を書きためる欄にもなっていて、そこに答えの語が入ることがある。
  実例 `r4m65`: 答え「柔毛／小腸」に対し、出典に
    「図がないので『小腸のかべにある…』『柔毛があるのは…』と置きかえたところ…」
  と書かれていた。**お子さんは、答えを考える前にこれを読める。**
  → A-1（同じ回の別問題の答えを問題文に書かない）と同じ型で、**経路が出典**。

■ 使い方
    python tools/check_answer_in_note.py            # 全部
    python tools/check_answer_in_note.py r4m        # id の頭で絞る

■ この検査が見るもの / 見ないもの
  見る  … 答えの語（2字以上）が、そのまま**その問自身の出典**の中にあるか
  見ない…
    ① **言いかえ**（「あの器官」のような書き方は見つけられない）
    ② ★★**別の問の答えが露出していること（A-1）。まったく見ていません。**
       実例（2026-09-20・理科担当の検査が見つけ、こちらは素通りした）:
         r4m66 問「M管・N管の名前を」        答え「毛細血管・リンパ管」
         r4m67 答え「毛細血管…ブドウ糖…／リンパ管…しぼう酸…」
         → **r4m67 の答えが、r4m66 の答えを含んでいる。**経路は出典ではなく「答え」
    ③ **問題文（`q`）への露出**も見ていない。ここが見るのは `note` だけ
  ⚠️ ★**だから「0件」や「4件」を「ほかは大丈夫」と読まないでください。**
     この道具が守っているのは**「出典に答えが出ている」という1本の道だけ**です。
  ⚠️ 取りこぼしより**言いすぎ**の側に倒してある。出たものは人が見て判断すること。
"""
import io, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pref = sys.argv[1] if len(sys.argv) > 1 else ""
d = io.open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()

recs = []
for m in re.finditer(r'\{\s*"id":\s*"([^"]+)"([\s\S]*?)\n \}', d):
    b = m.group(2)
    g = lambda k: (re.search(r'"%s":\s*"((?:[^"]|\\")*)"' % k, b) or [None, None])[1]
    recs.append((m.group(1), g("a") or "", g("note") or ""))

def words(a):
    s = re.sub(r'[（）()「」『』【】]', ' ', a)
    out = []
    for w in re.split(r'[／/・、,：:\s]+', s):
        w = w.strip()
        # 「〜です。」などの言い回しを落とす
        w = re.sub(r'(です|でした|といいます|ます)。?$', '', w)
        if len(w) >= 2 and not re.fullmatch(r'[ぁ-んー。、]+', w):
            out.append(w)
    return out

hits = [(i, a, n, w) for i, a, n in recs if i.startswith(pref)
        for w in words(a) if w in n][:200]
seen, uniq = set(), []
for h in hits:
    if h[0] in seen: continue
    seen.add(h[0]); uniq.append(h)

for i, a, n, w in uniq:
    print("★ %s  答え=%s  出典に出ている語=「%s」" % (i, a[:40], w))
    print("    出典: %s" % n[:110])
print("\n対象 %d 問 / ★出典に答えが出ている: %d 件" % (len([r for r in recs if r[0].startswith(pref)]), len(uniq)))

# ★この検査が鳴るか（D-17）。わざと答えを出典に書いた問を作って、見つけられることを見る
probe_a, probe_n = "柔毛／小腸", "ここに柔毛と書いてある"
found = any(w in probe_n for w in words(probe_a))
print("この検査が鳴るか（わざと答えを出典に書いてみる）:", "★鳴る" if found else "✘ 鳴らない。検査が壊れている")
sys.exit(0 if found else 2)
