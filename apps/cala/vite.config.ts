import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import wasm from 'vite-plugin-wasm';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf-8'));
const displayName = pkg.calab?.displayName ?? path.basename(import.meta.dirname);

// SharedArrayBuffer (design §13) requires cross-origin isolation:
//   - Cross-Origin-Opener-Policy: same-origin
//   - Cross-Origin-Embedder-Policy: require-corp
// The Vite dev and preview servers set these directly. For the
// GitHub Pages production deploy, `public/coi-serviceworker.js`
// registers a service worker that re-issues top-level navigations
// with the headers attached (Phase 6 task 14) — so production also
// boots `crossOriginIsolated`.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  resolve: {
    alias: {
      '@calab/cala-core': path.resolve(repoRoot, 'packages/cala-core/src'),
      '@calab/cala-runtime': path.resolve(repoRoot, 'packages/cala-runtime/src'),
      '@calab/compute': path.resolve(repoRoot, 'packages/compute/src'),
      '@calab/core': path.resolve(repoRoot, 'packages/core/src'),
      '@calab/io': path.resolve(repoRoot, 'packages/io/src'),
      '@calab/ui': path.resolve(repoRoot, 'packages/ui/src'),
    },
  },
  envDir: repoRoot,
  base: process.env.GITHUB_ACTIONS
    ? `/CaLab/${displayName}/`
    : process.env.CALAB_PAGES
      ? `/${displayName}/`
      : '/',
  server: {
    headers: crossOriginIsolation,
  },
  preview: {
    headers: crossOriginIsolation,
  },
  plugins: [solidPlugin(), wasm()],
  worker: {
    plugins: () => [wasm()],
    format: 'es',
  },
  build: {
    target: 'esnext',
  },
});
