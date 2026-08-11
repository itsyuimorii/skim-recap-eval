#!/usr/bin/env python3
"""Recompute a declared set of metrics from the exported results file.

The expected values checked by this script are encoded below. The script does
not parse the report or web article and does not validate every number or prose
statement in either document. Run it before publishing or when inspecting the
recorded metrics:

    python3 eval/verify-claims.py

Each row prints the encoded expected value, the recomputed value, and a source
label. Rows marked NOT-IN-EXPORT identify statements whose supporting value is
not present in the results JSON; the script does not independently validate
those statements.
"""
import json
import glob
import re
import statistics
import sys
from collections import defaultdict
from math import comb
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS = sorted(glob.glob(str(ROOT / 'eval/results/*.json')))[-1]
# The published writeup lives on the web; the copy checked here is the report
# in this repository. Point BLOG at a saved copy of the page to scan that too.
DOCS = {
    'report': ROOT / 'docs/report.md',
    'findings': ROOT / 'eval/findings.md',
}
BLOG = ROOT / 'docs/blog.html'  # optional

data = json.load(open(RESULTS))
runs = data['runs']
env = data['env']
cell = defaultdict(dict)
for r in runs:
    cell[(r['fixtureId'], r['mode'])][(r['backend'], r['repeat'])] = r


def sign_test(wins, n):
    return 2 * sum(comb(n, k) for k in range(wins, n + 1)) / 2 ** n


rows = []


def check(label, claimed, actual, where='blog'):
    rows.append((label, str(claimed), str(actual), where, str(claimed) == str(actual)))


def note(label, value, where):
    rows.append((label, '(not in export)', str(value), where, None))


# ---- corpus shape --------------------------------------------------------
check('total runs', 72, len(runs))
check('failures', 0, sum(not r['ok'] for r in runs))
check('distinct passages', 9, len({r['fixtureId'] for r in runs}))
check('cells', 18, len(cell))

# ---- output length -------------------------------------------------------
for mode, claim in (('recap', (387, 509)), ('feynman', (1011, 1656))):
    for backend, c in zip(('litert', 'prompt-api'), claim):
        vals = [r['outputChars'] for r in runs if r['mode'] == mode and r['backend'] == backend]
        check(f'{mode} mean chars · {backend}', c, round(statistics.mean(vals)))
ratio_recap = statistics.mean([r['outputChars'] for r in runs if r['mode'] == 'recap' and r['backend'] == 'prompt-api']) / \
    statistics.mean([r['outputChars'] for r in runs if r['mode'] == 'recap' and r['backend'] == 'litert'])
ratio_fey = statistics.mean([r['outputChars'] for r in runs if r['mode'] == 'feynman' and r['backend'] == 'prompt-api']) / \
    statistics.mean([r['outputChars'] for r in runs if r['mode'] == 'feynman' and r['backend'] == 'litert'])
check('recap ratio', '1.31', f'{ratio_recap:.2f}')
check('feynman ratio', '1.64', f'{ratio_fey:.2f}')

# ---- reproducibility -----------------------------------------------------
for b in ('litert', 'prompt-api'):
    same = sum(1 for c in cell.values() if c[(b, 1)]['text'] == c[(b, 2)]['text'])
    check(f'identical across repeats · {b}', '18/18', f'{same}/{len(cell)}')

# ---- the three pairings --------------------------------------------------
pairs_same = [(c[('litert', r)]['ttftMs'], c[('prompt-api', r)]['ttftMs']) for c in cell.values() for r in (1, 2)]
w = sum(p < l for l, p in pairs_same)
check('pairing: same repeat index', '28/36', f'{w}/{len(pairs_same)}')
check('  its p value', '0.001', f'{sign_test(w, len(pairs_same)):.3f}')
check('  litert side of it', '8/36', f'{len(pairs_same) - w}/{len(pairs_same)}')

pairs_adj = [(c[('litert', 2)]['ttftMs'], c[('prompt-api', 1)]['ttftMs']) for c in cell.values()]
w = sum(p < l for l, p in pairs_adj)
check('pairing: truly adjacent', '16/18', f'{w}/{len(pairs_adj)}')
check('  its p value', '0.001', f'{sign_test(w, len(pairs_adj)):.3f}')

pairs_rig = [(min(c[('litert', 1)]['ttftMs'], c[('litert', 2)]['ttftMs']),
              max(c[('prompt-api', 1)]['ttftMs'], c[('prompt-api', 2)]['ttftMs'])) for c in cell.values()]
w = sum(p < l for l, p in pairs_rig)
check('pairing: rigged', '10/18', f'{w}/{len(pairs_rig)}')
check('  its p value', '0.81', f'{sign_test(w, len(pairs_rig)):.2f}')

# ---- thermal drift -------------------------------------------------------
for b, claim in (('litert', (813, 1266)), ('prompt-api', (719, 1017))):
    rs = [r for r in runs if r['backend'] == b]
    n = len(rs) // 3
    check(f'drift first third · {b}', claim[0], round(statistics.median(r['ttftMs'] for r in rs[:n])))
    check(f'drift last third · {b}', claim[1], round(statistics.median(r['ttftMs'] for r in rs[-n:])))

# ---- per-conversation warm-up -------------------------------------------
for b, med, cnt in (('litert', -114, '14/18'), ('prompt-api', +149, None)):
    d = [c[(b, 2)]['ttftMs'] - c[(b, 1)]['ttftMs'] for c in cell.values()]
    check(f'repeat2 - repeat1 median · {b}', med, round(statistics.median(d)))
    if cnt:
        check(f'  cells where run 2 is faster · {b}', cnt, f'{sum(x < 0 for x in d)}/{len(d)}')

