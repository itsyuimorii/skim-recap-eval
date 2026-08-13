# Prompt API evaluation — observation and correction log

This file records observations in chronological order, including measurements
that were later superseded or corrected. It does not rank the backends, infer
model equivalence, or recommend a product decision.

Unless a section says otherwise, the environment was Chrome 151.0.7922.108 on
macOS with device performance class `Very High` as displayed by
`chrome://on-device-internals`.

Status labels have the following meanings:

- `CURRENT`: directly recorded and not superseded by a later observation.
- `SUPERSEDED`: describes an earlier run or configuration that is not the
  configuration in the final export.
- `CORRECTION`: amends a statement or artifact created earlier.
- `OPEN`: not tested or not present in the artifacts.

## 1. Prompt API availability on the test profile

**Status: CURRENT**

`await LanguageModel.availability()` returned `available` on an ordinary page
and in the top-level extension evaluation page. No Chrome flag had been enabled
manually for the run.

This records the state of the test profile at that time. The harness did not
use a clean Chrome profile and did not measure an initial Prompt API model
download. The backend code handles `downloadable` and `downloading` states, but
neither state was observed in the exported run.

The `Tools` tab in `chrome://on-device-internals` displayed `Unable to get
default model path`, and the `Event Logs` tab was empty. No model-path value
from that page was included in the export.

## 2. Prompt API language probes

**Status: CURRENT**

Calling session creation separately for each language produced:

| Declaration | Succeeded | Raised `NotSupportedError` |
| --- | --- | --- |
| `expectedOutputs` | `en`, `ja`, `es`, `de`, `fr` | `zh`, `zh-Hant`, `ko` |
| `expectedInputs` | `en`, `ja`, `es`, `de`, `fr` | `zh`, `zh-Hant`, `ko` |

As individual examples from these probes, `ja` session creation succeeded for
both declarations, while `ko` raised `NotSupportedError` for both declarations.

The probes ran inside a top-level extension page. The first comparison attempt
declared all eight Skim Recap languages in `expectedInputs`; Prompt API session
creation then raised `NotSupportedError` before generation. The final exported
run declared the five codes that succeeded in the probes.

The failed setup attempts are not included in the 72-generation final export.

## 3. Reported Prompt API parameters

**Status: CURRENT**

The test profile reported:

```text
contextWindow: 9216
defaultTopK: 64
maxTopK: 128
defaultTemperature: 1
```

The final Prompt API sessions requested:

```text
temperature: 0
topK: 1
```

The Prompt API `contextWindow`, default sampler values, and requested final
session values are present in the exported environment data.

## 4. LiteRT-LM engine fields

**Status: CURRENT, PARTLY OUTSIDE THE EXPORT**

A separate `engine.settings` reading taken after the LiteRT-LM engine had
loaded contained:

```text
backend: 2
mainExecutorSettings: { maxNumTokens: 4096, samplerBackend: 0 }
```

That reading did not expose temperature or top-K parameters. The final JSON
contains `engine not loaded yet — run once to populate` because backend
description did not trigger model loading.

The extension passed a preface and no LiteRT-LM `sessionConfig`. LiteRT-LM
temperature and top-K values are therefore not recorded in the source, engine
dump, or final export.

## 5. Extraction observations during capture

**Status: CURRENT, NOT FULLY REPRESENTED IN THE EXPORT**

Four captures from one article contained 3,996, 3,997, 3,957, and 3,983
characters. The extraction budget was 4,000 characters.

Observed heading substitutions included `Latest posts` and `Subscribe to
newsletter`. One extracted body consisted of bibliography entries. The
bibliography satisfied the existing minimum-length, article-container, and
link-density checks.

Approximately 17 captures were reviewed. Captures containing bibliographies,
author lists, or sidebar-derived headings were excluded before the final nine
fixtures were selected. The excluded text is not stored in the final export.

On one source site, `document.documentElement.lang` was empty and the capture
metadata recorded `lang: '?'`.

## 6. Initial two-passage observations

**Status: SUPERSEDED AS AGGREGATE EVIDENCE; RETAINED AS RUN HISTORY**

The first education-research passage produced the following measurements:

| Mode | Backend | TTFT | Total | Characters |
| --- | --- | ---: | ---: | ---: |
| Recap | LiteRT-LM | 811 ms | 2,198 ms | 365 |
| Recap | Prompt API | 692 ms | 1,990 ms | 500 |
| Explain/Feynman | LiteRT-LM | 866 ms | 6,151 ms | 1,223 |
| Explain/Feynman | Prompt API | 769 ms | 5,939 ms | 1,885 |

Both outputs included an explanation of `cohesive links`.

A later Jevons-paradox passage produced:

| Mode | Backend | TTFT | Total | Characters |
| --- | --- | ---: | ---: | ---: |
| Recap | LiteRT-LM | 786 ms | 2,449 ms | 342 |
| Recap | Prompt API | 631 ms | 2,298 ms | 590 |
| Explain/Feynman | LiteRT-LM | 782 ms | 4,948 ms | 915 |
| Explain/Feynman | Prompt API | 687 ms | 5,227 ms | 1,590 |

