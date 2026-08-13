#!/usr/bin/env python3
"""Recompute the figures in the writeups from the exported results files.

Two runs over the same nine passages are recorded, so the expectations are
encoded per run rather than against whichever export happens to be newest. The
cross-run section checks the claim the second run exists to support: that
configuring the sampler explicitly changed nothing the models produced.

    python3 eval/verify-claims.py

Each row prints the encoded expectation, the recomputed value, and where the
claim appears. Rows marked NOT-IN-EXPORT are statements whose supporting value
lives somewhere other than a results file; this script does not validate those,
it names them so they can be questioned. Exit status is non-zero on a mismatch.
"""
import json
import statistics
import sys
from collections import defaultdict
from math import comb
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / 'eval/results'

RUN1 = 'skim-recap-eval-2026-08-11T00-30-45-750Z.json'
RUN2 = 'skim-recap-eval-2026-08-13T03-16-36-736Z.json'

rows = []
failures = 0


def check(label, expected, actual, where='blog'):
    global failures
    ok = str(expected) == str(actual)
    failures += not ok
    rows.append(('ok' if ok else 'MISMATCH', label, str(expected), str(actual), where))


def note(label, value, where):
    rows.append(('NOT-IN-EXPORT', label, '', str(value), where))


def load(name):
    return json.load(open(RESULTS / name))


def cells(runs):
    c = defaultdict(dict)
    for r in runs:
        c[(r['fixtureId'], r['mode'])][(r['backend'], r['repeat'])] = r
    return c


def sign_test(wins, n):
    return 2 * sum(comb(n, k) for k in range(wins, n + 1)) / 2 ** n


def pairs_won(pairs):
    """How often the Prompt API's TTFT is the lower of the pair."""
    return sum(p < l for l, p in pairs), len(pairs)


# ---------------------------------------------------------------- per run ---
def verify_run(name, tag, exp):
    d = load(name)
    runs, env, c = d['runs'], d['env'], cells(d['runs'])
    w = f'{tag}'

    check(f'[{tag}] generations', 72, len(runs), w)
    check(f'[{tag}] failures', 0, sum(not r['ok'] for r in runs), w)
    check(f'[{tag}] distinct passages', 9, len({r['fixtureId'] for r in runs}), w)

    for mode, (a, b) in exp['chars'].items():
        for backend, e in zip(('litert', 'prompt-api'), (a, b)):
            vals = [r['outputChars'] for r in runs if r['mode'] == mode and r['backend'] == backend]
            check(f'[{tag}] mean {mode} chars · {backend}', e, round(statistics.mean(vals)), w)

    for backend in ('litert', 'prompt-api'):
        same = sum(1 for v in c.values() if v[(backend, 1)]['text'] == v[(backend, 2)]['text'])
        check(f'[{tag}] identical repeats · {backend}', f'{len(c)}/{len(c)}', f'{same}/{len(c)}', w)
        rs = [r for r in runs if r['backend'] == backend]
        trailing = sum(1 for r in rs if r['text'] != r['text'].rstrip())
        check(f'[{tag}] trailing whitespace · {backend}',
              exp['trailing'][backend], f'{trailing}/{len(rs)}', w)

    pairs = [(v[('litert', rep)]['ttftMs'], v[('prompt-api', rep)]['ttftMs'])
             for v in c.values() for rep in (1, 2)]
    won, n = pairs_won(pairs)
    check(f'[{tag}] Prompt API first to token', exp['first_to_token'], f'{won}/{n}', w)
    check(f'[{tag}]   sign test p', exp['p'], f'{sign_test(won, n):.4f}', w)

    # The schedule itself, since the second run exists partly to change it.
    order = {tuple(r['backend'] for r in sorted(v.values(), key=lambda x: x['startedAt']))
             for v in c.values()}
    check(f'[{tag}] distinct within-group orders', exp['orders'], len(order), w)

    lang = env['prompt-api']['describe']
    ok_langs = [k for k, v in lang['outputLanguages'].items() if v == 'ok']
    check(f'[{tag}] accepted languages', "['en', 'ja', 'es', 'de', 'fr']", str(ok_langs), w)
    check(f'[{tag}] inputs match outputs', 'True',
          str(lang['inputLanguages'] == lang['outputLanguages']), w)
    check(f'[{tag}] Prompt API sampling', "{'temperature': 0, 'topK': 1}",
          str(lang['sessionSampling']), w)

    return d


RUN1_EXP = dict(
    chars={'recap': (387, 509), 'feynman': (1011, 1656)},
    trailing={'litert': '0/36', 'prompt-api': '22/36'},
    first_to_token='28/36', p='0.0012', orders=1,
)
RUN2_EXP = dict(
    chars={'recap': (387, 509), 'feynman': (1011, 1656)},
    trailing={'litert': '0/36', 'prompt-api': '22/36'},
    first_to_token='31/36', p='0.0000', orders=2,
)

d1 = verify_run(RUN1, 'run 1', RUN1_EXP)
d2 = verify_run(RUN2, 'run 2', RUN2_EXP)

# ------------------------------------------------------------- run 1 only ---
# The schedule that made the first run's timing worth re-doing.
c1 = cells(d1['runs'])
seq = {tuple(r['backend'] for r in sorted(v.values(), key=lambda x: x['startedAt']))
       for v in c1.values()}
