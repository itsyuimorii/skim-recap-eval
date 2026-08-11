// Side-by-side comparison of the two backends, run as an ordinary extension
// page so it can be opened in front of people.
//
// Not part of the product: build.js only emits this when EVAL=1, and
// offscreen.ts never imports it.
//
// It deliberately does not go through the background/offscreen message
// protocol. Both backends are instantiated here, in this page, which keeps the
// shipped path untouched and removes the question of whether the Prompt API
// works in an offscreen document from the critical path — a top-level
// extension page is a context Chrome documents as supported, and WebGPU (what
// LiteRT needs) is available in any document.

import { classifyError, type BackendId, type LlmBackend } from './backend';
import { litertBackend } from './backend-litert';
import { getObservedStreamSemantics, promptApiBackend } from './backend-prompt';
import {
  FIXTURES,
  captureAsFixture,
  captureToSource,
  clearCaptures,
  demoFixtures,
  extensionVersion,
  loadCaptures,
  type Capture,
  type Fixture,
} from './fixtures';
import type { SummaryMode } from './messages';
import { MAX_INPUT_CHARS, systemPrompt, userMessage } from './prompts';

const BACKENDS: LlmBackend[] = [litertBackend, promptApiBackend];

interface RunRecord {
  fixtureId: string;
  backend: BackendId;
  mode: SummaryMode;
  targetLang: string;
  /** 1-based. Anything above 1 exists to test whether the same passage gives
   *  the same answer twice — a claim the changelog makes about LiteRT. */
  repeat: number;
  ok: boolean;
  /** null when it failed before producing anything. */
  ttftMs: number | null;
  totalMs: number;
  chunkCount: number;
  outputChars: number;
  outputLines: number;
  text: string;
  error?: { name: string; kind: string; message: string };
  startedAt: string;
}

interface EvalRun {
  schemaVersion: 1;
  env: Record<string, unknown>;
  /* The passages travel with the results. Without them an export can only be
     read back on the machine that produced it — fixture ids mean nothing on
     their own — which defeats the point of exporting. */
  fixtures: Fixture[];
  startedAt: string;
  finishedAt: string;
  runs: RunRecord[];
}

let current: EvalRun | null = null;
let abort: AbortController | null = null;
/** Set once a file has been rendered, so the background probe of this machine
 *  cannot overwrite the environment the results were actually produced on. */
let showingLoaded = false;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const el = (tag: string, cls?: string, text?: string) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

// ---- environment ----

async function collectEnv(): Promise<Record<string, unknown>> {
  const env: Record<string, unknown> = {
    userAgent: navigator.userAgent,
    extensionVersion: extensionVersion(),
    capturedAt: new Date().toISOString(),
    /* Filled in by hand from the probe: whether the Prompt API is reachable
       from the contexts the product actually runs in. The eval page itself is
       a top-level extension page, so it proves nothing about those. */
    promptApiContexts: { offscreen: 'untested', contentScript: 'untested' },
  };
  /* Rendered as each backend answers rather than after all of them, because
     the Prompt API's describe() opens one session per language to find out
     which are accepted, and that is several seconds of nothing on screen. */
  for (const b of BACKENDS) {
    env[b.id] = { label: b.label, availability: 'checking…', describe: null };
    if (!showingLoaded) renderEnv(env);
    env[b.id] = {
      label: b.label,
      availability: await b.availability().catch((e) => `error: ${e.message}`),
      describe: await b.describe().catch((e) => ({ error: e.message })),
    };
    if (!showingLoaded) renderEnv(env);
  }
  return env;
}

function renderEnv(env: Record<string, unknown>) {
  const box = $('#env');
  box.textContent = '';
  const grid = el('div', 'envgrid');
  const add = (k: string, v: unknown) => {
    grid.appendChild(el('div', 'k', k));
    grid.appendChild(
      el('div', 'v', typeof v === 'string' ? v : JSON.stringify(v, null, 1))
    );
  };
  add('Chrome', String(env.userAgent).match(/Chrome\/[\d.]+/)?.[0] ?? '—');
  add('Extension', String(env.extensionVersion));
  for (const b of BACKENDS) {
    const info = env[b.id] as { availability?: string; describe?: Record<string, unknown> };
    add(b.label, info?.availability ?? '—');
    const desc = info?.describe;
    if (!desc) continue;

    /* Which of Skim Recap's eight output languages this backend will actually
       write gets its own row. Buried in a JSON blob it reads as one field
       among many; it is the single clearest difference between the two. */
    for (const [key, label] of [
      ['outputLanguages', 'output languages'],
      ['inputLanguages', 'input languages (page)'],
    ] as const) {
      const langs = desc[key] as Record<string, string> | undefined;
      if (!langs) continue;
      grid.appendChild(el('div', 'k', label));
      const chips = el('div', 'chips');
      for (const [lang, verdict] of Object.entries(langs)) {
        const chip = el('span', verdict === 'ok' ? 'chip ok' : 'chip no');
        chip.textContent = verdict === 'ok' ? lang : `${lang} · ${verdict}`;
        chips.appendChild(chip);
      }
      grid.appendChild(chips);
    }
    const rest = { ...desc };
    delete rest.outputLanguages;
    delete rest.inputLanguages;
    add(`${b.id} · detail`, rest);
  }
  box.appendChild(grid);
}

