// Builds the comparison harness as a loadable extension.
//
// The extension this harness belongs to is a separate, private repository; the
// manifest here declares only what eval.html needs to run — storage for the
// capture panel, host permissions for the model download, and wasm-unsafe-eval
// for the LiteRT-LM runtime. Loading it gives you the harness, not Skim Recap.
import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: { eval: 'src/eval.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info',
});

// Vendored rather than fetched: Manifest V3 forbids loading remotely-hosted
// code, so the wasm runtime has to sit inside the extension directory. It is a
// build output, copied out of node_modules, and is not committed.
const wasmSrc = 'node_modules/@litert-lm/core/wasm';
if (existsSync(wasmSrc)) {
  cpSync(wasmSrc, 'wasm', { recursive: true });
  console.log('Copied LiteRT-LM wasm runtime -> ./wasm');
} else {
  console.warn('WARNING: @litert-lm/core wasm/ not found — run npm install first.');
}

console.log('Build done. Load this directory unpacked, then open eval.html.');
