import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/CaTune/' : '/',
  plugins: [
    solidPlugin(),
    wasm(),
    topLevelAwait(),
  ],
  worker: {
    plugins: () => [
      wasm(),
      topLevelAwait(),
    ],
  },
});