// ---- running ----

/** Every cell in the matrix. Backend is innermost *here*, but `runAll` wraps
 *  each cell in a repeat loop, so the order actually executed is
 *
 *      fixture → mode → backend → repeat
 *
 *  and within every cell both LiteRT runs happen before both Prompt API runs.
 *  That is a systematic position effect, not the interleaving this comment
 *  used to claim: on a machine that heats up, LiteRT always gets the cheaper
 *  slots. Anything comparing latency across backends has to say so — see
 *  eval/findings.md §16, which reports the same comparison under three
 *  different pairings for exactly this reason.
 *
 *  Moving the repeat loop out to here would fix it, at the cost of making a
 *  partial run less useful to watch. Left as is, and documented instead. */
function* plan(fixtures: Fixture[]) {
  for (const f of fixtures) {
    for (const mode of f.modes) {
      for (const b of BACKENDS) yield { fixture: f, mode, backend: b };
    }
  }
}

async function runOne(
  fixture: Fixture,
  mode: SummaryMode,
  backend: LlmBackend,
  sink: (chunk: string) => void,
  repeat = 1
): Promise<RunRecord> {
  const rec: RunRecord = {
    fixtureId: fixture.id,
    backend: backend.id,
    mode,
    targetLang: fixture.targetLang,
    repeat,
    ok: false,
    ttftMs: null,
    totalMs: 0,
    chunkCount: 0,
    outputChars: 0,
    outputLines: 0,
    text: '',
    startedAt: new Date().toISOString(),
  };

  let session;
  const t0 = performance.now();
  try {
    session = await backend.createSession(systemPrompt(mode, fixture.targetLang), fixture.targetLang);
    const input = userMessage(fixture.text.slice(0, MAX_INPUT_CHARS), mode, fixture.targetLang);
    for await (const chunk of session.stream(input, abort?.signal)) {
      if (rec.ttftMs === null) rec.ttftMs = Math.round(performance.now() - t0);
      rec.chunkCount++;
      rec.text += chunk;
      sink(chunk);
    }
    rec.ok = true;
  } catch (err) {
    const be = classifyError(err);
    rec.error = { name: be.name, kind: be.kind, message: be.message };
  } finally {
    rec.totalMs = Math.round(performance.now() - t0);
    rec.outputChars = rec.text.length;
    rec.outputLines = rec.text.split('\n').filter((l) => l.trim()).length;
    if (session) await session.close();
  }
  return rec;
}

async function run(fixtures: Fixture[]) {
  if (!fixtures.length) {
    setStatus('No fixtures yet — capture some passages first.');
    return;
  }
  abort = new AbortController();
  setBusy(true);

  const env = await collectEnv();
  renderEnv(env);
  current = {
    schemaVersion: 1,
    env,
    fixtures,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    runs: [],
  };

  const cells = [...plan(fixtures)];
  renderGrid(fixtures);

  /* One discarded generation per backend. The first call carries prefill and
     graph warm-up, and including it would make LiteRT look slower than a user
     ever experiences. */
  for (const b of BACKENDS) {
    if ((await b.availability()) === 'unavailable') continue;
    setStatus(`Warming up ${b.label}…`);
    try {
      await b.load((t) => setStatus(`${b.label}: ${t}`));
      await runOne(fixtures[0], 'recap', b, () => {});
    } catch {
      // a warm-up failure is not a result; the real runs will record it
    }
  }

  const repeats = Number($<HTMLSelectElement>('#repeats').value) || 1;
  let done = 0;
  for (const { fixture, mode, backend } of cells) {
    if (abort.signal.aborted) break;
    const cell = $(`#cell-${fixture.id}-${mode}-${backend.id}`);
    cell.textContent = '';
    const texts: string[] = [];
    for (let r = 1; r <= repeats; r++) {
      if (abort.signal.aborted) break;
      setStatus(
        `${++done}/${cells.length * repeats} · ${fixture.title} · ${mode} · ${backend.label}` +
          (repeats > 1 ? ` · run ${r}` : '')
      );
      if (repeats > 1) cell.appendChild(el('div', 'runlabel', `run ${r}`));
      const body = el('div', 'out');
      cell.appendChild(body);
      const rec = await runOne(
        fixture,
        mode,
        backend,
        (c) => {
          body.textContent += c;
        },
        r
      );
      current.runs.push(rec);
      texts.push(rec.text);
      paintCell(cell, rec);
    }
    /* The changelog claims a passage yields the same recap every time. This is
       where that either holds or does not. */
    if (texts.length > 1) {
      const same = texts.every((t) => t === texts[0]);
      const verdict = el('div', same ? 'verdict same' : 'verdict differs');
      verdict.textContent = same ? 'identical across runs' : 'differs across runs';
      cell.appendChild(verdict);
    }
  }

  current.finishedAt = new Date().toISOString();
  (current.env as Record<string, unknown>).streamSemantics = {
    'prompt-api': getObservedStreamSemantics(),
  };
  setStatus(abort.signal.aborted ? 'Stopped.' : `Done — ${current.runs.length} runs.`);
  setBusy(false);
}

