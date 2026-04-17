import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    passWithNoTests: false,
    environmentMatchGlobs: [['src/lib/__tests__/**', 'node']],
  },
});
