// Gemma 4 E4B on the local GPU, through LiteRT-LM's web runtime.
//
// Moved here verbatim from offscreen.ts when a second backend was added for
// comparison; the logic is unchanged. This is the shipped path.

import { Engine, loadLiteRtLm, type Conversation } from '@litert-lm/core';
import {
  BackendError,
  classifyError,
  type Availability,
  type LlmBackend,
  type LlmSession,
  type ProgressFn,
} from './backend';

// Same model the "the room" Literary Salon app uses, for parity — a Gemma
// checkpoint packaged for LiteRT-LM's web runtime.
const MODEL_URL =
  'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm';
const CACHE_NAME = 'skim-recap-model-v1';

function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/* LiteRT logs its startup chatter ("Creating LiteRT environment", the NPU
   fallback warning, XNNPACK registration) to stderr. Emscripten forwards
   stderr to console.error, so Chrome's extension Errors page fills up with
   these plus the whole wasm glue source, and real faults get lost in it.
   Emscripten takes print/printErr off self.Module, which is exactly what
   @litertjs/wasm-utils hands to the module factory. */
function quietLiteRtLogging() {
  const host = self as unknown as { Module?: Record<string, unknown> };
  host.Module = {
    ...(host.Module ?? {}),
    print: (text: string) => console.debug('[litert]', text),
    printErr: (text: string) => console.debug('[litert]', text),
  };
}

let wasmLoaded = false;
async function ensureWasmLoaded() {
  if (wasmLoaded) return;
  quietLiteRtLogging();
  await loadLiteRtLm(chrome.runtime.getURL('wasm/'));
  wasmLoaded = true;
}

async function fetchModelWithCache(onProgress: ProgressFn): Promise<Blob> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(MODEL_URL);
  if (cached) {
    onProgress('Loading cached model…');
    return cached.blob();
  }

  onProgress('Downloading model (first run only)…', 0);
  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) {
    throw new Error(`Model download failed: HTTP ${response.status}`);
  }
  const total = Number(response.headers.get('content-length') ?? 0);

  // The model is multiple GB, so it must never be buffered in JS memory.
  // Piping through a counting TransformStream lets the Cache API stream it
  // straight to disk while we still report progress.
  let received = 0;
  let lastPost = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      const now = performance.now();
      if (now - lastPost > 200) {
        lastPost = now;
        const mb = (received / 1e6).toFixed(0);
        if (total > 0) {
          onProgress(`Downloading model… ${mb} / ${(total / 1e6).toFixed(0)} MB`, received / total);
        } else {
          onProgress(`Downloading model… ${mb} MB`);
        }
      }
      controller.enqueue(chunk);
    },
  });

  await cache.put(
    MODEL_URL,
    new Response(response.body.pipeThrough(counter), {
      headers: { 'content-type': 'application/octet-stream' },
    })
  );

  const stored = await cache.match(MODEL_URL);
  if (!stored) {
    throw new Error('Model downloaded but could not be cached — free up disk space and retry.');
  }
  return stored.blob();
}

let enginePromise: Promise<Engine> | null = null;

function loadEngine(onProgress: ProgressFn): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      if (!isWebGPUAvailable()) {
        throw new BackendError('WebGPU is unavailable — check chrome://gpu.', 'unavailable');
      }
      onProgress('Loading model runtime…');
      await ensureWasmLoaded();
      const modelBlob = await fetchModelWithCache(onProgress);
      onProgress('Moving model onto the GPU…');
      const engine = await Engine.create({ model: modelBlob });
      onProgress('Ready.', 1);
      return engine;
    })().catch((err) => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

class LiteRtSession implements LlmSession {
  constructor(private readonly conversation: Conversation) {}

  async *stream(userText: string, signal?: AbortSignal): AsyncIterable<string> {
    // sendMessageStreaming returns a ReadableStream. Chrome does not implement
    // async iteration over ReadableStream, so read it explicitly.
    const reader = this.conversation.sendMessageStreaming(userText).getReader();
    const onAbort = () => void reader.cancel();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (signal?.aborted) {
          await reader.cancel();
          return;
        }
        const content = value?.content;
        if (typeof content === 'string') {
          if (content) yield content;
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === 'text' && part.text) yield part.text;
          }
        }
      }
    } catch (err) {
      throw classifyError(err);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async close(): Promise<void> {
    // Each passage is unrelated to the next — don't let history accumulate
    // or bleed context from one article into another's summary.
    await this.conversation.delete().catch(() => {});
  }
}

class LiteRtBackend implements LlmBackend {
  readonly id = 'litert' as const;
  readonly label = 'LiteRT-LM · Gemma 4 E4B';

  async availability(): Promise<Availability> {
    if (!isWebGPUAvailable()) return 'unavailable';
    try {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(MODEL_URL)) ? 'available' : 'downloadable';
    } catch {
      return 'downloadable';
    }
  }

  async load(onProgress: ProgressFn): Promise<void> {
    await loadEngine(onProgress);
  }

  async createSession(system: string): Promise<LlmSession> {
    const engine = await loadEngine(() => {});
    try {
      const conversation = await engine.createConversation({
        preface: { messages: [{ role: 'system', content: system }] },
      });
      return new LiteRtSession(conversation);
    } catch (err) {
      throw classifyError(err);
    }
  }

  /* Reports only what is already known. Reading `engine.settings` would mean
     loading 2.97 GB, and describing a backend must never be the thing that
     starts that — an environment panel that hangs on page load is worse than
     one that fills in after the first run.

     Note for anyone reading an eval export: `settings` is what the engine
     actually resolved to, not what we asked for. We pass no sessionConfig at
     all, so sampling is whatever the library defaults to — worth knowing when
     comparing output length or latency against a backend whose temperature and
     topK we do set. */
  async describe(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = { model: MODEL_URL.split('/').pop() };
    if (enginePromise) {
      try {
        const engine = await enginePromise;
        out.engineSettings = (engine as unknown as { settings?: unknown }).settings ?? null;
      } catch (err) {
        out.engineSettings = `failed: ${(err as Error).message}`;
      }
    } else {
      out.engineSettings = 'engine not loaded yet — run once to populate';
    }
    try {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(MODEL_URL);
      out.cachedModelBytes = hit ? (await hit.blob()).size : null;
    } catch {
      out.cachedModelBytes = null;
    }
    try {
      const adapter = await (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } })
        .gpu?.requestAdapter();
      // GPUAdapterInfo exposes its fields as prototype getters, so
      // JSON.stringify sees an empty object. Pick them out by name.
      const info = (adapter as { info?: Record<string, string> } | undefined)?.info;
      out.gpuAdapter = info
        ? {
            vendor: info.vendor,
            architecture: info.architecture,
            device: info.device,
            description: info.description,
          }
        : null;
    } catch {
      out.gpuAdapter = null;
    }
    return out;
  }
}

export const litertBackend: LlmBackend = new LiteRtBackend();
