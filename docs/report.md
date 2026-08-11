# Chrome Prompt API and a bundled Gemma — observed run record

This document records measurements from a Skim Recap evaluation run. It does
not rank the two backends, establish model equivalence, or recommend an
adoption decision.

Skim Recap is a Chrome extension that detects a fast scroll, extracts the
passage that moved past the viewport, and generates a recap locally. The
shipping backend uses Gemma 4 E4B through LiteRT-LM on WebGPU in an offscreen
document. The model file recorded for that backend is 2,969,059,328 bytes.

The second backend uses Chrome's `LanguageModel` Prompt API. On the test
machine, `LanguageModel.availability()` returned `available`. That observation
does not establish that another Chrome profile or device will have the model
already downloaded; Chrome manages the Prompt API model and may report
`downloadable` or `downloading` on other installations.

## Scope and provenance

| Item | Recorded value or source |
| --- | --- |
| Run date | August 2026 |
| Browser | Chrome 151.0.7922.108 on macOS |
| GPU | Apple, `metal-3` |
| Device performance class | `Very High` |
| Bundled backend | `gemma-4-E4B-it-web.litertlm` through LiteRT-LM |
| Prompt API backend | `LanguageModel` in Chrome 151 stable |
| Passages | 9 |
| Domains | clinical pharmacology, economic history, ML systems, education research, and AI model analysis |
| Modes | recap and explain/Feynman |
| Repeats | 2 per passage, mode, and backend |
| Exported generations | 72 |
| Failed generations in the final export | 0 |

André Cipriani Bandarra stated after the run that Chrome stable was using
Gemini Nano and Canary was using Gemma 4 during an ongoing migration. The
runtime and exported JSON do not independently expose the Prompt API model
identity. The statement is therefore recorded as an external attribution, not
as a value measured by the harness.

The exported artifacts are:

- `eval/results/skim-recap-eval-2026-08-11T00-30-45-750Z.json`: output text,
  timings, chunk counts, errors, environment fields, and fixture metadata.
- `eval/results/comparison-2026-08-11.pdf`: rendered side-by-side outputs.
- `eval/findings.md`: chronological observations, corrections, and open items.
- `eval/verify-claims.py`: recomputation of a declared set of metrics encoded
  in that script.

The exact input passages are not present in the repository. `src/fixtures.ts`
exports an empty array, and all nine fixture `text` fields in the JSON export
are empty. A fresh clone can inspect the harness, prompts, outputs, and selected
aggregate calculations, but cannot rerun the exact corpus.

## Prompt and input handling

Both backends received system and user messages from `src/prompts.ts`. The
evaluation did not maintain a second copy of those prompts.

The recap prompt requests two to four short, self-contained points and limits
the response to the supplied passage. The explain/Feynman prompt requests two
to three short paragraphs and permits the backend to explain a term that the
passage names without defining.

The nine selected passages were captured through the extension's extraction
path and were no longer than the extraction budget of 4,000 characters. The
selection process began with approximately 17 captures. Captures containing
bibliographies, author lists, or sidebar-derived headings were not included in
the final nine. This selection history is recorded in `eval/findings.md`; it is
not represented in the exported JSON.

## Sampling configuration

The Prompt API sessions in the final export requested:

```text
temperature: 0
topK: 1
```

LiteRT-LM received a preface and no `sessionConfig`. Its temperature and top-K
values were not available in the source, TypeScript surface, engine settings
dump, or exported JSON. Its two outputs were byte-identical in every one of the
18 passage-mode conditions. The report therefore records observed repeat
equality, not matched sampler parameters.

An earlier run used the Prompt API defaults reported by `LanguageModel.params()`:
`defaultTemperature: 1` and `defaultTopK: 64`. In that earlier run, LiteRT-LM
was identical in 11 of 11 repeated conditions and the Prompt API was identical
in 0 of 11. Those counts are not part of the final exported run.

## Execution order and timing definition

The final runner used this order within every passage-mode condition:

```text
LiteRT repeat 1
LiteRT repeat 2
Prompt API repeat 1
Prompt API repeat 2
```

The order was not randomized or counterbalanced. One generation per backend
was discarded before the measured loop. Each measured generation created a
new session. The timer began before session creation and ended after streaming
completed; time to first token therefore includes per-request session setup.
Model download and the availability probe were outside the measured interval.

## Recorded output measurements

### Repeat equality

| Backend | Conditions with byte-identical repeat text |
| --- | ---: |
| LiteRT-LM | 18 / 18 |
| Prompt API | 18 / 18 |

This records equality between two outputs per condition. It does not describe
behavior under other sampler configurations, Chrome versions, devices, or
additional repeats.

### Output length

| Mode | LiteRT-LM mean characters | Prompt API mean characters | Prompt/LiteRT ratio |
| --- | ---: | ---: | ---: |
| Recap | 387 | 509 | 1.31x |
| Explain/Feynman | 1,011 | 1,656 | 1.64x |

Character counts include trailing whitespace. The Prompt API output ended with
trailing whitespace in 22 of 36 runs; LiteRT-LM did so in 0 of 36 runs.

The recap prompt requested two to four points. In separate observed runs, the
Prompt API returned six points on one passage and LiteRT-LM returned five
points on one passage. These observations came from different run sets and are
not a controlled comparison of violation frequency.

### Time to first token

The following pair counts are recomputed from the final JSON:

| Pair definition | Pairs in which Prompt API TTFT was lower | Two-sided sign-test p-value |
| --- | ---: | ---: |
| LiteRT repeat 2 vs Prompt API repeat 1 | 16 / 18 | 0.001 |
| Same repeat index | 28 / 36 | 0.001 |
| Minimum LiteRT TTFT vs maximum Prompt API TTFT | 10 / 18 | 0.81 |

The first-third and last-third TTFT medians were:

| Backend | First third | Last third |
| --- | ---: | ---: |
| LiteRT-LM | 813 ms | 1,266 ms |
| Prompt API | 719 ms | 1,017 ms |

Within a condition, LiteRT-LM repeat 2 was a median 114 ms lower than repeat 1
and was lower in 14 of 18 conditions. Prompt API repeat 2 was a median 149 ms
higher than repeat 1. The fixed backend order, repeated observations within a
condition, session creation, and machine drift are all present in these timing
measurements.

### Context fields

The Prompt API session reported `contextWindow: 9216` in the export. A separate
LiteRT-LM `engine.settings` reading recorded
`mainExecutorSettings.maxNumTokens: 4096`. The latter is not present in the
final JSON because the engine had not been loaded when that backend was
described.

## Language probes

The harness attempted session creation separately for each language, once in
`expectedInputs` and once in `expectedOutputs`.

| Declaration | Session creation succeeded | Session creation raised `NotSupportedError` |
| --- | --- | --- |
| `expectedInputs` | `en`, `ja`, `es`, `de`, `fr` | `zh`, `zh-Hant`, `ko` |
| `expectedOutputs` | `en`, `ja`, `es`, `de`, `fr` | `zh`, `zh-Hant`, `ko` |

As individual examples from these probes, `ja` session creation succeeded for
both declarations, while `ko` raised `NotSupportedError` for both declarations.

These probes ran in a top-level extension page. Prompt API availability in an
offscreen document and in a content-script isolated world was not tested.

Before the supported input declaration was narrowed to the five accepted
codes, a run that declared all eight Skim Recap languages failed Prompt API
session creation with `NotSupportedError`. Those failed attempts are recorded
in the chronological findings log and are not included in the 72-run final
export.

## Manual content review

The author read all 72 outputs with backend identity visible. There was no
predefined rubric, second reviewer, blinding procedure, or inter-rater
agreement measurement.

Four output claims were checked against external information. The verifier
checks only that the quoted fragments occur in outputs from the attributed
backend; it does not verify factual correctness.

Recorded excerpts:

- LiteRT-LM: "Saxagliptin inhibits the DPP-4 enzyme to prolong incretin
  hormone activity."
- LiteRT-LM: "the gemfibrozil prevents the body from breaking down the
  repaglinide"
- Prompt API: "rifampicin (an antibiotic) can reduce the effectiveness of
  nateglinide"
- Prompt API: "LlamaWeb uses less memory than Transformers.js and WebLLM on
  NVIDIA RTX 5080"

An earlier draft attributed a sentence containing `WeInfer` to the Prompt API.
No exported output contains `WeInfer`; that sentence is not used in this
report.

The exact input passages are absent from the artifacts, so the repository does
not permit an independent passage-to-output groundedness review.

## Extraction observations

During corpus capture:

- several extracted bodies were between 3,957 and 3,997 characters;
- headings were sometimes taken from sidebar text such as `Latest posts` and
  `Subscribe to newsletter`;
- a bibliography passed the existing article-container, minimum-length, and
  link-density filters;
- advertising, navigation, and related-content blocks were not present in the
  nine selected passages.

These are observations from the selection session. The rejected passages are
not included in the final export.

## Verification script coverage

`eval/verify-claims.py` recomputes a declared set of metrics whose expected
values are encoded in the script: run counts, output-length means and ratios,
repeat equality, three TTFT pairings and sign tests, drift summaries,
repeat-to-repeat TTFT deltas, trailing whitespace counts, run order, selected
environment fields, language probe results, and the presence of four quoted
fragments.

The script does not parse this report or the web article and does not establish
that every number in either document is covered. It prints `NOT-IN-EXPORT` for
claims that depend on another source. A zero mismatch count means that the
encoded expectations matched the newest JSON file; it is not a validation of
all prose or all factual claims.

## Limits of this record

- The corpus contains nine selected passages and is not a representative
  sample of reading behavior.
- Repeated generations within one passage-mode condition are not independent
  passages.
- The author performed the content review unblinded.
- Four claims, rather than all generated statements, received an external
  factual check.
- Measurements were made on one machine in one sequential session.
- Backend order was fixed.
- The Prompt API model is browser-managed and not pinned in the artifacts.
- The exact passage text is missing from the repository and export.
- Prompt API execution in the extension's production offscreen context was not
  tested.

## Open questions

1. Does `LanguageModel` work in the extension's offscreen document?
2. Does it work in a content-script isolated world?
3. Is there a supported way to declare best-effort input languages or defer an
   unsupported-language error until an individual request?
4. What is the schedule for additional Prompt API input and output languages?
5. Is an output-token limit planned for the Prompt API surface?
6. What model and runtime identifiers can an extension record for a
   browser-managed backend?
7. What download state and model size are observed in a clean Chrome profile?
8. How do Stable and Canary differ when browser version, runtime, and model may
   all change together?
