/* Prompt API availability probe — stage 0.
 *
 * Paste the whole thing into a DevTools console, once per context. In one run
 * it answers:
 *
 *   1. Is it actually usable in this context     ('LanguageModel' in self`
 *                                                  returning true doesn't count —
 *                                                  the binding can exist and
 *                                                  create() can still reject, so
 *                                                  this runs all the way to
 *                                                  promptStreaming)
 *   2. contextWindow / inputQuota                 Skim Recap's input is always
 *                                                  <=4000 chars (PROMPT_CHAR_BUDGET)
 *                                                  — does that fit
 *   3. Cumulative or delta streaming               promptStreaming has shipped
 *                                                  both semantics across Chrome
 *                                                  versions; don't assume
 *   4. Tokens for 4000 characters                  a char->token ratio worth
 *                                                  putting in front of the
 *                                                  Chrome team
 *   5. Can ja / zh / ko be declared as output      docs say only en/ja/es/de/fr
 *                                                  are accepted. ja should be
 *                                                  fine; zh and ko should throw
 *                                                  NotSupportedError — worth
 *                                                  confirming once rather than
 *                                                  asserting it from memory
 *
 * Three contexts, one screenshot each:
 *
 *   A. Offscreen document      Popup -> Preload creates it, then
 *                               chrome://extensions -> Skim Recap ->
 *                               "Inspect views: offscreen.html"
 *                               Answers: can the existing architecture just
 *                               swap backends
 *
 *   B. Popup extension page    Right-click the extension icon -> Inspect popup
 *                               Answers: can the eval page run at all
 *                               (expected: yes)
 *
 *   C. Content-script isolated  Any page, open DevTools -> the JS-context
 *      world                    dropdown top-left of the console -> switch
 *                               from "top" to "Skim Recap"
 *                               Answers: can offscreen be skipped entirely —
 *                               if so, inference could run directly on the
 *                               page and stream straight into the card, and
 *                               the whole background/offscreen relay goes away
 */

(async () => {
  const R = { context: location.href, present: 'LanguageModel' in self };

  if (!R.present) {
    console.log('%c✗ No LanguageModel in this context', 'color:#c00;font-weight:bold');
    console.log(JSON.stringify(R, null, 2));
    return R;
  }

  try { R.availability = await LanguageModel.availability(); }
  catch (e) { R.availability = `${e.name}: ${e.message}`; }

  try { R.params = await LanguageModel.params(); }
  catch (e) { R.params = `${e.name}: ${e.message}`; }

  // Context window, streaming semantics, and char->token ratio, all from one session.
  try {
    const s = await LanguageModel.create({
      initialPrompts: [{ role: 'system', content: 'Reply in one short sentence.' }],
    });
    R.contextWindow = s.contextWindow ?? null;
    R.inputQuota = s.inputQuota ?? s.maxTokens ?? null;
    R.inputUsage = s.inputUsage ?? s.tokensSoFar ?? null;

    const chunks = [];
    for await (const c of s.promptStreaming('Say hello.')) chunks.push(c);
    R.chunkCount = chunks.length;
    R.firstChunks = chunks.slice(0, 3);
    // If chunk 2 starts with chunk 1, each chunk is the full text so far, not a delta.
    R.streamSemantics =
      chunks.length > 1 && chunks[1].startsWith(chunks[0])
        ? 'cumulative'
        : 'delta';

    // The order of magnitude Skim Recap actually sends.
    R.tokensFor4000Chars = await s.measureInputUsage('x '.repeat(2000));
    s.destroy();
  } catch (e) {
    R.createError = `${e.name}: ${e.message}`;
  }

  // Language support. ja is the control; zh/ko are the ones to confirm.
  R.languages = {};
  for (const lang of ['ja', 'zh', 'ko', 'zh-Hant']) {
    try {
      const s = await LanguageModel.create({
        initialPrompts: [{ role: 'system', content: 'Reply in one word.' }],
        expectedOutputs: [{ type: 'text', languages: [lang] }],
      });
      R.languages[lang] = 'OK';
      s.destroy();
    } catch (e) {
      R.languages[lang] = e.name;
    }
  }

  console.log('%c── Prompt API probe results ──', 'font-weight:bold');
  console.log(JSON.stringify(R, null, 2));
  return R;
})();
