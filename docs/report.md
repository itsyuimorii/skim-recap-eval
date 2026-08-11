# Chrome Prompt API vs. a bundled Gemma — an evaluation from Skim Recap

Skim Recap is a Chrome extension that detects a fast scroll, works out which
passage went past unread, and shows a recap of it beside the cursor. It runs
Gemma 4 E4B locally through LiteRT-LM on WebGPU, in an offscreen document. The
model is a one-time 2.97 GB download.

André Cipriani Bandarra asked whether the Prompt API would work for this, "or
not". This is the answer, with the harness that produced it.

**Which model this actually measured.** After the run, André confirmed that the
migration from Gemini Nano to Gemma 4 is under way: Chrome *stable* still uses
Gemini Nano, Canary already runs Gemma 4. This evaluation ran on Chrome 151
stable, so every number below is **Gemma 4 E4B against Gemini Nano** — not two
versions of one model. That makes the result stronger rather than weaker: the
browser-bundled model held its own without a download.

**Reproduce it:** `EVAL=1 npm run build`, load unpacked, open
`chrome-extension://<id>/eval.html`. It runs both backends over the same
passages using the prompts the extension actually ships, streams them side by
side, and exports JSON.

**Artifacts in this repository:**

- `eval/results/skim-recap-eval-2026-08-11T00-30-45-750Z.json` — every run, with
  full output text, timings and any error. 72 runs, 9 passages, 0 failures.
- `eval/results/comparison-2026-08-11.pdf` — the rendered side-by-side.
- `eval/findings.md` — the running log, including the findings later withdrawn.
- `src/eval.ts`, `eval.html` — the harness.

Every number below is computed from that JSON, not transcribed.

---

## Setup

| | |
| --- | --- |
| Chrome | 151.0.7922.108, macOS, device performance class *Very High* |
| GPU | Apple, metal-3 |
| Bundled model | `gemma-4-E4B-it-web.litertlm`, 2,969,059,328 bytes, `maxNumTokens` 4096 (from an `engine.settings` read logged in `eval/findings.md` §8; the exported run reads *engine not loaded yet*), sampler params not reported |
| Prompt API | `availability()` → `available` with no flag and no setup step; `contextWindow` 9216 |
| Corpus | 9 passages, 4 domains: clinical pharmacology (CYP3A4 induction, dietary modulation, statins, repaglinide, saxagliptin), economic history (the Nixon shock), ML systems (a WebGPU inference paper), education research (control), AI (model knowledge cutoffs) |
| Method | both backends × both modes × 2 runs, strictly sequential, one discarded warm-up per backend, timers start after model load but *before* session creation |

Passages were captured through the extension's own extraction pipeline rather
than copied by hand, so they are the text the product would actually send.
Each is ≤4000 characters, which is the budget `extract.ts` enforces.

Two modes are compared. **Recap** is fenced to the passage — *"Given ONLY that
passage"* — because a recap that adds things the article never said is a lie
about what you scrolled past. **Explain** deliberately lifts that fence: where
the passage names a term without defining it, the model may supply the
definition. That second mode is why model capability seemed likely to matter.

### What is held constant, and what isn't

**The prompts.** Both backends are given byte-identical system and user
messages, from the module the extension itself imports. They were moved out of
the inference file for exactly this reason: a copy inside the harness would
agree today and silently disagree the first time a word was tuned, invalidating
the comparison without failing anything.

**Sampling.** Greedy on both sides — but configured on only one of them, and
the distinction matters. The Prompt API is explicitly set to `temperature: 0,
topK: 1`. LiteRT-LM is passed a preface and no `sessionConfig` at all, so its
sampler is a WASM default that appears in neither the library's TypeScript
surface, nor this source, nor the export. What can be said is behavioural: it
produced byte-identical output on every repeat, 18 times out of 18. *Greedy* is
an inference from that, not a value anyone read. Getting this wrong produced one
of the two withdrawn results below.

**Run order, corrected.** An earlier draft claimed backend was the innermost
loop. Reading the runner: the nest is fixture → mode → backend → *repeat*, so
within each of the 18 cells the order is LiteRT, LiteRT, Prompt API, Prompt API.
LiteRT-LM takes the two earlier — and on a warming machine, cheaper — slots in
every cell. The position effect therefore favours the bundled model, which lost
anyway; see §3 for the three pairings that check it.

