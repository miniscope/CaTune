# Roadmap: CaTune

## Overview

CaTune delivers browser-based interactive calcium deconvolution parameter tuning in eight phases, starting from data import foundations and building through the WASM solver, visualization, and interactive controls to create the core tuning loop. From there, multi-trace validation, the progressive tutorial system, community parameter database, and Python companion extend the tool into a complete ecosystem. Phases 2 (solver) and 3 (visualization) can develop in parallel since they join at Phase 4 (interactive core loop).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Foundation** - Drag-and-drop data import with validation and in-memory storage
- [x] **Phase 2: WASM Solver** - Rust ISTA/FISTA solver compiled to WASM running in Web Workers
- [x] **Phase 3: Visualization** - High-performance trace plotting with reconvolution overlay and residuals
- [x] **Phase 4: Interactive Core Loop** - Parameter controls wired to solver and plots for live tuning
- [x] **Phase 5: Multi-Trace and Export** - Multi-cell validation and parameter export for downstream use
- [x] **Phase 6: Tutorial System** - Progressive guided tutorials encoding the Aharoni Lab tuning workflow
- [x] **Phase 7: Community Database** - Opt-in parameter sharing and cross-lab distribution browsing
- [ ] **Phase 8: Python Companion** - Minimal Python package for data conversion and offline deconvolution

## Phase Details

### Phase 1: Data Foundation
**Goal**: Users can load their calcium imaging data into the browser and verify it was interpreted correctly
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DEPL-02
**Success Criteria** (what must be TRUE):
  1. User can drag-and-drop a .npy or .npz file and see their traces appear in the browser
  2. User is prompted to confirm detected array dimensions (cells vs timepoints) and can swap them if wrong
  3. User must specify sampling rate before proceeding, with sensible defaults offered
  4. User sees immediate feedback if data contains problems (NaN/Inf, unreasonable values)
  5. No trace data leaves the browser at any point during or after import
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md -- Project scaffold (Vite 7 + SolidJS 1.9 + TypeScript) with shared types and reactive data store
- [x] 01-02-PLAN.md -- TDD: Binary parsers (.npy/.npz) and data validation with full test coverage
- [x] 01-03-PLAN.md -- Import flow UI (drop zone, dimension confirmation, sampling rate, validation report, trace preview)

### Phase 2: WASM Solver
**Goal**: Deconvolution computation runs fast enough for interactive use with correct scientific results
**Depends on**: Phase 1
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-06, COMP-07
**Success Criteria** (what must be TRUE):
  1. Deconvolution runs in a Web Worker without blocking the UI thread
  2. Parameter changes produce visible solver output within 500ms via windowed computation and warm-start
  3. Solver streams intermediate results at ~10Hz so users see progressive convergence
  4. Windowed computation produces results identical to full-trace computation (no edge artifacts from boundary handling)
  5. Computation is deterministic and uses Float64 precision throughout
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md -- Rust FISTA solver core with double-exponential kernel, TDD with cargo test
- [x] 02-02-PLAN.md -- WASM build pipeline (wasm-pack), Vite config, Comlink Web Worker integration
- [x] 02-03-PLAN.md -- Overlap-and-discard windowing, warm-start cache, job scheduler with intermediate streaming

### Phase 3: Visualization
**Goal**: Users can see their traces and deconvolution results with smooth, responsive plotting
**Depends on**: Phase 1 (can develop in parallel with Phase 2 using mock data)
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05, VIZ-09, VIZ-10
**Success Criteria** (what must be TRUE):
  1. User can view raw fluorescence, deconvolved activity, reconvolution fit overlay, and residuals for a selected cell
  2. User can zoom and pan traces with 100K+ timepoints without lag or jank
  3. User can see the calcium kernel shape derived from current parameter values
  4. All linked trace displays share synchronized time axes (zoom one, all update)
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md -- Chart utilities (uPlot, downsampling, zoom sync, dark theme, kernel math) and reusable TracePanel component
- [x] 03-02-PLAN.md -- Synchronized multi-panel stack, kernel display, visualization store with mock data, and App integration

### Phase 4: Interactive Core Loop
**Goal**: Users can tune deconvolution parameters with live visual feedback -- the core CaTune experience
**Depends on**: Phase 2, Phase 3
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04, CTRL-05, CTRL-06, DEPL-01, DEPL-03
**Success Criteria** (what must be TRUE):
  1. User can adjust tau_rise, tau_decay, and lambda via sliders and numeric inputs, and see the effect on traces immediately as they drag
  2. A convergence indicator shows whether the displayed result is still solving or fully converged
  3. User can undo/redo parameter changes to navigate their exploration history
  4. The tool is deployed as a static site accessible via URL on Chrome, Firefox, and Safari
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md -- Parameter control UI components (ParameterSlider, ParameterPanel, ConvergenceIndicator), param-history undo/redo stack, and CSS styling
- [x] 04-02-PLAN.md -- GitHub Pages deployment (vite.config.ts base path, GitHub Actions workflow with WASM build)
- [x] 04-03-PLAN.md -- Tuning orchestrator wiring (params -> solver -> viz-store), undo/redo keyboard shortcuts, mock data replacement, App integration

