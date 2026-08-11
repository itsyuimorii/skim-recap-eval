// The prompts, and nothing else.
//
// These live apart from the engine that runs them so that anything measuring
// this extension — the Prompt API comparison in eval.ts, most immediately —
// measures the prompts the product actually ships. A copy in the eval file
// would agree with these today and quietly disagree the first time a word is
// tuned here, invalidating the comparison without failing anything.

import type { SummaryMode } from './messages';

/** Defensive cap only. `PROMPT_CHAR_BUDGET` in extract.ts is 4000 and is
 *  applied before the text ever reaches a backend, so in the product path this
 *  is never the binding constraint. */
export const MAX_INPUT_CHARS = 6000;

// One point per line: the card renders the same output either as prose
// (lines joined) or as numbered blocks (lines listed), so the toggle never
// has to regenerate anything.
const SYSTEM_PROMPT_BASE =
  'You are a reading assistant. The user just scrolled past a passage of an ' +
  'article too fast to read it. Given ONLY that passage, write 2 to 4 recap ' +
  'points. Put each point on its own line. Each point is ONE short, ' +
  'self-contained sentence stating concrete content (claims, numbers, names, ' +
  'steps) — never a description like "this section discusses". Do not number ' +
  'or bullet the lines yourself. ';

/* The recap prompt above is deliberately fenced in: "given ONLY that passage"
   stops the model decorating a summary with things the article never said,
   which in a recap is simply a lie about what you scrolled past.

   Feynman mode inverts that on purpose. The reason a passage doesn't land is
   usually a term it names without defining — a recap of a page about the
   Toulmin Model can say "the passage refers to the Toulmin Model" three times
   and never tell you what one is, because the page never said. Re-stating that
   in plainer words changes nothing. So here the passage sets the subject and
   the model is allowed to supply what the passage assumed you knew.

   That is a real trade: this output can be wrong in ways a recap cannot, since
   it is no longer bounded by the text on screen. It is a fair trade only
   because the reader pressed a button asking to have something explained,
   rather than being handed it unasked. */
const FEYNMAN_PROMPT_BASE =
  'The reader skimmed the passage below and did not follow it. Explain what it ' +
  'is actually saying, in plain words, in 2 to 3 short paragraphs. Put each ' +
  'paragraph on its own line. The passage sets the subject, but you are not ' +
  'limited to it: where it names a term without explaining it, explain the term ' +
  'yourself, in the same sentence you first use it. Use an everyday comparison ' +
  'only where one genuinely fits — never force one. Never write "in simple ' +
  'terms", "think of it like", "essentially", or "at its core". ';

const SYSTEM_PROMPT_TAIL = 'No preamble, no closing remarks, nothing but the points.';

const FEYNMAN_PROMPT_TAIL = 'No preamble, no closing remarks, no heading.';

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/* Gemma is multilingual, so a reader who wants English recaps of Japanese
   pages gets them in one pass — asking the model to write in the target
   language beats summarising in the source and translating afterwards,
   which stacks the translator's errors on top of the summary's.

   Saying it once in the preface isn't enough: left to itself the model
   mirrors the language of the passage, and a system instruction sitting
   thousands of tokens before the text loses to that pull. So the rule is
   stated in the preface AND repeated straight after the passage — the last
   thing read before generation starts — and phrased as a prohibition, not
   just a preference. */
export function systemPrompt(mode: SummaryMode, targetLang: string): string {
  const feynman = mode === 'feynman';
  const unit = feynman ? 'paragraphs' : 'points';
  const languageRule = targetLang
    ? `Always write in ${languageName(targetLang)}. The passage may be in a ` +
      `different language; that does not matter — the ${unit} are still ` +
      `written in ${languageName(targetLang)}. `
    : 'Reply in the same language as the passage. ';
  return feynman
    ? FEYNMAN_PROMPT_BASE + languageRule + FEYNMAN_PROMPT_TAIL
    : SYSTEM_PROMPT_BASE + languageRule + SYSTEM_PROMPT_TAIL;
}

export function userMessage(text: string, mode: SummaryMode, targetLang: string): string {
  if (!targetLang) return text;
  const name = languageName(targetLang);
  const verb = mode === 'feynman' ? 'Explain' : 'Recap';
  return `${text}\n\n---\n${verb} the passage above in ${name}. Write in ${name} only, even though the passage is not in ${name}.`;
}