**Extraction.** Both backends receive the same extracted text, so extraction is
controlled by construction — it cannot favour either. But it does decide
whether a passage is worth comparing at all, and that had to be handled by
selection rather than by code.

Of roughly seventeen captures taken, several were extraction failures and were
excluded from the corpus: bibliographies, author lists, and passages whose
heading came from a sidebar ("Subscribe to newsletter", "Latest posts") rather
than the article.

**That exclusion is itself worth reporting.** A reference list passes every
filter this extension has. Citations are mostly plain text, so the link-density
test that catches menus and "related articles" grids does not fire; each entry
clears the minimum length; and the whole section sits inside the article
container, so clipping the range to the article does not exclude it. Nothing
about it looks like page furniture, and no recap of it can be useful.

This is the part of the problem no choice of model addresses. Advertising
slots, navigation and recommendation widgets are handled — they are link-dense
and their class names say what they are. A bibliography on an academic blog is
neither, and it defeated an extractor that has already been through three
rounds of tuning.

---

## 1. The expected result did not appear

The corpus was built to find a knowledge edge. It contains terms invoked and
never defined: `q2_k`, `q4_k_m`, `q8_0`, GPTQ, AWQ; bergamottin,
furanocoumarins, PXR, CAR, AhR, DPP-4, SGLT2; Bretton Woods, gold
convertibility.

**Across nine passages and four domains, neither backend showed a knowledge
gap, and no fabricated definition was found on either side.** Stated precisely:
all 72 outputs were read, and the four below were formally verified against
outside knowledge rather than against the passage — which is the only check that
means anything here. Four checked, not seventy-two; this is a reading, not an
audit.

> **LiteRT:** "Saxagliptin inhibits the DPP-4 enzyme to prolong incretin
> hormone activity." — correct.
>
> **LiteRT:** "taking repaglinide with gemfibrozil … because the gemfibrozil
> prevents the body from breaking down the repaglinide" — correct, and it is
> the textbook CYP2C8 interaction.
>
> **Prompt API:** "rifampicin (an antibiotic) can reduce the effectiveness of
> nateglinide" — correct; rifampicin is an inducer.
>
> **Prompt API:** "WebLLM, Transformers.js, and WeInfer are existing
> browser-based inference frameworks compared in this evaluation." — correct.

Whatever separates these two backends for this product, it is not what they
know.

## 2. Two results this evaluation had to withdraw

Both are included because the corrections are more informative than the
original claims.

**Reproducibility.** A first pass showed LiteRT identical across runs 11 times
out of 11 and the Prompt API 0 out of 11 — an apparently decisive result. It
was an artefact of two samplers, not two models. LiteRT-LM was running at its
library default — deterministic in behaviour, though see the note on sampling
above: nothing readable names it. The Prompt API was running at *its* documented
default of `temperature: 1`. The
Prompt API exposes `temperature` and `topK` to extensions and not to the open
web, so this was ours to fix. Re-run with `temperature: 0, topK: 1`:

| backend | identical across runs |
| --- | --- |
| LiteRT-LM | **18 / 18** |
| Chrome Prompt API | **18 / 18** |

A perfect tie, from what had looked like a decisive win.

**Instruction-following.** A first pass showed the Prompt API returning 6
recap points against a "2 to 4" instruction, and LiteRT holding to 4. Over the
full corpus LiteRT returned **5** on one passage. Both overshoot; neither
reliably.

## 3. What survives at matched sampling

**Length.** Recap asks for *"2 to 4 recap points"*; explain asks for *"2 to 3
short paragraphs"*. Mean output over all 72 runs:

| mode | LiteRT-LM | Prompt API | ratio |
| --- | --- | --- | --- |
| recap | 387 chars | 509 chars | 1.32× |
| explain | 1011 chars | 1656 chars | **1.64×** |

With sampling held equal, so this is the model and not the sampler. For a card
that appears beside the cursor mid-scroll, length is not a cosmetic property —
and the gap widens in exactly the mode where the instruction says *short*.

