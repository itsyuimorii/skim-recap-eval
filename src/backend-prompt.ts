// Chrome's built-in Prompt API as a second backend, for comparison only.
//
// Not shipped and not reachable from the extension UI: offscreen.ts hardcodes
// LiteRT. This exists so eval.ts can put the two side by side.
//
// Written to the same shape as the Translator/LanguageDetector integrations
// already in offscreen.ts — `'X' in self`, then `availability()`, then degrade
// rather than throw.

import {
  BackendError,
  classifyError,
  type Availability,
  type LlmBackend,
  type LlmSession,
  type ProgressFn,
} from './backend';

/* The five Chrome accepts. Declaring anything else rejects the whole session
   with NotSupportedError — and the restriction applies to `expectedInputs`,
   not just `expectedOutputs`.

   That distinction matters more than it first looks. Skim Recap does not
   choose what language a page is in; the reader opens whatever they were
   going to read. Declaring `zh` here is only saying "a Chinese page might
   turn up", which is true of any reading tool, and it is enough to make every
   session fail — including one that only ever wanted an English recap out.
   So the practical ceiling is not "no Chinese output", it is "no Chinese
   input either", i.e. the extension would have to stop working on Chinese and
   Korean pages entirely rather than degrade on them. */
const EXPECTED_INPUT_LANGS = ['en', 'ja', 'es', 'de', 'fr'];

/** Detects whether `promptStreaming` is handing back deltas or the whole
 *  string so far. Chrome has shipped both; which one this build does is itself
 *  a finding, so it is measured rather than assumed. */
export type StreamSemantics = 'delta' | 'cumulative' | 'unknown';

let observedSemantics: StreamSemantics = 'unknown';
export const getObservedStreamSemantics = () => observedSemantics;

class PromptApiSession implements LlmSession {
  constructor(private readonly session: ChromeLanguageModelSession) {}

  async *stream(userText: string, signal?: AbortSignal): AsyncIterable<string> {
    /* Ask first rather than only catching the throw. The throw tells you that
       it didn't fit; the measurement tells you by how much, and a chars-per-
       token figure is the thing worth putting in front of the Chrome team. */
    let needed: number | null = null;
    try {
      needed = await this.session.measureInputUsage(userText);
    } catch {
      // measureInputUsage is newer than the rest of the API; absence is not a
      // failure, it just means no pre-check.
    }
    const quota = this.session.inputQuota ?? this.session.maxTokens ?? null;
    const used = this.session.inputUsage ?? this.session.tokensSoFar ?? 0;
    if (needed !== null && quota !== null && needed > quota - used) {
      throw new BackendError(
        `Input needs ${needed} tokens, ${quota - used} available of ${quota}.`,
        'quota'
      );
    }

    try {
      let seen = '';
      for await (const chunk of this.session.promptStreaming(userText, { signal })) {
        let delta: string;
        if (seen && chunk.startsWith(seen)) {
          delta = chunk.slice(seen.length);
          seen = chunk;
          observedSemantics = 'cumulative';
        } else {
          delta = chunk;
          seen += chunk;
          if (observedSemantics === 'unknown' && seen.length > chunk.length) {
            observedSemantics = 'delta';
          }
        }
        if (delta) yield delta;
      }
    } catch (err) {
      throw classifyError(err);
    }
  }

  async close(): Promise<void> {
    try {
      this.session.destroy();
    } catch {
      // already gone
    }
  }
}

class PromptApiBackend implements LlmBackend {
  readonly id = 'prompt-api' as const;
  readonly label = 'Chrome Prompt API';

  async availability(): Promise<Availability> {
    if (!('LanguageModel' in self)) return 'unavailable';
    try {
      return await LanguageModel.availability();
    } catch {
      return 'unavailable';
    }
  }

