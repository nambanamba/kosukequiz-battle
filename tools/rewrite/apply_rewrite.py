# -*- coding: utf-8 -*-
"""data.js と元データJSONに、長い四択の書き換えパッチを当てる（2026-09-12）。

data.js は「1フィールド＝1行」なので、該当 id のブロック内の該当行だけを
差し替える。ファイル全体を書き直さないので、差分は変えた行の数だけになる。
元データへの書き戻し（C-6）も同時に行う。
改行コード（ローカルは CRLF）と末尾の改行は、元のまま保つ。
"""
import json, io, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'data.js')
SRC = os.path.join(os.path.dirname(ROOT), '5年下')

KAKI_FILES = {
  '1': '復習編1_日本の食料生産_v2.json', '2': '復習編2_工業資源輸送機関.json',
  '3': '復習編3_九州地方.json', '4': '復習編4_中国四国地方.json',
  '5': '復習編5_近畿地方.json', '6': '復習編6_中部地方.json',
  '7': '復習編7_関東地方.json', '8': '復習編8_東北北海道地方.json',
}
G_FILES = {'1': '第1回_旧石器縄文弥生.json', '2': '第2回_古墳飛鳥.json',
           '3': '第3回_奈良時代.json', '4': '第4回_平安時代.json'}

FIELDS = ('q', 'a', 'sol', 'img')
CRLF = '\r\n'
LF = '\n'


def src_path(qid):
    m = re.match(r'kaki(\d)_', qid)
    if m:
        return os.path.join(SRC, 'quiz_csv_夏期講習', KAKI_FILES[m.group(1)]), ('id', qid)
    m = re.match(r'g(\d)r(\d+)$', qid)
    if m:
        return os.path.join(SRC, 'quiz_csv', G_FILES[m.group(1)]), ('no', int(m.group(2)))
    raise SystemExit('元データの場所が分からない id: ' + qid)


def esc(s):
    return json.dumps(s, ensure_ascii=False)


def patch_datajs(text, qid, fields):
    """id ブロックを見つけて、該当フィールド行だけ差し替える。text は LF 前提。"""
    lines = text.split(LF)
    start = None
    for i, ln in enumerate(lines):
        if ln.strip() == '"id": %s,' % esc(qid):
            start = i
            break
    if start is None:
        raise SystemExit('data.js に見つからない id: ' + qid)
    end = start
    while end < len(lines) and not lines[end].startswith(' }'):
        end += 1
    changed = []
    for key, val in fields.items():
        if key not in FIELDS:
            continue
        hit = None
        for j in range(start, end):
            if lines[j].lstrip().startswith('"%s":' % key):
                hit = j
                break
        newline = '  "%s": %s,' % (key, esc(val))
        if hit is None:
            if val == '':
                continue
            lines.insert(end, newline)
            end += 1
            changed.append(key + '(新規)')
            continue
        if val == '':
            del lines[hit]
            end -= 1
            changed.append(key + '(削除)')
            continue
        keep_comma = lines[hit].rstrip().endswith(',')
        lines[hit] = newline if keep_comma else newline[:-1]
        changed.append(key)
    return LF.join(lines), changed


def main(apply):
    patches = json.load(io.open('patch_2026-09-12.json', encoding='utf-8'))['patches']
    raw = io.open(DATA, encoding='utf-8', newline='').read()
    data_nl = CRLF if CRLF in raw else LF
    text = raw.replace(CRLF, LF)
    src_cache, src_style, src_changed = {}, {}, {}
    for qid, p in patches.items():
        fields = dict((k, v) for k, v in p.items() if k in FIELDS)
        text, changed = patch_datajs(text, qid, fields)
        path, (key, want) = src_path(qid)
        if path not in src_cache:
            orig = io.open(path, encoding='utf-8', newline='').read()
            src_cache[path] = json.loads(orig)
            src_style[path] = (CRLF if CRLF in orig else LF, orig.endswith(LF))
        rows = [r for r in src_cache[path] if r.get(key) == want]
        if len(rows) != 1:
            raise SystemExit('元データで %s が %d 件（1件のはず）: %s' % (qid, len(rows), path))
        for k, v in fields.items():
            rows[0]['file' if k == 'img' else k] = v
        src_changed[path] = src_changed.get(path, 0) + 1
        print('%-11s %-4s %s' % (qid, p['type'], ','.join(changed)))
    print('\n書き換え %d 問' % len(patches))
    if not apply:
        print('（空回し。--apply で書き込み）')
        return
    io.open(DATA, 'w', encoding='utf-8', newline='').write(text.replace(LF, data_nl))
    print('data.js を書き換えました（改行 %s）' % ('CRLF' if data_nl == CRLF else 'LF'))
    for path, n in src_changed.items():
        nl2, trail = src_style[path]
        out = json.dumps(src_cache[path], ensure_ascii=False, indent=2)
        if trail:
            out += LF
        io.open(path, 'w', encoding='utf-8', newline='').write(out.replace(LF, nl2))
        print('元データ %s … %d 問' % (os.path.basename(path), n))


main('--apply' in sys.argv)
