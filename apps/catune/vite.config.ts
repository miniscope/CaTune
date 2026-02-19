import path from 'node:path';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import wasm from 'vite-plugin-wasm';

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@catune/core': path.resolve(repoRoot, 'packages/core/src'),
      '@catune/compute': path.resolve(repoRoot, 'packages/compute/src'),
      '@catune/io': path.resolve(repoRoot, 'packages/io/src'),
      '@catune/community': path.resolve(repoRoot, 'packages/community/src'),
      '@catune/tutorials': path.resolve(repoRoot, 'packages/tutorials/src'),
      '@catune/ui': path.resolve(repoRoot, 'packages/ui/src'),
    },
  },
  envDir: repoRoot,
  base: process.env.GITHUB_ACTIONS ? '/CaLab/CaTune/' : '/',
  plugins: [solidPlugin(), wasm()],
  worker: {
    plugins: () => [wasm()],
    format: 'es',
  },
  build: {
    target: 'esnext',
  },
});