### Phase 5: Multi-Trace and Export
**Goal**: Users can validate parameter suitability across multiple cells and export their chosen parameters
**Depends on**: Phase 4
**Requirements**: VIZ-06, VIZ-07, VIZ-08, EXPT-01, EXPT-02
**Success Criteria** (what must be TRUE):
  1. User can view multiple traces simultaneously to compare how parameters perform across diverse cells
  2. User can select which traces to view: top-N most active, random sample, or manual selection
  3. User can compare before/after parameter snapshots side-by-side on the same trace
  4. User can export chosen parameters as a JSON file with full metadata (tau values, lambda, AR2 coefficients, sampling rate, version, mathematical formulation)
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md -- Multi-cell data layer: cell activity ranking, reactive selection store, batch solver
- [x] 05-02-PLAN.md -- AR2 coefficient derivation, JSON export with Blob download, before/after pinned snapshot overlay
- [x] 05-03-PLAN.md -- UI components (MultiTraceView, CellSelector, ExportPanel) and App.tsx integration

### Phase 6: Tutorial System
**Goal**: Users learn the tuning workflow through progressive, contextual guidance on their own data
**Depends on**: Phase 4 (requires stable interactive loop)
**Requirements**: TUTR-01, TUTR-02, TUTR-03, TUTR-04, TUTR-05
**Success Criteria** (what must be TRUE):
  1. User can follow a progressive tutorial from basic concepts (what each parameter does) through the complete guided tuning workflow to advanced techniques (residual analysis, parameter coupling)
  2. Tutorial steps reference and highlight actual UI elements, providing contextual guidance on the user's own data
  3. Tutorial content is data-driven (JSON/YAML definitions) so updates require no code changes
**Plans**: 3 plans

Plans:
- [x] 06-01-PLAN.md -- Tutorial engine core: driver.js install, type system, progress persistence, SolidJS store, engine, dark theme CSS
- [x] 06-02-PLAN.md -- data-tutorial attributes on existing components + three progressive tutorial content definitions (basics, workflow, advanced)
- [x] 06-03-PLAN.md -- Tutorial UI (TutorialPanel, TutorialLauncher), App.tsx integration, first-time banner, orchestrator wiring

### Phase 7: Community Database
**Goal**: Users can share their tuned parameters and learn from other labs' parameter choices across experimental conditions
**Depends on**: Phase 5 (parameter export format informs submission schema)
**Requirements**: CMTY-01, CMTY-02, CMTY-03, CMTY-04, CMTY-05, CMTY-06, CMTY-07
**Success Criteria** (what must be TRUE):
  1. User can submit tuned parameters with required metadata (indicator, species, brain region, sampling rate) via an explicit opt-in action
  2. User sees a clear statement that traces remain local and only parameters are uploaded
  3. User can browse and filter community parameter distributions by metadata (e.g., "GCaMP7f in mouse cortex")
  4. Community distributions display as scatter plots and histograms showing parameter relationships
**Plans**: 4 plans

Plans:
- [x] 07-01-PLAN.md -- Supabase client foundation, community types, auth store, CRUD service, quality checks, dataset hash
- [x] 07-02-PLAN.md -- Submission flow UI: AuthGate, PrivacyNotice, unified SubmitPanel, SubmissionSummary, community CSS
- [x] 07-03-PLAN.md -- Community browser: ScatterPlot, MarginalHistogram, FilterBar, CommunityBrowser wrapper
- [x] 07-04-PLAN.md -- App.tsx integration (replace ExportPanel with SubmitPanel, add CommunityBrowser) and deploy workflow update

### Phase 8: Python Companion
**Goal**: Users can prepare data for CaTune and run offline deconvolution from Python using the same algorithm
**Depends on**: Phase 2 (same algorithm), Phase 5 (parameter format)
**Requirements**: PYTH-01, PYTH-02
**Success Criteria** (what must be TRUE):
  1. User can call `save_for_tuning()` in Python to convert numpy arrays into CaTune-compatible format with metadata
  2. User can call `run_deconvolution()` in Python with parameters from CaTune and get identical results to the browser tool
**Plans**: 2 plans

Plans:
- [ ] 08-01-PLAN.md -- Python package scaffold (pyproject.toml, hatchling), kernel math module (build_kernel, tau_to_ar2, compute_lipschitz), and kernel tests
- [ ] 08-02-PLAN.md -- FISTA solver (run_deconvolution), I/O functions (save_for_tuning, load_tuning_data), and comprehensive test suite with equivalence tests

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8
Note: Phases 2 and 3 can develop in parallel (they share no dependencies beyond Phase 1).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 3/3 | ✓ Complete | 2026-02-10 |
| 2. WASM Solver | 3/3 | ✓ Complete | 2026-02-10 |
| 3. Visualization | 2/2 | ✓ Complete | 2026-02-10 |
| 4. Interactive Core Loop | 3/3 | ✓ Complete | 2026-02-10 |
| 5. Multi-Trace and Export | 3/3 | ✓ Complete | 2026-02-11 |
| 6. Tutorial System | 3/3 | ✓ Complete | 2026-02-11 |
| 7. Community Database | 4/4 | ✓ Complete | 2026-02-11 |
| 8. Python Companion | 0/2 | Not started | - |
