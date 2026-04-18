import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@calab/core': path.resolve(__dirname, '../core/src'),
      '@calab/cala-core': path.resolve(__dirname, '../cala-core/src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
