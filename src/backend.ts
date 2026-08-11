// The contract a text-generation backend has to satisfy for this extension.
//
// Deliberately tiny. The LiteRT-LM integration only ever touches four things —
// create an engine, open a conversation with a system preface, stream one
// reply, dispose — so that is the whole interface. Anything wider would be
// speculation about a second backend we have not measured yet.
//
// Chrome's Prompt API lines up almost exactly:
//
//   Engine.create({ model })                    ->  LanguageModel.availability()
//   engine.createConversation({ preface })      ->  LanguageModel.create({ initialPrompts })
//   conversation.sendMessageStreaming(text)     ->  session.promptStreaming(text)
//   conversation.delete()                       ->  session.destroy()

export type BackendId = 'litert' | 'prompt-api';

/** The same four words Chrome's built-in AI APIs use (`Translator`,
 *  `LanguageDetector`), so the whole codebase speaks one availability
 *  language. LiteRT maps onto it: no WebGPU is `unavailable`, a cached model
 *  blob is `available`, otherwise `downloadable`. */
export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

export type ProgressFn = (text: string, ratio?: number) => void;

/** One generation's worth of state — a LiteRT `Conversation`, or a Prompt API
 *  `LanguageModel` session. Always short-lived: each passage is unrelated to
 *  the next, and leaking history between them would bleed one article's
 *  context into another's recap. */
export interface LlmSession {
  /** Plain-text deltas, never `''`. Normalising the two backends' differing
   *  chunk shapes is the implementation's job, not the caller's. */
  stream(userText: string, signal?: AbortSignal): AsyncIterable<string>;
  close(): Promise<void>;
}

export interface LlmBackend {
  readonly id: BackendId;
  readonly label: string;

  availability(): Promise<Availability>;

  /** Idempotent and memoised. Everything slow and one-time belongs here, so it
   *  can never land inside a time-to-first-token measurement. */
  load(onProgress: ProgressFn): Promise<void>;

  createSession(system: string, targetLang: string): Promise<LlmSession>;

  /** Free-form, recorded verbatim into the eval JSON: effective sampling
   *  parameters, quotas, adapter info. Never load-bearing for behaviour — it
   *  exists so the numbers in a comparison can be interpreted afterwards. */
  describe(): Promise<Record<string, unknown>>;
}

/** Separates "the model declined, or ran out of room" from "the code broke",
 *  so an evaluation can count those separately instead of lumping both under
 *  a generic error. Which kind a given passage produces is itself a result. */
export class BackendError extends Error {
  constructor(
    message: string,
    readonly kind: 'unavailable' | 'quota' | 'language' | 'aborted' | 'runtime',
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

/** Classifies what a backend threw. `NotSupportedError` is the interesting one:
 *  Chrome raises it when asked for a language the built-in model will not
 *  emit, which is a capability limit rather than a fault. */
export function classifyError(err: unknown): BackendError {
  if (err instanceof BackendError) return err;
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  if (name === 'NotSupportedError') return new BackendError(message, 'language', err);
  if (name === 'QuotaExceededError') return new BackendError(message, 'quota', err);
  if (name === 'AbortError') return new BackendError(message, 'aborted', err);
  return new BackendError(message, 'runtime', err);
}
