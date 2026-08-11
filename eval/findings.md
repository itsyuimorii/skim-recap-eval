# Prompt API evaluation — findings log

Recorded as they land, so nothing depends on remembering a console session.
Environment for every entry unless stated otherwise: Chrome 151.0.7922.108,
macOS, device performance class **Very High** (per `chrome://on-device-internals`).

---

## 1. The built-in model is available without any setup

`await LanguageModel.availability()` → `'available'`, run on an ordinary web
page, with no flag enabled and no manual download step.

Worth noting because `chrome://on-device-internals` is misleading here: its
**Tools** tab reports *"Unable to get default model path"* and its **Event
Logs** tab is empty, which reads like no model is installed. That page appears
to cover a different (manually-loaded) model path than the one the Prompt API
uses. The API's own `availability()` is the authority.

**Consequence for Skim Recap:** the Prompt API path would have *no* first-run
download, against 2.97 GB for LiteRT-LM. That is the single biggest difference
between the two backends from a user's point of view, and it is the reason
this evaluation is worth doing at all.

## 2. Output language is restricted to five, and Chrome says so itself

Calling `availability()` without declaring an output language produces this
console warning:

> No output language was specified in a LanguageModel API request. An output
> language should be specified to ensure optimal output quality and properly
> attest to output safety. Please specify a supported output language code:
> **[de, en, es, fr, ja]**

This is the runtime's own list, not the documentation's — they agree.

Against what Skim Recap currently offers in its popup:

| Skim Recap output language | Prompt API |
| --- | --- |
| `en`, `ja`, `es`, `fr`, `de` | supported |
| **`zh`** (Simplified), **`zh-Hant`** (Traditional), **`ko`** | **not supported** |

Three of eight, including both Chinese variants and Korean.

**Why this matters more than a feature gap.** Skim Recap generates the recap
*in* the target language in a single pass, rather than summarising in the
source language and translating afterwards — the reason is in the prompt's own
comment: translating a summary stacks the translator's errors on top of the
summary's. Chrome's Translator API, which this extension already uses for the
on-demand Translate action, handles Chinese and Korean without trouble.

So the asymmetry is: *translating into* Chinese works, *generating in* Chinese
does not. Adopting the Prompt API would push exactly those languages back onto
the two-step path this extension deliberately avoids. That is a concrete API
request rather than a preference.

Note also that the warning frames language declaration as *"properly attest to
output safety"*, not merely output quality — so it is not advisory.

---

## 3. The context window is not a constraint here

`session.contextWindow` → **9216** tokens.

`extract.ts` caps every payload at `PROMPT_CHAR_BUDGET = 4000` characters
before it reaches a backend, which is roughly 1,000–1,300 tokens of English.
So the window has an order of magnitude of headroom and will not be what
separates the two backends. Recorded so the comparison can say so rather than
leave it as an open suspicion.

Also observed: `create()` reported `0.0%` then `100.0%` immediately, i.e. the
model was already resident — consistent with finding 1.

## 4. The Prompt API works in an extension page, and the language limit holds there

Confirmed from `eval.html`, a top-level extension page at
`chrome-extension://…`, not from a web page: `availability()` → `'available'`,
and creating one session per language gives

| | |
| --- | --- |
| accepted | `en` `ja` `es` `de` `fr` |
| rejected with `NotSupportedError` | `zh` `zh-Hant` `ko` |

So the restriction is not an artefact of testing on the open web — it is what
an extension gets too.

`LanguageModel.params()` → `defaultTopK: 64`, `maxTopK: 128`,
`defaultTemperature: 1`.

## 5. Neither backend is running greedy, and neither is configured

The Prompt API defaults to `temperature: 1` — sampled, not greedy. LiteRT-LM
is passed no `sessionConfig` at all (see finding in the plan), so it runs at
whatever the library defaults to.

Two consequences for reading any numbers this harness produces:

- Output length and latency are not strictly reproducible on either side, so
  neither should be quoted to more precision than it deserves.
- The qualitative questions — does it define a term the passage never defined,
  does it refuse a language — are unaffected by sampling, which is the reason
  those are the questions being asked.

Worth stating plainly in the writeup rather than discovered by a reader.