// ---- rendering ----

function renderGrid(fixtures: Fixture[]) {
  const grid = $('#grid');
  grid.textContent = '';
  for (const f of fixtures) {
    for (const mode of f.modes) {
      const row = el('section', 'row');
      const head = el('div', 'rowhead');
      head.appendChild(el('span', 'title', f.title));
      head.appendChild(el('span', 'mode', mode));
      head.appendChild(
        el('span', 'lang', f.targetLang ? `→ ${f.targetLang}` : '→ page language')
      );
      head.appendChild(el('span', 'hyp', f.hypothesis));
      if (f.undefinedTerms?.length) {
        head.appendChild(el('span', 'terms', `undefined: ${f.undefinedTerms.join(', ')}`));
      }
      row.appendChild(head);

      const cols = el('div', 'cols');
      for (const b of BACKENDS) {
        const col = el('div', 'col');
        col.appendChild(el('div', 'collabel', b.label));
        const cell = el('div', 'cell');
        cell.id = `cell-${f.id}-${mode}-${b.id}`;
        cell.appendChild(el('div', 'pending', '—'));
        col.appendChild(cell);
        cols.appendChild(col);
      }
      row.appendChild(cols);
      grid.appendChild(row);
    }
  }
}

function paintCell(cell: HTMLElement, rec: RunRecord) {
  const meta = el('div', 'meta');
  if (rec.ok) {
    meta.textContent =
      `${rec.ttftMs ?? '—'} ms to first token · ${rec.totalMs} ms · ` +
      `${rec.outputChars} chars · ${rec.outputLines} lines`;
  } else {
    const bad = el('div', `err kind-${rec.error?.kind}`);
    bad.textContent = `${rec.error?.kind ?? 'error'} — ${rec.error?.message ?? ''}`;
    cell.appendChild(bad);
    meta.textContent = `failed after ${rec.totalMs} ms`;
  }
  cell.appendChild(meta);
}

/** One render path, whether the data came from a live run or a loaded file —
 *  otherwise the thing shown in a meeting is not the thing that was tested. */
function renderRun(data: EvalRun) {
  current = data;
  showingLoaded = true;
  renderEnv(data.env);
  const byId = new Map([...FIXTURES, ...(data.fixtures ?? [])].map((f) => [f.id, f]));
  const seen = new Map<string, Fixture>();
  for (const r of data.runs) {
    const f = byId.get(r.fixtureId);
    if (f) seen.set(f.id, f);
  }
  renderGrid([...seen.values()]);
  const cleared = new Set<string>();
  for (const r of data.runs) {
    const key = `${r.fixtureId}-${r.mode}-${r.backend}`;
    const cell = document.querySelector<HTMLElement>(`#cell-${key}`);
    if (!cell) continue;
    if (!cleared.has(key)) {
      cell.textContent = '';
      cleared.add(key);
    }
    if ((r.repeat ?? 1) > 1) cell.appendChild(el('div', 'runlabel', `run ${r.repeat}`));
    cell.appendChild(el('div', 'out', r.text));
    paintCell(cell, r);
  }
  setStatus(`Loaded ${data.runs.length} runs from ${data.startedAt}.`);
}

// ---- captures ----

