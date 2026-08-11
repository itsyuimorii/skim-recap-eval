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

## Artifact map

| Path | Contents |
| --- | --- |
| `eval/results/*.json` | 72 generated outputs with timings, chunk counts, errors, environment fields, and fixture metadata |
| `eval/results/*.pdf` | Rendered side-by-side outputs |
| `eval/findings.md` | Factual observation, correction, and open-item log |
| `eval/verify-claims.py` | Recomputes a declared set of metrics encoded in the script |
| `docs/report.md` | Current factual run record |
| `src/eval.ts`, `eval.html` | Evaluation runner and interface |
| `src/backend*.ts` | Backend adapters |
| `src/prompts.ts` | Prompts used by both backends |
| `src/fixtures.ts` | Fixture type and currently empty fixture array |

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

## Reproduction boundary

The exact nine input passages are absent from this repository.
`src/fixtures.ts` exports an empty array, and every fixture `text` field in the
current JSON export is empty. The artifacts preserve source domains, capture
timestamps, extension versions, prompts, output text, timings, and errors, but
not the exact passage text supplied to the backends.

A fresh clone can inspect and run the harness with newly supplied fixtures and
can recompute the encoded metrics from the existing export. It cannot rerun the
exact nine-passage corpus or independently compare those missing passages with
the saved outputs.

## Recorded run shape

| Field | Value |
| --- | --- |
| Passages | 9 |
| Modes | recap and explain/Feynman |
| Backends | LiteRT-LM and Prompt API |
| Repeats | 2 per passage-mode-backend condition |
| Final exported generations | 72 |
| Failed generations in the final export | 0 |
| Prompt API sampling request | `temperature: 0`, `topK: 1` |
| LiteRT-LM sampler parameters | not reported |

The chronological log contains earlier runs and corrections. Sections in that
file are marked `CURRENT`, `SUPERSEDED`, `CORRECTION`, or `OPEN`.

## Review limitations

- The corpus contains nine selected passages.
- Output review was performed by the author with backend identity visible.
- There was no predefined rubric, second reviewer, or agreement statistic.
- Four output claims received an external factual check.
- Timing came from one sequential session on one machine with a fixed backend
  order.
- The Prompt API model identity is externally attributed rather than exposed by
  the runtime or export.
- Prompt API execution in an offscreen document was not tested.

## Licence

MIT for the harness and analysis code. Models and browser components remain
under their respective terms.