**Time to first token.** Not reported as a median. The machine drifted over the
session — comparing each backend's first third against its last, LiteRT-LM went
from 813 ms to 1266 ms and the Prompt API from 719 ms to 1017 ms, roughly
1.4–1.6× on both sides — so a pooled median is not a property of either model.
Reported pairwise instead, within a cell:

| how the pair is formed | Prompt API first | *p* |
| --- | --- | --- |
| truly adjacent in time — LiteRT run 2 vs Prompt API run 1 | **16 / 18** | 0.001 |
| same repeat index | **28 / 36** | 0.001 |
| rigged — LiteRT's faster repeat vs the Prompt API's slower one | 10 / 18 | 0.81 |

The ordering survives every pairing that is not rigged against it; the margin is
small enough that rigging it erases the effect. The Prompt API answers first,
and this session cannot say by how much. It still takes longer in total, because
it produces more.

Note also that the timer starts before `createSession`, so these figures include
per-request session setup on both sides — time from asking for an answer to the
first word of it, which is what a reader waits through.

**A warm-up that does not cover everything.** LiteRT-LM's second run in a cell is
a median **114 ms faster** than its first, in 14 of 18 cells. The discarded
warm-up is one per backend, not one per conversation, so every cell pays a
fresh-conversation cost the warm-up never covered. The Prompt API shows the
opposite sign (+149 ms), which is what plain drift looks like.

**One artefact, perfectly one-sided.** The Prompt API ended its output with
trailing whitespace in **22 of 36** runs; LiteRT-LM in **0 of 36**. Cosmetic, and
one `trimEnd()` fixes it, but anything streaming straight into a card sees it.

**Failures: zero**, on either side, across all 72 runs.

**Context window.** The Prompt API reports 9216 tokens against LiteRT-LM's
`maxNumTokens: 4096`. More than twice the window, on the side with no
download.

## 4. The blocker: languages, and specifically input languages

`LanguageModel` accepts five: `en`, `ja`, `es`, `de`, `fr`. Chrome says so
itself, in a console warning when no output language is declared:

> Please specify a supported output language code: [de, en, es, fr, ja]

Skim Recap offers eight output languages. Three of them — Simplified Chinese,
Traditional Chinese, Korean — are outside that set. Measured per language by
creating one session each, inside an extension page:

| | accepted | rejected with `NotSupportedError` |
| --- | --- | --- |
| `expectedOutputs` | en ja es de fr | **zh zh-Hant ko** |
| `expectedInputs` | en ja es de fr | **zh zh-Hant ko** |

**The input row is the one that matters, and it is the harder half.**

An output language is something a tool chooses. Dropping Chinese recaps would
be a feature reduction — unwelcome, survivable.

An input language is something a tool *receives*. Skim Recap does not decide
what page the reader opens. Declaring `zh` in `expectedInputs` says only "a
Chinese page might turn up", which is true of any reading tool on the open web
— and that declaration alone rejects the session, including one that only ever
wanted English out. We observed this as a real failure before narrowing the
declaration: every cell, every mode, `failed after 0 ms`.

So the ceiling is not "no Chinese recaps". It is that the extension would have
to **stop working on Chinese and Korean pages entirely** rather than degrade on
them, and it cannot know in advance which pages those will be.

## 5. Where this leaves the decision

| | LiteRT-LM (2.97 GB) | Chrome Prompt API |
| --- | --- | --- |
| First-run download | 2.97 GB | **none** |
| Reproducible output | 18/18 | **18/18** |
| Knowledge, 4 domains | no gap found | **no gap found** |
| Fabrication | none observed | **none observed** |
| Explain-mode length | **1011 chars** | 1656 chars |
| First to token, paired runs | 8 / 36 | **28 / 36** |
| Context window | 4096 | **9216** |
| Failures in 72 runs | 0 | 0 |
| Output languages | whatever Gemma writes | five |
| Input languages | any | five |
| Model version | pinned | browser-managed |

The 2.97 GB download is this extension's single largest install barrier — the
store listing warns about it above the feature list, deliberately. A path with
no download at all is worth a great deal, and on quality this evaluation could
not find a reason to reject one.

**So the blocker is not quality. On this corpus I could not find a quality
reason to rule the built-in model out; what I could not work around is that a
reading tool on the open web cannot promise the page will be in one of five
languages.**

---