The Jevons-paradox source defined the term that had been selected as an
undefined-term probe. It was not retained as an undefined-term fixture in the
final nine-passage corpus.

## 7. Earlier default-sampler run

**Status: SUPERSEDED**

In an earlier six-passage run, LiteRT-LM used its unreported library defaults
and the Prompt API used `defaultTemperature: 1` and `defaultTopK: 64`.

Repeated output text was byte-identical in:

| Backend | Identical repeated conditions |
| --- | ---: |
| LiteRT-LM | 11 / 11 |
| Prompt API | 0 / 11 |

The two backends did not use the same recorded Prompt API sampler request in
that run. These counts are not used as final-run repeat-equality measurements.

The earlier run also contained one Prompt API recap with six output lines
against a prompt requesting two to four points.

## 8. Final-run repeat equality and output length

**Status: CURRENT**

The final run requested `temperature: 0` and `topK: 1` from the Prompt API.
LiteRT-LM sampler parameters remained unreported.

Repeated output text was byte-identical in:

| Backend | Identical repeated conditions |
| --- | ---: |
| LiteRT-LM | 18 / 18 |
| Prompt API | 18 / 18 |

Mean character counts in the 72-run export were:

| Mode | LiteRT-LM | Prompt API | Prompt/LiteRT ratio |
| --- | ---: | ---: | ---: |
| Recap | 387 | 509 | 1.31x |
| Explain/Feynman | 1,011 | 1,656 | 1.64x |

One LiteRT-LM recap in the final corpus contained five non-empty output lines
against a prompt requesting two to four points.

## 9. Final-run timing observations

**Status: CURRENT WITH FIXED-ORDER LIMITATION**

The actual order inside every passage-mode condition was:

```text
LiteRT repeat 1
LiteRT repeat 2
Prompt API repeat 1
Prompt API repeat 2
```

The backend order was fixed rather than randomized or counterbalanced.

Recomputed TTFT pair counts:

| Pair definition | Prompt API TTFT lower | Two-sided sign-test p-value |
| --- | ---: | ---: |
| LiteRT repeat 2 vs Prompt API repeat 1 | 16 / 18 | 0.001 |
| Same repeat index | 28 / 36 | 0.001 |
| Minimum LiteRT TTFT vs maximum Prompt API TTFT | 10 / 18 | 0.81 |

First-third and last-third TTFT medians:

| Backend | First third | Last third |
| --- | ---: | ---: |
| LiteRT-LM | 813 ms | 1,266 ms |
| Prompt API | 719 ms | 1,017 ms |

LiteRT-LM repeat 2 minus repeat 1 had a median of -114 ms; repeat 2 was lower
in 14 of 18 conditions. Prompt API repeat 2 minus repeat 1 had a median of
+149 ms.

The discarded warm-up was one generation per backend. Each measured run
created a new session. The timer started before session creation, so TTFT
includes per-request session setup.

## 10. Trailing whitespace

**Status: CURRENT**

The Prompt API output ended with trailing whitespace in 22 of 36 final runs.
LiteRT-LM output ended with trailing whitespace in 0 of 36 final runs.

## 11. Manual output review

**Status: CURRENT WITH REVIEW LIMITATIONS**

The author reviewed the outputs with backend identity visible. The review was
not exhaustive: not every generation was read closely. There was no predefined
scoring rubric, second reviewer, blinding procedure, or agreement statistic.

Four output claims were checked against external information. The repository's
verification script checks that the quoted fragments occur in the attributed
backend output; it does not verify their factual correctness.

Recorded fragments:

- LiteRT-LM: `Saxagliptin inhibits the DPP-4 enzyme to prolong incretin hormone
  activity`
- LiteRT-LM: `the gemfibrozil prevents the body from breaking down the
  repaglinide`
- Prompt API: `rifampicin (an antibiotic) can reduce the effectiveness of
  nateglinide`
- Prompt API: `LlamaWeb uses less memory than Transformers.js and WebLLM on
  NVIDIA RTX 5080`

No exhaustive claim-level factual audit was performed.

## 12. Incorrect quotation in an earlier draft

**Status: CORRECTION**

An earlier draft attributed this sentence to the Prompt API:

> "WebLLM, Transformers.js, and WeInfer are existing browser-based inference
> frameworks compared in this evaluation."

No final exported output contains `WeInfer`. The Prompt API fragment present in
the export is:

> "LlamaWeb uses less memory than Transformers.js and WebLLM on NVIDIA RTX 5080,
> demonstrating its memory-efficient design."

The report now uses the exported fragment.

## 13. Corpus text absent from artifacts

**Status: CURRENT, OPEN REMEDIATION**

`src/fixtures.ts` exports `FIXTURES: Fixture[] = []`. All nine fixture objects
in `skim-recap-eval-2026-08-11T00-30-45-750Z.json` contain an empty `text`
field.

The artifacts contain source domains, capture timestamps, extension versions,
prompts, output text, timings, and errors. They do not contain the exact input
text supplied to either backend. Re-running the exact corpus and independently
checking passage-to-output groundedness are therefore not possible from the
repository alone.