  async load(onProgress: ProgressFn): Promise<void> {
    const state = await this.availability();
    if (state === 'unavailable') {
      throw new BackendError(
        "The Prompt API isn't available in this context or on this device.",
        'unavailable'
      );
    }
    if (state === 'available') {
      onProgress('Ready.', 1);
      return;
    }
    /* 'downloadable' | 'downloading' — create() is what performs the download,
       and the monitor callback is the only progress signal offered. */
    onProgress('Downloading the built-in model…', 0);
    const warm = await LanguageModel.create({
      monitor: (m) =>
        m.addEventListener('downloadprogress', (e) => {
          const loaded = (e as ProgressEvent).loaded ?? 0;
          onProgress(`Downloading the built-in model… ${(loaded * 100).toFixed(0)}%`, loaded);
        }),
    });
    warm.destroy();
    onProgress('Ready.', 1);
  }

  async createSession(system: string, targetLang: string): Promise<LlmSession> {
    try {
      const session = await LanguageModel.create({
        initialPrompts: [{ role: 'system', content: system }],
        expectedInputs: [{ type: 'text', languages: EXPECTED_INPUT_LANGS }],
        expectedOutputs: [{ type: 'text', languages: [targetLang || 'en'] }],
        /* Greedy, to match what LiteRT-LM happens to do by default. Left at
           the API's own defaults (temperature 1, topK 64) the same passage
           gives a different recap every time, and it is not possible to tell
           whether that — or the extra verbosity that comes with it — is a
           property of the model or only of the sampler. Chrome exposes these
           two to extensions and not to the web, so this is a comparison an
           extension can actually make.

           Both must be given together or neither: Chrome rejects a session
           that specifies only one. */
        temperature: 0,
        topK: 1,
      });
      return new PromptApiSession(session);
    } catch (err) {
      // A NotSupportedError here means the model won't write that language at
      // all — classifyError tags it 'language' so it is counted as a capability
      // limit rather than lumped in with crashes.
      throw classifyError(err);
    }
  }

  async describe(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {
      present: 'LanguageModel' in self,
      streamSemantics: observedSemantics,
      // What we actually ask for, as opposed to params() below, which reports
      // what the API would use if we asked for nothing.
      sessionSampling: { temperature: 0, topK: 1 },
    };
    if (!out.present) return out;
    try {
      // Same prototype-getter problem as GPUAdapterInfo: read the fields by
      // name rather than trusting the object to serialise.
      const p = await LanguageModel.params();
      out.params = p
        ? {
            defaultTopK: p.defaultTopK,
            maxTopK: p.maxTopK,
            defaultTemperature: p.defaultTemperature,
            maxTemperature: p.maxTemperature,
          }
        : null;
    } catch (err) {
      out.params = `unavailable: ${(err as Error).message}`;
    }
    try {
      const s = await LanguageModel.create({
        initialPrompts: [{ role: 'system', content: 'Reply in one word.' }],
      });
      out.contextWindow = s.contextWindow ?? null;
      out.inputQuota = s.inputQuota ?? s.maxTokens ?? null;
      s.destroy();
    } catch (err) {
      out.contextWindow = `unavailable: ${(err as Error).message}`;
    }
    /* Which of Skim Recap's languages this API will accept, tested separately
       as output and as input. Recorded per language rather than as a boolean,
       because the DOMException name is the evidence — and separately for the
       two directions, because a reading tool controls its output language but
       never its input language. */
    const probe = async (opts: LanguageModelCreateOptions) => {
      try {
        const s = await LanguageModel.create({
          initialPrompts: [{ role: 'system', content: 'Reply in one word.' }],
          ...opts,
        });
        s.destroy();
        return 'ok';
      } catch (err) {
        return err instanceof Error ? err.name : String(err);
      }
    };
    const outputLanguages: Record<string, string> = {};
    const inputLanguages: Record<string, string> = {};
    for (const lang of ['en', 'ja', 'es', 'de', 'fr', 'zh', 'zh-Hant', 'ko']) {
      outputLanguages[lang] = await probe({ expectedOutputs: [{ type: 'text', languages: [lang] }] });
      inputLanguages[lang] = await probe({
        expectedInputs: [{ type: 'text', languages: [lang] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      });
    }
    out.outputLanguages = outputLanguages;
    out.inputLanguages = inputLanguages;
    return out;
  }
}

export const promptApiBackend: LlmBackend = new PromptApiBackend();
