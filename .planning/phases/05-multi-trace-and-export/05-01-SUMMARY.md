---
phase: 05-multi-trace-and-export
plan: 01
subsystem: data
tags: [solidjs, signals, variance, fisher-yates, batch-solver, comlink, web-worker]

# Dependency graph
requires:
  - phase: 01-data-foundation
    provides: NpyResult type, parsedData/effectiveShape/swapped signals from data-store
  - phase: 02-wasm-solver
    provides: solver worker singleton (createSolverWorker), SolverParams, SolveResult types
  - phase: 03-visualization
    provides: viz-store trace indexing pattern (loadCellTraces)
provides:
  - Cell activity ranking via variance (rankCellsByActivity)
  - Fisher-Yates random cell sampling (sampleRandomCells)
  - Reactive multi-cell selection state (selectionMode, selectedCells, displayCount)
  - Batch multi-cell solver with progress tracking (solveSelectedCells)
  - CellTraces interface for multi-cell results
affects: [05-02-PLAN, 05-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [single-pass variance, Fisher-Yates partial shuffle, sequential batch solve through worker singleton]

key-files:
  created:
    - src/lib/cell-ranking.ts
    - src/lib/multi-cell-store.ts
    - src/lib/multi-cell-solver.ts
  modified: []

key-decisions:
  - "Single-pass variance (sumSq/n - mean^2) for O(cells*timepoints) activity ranking"
  - "Cold start for batch solves (no warm-start reuse across different cells)"
  - "Sequential batch solve to avoid worker contention with interactive tuning"

patterns-established:
  - "Multi-cell store follows same module-level signal pattern as data-store and viz-store"
  - "Batch solver uses try/catch per cell to continue on individual failures"

# Metrics
duration: 2min
completed: 2026-02-11
---

# Phase 5 Plan 1: Multi-Cell Data Layer Summary

**Variance-based cell activity ranking, Fisher-Yates sampling, reactive multi-cell selection store, and sequential batch solver through existing WASM worker singleton**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-11T06:59:15Z
- **Completed:** 2026-02-11T07:01:04Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Cell activity ranking using single-pass variance computation with correct flat-array indexing for both normal and swapped layouts
- Fisher-Yates partial shuffle for random cell sampling (only shuffles first N elements)
- Reactive multi-cell selection store with three modes: top-active, random, manual
- Batch solver that sequentially processes cells through the existing Comlink worker singleton with per-cell error handling and progress tracking

## Task Commits

Each task was committed atomically:

1. **Task 1: Cell activity ranking and random sampling utilities** - `559161d` (feat)
2. **Task 2: Multi-cell reactive store and batch solver** - `fb9b627` (feat)

## Files Created/Modified
- `src/lib/cell-ranking.ts` - Pure functions: rankCellsByActivity (variance-based) and sampleRandomCells (Fisher-Yates)
- `src/lib/multi-cell-store.ts` - SolidJS signals for selection mode, selected cells, display count, results map, solving status, progress, cached activity ranking
- `src/lib/multi-cell-solver.ts` - solveSelectedCells: sequential batch solve with Comlink.transfer, cold start, per-cell error handling

## Decisions Made
- Single-pass variance (sumSq/n - mean^2) avoids two-pass mean computation while remaining numerically stable for typical fluorescence data ranges
- Cold start for each batch cell since warm-start state is cell-specific and not transferable between cells
- Sequential (not parallel) batch solving prevents worker contention with the interactive tuning loop's solver

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Multi-cell data layer complete, ready for Plan 02 (multi-trace chart UI) and Plan 03 (App integration)
- All three modules export the expected public API and type-check cleanly
- No modifications to existing files; all additions are new modules

## Self-Check: PASSED

All 3 created files verified on disk. Both task commits (559161d, fb9b627) verified in git log.

---
*Phase: 05-multi-trace-and-export*
*Completed: 2026-02-11*
