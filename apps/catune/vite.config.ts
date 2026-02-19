import path from 'node:path';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import wasm from 'vite-plugin-wasm';

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@catune/core': path.resolve(repoRoot, 'packages/core/src'),
    },
  },
  envDir: repoRoot,
  base: process.env.GITHUB_ACTIONS ? '/CaTune/' : '/',
  plugins: [solidPlugin(), wasm()],
  worker: {
    plugins: () => [wasm()],
    format: 'es',
  },
  build: {
    target: 'esnext',
  },
});