## 6. Extraction fills its budget, and mislabels a heading sometimes

Four captures from one article: 3996, 3997, 3957, 3983 characters — all within
1% of `PROMPT_CHAR_BUDGET = 4000`, so `selectBlocks` is packing the budget as
intended rather than under-filling it.

Two of the four took **"Latest posts"** as their heading, which is a sidebar
element, not the article title. The extracted *body* text is correct in each
case; only the title is wrong. Minor, and unrelated to this comparison, but
recorded because it is a real extraction bug and this is where it surfaced.

Also: `document.documentElement.lang` was empty on that site, so every capture
recorded `lang: '?'`. The language-detection fallback in `offscreen.ts` covers
this at recap time, but the capture metadata does not use it.

## 7. The language restriction applies to input, not just output — which is the harder half

The first comparison run failed on the Prompt API side for *every* cell, at
0 ms, with:

> `NotSupportedError: The requested language options are not supported.`

The cause was our own `expectedInputs` declaration listing all eight languages
Skim Recap deals with. Chrome rejects the session outright if any declared
language is outside its five.

This is worth separating from finding 2, because the two are not the same
limitation:

- **Output language** is something a tool *chooses*. Not offering Chinese
  recaps is a feature reduction — unwelcome, but survivable.
- **Input language** is something a tool *receives*. Skim Recap does not pick
  what page the reader opens. Declaring `zh` only says "a Chinese page might
  turn up", which is true of any reading tool on the open web, and that alone
  is enough to fail every session — including ones that only ever wanted
  English out.

So the real ceiling is not "no Chinese recaps". It is that the extension would
have to **stop working on Chinese and Korean pages entirely**, rather than
degrade gracefully on them. A general-purpose reading tool cannot declare in
advance which languages the web will hand it.

Adjusted the declaration to the supported five so the comparison can proceed,
and added a second probe row so input and output support are measured
separately rather than assumed to be the same list.

**Measured, both directions:**

| | accepted | rejected |
| --- | --- | --- |
| `expectedOutputs` | `en` `ja` `es` `de` `fr` | `zh` `zh-Hant` `ko` |
| `expectedInputs` | `en` `ja` `es` `de` `fr` | `zh` `zh-Hant` `ko` |

Identical. So there is no asymmetry to exploit — no configuration where the
extension accepts a Chinese page and answers in English.

## 8. The built-in model's context window is larger than the one we ship

`engineSettings` from LiteRT-LM, once an engine exists:

```
backend: 2
mainExecutorSettings: { maxNumTokens: 4096, samplerBackend: 0 }
```

So **LiteRT-LM: 4096 tokens** against the **Prompt API's 9216**.

Recorded because it cuts against the expected narrative. Whatever the built-in
model turns out to lack, context length is not it — it has more than twice the
window of the 2.97 GB checkpoint this extension ships. Any writeup that argues
"the bigger model earns its download" has to concede this line.

## 9. Reference lists defeat the extractor

Capturing more of the same article produced a passage whose entire body is a
bibliography:

> Head, C. N. (2023). The effects of direct instruction on reading
> comprehension for individuals with autism or intellectual disability.
> Unpublished doctoral dissertation, Auburn University. Keller-Margulis, M. A.,
> Mire, S. S., Loría Garro, E. S., Jellinek-Russ…

It passes every filter `extract.ts` has. Citations are mostly plain text, so
link density stays low; each entry is far longer than the 40-character
minimum; and the whole section sits inside the article container, so clipping
the range to the article does not exclude it. Nothing about it looks like page
furniture, and yet no recap of it can be useful.

Two more captures took **"Subscribe to newsletter"** as their heading, which is
a second instance of the heading bug in finding 6.

Unrelated to the backend comparison, but worth keeping for the meeting: it is
concrete evidence for the claim that extraction is the harder half of this
problem. A bibliography on an academic blog is enough to defeat an extractor
that has already been through three rounds of tuning — and no choice of model
would have helped.

## 10. First head-to-head: the hypothesis does not hold on this passage

One passage, both modes, both backends. Source: an education-research blog
post on reading comprehension and autism.

