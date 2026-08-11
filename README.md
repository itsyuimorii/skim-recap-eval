# Gemma 4 E4B vs Chrome's built-in Prompt API

The eval harness, raw results and working notes behind
[this writeup](https://skim-recap.vercel.app/blog/gemma-4-e4b-vs-chrome-prompt-api).

[Skim Recap](https://chromewebstore.google.com/detail/skim-recap/febndabjnmbmdodeoenjmnplfcalmnmc)
is a Chrome extension that notices when you scroll past something and shows a
recap of it beside your cursor, generated on your own machine. It runs **Gemma 4
E4B through LiteRT-LM** on WebGPU — a 2.97 GB one-time download. Chrome's
**Prompt API** offers extensions an on-device model with no download at all.
This compares the two on the prompts the extension actually ships.

The extension itself is a private repository. This one carries the parts of it
that a comparison has to expose to be checkable.

---

## Verify the numbers without running anything

```
python3 eval/verify-claims.py
```

No dependencies. It reads the results file and recomputes every figure that
appears in the writeup — run counts, mean output length per mode per backend,
reproducibility, all three latency pairings with their sign tests, the drift
figures, the per-conversation warm-up delta, trailing whitespace, the
environment values, and whether each quoted sentence appears verbatim in an
output from the backend it is attributed to. It exits non-zero on any mismatch.

It also prints a **NOT-IN-EXPORT** list: claims that are true but sourced
somewhere other than the results file. Those are named deliberately, because
they are the ones worth questioning.

On its first run it caught two errors in the draft: a quotation attributed to
the Prompt API that no output contained, and a length ratio printed as 1.32 that
is 1.31 when computed from unrounded means. Both are recorded in
[`eval/findings.md`](eval/findings.md) §20 and §22.

## What is here

| | |
| --- | --- |
| `eval/results/*.json` | Every run: full output text, timings, chunk counts, errors. 72 runs, 9 passages, 0 failures. |
| `eval/findings.md` | The working log, in the order things were discovered — including the findings later withdrawn, and the methodology error found after publishing. |
| `eval/verify-claims.py` | Recomputes the writeup from the results file. |
| `docs/report.md` | The written comparison. |
| `src/eval.ts`, `eval.html` | The harness. |
| `src/backend*.ts` | The two-backend abstraction. LiteRT-LM and the Prompt API differ by four calls. |
| `src/prompts.ts` | **The prompts under test**, verbatim from what the extension ships. |
| `src/fixtures.ts` | The corpus type — and see the honest note below. |

## What you cannot re-run, and why

**The nine passages are not here.** They were captured from live pages through
the extension's own extraction path into browser storage, and never promoted
into `src/fixtures.ts`, which still exports an empty array. The results file was
designed to carry them — `EvalRun.fixtures` exists precisely so that passages
travel with results — but in this export that field is empty for all nine.

So a clone reproduces the harness, the prompts and the whole analysis; it does
not reproduce the inputs. What survives is provenance — every fixture carries
its `source.url`, capture timestamp and extension version, so all nine are
traceable to arXiv, PMC, history.state.gov and the rest — plus every generated
output, verbatim.

Fixing it means re-capturing the corpus and committing it as literal constants,
which is how it was always meant to work: a comparison that depends on nine
pages still being up and still laid out the same way is not reproducible either.
Tracked in `findings.md` §21.

## What the comparison found

Neither model showed a knowledge gap across clinical pharmacology, economic
history, ML systems and education research — including in the mode built to
expose one, where the model may define a term the passage names but never
explains. At matched sampling both are fully reproducible, 18/18 each. The
built-in model is more verbose (1.64× in explain mode) and answers first in 28
of 36 paired runs.

What blocks adoption is not quality. `LanguageModel` accepts five languages, and
the restriction applies to **declared inputs**, not only outputs — so declaring
that a Chinese page *might* turn up rejects session creation outright, including
a session that only ever wanted English out. A reading tool does not get to
choose what page it is handed.

## Two things the writeup gets wrong, and now says so

Both were found by auditing the post against the code rather than against
memory, and both are in `findings.md` rather than quietly patched:

- **The run order is not what was claimed.** The nest is fixture → mode →
  backend → *repeat*, so within each of the 18 cells LiteRT-LM takes the two
  earlier — and on a warming machine, cheaper — slots. That biases toward the
  bundled model, which lost anyway, so the latency result is reported under
  three pairings instead of one (§16).
- **"Greedy on both sides" was configured on one side.** The Prompt API is set
  to `temperature: 0, topK: 1`. LiteRT-LM is passed a preface and no
  `sessionConfig` at all, so its sampler is a WASM default that appears in
  neither the library's types, this source, nor the export. It behaved
  deterministically 18/18; *greedy* is an inference from that (§18).

## Which model this actually measured

Chrome stable's Prompt API is backed by **Gemini Nano**; Canary is already on
**Gemma 4**. So this run is Gemma 4 E4B against Gemini Nano — not two versions
of one model. Next is the same fixed corpus on Canary, to separate the model
from the API surface.

## Limitations

n = 9, and the corpus was chosen adversarially. Quality was judged by the author,
unblinded, with no rubric and no second rater. One machine, and a warm one — the
drift measured across the session is in the results. The built-in model is
browser-managed and unpinned, so these numbers describe Chrome 151 on one date.
The report carries the full version.

## Licence

MIT for the harness and the analysis. The model is Google's, under its own
terms.
