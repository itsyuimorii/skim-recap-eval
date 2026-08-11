// Minimal ambient declarations for the Chrome built-in AI APIs we use.
// @types/chrome doesn't ship these yet. Only the surface actually called
// here is declared — deliberately not a full typing of the spec.

type AIAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageDetectionResult {
  detectedLanguage: string;
  confidence: number;
}

interface ChromeLanguageDetector {
  detect(text: string): Promise<LanguageDetectionResult[]>;
  destroy(): void;
}

declare const LanguageDetector: {
  availability(): Promise<AIAvailability>;
  create(): Promise<ChromeLanguageDetector>;
};

interface ChromeTranslator {
  translate(input: string): Promise<string>;
  destroy(): void;
}

interface TranslatorPair {
  sourceLanguage: string;
  targetLanguage: string;
}

declare const Translator: {
  availability(pair: TranslatorPair): Promise<AIAvailability>;
  create(pair: TranslatorPair): Promise<ChromeTranslator>;
};

/* The Prompt API. Chrome's docs list en, ja, es, de and fr as the accepted
   `languages` values; anything else rejects with a NotSupportedError. That is a
   runtime capability limit rather than a type-level one, so `string` here is
   deliberate. */
interface LanguageModelExpectation {
  type: 'text' | 'image' | 'audio';
  languages?: string[];
}

interface LanguageModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  prefix?: boolean;
}

interface LanguageModelCreateOptions {
  initialPrompts?: LanguageModelMessage[];
  expectedInputs?: LanguageModelExpectation[];
  expectedOutputs?: LanguageModelExpectation[];
  temperature?: number;
  topK?: number;
  signal?: AbortSignal;
  monitor?: (m: EventTarget) => void;
}

interface LanguageModelParams {
  defaultTopK: number;
  maxTopK: number;
  defaultTemperature: number;
  maxTemperature: number;
}

interface ChromeLanguageModelSession {
  promptStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
  measureInputUsage(input: string): Promise<number>;
  destroy(): void;
  /* Renamed across Chrome versions (inputQuota/inputUsage vs maxTokens/
     tokensSoFar); read whichever this build exposes rather than assuming. */
  readonly contextWindow?: number;
  readonly inputQuota?: number;
  readonly inputUsage?: number;
  readonly maxTokens?: number;
  readonly tokensSoFar?: number;
}

declare const LanguageModel: {
  availability(options?: LanguageModelCreateOptions): Promise<AIAvailability>;
  params(): Promise<LanguageModelParams>;
  create(options?: LanguageModelCreateOptions): Promise<ChromeLanguageModelSession>;
};