| mode | backend | TTFT | total | chars |
| --- | --- | --- | --- | --- |
| recap | LiteRT-LM | 811 ms | 2198 ms | 365 |
| recap | **Prompt API** | **692 ms** | **1990 ms** | 500 |
| feynman | LiteRT-LM | 866 ms | 6151 ms | 1223 |
| feynman | **Prompt API** | **769 ms** | **5939 ms** | 1885 |

**Recap.** Both produced four concrete lines, and neither lapsed into the
"this section discusses…" register the prompt forbids. The Prompt API was
faster on both measures and somewhat fuller.

**Feynman.** Both explained the term the passage leaves undefined:

> LiteRT: *"teaching students how to use cohesive links, which are the words
> and phrases that connect ideas in a sentence or paragraph"*
>
> Prompt API: *"teaching students to use 'cohesive links' — words and phrases
> that connect ideas"*

So the discriminating test did not discriminate. The likely reason is the
corpus rather than the hypothesis: *cohesive links* and *theory of mind* are
introductory concepts in education and psychology, and a model does not need
much capacity to hold them.

**What this changes.** The claim under test is that feynman mode needs world
knowledge a smaller model lacks. Testing it requires undefined terms obscure
enough that a smaller model plausibly does not have them — a named result
invoked but never stated, a narrow domain term, an event referred to by
shorthand. Common introductory vocabulary cannot separate the two, so the
corpus has to be built to find the edge rather than to confirm the
expectation.

**Stated plainly, because it is the honest reading so far:** on this passage
the zero-download backend was faster, and nothing separated them on accuracy. One passage from one
article settles nothing, but it is evidence against the expected conclusion
rather than for it.

## 11. Second passage: a real quality difference, but not the expected one

Source: an encyclopedia article on the Jevons paradox.

| mode | backend | TTFT | total | chars |
| --- | --- | --- | --- | --- |
| recap | LiteRT-LM | 786 ms | 2449 ms | 342 |
| recap | **Prompt API** | **631 ms** | 2298 ms | 590 |
| feynman | LiteRT-LM | 782 ms | 4948 ms | 915 |
| feynman | **Prompt API** | **687 ms** | 5227 ms | 1590 |

**Latency.** Four runs across two articles now, and the built-in model was
first to token every time.

**A genuine difference in recap, about instruction-following rather than
knowledge.** The recap prompt asks for *"concrete content (claims, numbers,
names, steps)"*. LiteRT supplied them; the Prompt API mostly did not:

> LiteRT: *"William Stanley Jevons first described the Jevons paradox in
> **1865**." / "**James Watt's** steam engine…" / "…depends on the **price
> elasticity of demand**." / "**Saunders** argues…"*
>
> Prompt API: *"…observed that technological improvements led to increased coal
> consumption in the 19th century." / "The Jevons paradox **describes the
> phenomenon where**…" / "Increased energy efficiency **can lead to**…"*

Dates, names and named quantities on one side; paraphrase on the other. This
is the more interesting finding than latency, because it is about how closely
each model holds a written instruction under the same prompt — and it is
measurable without appealing to taste.

**A methodological problem this passage exposes.** An encyclopedia article
*about* the Jevons paradox necessarily defines the Jevons paradox. So the term
was never undefined, and both backends could answer from the passage alone.
The same flaw applies to any reference-work entry: the subject of the article
is the term.

The corpus needs passages that **invoke** a term while being about something
else — a piece on data-centre power that says "of course, Jevons paradox
suggests…" and moves on; a systems article that says "by Amdahl's law…"
without stating it. The test is whether the article's *subject* differs from
the term left unexplained.

## 12. Full run, six passages, four knowledge domains — the hypothesis fails

Corpus: two sections of a pharmacology review (CYP3A4 induction; dietary
modulation), a State Department history of the Nixon shock, a results/related-work
section of a WebGPU LLM-inference paper, an education-research blog post
(control), and a blog post on model knowledge cutoffs. Both modes, both
backends, two runs each.

### Reproducibility splits perfectly

| backend | identical across runs |
| --- | --- |
| LiteRT-LM | **11 / 11** |
| Prompt API | **0 / 11** |

Not one exception either way. The 0.3.0 changelog's claim that a passage
yields the same recap every time is **true of the shipped build**, despite no
explicit sampler configuration — the library default is evidently greedy.