# ---- trailing whitespace -------------------------------------------------
for b, claim in (('prompt-api', '22/36'), ('litert', '0/36')):
    rs = [r for r in runs if r['backend'] == b]
    check(f'trailing whitespace · {b}', claim, f"{sum(1 for r in rs if r['text'] != r['text'].rstrip())}/{len(rs)}")

# ---- run order -----------------------------------------------------------
seq = {tuple(r['backend'] for r in sorted(v.values(), key=lambda x: x['startedAt'])) for v in cell.values()}
check('every cell runs litert,litert,prompt,prompt', 'True',
      str(seq == {('litert', 'litert', 'prompt-api', 'prompt-api')}))

# ---- environment ---------------------------------------------------------
d_lite, d_prompt = env['litert']['describe'], env['prompt-api']['describe']
check('cached model bytes', 2969059328, d_lite['cachedModelBytes'])
check('contextWindow', 9216, d_prompt['contextWindow'])
check('defaultTopK', 64, d_prompt['params']['defaultTopK'])
check('defaultTemperature', 1, d_prompt['params']['defaultTemperature'])
check('sampling actually set on prompt-api', "{'temperature': 0, 'topK': 1}", str(d_prompt['sessionSampling']))
ok_langs = [k for k, v in d_prompt['outputLanguages'].items() if v == 'ok']
bad_langs = [k for k, v in d_prompt['outputLanguages'].items() if v != 'ok']
check('accepted output languages', "['en', 'ja', 'es', 'de', 'fr']", str(ok_langs))
check('rejected output languages', "['zh', 'zh-Hant', 'ko']", str(bad_langs))
check('input languages match output', 'True', str(d_prompt['inputLanguages'] == d_prompt['outputLanguages']))

# ---- claims that are true but live outside this file ---------------------
note('maxNumTokens 4096', f"engine.settings, logged in findings.md §4 · "
     f"this export says: {d_lite['engineSettings']!r}", 'blog, report, findings')
note('LiteRT sampler parameters', 'not reported; 18/18 byte-identical repeats do not identify the sampler settings',
     'report, findings §4')
note('Chrome 151.0.7922.108', f"userAgent in export reads {env['userAgent'].split('Chrome/')[1].split()[0]}"
     ' — the full build number came from chrome://version', 'blog, report')
note('~17 captures, several excluded', 'selection history, not in the results file', 'blog, report, findings §5')
note('external factual review of 4 excerpts', 'reported by the author; the script only checks that the fragments occur',
     'blog, report, findings §11')

# ---- did the four quotes actually come out of these runs? ----------------
# Substrings long enough that a paraphrase cannot pass. Each must appear
# verbatim in an output from the backend it is attributed to.
QUOTES = [
    ('litert', 'Saxagliptin inhibits the DPP-4 enzyme to prolong incretin hormone activity'),
    ('litert', 'the gemfibrozil prevents the body from breaking down the repaglinide'),
    ('prompt-api', 'rifampicin (an antibiotic) can reduce the effectiveness of nateglinide'),
    ('prompt-api', 'LlamaWeb uses less memory than Transformers.js and WebLLM on NVIDIA RTX 5080'),
]
for backend, quote in QUOTES:
    hit = any(quote.lower() in r['text'].lower() for r in runs if r['backend'] == backend)
    check(f'quote verbatim in {backend}: {quote[:40]!r}...', 'True', str(hit))

# The corpus is supposed to travel with the results. Right now it does not.
empty = [f['id'] for f in data.get('fixtures', []) if not f.get('text')]
if empty:
    note('corpus text in export', f'{len(empty)} of {len(data["fixtures"])} fixtures have empty text — '
         'passages are in neither the export nor src/fixtures.ts (findings.md §13)', 'blog, report, findings')
else:
    check('every fixture carries its passage', 'True', 'True')

# ---- report -------------------------------------------------------------
W = max(len(r[0]) for r in rows) + 2
fails = 0
print(f'results file: {Path(RESULTS).name}\n')
for label, claimed, actual, where, ok in rows:
    if ok is None:
        print(f'  NOT-IN-EXPORT  {label:<{W}} {actual}   [{where}]')
    elif ok:
        print(f'  ok             {label:<{W}} {claimed}')
    else:
        fails += 1
        print(f'  MISMATCH       {label:<{W}} writeup says {claimed!r}, data says {actual!r}   [{where}]')

# ---- diagnostic scan for unmapped large numbers --------------------------
print()
source = BLOG if BLOG.exists() else DOCS['report']
body = source.read_text()
body = re.sub(r'<style.*?</style>', '', body, flags=re.S)
body = re.sub(r'<[^>]+>', ' ', body)
known = {c for _, c, a, _, _ in rows for c in re.findall(r'\d+(?:\.\d+)?', f'{c} {a}')}
known |= {'0', '1', '2', '3', '4', '5', '6', '8', '9', '10', '11', '12', '13', '14', '18', '36', '72', '2026', '151'}
loose = sorted({m for m in re.findall(r'(?<![\w.-])\d{3,}(?![\w%])', body)} - known)
print(f'numbers >=3 digits in {source.name} not mapped to an encoded check:', ', '.join(loose) or '(none)')
print(f'\nmismatches: {fails}')
sys.exit(1 if fails else 0)
