# Skim Recap Prompt API evaluation artifacts

This repository contains an evaluation harness, one exported run, a rendered
comparison, and an observation log for two Skim Recap inference backends:

- Gemma 4 E4B through LiteRT-LM;
- Chrome's `LanguageModel` Prompt API.

The artifacts describe one run on one machine. They do not establish model
equivalence, rank the backends, or state an adoption decision.

[Skim Recap](https://chromewebstore.google.com/detail/skim-recap/febndabjnmbmdodeoenjmnplfcalmnmc)
is a Chrome extension that extracts a passage after a fast scroll and generates
a recap locally. Its shipping LiteRT-LM model file is 2,969,059,328 bytes. On
the evaluation profile, `LanguageModel.availability()` returned `available`.
That observation does not establish the download state on another Chrome
profile or device.

## In plain terms

Skim Recap generates its recaps on the reader's own machine. There are two ways
to do that in a Chrome extension today, and this run compares them on the work
the extension actually does.

**The two things being compared**

- **LiteRT-LM + Gemma 4 E4B** — what the extension ships. A 2.97 GB model file,
  downloaded once and cached, running on WebGPU.
- **Chrome's Prompt API** — a model already in the browser, no download.

**What was held the same for both.** Identical prompt text, imported from the
module the extension itself ships rather than copied into the harness. The same
extracted passages. The same two prompt modes. Greedy sampling requested on both
sides.

**The two prompt modes** are product features, not evaluation techniques:

- **Recap** is fenced to the passage. It may only restate what the text says,
  because a recap that adds material misrepresents what the reader scrolled past.
- **Explain** deliberately lifts that fence. Where the passage names a term and
  never defines it, the model may supply the definition from its own knowledge.
  This mode exists because a recap cannot help a reader who was stopped by an
  undefined term — by construction, the definition is not in the passage.

Explain is the mode where a model's own knowledge should decide the outcome,
which is why both modes are run rather than just one.

**What was measured**

| Metric | How | What it tells you |
| --- | --- | --- |
| Time to first token | ms from requesting a session to the first streamed character | Responsiveness as a reader experiences it. Includes per-request session setup on both sides. |
| Total generation time | ms from request to stream end | |
| Output length | characters, and lines | Whether a length instruction was followed |
| Repeat equality | byte comparison of two runs of the same condition | Whether the same passage yields the same recap |
| Session creation outcome | success, or the `DOMException` name | Which conditions the API refuses outright — this is where the language limits appear |
| Language support | one session created per language, both `expectedInputs` and `expectedOutputs` | Which languages the API will accept |

**Not measured, and this is the main gap.** Summarization quality has no metric
here. One reader reviewed the outputs unblinded and checked four excerpts
against outside knowledge; the review was not exhaustive, and there was no
rubric and no second rater. That is a reading, not a measurement, and it should
not be weighed like the rows above.

**The test data** is nine passages captured from live pages — clinical
pharmacology, economic history, ML systems, and education research — through the
extension's real extraction path rather than pasted by hand, because working out
which part of a page is the article is most of what the extension does. They are
committed in `src/fixtures.ts`.

Most were chosen because they name a technical term and never define it, which
is the condition under which a knowledge difference would show. Four turned out
on re-reading to define their own key terms and are now marked `bounded`: they
serve as controls, since an explain-mode answer that still adds material there
is padding rather than a missing definition.

**Where 72 comes from**

```
9 passages × 2 backends × 2 prompt modes × 2 repeats = 72 generations
```

The 9 × 2 modes = 18 *groups*. Each group runs both backends, twice.

## Artifact map

| Path | Contents |
| --- | --- |
| `eval/results/*.json` | 72 generated outputs with timings, chunk counts, errors, environment fields, and fixture metadata |
| `eval/results/*.pdf` | Rendered side-by-side outputs |
| `eval/findings.md` | Chronological observation, correction, and open-item log — the primary record |
| `eval/verify-claims.py` | Recomputes a declared set of metrics encoded in the script |
| `src/eval.ts`, `eval.html` | Evaluation runner and interface |
| `manifest.json`, `build.js` | Enough to load the harness as an unpacked extension |
| `src/backend*.ts` | Backend adapters |
| `src/prompts.ts` | Prompts used by both backends |
| `src/fixtures.ts` | The nine passages, with per-passage term lists and licence notes |

## Recompute the encoded metrics

```sh
python3 eval/verify-claims.py
```

The script has no third-party dependencies. It recomputes the metrics whose
expected values are explicitly encoded in the script, including run counts,
mean output lengths, repeat equality, three TTFT pair definitions, sign tests,
drift summaries, repeat-to-repeat TTFT deltas, trailing whitespace, run order,
selected environment fields, language probes, and the presence of four quoted
fragments.

It does not parse the report or web article and does not verify every number or
prose statement in either document. A zero mismatch count means that the
encoded expectations match the newest JSON export.

The script prints `NOT-IN-EXPORT` for recorded values that depend on another
source, including a LiteRT-LM engine-settings reading, the full Chrome build
number, capture-selection history, and external factual review of four output
claims.

The script previously exposed two draft errors: an output quotation that did
not occur in the export and a recap length ratio written as 1.32 rather than
1.31. Both corrections are recorded in `eval/findings.md`.

## Run it

```sh
npm install
npm run build
```

Then load this directory unpacked at `chrome://extensions` with Developer mode
on, and open `chrome-extension://<id>/eval.html`. `Run corpus` runs all nine
passages through both backends in both modes; `Export JSON` writes a results
file in the same shape as the one in `eval/results/`.

The manifest here declares only what the harness needs: storage, host
permissions for the model download, and `wasm-unsafe-eval` for the LiteRT-LM
runtime. Loading it gives you the comparison page, not Skim Recap — the
extension is a separate, private repository.

Two costs worth knowing before you start. LiteRT-LM fetches a **2.97 GB model**
from Hugging Face on first use and caches it; the Prompt API side needs a Chrome
build where `LanguageModel.availability()` returns something other than
`unavailable`. Both need a machine with WebGPU.

## Reproduction boundary

The nine passages are committed in `src/fixtures.ts` as literal constants, each
with its source URL, capture timestamp, and a licence note. They were captured
through the extension's own extraction path rather than pasted by hand, because
deciding which part of a page is the article is most of what the extension does
— a hand-picked passage would not be what the product actually produces.

Each fixture also carries three lists, written against the passage text rather
than assumed from its subject area:

- `undefinedTerms` — named by the passage, never explained by it
- `definedInPassage` — named *and* explained, so an explain-mode answer covering
  only these has paraphrased rather than supplied outside knowledge
- `requiresWorldKnowledge` — what a correct explain answer has to add

An earlier version of this corpus filled those fields in per subject area. Three
pharmacology fixtures shared one sentence naming terms that appear in none of
them, and the saxagliptin entry claimed DPP-4 was undefined when the passage
defines it in its first sentence. Two fixtures were reclassified from
`undefined-term` to `bounded` on re-reading. That history is in
`eval/findings.md`.

**A caveat on the corpus itself, not the artifacts.** Two fixtures are
overlapping slices of one blog post (90% text overlap — flagged in
`eval/findings.md` as due for replacement), two more are sections of one
systems paper, and three are sections of a single pharmacology review. Nine
passages come from **five** independent sources, not nine.

## Two runs, not one

Two exports are committed, both over the same nine passages:

| | `...2026-08-11...json` (run 1) | `...2026-08-13...json` (run 2) |
| --- | --- | --- |
| Passages in the export | ids and domains only, no text | full text, source URL, licence |
| LiteRT-LM sampler | library default, unstated | `SamplerType.GREEDY` requested by name |
| Backend order | LiteRT-LM leads all 18 groups | alternates, each leads 18 of 36 |
| Generated output | **byte-identical to run 2** | **byte-identical to run 1** |
| Prompt API first to token | 28 / 36 | 31 / 36 |

The content side is stable across the two runs; the timing side is not, and
that disagreement is itself the result worth reading — not a signal that run
2's numbers are the trustworthy ones. `eval/findings.md` §16 has the full
account, including a finding from run 1 that did not survive run 2 and was
withdrawn.

`eval/findings.md` is the primary record: both runs, in the order they happened,
including what was corrected and why. Sections are marked `CURRENT`,
`SUPERSEDED`, `CORRECTION`, or `OPEN`. The [writeup](https://skim-recap.vercel.app/blog/gemma-4-e4b-vs-chrome-prompt-api)
is the polished version of the same record; there is no separate markdown
report kept in sync with it, to avoid two documents drifting apart.

## Review limitations

- The corpus contains nine selected passages.
- Output review was performed by the author with backend identity visible, and
  was not exhaustive.
- There was no predefined rubric, second reviewer, or agreement statistic.
- Four output claims received an external factual check.
- Timing came from one sequential session on one machine. The exported run used
  a fixed backend order within each group; the harness now counterbalances that
  order, so a re-run will not carry the same position effect.
- The Prompt API model identity is externally attributed rather than exposed by
  the runtime or export.
- Prompt API execution in an offscreen document was not tested.

## Licence

MIT for the harness and analysis code. Models and browser components remain
under their respective terms.