## Limitations

Everything above is one person, one laptop, one afternoon.

**Nine passages is a probe, not a sample.** The corpus was chosen adversarially —
passages that name a term and never define it — because that is the condition
under which a knowledge gap would show. It is not representative of what anyone
reads. "No gap found on nine hard passages" is much weaker than "no gap", and the
honest reading of a null result at n = 9 is that the test lacked the power to
separate them, not that they are equal.

**Quality was judged by the author, unblinded.** No rubric, no second rater, no
blinding, no agreement statistic — so every knowledge and fabrication claim
carries a bias in favour of the model already shipped. The one reassurance is
that the bias points the wrong way: the expectation was that the bundled model
would win, and the report says it did not.

**Length is measured; usefulness is not.** 1656 chars against 1011 is arithmetic.
Whether the longer answer is worse is a product judgement — a card beside the
cursor mid-scroll — never tested on a reader. On a different surface the ranking
could invert.

**One machine, and a warm one.** Apple silicon, *Very High* performance class,
WebGPU over metal-3. The drift measured above shows the machine changing
underneath the test. No absolute latency here should be quoted, and a thermally
limited laptop or an integrated GPU may not reproduce the ordering.

**Both sides are moving.** The built-in model is browser-managed and unpinned;
the bundled one is pinned. These numbers describe Chrome 151 on one date.

**What would fix it.** A held-out corpus neither model was chosen against; blind
pairwise rating by someone other than the author; and a machine that is not also
the one running the browser.

---

## Questions for the Chrome team

1. **Which model is actually behind the Prompt API today?** *Answered.* André
   confirmed the migration is under way: stable is Gemini Nano, Canary is
   already Gemma 4. So this compared Gemma 4 E4B against Gemini Nano. The
   obvious next run is Gemini Nano against Gemma 4, both through the Prompt
   API — stable against Canary. The harness is built and the corpus is fixed,
   so it is a re-run rather than a rebuild.

2. **Is `expectedInputs` intended to be as strict as `expectedOutputs`?**
   Chrome frames the output declaration as a safety attestation, which
   explains refusing an undeclared one. The input side behaves the same way,
   and there a tool cannot say "I may encounter this" without the session being
   refused. Is there a way to declare
   best-effort input handling, or to fail per-request rather than at session
   creation?

3. **What is the roadmap for zh and ko?** The docs say more languages are in
   development. For this product that single line decides adoption.

4. **Is the Prompt API available in an offscreen document?** The docs cover
   top-level windows, same-origin iframes and Web Workers, and say nothing
   about extension contexts. This extension runs inference in an offscreen
   document because it is the only MV3 context with WebGPU; if the Prompt API
   is unavailable there, adoption needs an architecture change even where
   language is not a problem. (This evaluation sidesteps the question by
   running in a top-level extension page.)

5. **Verbosity under an explicit length instruction.** Both models were given
   *"2 to 3 short paragraphs"*; one averaged 1.3–2× the other. Is there
   guidance for holding output length beyond prompt wording, given that
   `maxOutputTokens` is not exposed?

   In fairness: this side is not using the lever it has either. LiteRT-LM's
   `SessionConfig` accepts `samplerParams` and `maxOutputTokens`; Skim Recap
   passes neither. The restraint reported above is a library default, not a
   setting anyone chose, and this side owes itself a configuration pass before
   asking for a knob.

---

## A note on the other two APIs

The **Translator API** is already shipping in this extension — it powers the
on-demand Translate action on a finished recap, with `LanguageDetector` for
source detection. It handles Chinese and Korean without trouble, which is what
makes the Prompt API's five-language limit so visible from inside one codebase.

The **Summarizer API** does not have a place to put this. It takes no custom
system prompt — only `type`, `length` and `sharedContext`. Skim Recap's output quality
lives entirely in its prompts: the recap prompt forbids meta-description
("never a description like 'this section discusses'"), and explain mode is
*defined* by an instruction that lifts the passage constraint —

> "The passage sets the subject, but you are not limited to it: where it names
> a term without explaining it, explain the term yourself."

There is no combination of `type` and `length` that says that, which is why
this extension uses the Prompt API surface rather than this one. Recorded
because it is a concrete capability gap with a concrete use case behind it.
