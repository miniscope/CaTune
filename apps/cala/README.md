# CaLa

Streaming calcium imaging demixing. Browser-native OMF pipeline port of Raymond Chang's [`cala`](https://github.com/raymondchang-ucla/cala) reference — streaming preprocess + fit + extend loops, backed by the Rust numerical core in `crates/cala-core`.

## Status

**Coming soon** — scaffolded in Phase 5, functional build lands at Phase 5 exit (task 25). See `.planning/CALA_DESIGN.md` for the full design.

## Dev

```
npm run dev -w apps/cala       # starts Vite with COOP/COEP headers set
npm run verify-sab -w apps/cala # boots Vite, asserts SAB headers live
```

`SharedArrayBuffer` (used by the worker runtime for SAB-backed channels, mutation queue, and event bus) needs cross-origin isolation:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

The Vite dev server and preview server set these headers via `vite.config.ts`. If `SharedArrayBuffer` is undefined in the page, inspect response headers — the most common cause is serving through a proxy that strips them.

## Production deploy (GitHub Pages)

GitHub Pages does not support custom response headers. That means **`SharedArrayBuffer` won't work on the production Pages deploy as-is**. Two paths are available when the app goes live:

1. **Cross-origin-isolation service worker** (`coi-serviceworker` pattern) — the service worker intercepts `fetch` and injects the COOP/COEP headers. Works on GitHub Pages without host changes. Planned for Phase 6+ when SAB-using UI code actually ships to production.
2. **Alternative host** (Netlify, Cloudflare Pages) that honors a `_headers` file or equivalent. Requires deployment pipeline changes in `scripts/combine-dist.mjs` + `.github/workflows/deploy.yml`.

Phase 5 exit (task 25) only requires local dev to work end-to-end. The production SAB story is a separate deliverable that doesn't block Phase 5.

## Layout

```
apps/cala/
├── index.html
├── package.json           # @calab/* workspace deps
├── vite.config.ts         # path aliases, WASM plugin, COOP/COEP headers
├── tsconfig.json
├── scripts/
│   └── verify-sab.mjs     # smoke check for COOP/COEP header delivery
└── src/
    ├── App.tsx            # placeholder shell — components land in tasks 20-24
    ├── index.tsx
    ├── styles/global.css
    └── vite-env.d.ts
```

Per-task layout expansions:

| Task | Adds                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------- |
| 20   | `lib/data-store.ts`, `lib/run-control.ts`, `components/layout/ImportOverlay.tsx`, `components/layout/CaLaHeader.tsx` |
| 21   | `workers/decode-preprocess.worker.ts`                                                                                |
| 22   | `workers/fit.worker.ts`                                                                                              |
| 23   | `workers/extend.worker.ts`, `workers/archive.worker.ts`                                                              |
| 24   | `components/frame/SingleFrameViewer.tsx`, `lib/archive-client.ts`, `lib/dashboard-store.ts`                          |
| 25   | Phase 5 exit E2E on a real AVI                                                                                       |