check('run 1 ran litert,litert,prompt,prompt in every group', 'True',
      str(seq == {('litert', 'litert', 'prompt-api', 'prompt-api')}), 'blog §03, §11')

# ------------------------------------------------------------- run 2 only ---
lead = [r['ttftMs'] for r in d2['runs'] if r.get('ranFirstInGroup')]
follow = [r['ttftMs'] for r in d2['runs'] if r.get('ranFirstInGroup') is False]
check('run 2 leads per backend', '18 each',
      f"{len(lead) // 2} each" if len(lead) == 36 else f'{len(lead)} total', 'blog §11')
check('run 2 cost of following, median ms', 125,
      round(statistics.median(follow) - statistics.median(lead)), 'blog §05, §11')

# The withdrawn per-conversation warm-up: reported at -114 ms in run 1, gone here.
for backend, expected in (('litert', -18), ('prompt-api', 8)):
    c2 = cells(d2['runs'])
    delta = [v[(backend, 2)]['ttftMs'] - v[(backend, 1)]['ttftMs'] for v in c2.values()]
    check(f'run 2 repeat2 - repeat1 · {backend}', expected,
          round(statistics.median(delta)), 'blog §11')

check('run 2 export carries its passages', 'True',
      str(all(f.get('text') for f in d2['fixtures'])), 'blog §10')
check('run 2 fixtures carry full URLs', 'True',
      str(all(f['source']['url'].startswith('http') for f in d2['fixtures'])), 'blog §10')

# ------------------------------------------------------------- cross-run ---
# The claim the second run exists to test.
key = lambda r: (r['fixtureId'], r['mode'], r['backend'], r['repeat'])
a, b = {key(r): r for r in d1['runs']}, {key(r): r for r in d2['runs']}
common = set(a) & set(b)
identical = sum(1 for k in common if a[k]['text'] == b[k]['text'])
check('outputs identical across the two runs', f'{len(common)}/{len(common)}',
      f'{identical}/{len(common)}', 'blog §11')

# ---------------------------------------------------------------- corpus ---
# Each undefinedTerm has to occur in its own passage. The previous corpus was
# annotated per subject area, and named terms that appeared in no passage at all.
fixtures = d2['fixtures']
missing = [(f['title'], t) for f in fixtures for t in f.get('undefinedTerms', [])
           if t.lower() not in f['text'].lower()]
check('every undefinedTerm occurs in its passage', 'True', str(not missing), 'src/fixtures.ts')
for title, term in missing:
    check(f'  absent: {term!r}', 'in passage', f'not in {title}', 'src/fixtures.ts')

overlap = [(f['title'], t) for f in fixtures
           for t in set(f.get('undefinedTerms', [])) & set(f.get('definedInPassage', []))]
check('no term is both defined and undefined', 'True', str(not overlap), 'src/fixtures.ts')

sources = {f['source']['url'] for f in fixtures}
check('independent sources behind 9 passages', 5, len(sources), 'blog §12, README')
check('every fixture carries a licence', 'True',
      str(all(f['source'].get('licence') for f in fixtures)), 'README')

# ------------------------------------------------- true, but sourced elsewhere ---
note('maxNumTokens 4096', 'an engine.settings reading logged in findings.md; '
     'describe() will not load 2.97 GB to answer a configuration question',
     'blog §07, report, findings')
note('Chrome 151.0.7922.108',
     f"the export records {d2['env']['userAgent'].split('Chrome/')[1].split()[0]}; "
     'the full build number came from chrome://version', 'blog §02, report')
note('~17 captures reviewed, 9 kept', 'selection history, not in any results file',
     'blog §09, report, findings')
note('the four quoted excerpts are factually correct',
     'judged by hand against outside knowledge; the check below only proves the '
     'model produced the sentence', 'blog §08, findings')

QUOTES = [
    ('litert', 'Saxagliptin inhibits the DPP-4 enzyme to prolong incretin hormone activity'),
    ('litert', 'the gemfibrozil prevents the body from breaking down the repaglinide'),
    ('prompt-api', 'rifampicin (an antibiotic) can reduce the effectiveness of nateglinide'),
    ('prompt-api', 'LlamaWeb uses less memory than Transformers.js and WebLLM on NVIDIA RTX 5080'),
]
for backend, quote in QUOTES:
    hit = any(quote.lower() in r['text'].lower() for r in d2['runs'] if r['backend'] == backend)
    check(f'quoted verbatim in {backend}: {quote[:38]!r}…', 'True', str(hit), 'blog §08')

# ---------------------------------------------------------------- report ---
width = max(len(r[1]) for r in rows) + 2
print(f'run 1: {RUN1}\nrun 2: {RUN2}\n')
for status, label, expected, actual, where in rows:
    if status == 'NOT-IN-EXPORT':
        print(f'  NOT-IN-EXPORT  {label:<{width}} {actual}   [{where}]')
    elif status == 'ok':
        print(f'  ok             {label:<{width}} {actual}')
    else:
        print(f'  MISMATCH       {label:<{width}} writeup {expected!r}, data {actual!r}   [{where}]')

print(f'\nmismatches: {failures}')
sys.exit(1 if failures else 0)
