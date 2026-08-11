// Shared message shapes passed between content script, background service
// worker, offscreen document, and the toolbar popup.

export const PORT_NAME = 'skim-recap';

/** `recap` states what the passage said. `feynman` explains it to someone who
 *  did not follow it — and, unlike a recap, is allowed to bring in knowledge
 *  the passage itself never supplied. See the prompts in offscreen.ts. */
export type SummaryMode = 'recap' | 'feynman';

export interface SummarizeRequest {
  type: 'SUMMARIZE';
  requestId: string;
  text: string;
  skippedPx: number;
  /** BCP-47 code to write the recap in, or '' to follow the passage. */
  targetLang: string;
  mode: SummaryMode;
}

/** Fired when the reader presses Translate on a finished recap. Kept separate
 *  from SUMMARIZE so Gemma's output appears at full speed and translation is
 *  something the reader opts into, per recap. */
export interface TranslateRequest {
  type: 'TRANSLATE';
  points: string[];
  /** BCP-47 code, e.g. 'zh'. */
  targetLang: string;
  /** The page's own <html lang>, used if Chrome's detector isn't ready. */
  sourceHint: string;
}

export interface CancelRequest {
  type: 'CANCEL';
  requestId: string;
}

export interface PreloadModelRequest {
  type: 'PRELOAD_MODEL';
}

export interface GetStatusRequest {
  type: 'GET_STATUS';
}

export type ToBackgroundMessage = PreloadModelRequest | GetStatusRequest;
export type PortMessage = SummarizeRequest | CancelRequest;

export interface SummaryChunkMessage {
  type: 'SUMMARY_CHUNK';
  requestId: string;
  chunk: string;
}

export interface SummaryDoneMessage {
  type: 'SUMMARY_DONE';
  requestId: string;
}

export interface SummaryErrorMessage {
  type: 'SUMMARY_ERROR';
  requestId: string;
  message: string;
}

export interface ModelProgressMessage {
  type: 'MODEL_PROGRESS';
  text: string;
  ratio?: number;
}

export interface ModelReadyMessage {
  type: 'MODEL_READY';
}

export interface ModelErrorMessage {
  type: 'MODEL_ERROR';
  message: string;
}

export type FromOffscreenMessage =
  | SummaryChunkMessage
  | SummaryDoneMessage
  | SummaryErrorMessage
  | ModelProgressMessage
  | ModelReadyMessage
  | ModelErrorMessage;

// Sent from background down a tab's port.
export type ToContentMessage = FromOffscreenMessage;

/** How the recap body renders. Purely a display choice — the model is
 *  always asked for one short point per line, so switching re-renders what
 *  is already there instead of regenerating. */
export type Layout = 'focus' | 'smart';

export const STORAGE_KEYS = {
  enabled: 'skimRecapEnabled',
  thresholdPx: 'skimRecapThresholdPx',
  layout: 'skimRecapLayout',
  translateTo: 'skimRecapTranslateTo',
} as const;

export const DEFAULT_THRESHOLD_PX = 1200;

/** The language the recap itself is written in. 'off' = follow whatever the
 *  page is in; 'auto' = the browser UI language; anything else is a literal
 *  BCP-47 code. */
export const DEFAULT_TRANSLATE_TO = 'auto';

/** Resolves the stored setting to the code the Translator API wants.
 *  Region subtags are dropped ('zh-CN' -> 'zh'); the API keys models on the
 *  base language, apart from 'zh-Hant', which the user can pick explicitly. */
export function resolveTargetLang(setting: string): string {
  if (!setting || setting === 'off') return '';
  if (setting !== 'auto') return setting;
  const ui =
    (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) || navigator.language || '';
  return ui.startsWith('zh-Hant') ? 'zh-Hant' : ui.split('-')[0];
}