### World knowledge did not separate them

The corpus was built to find a knowledge edge: `q2_k` / `q4_k_m` / `q8_0`,
`bergamottin`, `furanocoumarins`, `PXR` / `CAR` / `AhR`, `Bretton Woods`,
`GPTQ` / `AWQ`. Both backends handled all of them, and **neither fabricated
a definition**. Spot-checked and correct on both sides:

> LiteRT: *"GPTQ and AWQ are examples of post-training quantization methods
> that modify weights."*
> LiteRT: *"Indole-3-carbinol and 3,3′-diindolylmethane activate PXR to induce
> CYP3A4 transcription."*
> Prompt API: *"WebLLM, Transformers.js, and WeInfer are existing browser-based
> inference frameworks compared in this evaluation."*

So the premise behind finding 10 — that feynman mode needs world knowledge a
smaller model lacks — **does not hold on this corpus**, across four unrelated
domains. That is the result, not a failure to find one.

### Correction to finding 11

Finding 11 claimed the Prompt API reaches for "the passage discusses…" while
LiteRT does not. Counted across all six passages that is too strong: LiteRT
opens 2 of 6 explanations with meta-framing (*"The first part of the text
analyzes…"*, *"This text explains how…"*), the Prompt API 5 of 12. A
difference in degree, not in kind. The earlier claim was made from two
samples and is withdrawn.

### What did separate them: length

The feynman prompt asks for *"2 to 3 **short** paragraphs"*.

| backend | mean chars |
| --- | --- |
| LiteRT-LM | ~926 |
| Prompt API | ~1622 |

About 1.75×. And in recap mode, which specifies *"2 to 4 recap points"*, the
Prompt API returned **6** on one run. LiteRT returned 4 every time.

## 13. The comparison so far is confounded, and the confound is fixable

Everything in finding 12 was measured with LiteRT-LM at its library default
(greedy) and the Prompt API at *its* default (`temperature: 1`, `topK: 64`).
Both the non-reproducibility and the extra length are exactly what a
temperature of 1 produces, so neither can currently be attributed to the model
rather than the sampler.

Chrome exposes `temperature` and `topK` to extensions and not to the open web,
so this is fixable — and fixing it is the difference between a finding and an
artefact. `createSession` now requests `temperature: 0, topK: 1`. Both have to
be passed together; Chrome rejects a session specifying only one.

**The re-run is the experiment that matters.** If the Prompt API becomes
reproducible and concise at greedy, then the only differences left standing
are language support and time-to-first-token — and the case for the 2.97 GB
download gets considerably weaker.

## 14. At matched sampling, the reproducibility gap disappears

Re-ran with the Prompt API requesting `temperature: 0, topK: 1`, which is what
finding 13 set up. Every cell now reports identical across runs on **both**
sides:

| passage · mode | LiteRT | Prompt API |
| --- | --- | --- |
| Repaglinide · feynman | 953 / 953 | **1932 / 1932** |
| Lipid-lowering · feynman | 954 / 954 | **1483 / 1483** |
| Saxagliptin · recap | 360 / 360 | **493 / 493** |
| Lipid-lowering · recap | 358 / 358 | **594 / 594** |
| Cutoffs · recap | 394 / 394 | **400 / 400** |

**Finding 12's headline result is withdrawn.** The 11-to-0 split was an
artefact of comparing one backend at greedy against the other at temperature
1 — a configuration this evaluation chose, not a property either model has.
Had that number gone into a writeup, it would have been a wrong conclusion
about someone else's API caused by our own default.

### What survives at matched sampling

**Length does.** The feynman prompt asks for *"2 to 3 short paragraphs"*:

| passage | LiteRT | Prompt API | ratio |
| --- | --- | --- | --- |
| Repaglinide | 953 | 1932 | 2.03× |
| Cutoffs | 1010 | 1588 | 1.57× |
| Lipid-lowering | 954 | 1483 | 1.55× |
| Saxagliptin | 1171 | 1470 | 1.26× |

Consistently 1.3–2× longer with sampling held equal, so this is a property of
the model or its instruction-following, not of the sampler.

**Instruction violations are not one-sided.** Finding 12 noted the Prompt API
returning 6 recap points against a "2 to 4" instruction. In this run **LiteRT
returned 5** on the saxagliptin passage while the Prompt API returned 4. Both
overshoot; neither reliably. That claim is downgraded to "both, occasionally".

**No knowledge gap, still.** Now nine passages across four domains, and
neither backend has fabricated a definition. Spot-checked against external
knowledge rather than against the passage:

> LiteRT: *"Saxagliptin inhibits the DPP-4 enzyme to prolong incretin hormone
> activity."* — correct.
> LiteRT: *"taking repaglinide with gemfibrozil … because the gemfibrozil
> prevents the body from breaking down the repaglinide"* — correct, and it is
> the textbook CYP2C8 interaction.
> Prompt API: *"rifampicin (an antibiotic) can reduce the effectiveness of
> nateglinide"* — correct; rifampicin is an inducer.

## 15. Where the comparison actually lands

With sampling matched, six dimensions:

| | LiteRT-LM (2.97 GB) | Chrome Prompt API |
| --- | --- | --- |
| First-run download | 2.97 GB | **none** |
| Reproducible output | yes | **yes** (once greedy is requested) |
| Domain knowledge, 4 domains | no gap found | **no gap found** |
| Fabrication | none observed | **none observed** |
| Mean chars, explain mode | 1011 | 1656 |
| Time to first token | slower | **faster** |
| Output languages | any Gemma writes | **five only** |
| Input languages | any | **five only** |
| Model version | pinned | browser-managed |

The expectation going in was that a 2.97 GB model would show a knowledge edge
in explain mode. It did not, in four unrelated domains. What separates the two
is not what they know.

**So the blocker is not quality.** On this corpus no quality reason to rule the
built-in model out turned up; it covers this product in English, Japanese,
Spanish, German and French — and cannot be adopted at all because a reading
tool on the open web cannot promise the page will be in one of those five.

That is something specific that can change, which is the useful kind of thing to report,
because it names something specific that can change.

---

## 16. The run order is not what the writeup claimed

Auditing the post against `src/eval.ts` rather than against memory. The cell
generator yields backend innermost, but the *repeat* loop sits inside the cell
loop in `runAll`, so the real nest is:

```
fixture → mode → backend → repeat
```

Verified against `startedAt` in the export: **all 18 cells** run in the order
`litert, litert, prompt-api, prompt-api`. LiteRT-LM takes the two earlier slots
in every single cell — a systematic position effect, not the interleaving the
writeup described.

It runs the wrong way for the result, which is why the conclusion stands: on a
warming machine the earlier slots are the cheaper ones, so the position effect
favours the bundled model, and it still lost. Three pairings, for the record:

| how the pair is formed | Prompt API first | *p* |
| --- | --- | --- |
| truly adjacent — LiteRT run 2 vs Prompt API run 1 | **16 / 18** | 0.001 |
| same repeat index (as reported) | **28 / 36** | 0.001 |
| rigged — LiteRT's faster repeat vs Prompt API's slower | 10 / 18 | 0.81 |

The ordering survives every pairing that is not rigged against it. The margin
does not survive rigging. Both halves belong in the writeup.

## 17. The discarded warm-up is per backend, not per conversation

Falling out of the same audit: LiteRT-LM's **second** run within a cell is a
median **114 ms faster** than its first, in 14 of 18 cells. `runAll` discards one
warm-up per backend, but `runOne` creates a fresh session every time, so each
cell pays a conversation-setup cost the warm-up never covered.

The Prompt API shows the opposite sign, +149 ms on the second run, which is what
undisturbed thermal drift looks like.

Related: `runOne` starts its timer at line 188, **before** `createSession` at
line 190. So every TTFT here includes per-request session setup on both sides.
That is the right metric for this product — it is what a reader waits through —
but it is not generation speed, and the writeup had implied it was.

## 18. `maxNumTokens: 4096` is real, but not in this export

Recorded because a draft correction went too far in the other direction. The
figure is a genuine `engine.settings` read, logged in §8 above, taken in a
session where the engine had been loaded. It is absent from
`skim-recap-eval-2026-08-11T00-30-45-750Z.json` only because `describe()`
deliberately refuses to trigger a 2.97 GB load, so it reports *engine not loaded
yet*.

What that dump does **not** carry is sampler parameters — only a token limit and
a sampler backend. So the context-window comparison is sourced; the word
*greedy* remains an inference from 18/18 identical outputs, not a value anyone
read.

## 19. Trailing whitespace, one-sided

The Prompt API ended its output with trailing whitespace in **22 of 36** runs.
LiteRT-LM: **0 of 36**. Cosmetic, one `trimEnd()` away, and the only behavioural
difference in the whole run that was perfectly one-sided.

## 20. A quotation in the writeup was not in the data

Found by scripting the check instead of trusting the draft. The blog attributed
this to the Prompt API:

> "WebLLM, Transformers.js, and WeInfer are existing browser-based inference
> frameworks compared in this evaluation."

**No output contains the string `WeInfer`, and no fixture does either.** The
sentence the model actually produced, on `cap_1786408203617`, recap mode, is:

> "LlamaWeb uses less memory than Transformers.js and WebLLM on NVIDIA RTX 5080,
> demonstrating its memory-efficient design."

Three named systems and a GPU, all correct — so the underlying point survives.
The quotation did not. In a post whose thesis is that neither model fabricated
anything, the only fabricated sentence was mine.

The other three quotations check out verbatim against the export. All four are
now asserted by `eval/verify-claims.py`, which fails the build if a quoted
fragment is absent from the outputs it is attributed to.

## 21. The corpus is not in the repository, and not in the export

The reproducibility claim does not hold as written.

- `src/fixtures.ts` still exports `FIXTURES: Fixture[] = []`. The passages were
  captured into `chrome.storage.local` and never promoted into source.
- The export *intends* to carry them — `EvalRun.fixtures` exists precisely so
  that "the passages travel with the results" — but in
  `skim-recap-eval-2026-08-11T00-30-45-750Z.json` **all nine have `text` of
  length 0**. Metadata survived; the passages did not.

So a fresh clone reproduces the harness, the prompts and the analysis, but not
the inputs. What does survive is provenance: every fixture carries `source.url`,
`capturedAt` and the extension version, and every generated output is in the
export verbatim.

Remedy, in order: re-capture the nine passages through the same extraction path,
paste them into `src/fixtures.ts` with `captureToSource()`, and re-export.
Committing them as literal constants was always the plan — a corpus that depends
on nine pages still being up and still laid out the same way is not reproducible
either.

Recorded rather than quietly fixed, because the writeup said the comparison was
re-runnable before anyone checked whether it was.

## 22. Every figure in the writeups is now recomputed by a script

`eval/verify-claims.py` reads the newest results file and re-derives every number
that appears in the blog and the report: run counts, mean output length per mode
per backend, reproducibility, all three latency pairings with their sign tests,
the drift figures, the per-conversation warm-up delta, trailing whitespace, the
environment values, and the presence of each quoted fragment. It exits non-zero
on any mismatch, and prints a separate NOT-IN-EXPORT list for the handful of
claims that are true but sourced elsewhere — `maxNumTokens 4096`, the full Chrome
build number, the capture-selection history, and the word *greedy*.

It caught two errors on its first run: the fabricated quotation above, and a
recap length ratio printed as 1.32 that is 1.31 when computed from unrounded
means.

## Still open

- Does the Prompt API work inside an **offscreen document**? (Product
  architecture depends on it; the eval page does not.)
- Does it work in a **content-script isolated world**? If so, this path needs
  no offscreen document at all.
- Streaming semantics: delta or cumulative in this build. (Detected at runtime
  by `backend-prompt.ts`; `describe()` reported `unknown` in this export.)
- ~~Which model is actually behind it~~ — **answered.** André confirmed the
  migration is under way: Chrome stable is Gemini Nano, Canary is already
  Gemma 4. So this run compared Gemma 4 E4B against Gemini Nano. Next: Nano vs
  Gemma 4, both through the Prompt API, stable against Canary.
- The core question, still unanswered after one passage: does `feynman` mode
  discriminate between the two backends in a way `recap` mode does not?
- **Re-capture the corpus into `src/fixtures.ts`** and re-export, so the results
  file carries the passages it was designed to carry. Until then the comparison
  is re-runnable in method but not in inputs (§21).
