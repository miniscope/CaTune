# CaTune Architecture

CaTune is a browser-based calcium imaging deconvolution tool built with SolidJS, TypeScript, and a Rust/WASM solver.

## Monorepo Structure

CaTune uses npm workspaces with two workspaces:

- **`apps/catune`** — the SolidJS single-page application
- **`packages/core`** (`@catune/core`) — shared library consumed as source (no build step; Vite transpiles it)

```
.
├── apps/
│   └── catune/                  # SolidJS SPA
│       ├── index.html
│       ├── src/
│       │   ├── App.tsx          # Root component, routing, layout
│       │   ├── components/      # UI components organized by feature
│       │   │   ├── cards/       # Cell cards, trace overview, zoom window
│       │   │   ├── community/   # Community browser, submit form, scatter plot
│       │   │   ├── controls/    # Parameter sliders, cell selector
│       │   │   ├── import/      # File drop zone, trace preview, validation
│       │   │   ├── layout/      # Header, sidebar, panels, overlays
│       │   │   ├── metrics/     # Quality metrics display
│       │   │   ├── spectrum/    # Power spectrum visualization
│       │   │   ├── traces/      # Trace panel, kernel display
│       │   │   └── tutorial/    # Tutorial launcher, popover
│       │   ├── lib/             # Core logic (non-UI)
│       │   │   ├── chart/       # Chart helpers: kernel math, downsample, series config
│       │   │   ├── community/   # Community service, store, types
│       │   │   ├── metrics/     # Quality metrics
│       │   │   ├── spectrum/    # Spectrum computation
│       │   │   ├── tutorial/    # Tutorial engine, content, progress
│       │   │   └── ...          # State stores, worker pool, exports
│       │   ├── workers/
│       │   │   └── pool-worker.ts  # WASM solver worker (raw postMessage)
│       │   └── styles/          # CSS files
│       ├── vite.config.ts
│       ├── vitest.config.ts
│       ├── tsconfig.json        # Extends ../../tsconfig.base.json
│       └── package.json
├── packages/
│   └── core/                    # @catune/core
│       ├── src/
│       │   ├── index.ts         # Barrel re-exports
│       │   ├── wasm-adapter.ts  # Single WASM import point
│       │   └── schemas/
│       │       └── export-schema.ts  # Valibot export validation
│       ├── tsconfig.json
│       └── package.json
├── wasm/
│   └── catune-solver/           # Rust FISTA solver crate
│       └── pkg/                 # wasm-pack output (committed)
├── supabase/                    # Supabase config
├── python/                      # Python utilities
├── test/                        # Test fixtures
├── docs/                        # Documentation
├── package.json                 # Workspace root
├── tsconfig.base.json           # Shared TS compiler options
└── eslint.config.js             # Shared lint config
```

## State Management

CaTune uses **module-level SolidJS signals** instead of Context providers. State modules export signals and setters directly:

- `data-store.ts` — loaded traces, parameters, solver results
- `viz-store.ts` — zoom range, selected cell, UI toggles
- `multi-cell-store.ts` — multi-cell selection and ranking

This pattern avoids provider nesting and makes state accessible from non-component code (e.g., the tutorial engine).

## Solver Pipeline

```
User adjusts params
  → data-store signals update
  → cell-solve-manager debounces and dispatches
  → worker-pool assigns job to idle Web Worker
  → pool-worker.ts (in worker thread):
      → @catune/core wasm-adapter → WASM Solver
      → cooperative cancellation via MessageChannel yields
      → intermediate results posted at ~100ms intervals
  → worker-pool routes results back to data-store
```

Key design decisions:

- **Raw postMessage** (not Comlink) so the event loop can process cancel messages between solver batches
- **MessageChannel yields** (<1ms) instead of setTimeout(0) (~4ms) for cooperative multitasking
- **Warm-start caching** reuses solver state when only lambda changes (kernel unchanged)

## Module Boundaries

### WASM Adapter Rule

Only `packages/core/src/wasm-adapter.ts` imports from `wasm/catune-solver/pkg/`. All other code imports `{ initWasm, Solver }` from `@catune/core`. Enforced by ESLint `no-restricted-imports`.

### Supabase Isolation

Only `apps/catune/src/lib/supabase.ts` dynamically imports `@supabase/supabase-js` (~45KB). The SDK is lazy-loaded on first use. The `supabaseEnabled` boolean is read by layout components to conditionally render community features. Enforced by ESLint `no-restricted-imports`.

### Barrel Files

Each sub-module (`chart/`, `community/`, `tutorial/`) has an `index.ts` barrel file that re-exports the public API. `@catune/core` also uses a barrel (`packages/core/src/index.ts`). Prefer importing from barrels rather than internal files.

## CSS Conventions

- Pure CSS with custom properties (no CSS-in-JS)
- Design tokens in `styles/global.css` (colors, spacing, shadows)
- Component styles co-located in `styles/` directory
- Dark theme throughout (scientific instrument aesthetic)
- `DashboardPanel` component with `data-panel-id` for layout targeting