## 14. Verification script coverage

**Status: CURRENT**

`eval/verify-claims.py` reads the newest result JSON and recomputes the metrics
explicitly encoded in the script:

- run, failure, passage, and condition counts;
- mean output characters and two ratios;
- repeat equality;
- three TTFT pair definitions and sign tests;
- first-third and last-third TTFT medians;
- repeat-to-repeat TTFT deltas;
- trailing whitespace counts;
- observed run order;
- selected exported environment values and language probes;
- presence of four quoted fragments in outputs from the attributed backend.

The script does not parse the report or web article. It does not check every
number or prose statement in either document. A zero mismatch count means that
the expectations encoded in the script match the newest result JSON.

The script separately labels values that are not available in the export,
including the LiteRT-LM 4096-token engine reading, the full Chrome build number,
the capture-selection history, and the external factual assessment of the four
quoted claims.

## 15. Prompt API model identity attribution

**Status: CURRENT, EXTERNALLY ATTRIBUTED**

After the run, André Cipriani Bandarra stated that Chrome stable was using
Gemini Nano and Canary was using Gemma 4 during an ongoing migration. The
harness, runtime fields, and exported JSON do not independently expose that
model identity.

A Stable-versus-Canary rerun would vary the Chrome channel and may also vary
browser version, runtime implementation, and model. Those variables are not
separated by the current harness.

## 16. Second run — corpus committed, sampler stated, schedule counterbalanced

**Status: CURRENT**

Maud Nalpas (Chrome team) reviewed the first run and raised three points: the
corpus was not in the repository, LiteRT-LM's sampler was unconfigured while
the Prompt API's was, and the execution order was fixed. All three were
addressed and the same nine passages were run again on 13 August. 72
generations, 0 failures.

**What changed going in.** The nine passages are now literal constants in
`src/fixtures.ts`, each with a source URL, capture timestamp, and licence note.
`backend-litert.ts` now requests `SamplerType.GREEDY` explicitly through
`sessionConfig.samplerParams`, where the first run passed only a preface.
`eval.ts` now alternates backends within a group and flips which one leads with
the group index and the repeat, so each leads exactly 18 of 36 slots, instead
of LiteRT-LM leading all 18 groups as it had in the first run.

**Content: unchanged, and that settles the sampler question.** All 72 outputs
are byte-identical to the first run's. Requesting greedy explicitly produced
exactly what the unconfigured default had produced, so the library default was
greedy the whole time — previously an inference from repeat equality, now a
direct comparison between two runs.

**Timing: did not replicate, and that is the finding.** Under the fixed order
the Prompt API was first to token in 28 of 36 pairs; with the order
counterbalanced it is first in 31 of 36 (sign test p < 0.0001). The leading
slot in a group carries a median 125 ms advantage, measured directly from the
counterbalanced run. This is not read as run 2 correcting run 1 into a
trustworthy number. Same corpus, same machine, and the answer moved when the
only thing that changed was which generation happened to run first — which
means neither run's absolute timing figures should be trusted on their own.

One result did not survive at all. The first run showed LiteRT-LM's second
generation in a group a median 114 ms faster than its first, recorded as a
per-conversation warm-up cost the discarded warm-up had not covered. Under the
counterbalanced schedule that gap is −18 ms, and +8 ms on the Prompt API side —
indistinguishable from noise. It was the fixed order, not conversation setup.
**Withdrawn.** Kept in this log rather than removed, because reporting a
scheduling artefact as a runtime property is exactly the failure this section
exists to record.

**Corpus correction found by the same reading.** Writing the per-passage notes
against the actual text turned up that nine passages come from five
independent sources, not six as first stated — the three pharmacology entries
are sections of one review, previously counted as separate sources. Licence
notes were added per passage; only the `history.state.gov` passage is
confirmed public domain, the rest are recorded as unverified or all-rights-
reserved pending confirmation.

**What is still open.** The corpus was not enlarged, and summarization quality
still has no metric. A second run of an unchanged corpus is not further
evidence about the models — it is evidence about how little a single
sequential session on one machine can be trusted to say about latency. What a
trustworthy setup would need — repeated sessions, a cooldown between them, or
simply not reporting absolute latency until it can — is recorded below as open,
not resolved by this run.

## Open items

**Status: OPEN**

- Test `LanguageModel` inside an extension offscreen document.
- Test `LanguageModel` inside a content-script isolated world.
- Record streaming semantics in a run where the detector resolves to `delta`
  or `cumulative`; both exports have recorded `unknown`.
- Measure Prompt API availability and download behavior in a clean Chrome
  profile.
- Design a latency measurement that survives more than one session — repeated
  runs with a cooldown between them, or a stated reason absolute latency
  should not be reported at all. Counterbalancing the schedule (§16) removed
  one source of bias; it did not make a single session trustworthy.
- Define a blinded review rubric if content-quality scoring is added.
- Replace the two `blog.sshh.io` fixtures, which overlap 90% and are not
  independent passages.
- Record multiple devices or sessions if device-level timing variability is
  evaluated.
