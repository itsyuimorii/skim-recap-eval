// The corpus the two backends are compared on.
//
// Passages are literal constants, never fetched. A comparison anyone else can
// re-run — including the Chrome team — cannot depend on a page still being up,
// still being outside a paywall, and still laid out the way it was.
//
// Capture them through the real pipeline rather than copying prose out of an
// article by hand: flick past a passage on the source page, then read
// `__skimRecapLastPayload.text` from the isolated world. Extraction is most of
// what this extension does, so a hand-picked passage would be measuring a
// corpus the product never actually produces.

import type { SummaryMode } from './messages';

export interface Fixture {
  id: string;
  title: string;
  /** Why this passage is in the corpus. Rendered beside the outputs, so
   *  whoever is judging has the rubric on screen. */
  hypothesis: string;
  category: 'bounded' | 'undefined-term' | 'multilingual' | 'context' | 'degenerate';
  /** BCP-47 of the passage itself. */
  lang: string;
  /** '' means "follow the passage", which is what the popup's 'off' produces. */
  targetLang: string;
  modes: SummaryMode[];
  /** Part of the short subset that can be run live in a meeting. */
  demo?: boolean;
  /** Named by the passage, never defined by it. The feynman rubric. */
  undefinedTerms?: string[];
  /** Facts a correct feynman answer has to supply that the passage never
   *  states. A correct recap must NOT contain these. */
  requiresWorldKnowledge?: string[];
  source: { url: string; capturedAt: string; extensionVersion: string; note?: string };
  text: string;
}

/* Every entry is captured from a real page through the real extraction path;
   nothing here is written by hand to make a point. Promoted from the capture
   list in eval.html once a passage has earned a place — the hypothesis field
   is the deciding question, not the text. */
export const FIXTURES: Fixture[] = [];

export const demoFixtures = () => FIXTURES.filter((f) => f.demo);

/** What content.ts stores after each real flick. */
export interface Capture {
  id: string;
  url: string;
  pageTitle: string;
  heading: string;
  lang: string;
  skippedPx: number;
  chars: number;
  capturedAt: string;
  text: string;
}

/* The page also has to run outside the extension — served over http it can
   render an exported result for a writeup, and there is no chrome.* there. */
const inExtension = () =>
  typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.runtime?.id;

export const extensionVersion = () =>
  inExtension() ? chrome.runtime.getManifest().version : 'n/a';

export function loadCaptures(): Promise<Capture[]> {
  if (!inExtension()) return Promise.resolve([]);
  return new Promise((resolve) => {
    chrome.storage.local.get('skimRecapCaptures', (res) => {
      resolve(Array.isArray(res.skimRecapCaptures) ? (res.skimRecapCaptures as Capture[]) : []);
    });
  });
}

export const clearCaptures = () => {
  if (inExtension()) chrome.storage.local.remove('skimRecapCaptures');
};

/** Lets a capture be compared immediately, before anyone has decided what it
 *  is for. Runs both modes, since which one discriminates is the question. */
export function captureAsFixture(c: Capture): Fixture {
  return {
    id: c.id,
    title: c.heading || c.pageTitle || c.url,
    hypothesis: '(unclassified capture)',
    category: 'bounded',
    lang: c.lang || 'en',
    targetLang: '',
    modes: ['recap', 'feynman'],
    source: { url: c.url, capturedAt: c.capturedAt, extensionVersion: '' },
    text: c.text,
  };
}

/** Emits a paste-ready `src/fixtures.ts` entry, so a capture worth keeping
 *  becomes a permanent, reviewable part of the corpus rather than living in
 *  browser storage. */
export function captureToSource(c: Capture, version: string): string {
  const esc = (s: string) => JSON.stringify(s);
  return `  {
    id: ${esc(c.id)},
    title: ${esc(c.heading || c.pageTitle)},
    hypothesis: 'TODO — what does this passage decide?',
    category: 'undefined-term',
    lang: ${esc(c.lang || 'en')},
    targetLang: '',
    modes: ['recap', 'feynman'],
    undefinedTerms: [],
    requiresWorldKnowledge: [],
    source: {
      url: ${esc(c.url)},
      capturedAt: ${esc(c.capturedAt)},
      extensionVersion: ${esc(version)},
    },
    text: ${esc(c.text)},
  },`;
}
