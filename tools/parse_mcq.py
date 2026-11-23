"""Parse multiple-choice questions from the Professor Messer SY0-701 PDF text dump.
usage: python3 parse_mcq.py full.txt out.json"""
import re, sys, json

text = open(sys.argv[1]).read()
pages = re.split(r'=====PAGE (\d+)=====\n', text)[1:]
pages = {int(pages[i]): pages[i+1] for i in range(0, len(pages), 2)}
# detailed-answer page ranges (PDF page numbers) from the TOC, minus PBQ answer pages
RANGES = {'A': (52, 139), 'B': (172, 265), 'C': (300, 393)}

def clean_page(t):
    lines = t.split('\n')
    out = []
    for l in lines:
        if re.fullmatch(r'\d{1,3}', l.strip()) or re.fullmatch(r'Practice Exam [ABC] - Answers', l.strip()):
            continue
        out.append(l)
    return '\n'.join(out)

def norm(s):
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def compact(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

KEY = {}
for m in re.finditer(r'^([ABC]\d+)\. ?((?:[A-H](?:,? and|,)? ?)+)\s*$', text, re.M):
    KEY[m.group(1)] = re.findall(r'[A-H]', m.group(2))

def take_options(lines, opts, skip=()):
    """Split 'X. option text (may wrap)\nexplanation...' blocks keyed by letter."""
    why, cur, i = {}, None, 0
    while i < len(lines):
        lm = re.match(r'\s*([A-H])\.\s+(.*)', lines[i])
        if lm and lm.group(1) in opts and lm.group(1) not in why:
            target, acc = compact(opts[lm.group(1)]), compact(lm.group(2))
            expected = [L for L in opts if L not in why and L not in skip]
            if acc and (target.startswith(acc[:12]) or (expected and lm.group(1) == expected[0])):
                cur = lm.group(1); why[cur] = []; i += 1
                while len(acc) < len(target) and i < len(lines) and target.startswith(acc + compact(lines[i])):
                    acc += compact(lines[i]); i += 1
                continue
        if cur: why[cur].append(lines[i])
        i += 1
    return {k: norm(' '.join(v)) for k, v in why.items()}

def fmt_stem(stem):
    out = []
    for l in stem.split('\n'):
        pre = re.search(r'\S {3,}\S|\S {3,}$|->', l)
        l2 = l.rstrip()
        if pre or (out and out[-1].startswith('\x00')):
            pass
        if pre:
            out.append('\x00' + l2.strip())
        elif l2.strip().startswith('•'):
            out.append('\x01' + l2.strip())
        elif not l2.strip():
            out.append('\x02')
        else:
            if out and out[-1][:1] not in ('\x00', '\x02'):
                out[-1] += ' ' + l2.strip()
            else:
                out.append(l2.strip())
    # rebuild: preformatted lines become code lines, blank lines are paragraph breaks
    res = []
    for l in out:
        if l.startswith('\x00'): res.append('`' + re.sub(r' {2,}', '  ', l[1:]))
        elif l.startswith('\x01'): res.append(l[1:])
        elif l == '\x02':
            if res and res[-1] != '': res.append('')
        else: res.append(l)
    s = '\n'.join(res).strip()
    # last bullet may have swallowed the question sentence
    s = re.sub(r'(•[^\n]*?) ((?:Which|What|How|When|Where|Why|The|An|A)\b[^\n•]*\?[^\n•]*)$', r'\1\n\2', s)
    return re.sub(r'\n{3,}', '\n\n', s)

result = {}
for ex, (a, b) in RANGES.items():
    body = '\n'.join(clean_page(pages[p]) for p in range(a, b + 1) if p in pages)
    chunks = re.split(r'\n(?=' + ex + r'\d{1,2}\.\s)', '\n' + body)
    qs = []
    for c in chunks:
        m = re.match(ex + r'(\d{1,2})\.\s', c.strip())
        if not m or 'The Answer' not in c:
            continue
        num = int(m.group(1))
        if f'{ex}{num}' in [q['id'] for q in qs]: continue
        c = c.strip()[m.end():]
        stem_opts, rest = re.split(r'\nThe Answers?:', c, 1)
        parts = re.split(r'\n\s*❍\s*', '\n' + stem_opts)
        stem = parts[0].strip()
        opts = {}
        for p in parts[1:]:
            om = re.match(r'([A-H])\.\s*(.*)', p, re.S)
            opts[om.group(1)] = norm(om.group(2))
        more = re.split(r'\nMore information:\n', rest, 1)
        main, info = more[0], (more[1] if len(more) > 1 else '')
        inc = re.split(r'\nThe incorrect answers?:\n', main, 1)
        ans_block, inc_block = inc[0], (inc[1] if len(inc) > 1 else '')
        letters = KEY.get(f'{ex}{num}') or re.findall(r'\b([A-H])\.\s', ans_block.split('\n')[0])
        cop = compact(''.join(opts[L] for L in letters))
        lines = ans_block.strip().split('\n')
        i = 0
        while i < len(lines):
            seg = compact(re.sub(r'\b[A-H]\.\s|\band\b', '', lines[i]))
            if seg and seg in cop: i += 1
            else: break
        body_lines = lines[i:]
        explanation = norm(' '.join(body_lines))
        why = take_options(inc_block.split('\n'), opts, letters)
        if len(letters) > 1:
            # explanation usually covers all correct answers together; keep it whole
            pass
        im = re.search(r'SY0-\d01,\s*(Objective [\d.]+)\s*-?\s*(.*?)\n(https?://\S+)', info, re.S)
        stem = fmt_stem(stem)
        qs.append({'id': f'{ex}{num}', 'type': 'mcq', 'q': stem, 'options': opts,
                   'answer': letters, 'explanation': explanation, 'why': why,
                   'objective': (im.group(1) + ' - ' + norm(im.group(2))) if im else '',
                   'link': im.group(3) if im else ''})
    result[ex] = qs

json.dump(result, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
for ex, qs in result.items():  # report suspicious parses
    bad = [q['id'] for q in qs if not q['answer'] or set(q['why']) | set(q['answer']) != set(q['options']) or not q['objective'] or not q['explanation']]
    print(ex, len(qs), bad)