/* Passages recorded from real flicks. They are runnable before anyone has
   decided what any of them is for — being able to see two backends disagree is
   what tells you which passages are worth keeping. */
let captures: Capture[] = [];
const chosen = new Set<string>();

async function refreshCaptures() {
  captures = await loadCaptures();
  const box = $('#captures');
  box.textContent = '';
  if (!captures.length) {
    box.appendChild(
      el(
        'p',
        'hint',
        'Nothing captured yet. Flick past a passage on any article with this ' +
          'build enabled, then reload this page.'
      )
    );
    return;
  }
  for (const c of captures) {
    const row = el('label', 'cap');
    const cb = el('input') as HTMLInputElement;
    cb.type = 'checkbox';
    cb.checked = chosen.has(c.id);
    cb.addEventListener('change', () => {
      cb.checked ? chosen.add(c.id) : chosen.delete(c.id);
      updateRunLabel();
    });
    row.appendChild(cb);

    const meta = el('div', 'capmeta');
    meta.appendChild(el('div', 'captitle', c.heading || c.pageTitle || c.url));
    meta.appendChild(
      el(
        'div',
        'capsub',
        `${c.chars} chars · ${c.lang || '?'} · ${c.skippedPx}px skipped · ${new URL(c.url).hostname}`
      )
    );
    meta.appendChild(el('div', 'captext', c.text.slice(0, 260) + (c.text.length > 260 ? '…' : '')));
    row.appendChild(meta);

    const copy = el('button', 'small', 'Copy as fixture');
    copy.addEventListener('click', (e) => {
      e.preventDefault();
      void navigator.clipboard
        .writeText(captureToSource(c, extensionVersion()))
        .then(() => {
          copy.textContent = 'Copied';
          setTimeout(() => (copy.textContent = 'Copy as fixture'), 1200);
        });
    });
    row.appendChild(copy);
    box.appendChild(row);
  }
  updateRunLabel();
}

function updateRunLabel() {
  const n = chosen.size;
  $('#run-captures').textContent = n ? `Run ${n} selected capture${n > 1 ? 's' : ''}` : 'Run selected captures';
  $<HTMLButtonElement>('#run-captures').disabled = n === 0;
}

const setStatus = (t: string) => ($('#status').textContent = t);
const setBusy = (b: boolean) => {
  $<HTMLButtonElement>('#run-all').disabled = b;
  $<HTMLButtonElement>('#run-demo').disabled = b;
  $<HTMLButtonElement>('#run-captures').disabled = b || chosen.size === 0;
  $<HTMLButtonElement>('#stop').disabled = !b;
};

// ---- wiring ----

$('#run-all').addEventListener('click', () => void run(FIXTURES));
$('#run-demo').addEventListener('click', () => void run(demoFixtures()));
/* Mirrors the popup's "Recap in" setting. Running the same passages once
   following the page and again pinned to a language is what turns the
   language limit from a line in the environment panel into a result. */
const targetLangOverride = () => $<HTMLSelectElement>('#target-lang').value;

$('#run-captures').addEventListener('click', () =>
  void run(
    captures
      .filter((c) => chosen.has(c.id))
      .map((c) => ({ ...captureAsFixture(c), targetLang: targetLangOverride() }))
  )
);
$('#refresh-captures').addEventListener('click', () => void refreshCaptures());
$('#clear-captures').addEventListener('click', () => {
  clearCaptures();
  chosen.clear();
  void refreshCaptures();
});
$('#stop').addEventListener('click', () => abort?.abort());

$('#export').addEventListener('click', () => {
  if (!current) return;
  const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `skim-recap-eval-${current.startedAt.replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* Chrome's print dialog saves to PDF, so the report anyone takes away is the
   page itself rather than a separate document that could drift from it. */
$('#print').addEventListener('click', () => window.print());

$('#import').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  file.text().then((t) => renderRun(JSON.parse(t) as EvalRun));
});

/* ?results=<url> renders an exported run without the file picker, so a result
   can be linked, and so figures for a writeup can be captured headlessly
   instead of cropped out of a screenshot. */
const fromUrl = new URLSearchParams(location.search).get('results');
if (fromUrl) {
  fetch(fromUrl)
    .then((r) => r.json())
    .then((d) => renderRun(d as EvalRun))
    .catch((err) => setStatus(`Could not load ${fromUrl}: ${err.message}`));
}

void collectEnv();
void refreshCaptures();
renderGrid(FIXTURES);
setStatus(
  FIXTURES.length
    ? `${FIXTURES.length} fixtures in the corpus.`
    : 'No corpus yet — flick past passages on real articles, then run them from Captured below.'
);
