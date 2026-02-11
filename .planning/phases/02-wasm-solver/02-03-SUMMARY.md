---
phase: 02-wasm-solver
plan: 03
subsystem: solver
tags: [windowing, warm-start, debounce, job-scheduler, overlap-and-discard, intermediate-streaming]

# Dependency graph
requires:
  - phase: 02-wasm-solver
    plan: 02
    provides: "Comlink Web Worker API (createSolverWorker singleton), shared TypeScript types (SolverParams, SolveResult, IntermediateResult, WarmStartStrategy)"
provides:
  - "Overlap-and-discard windowed computation with 5*tauDecay*fs padding"
  - "Warm-start state cache with strategy classification (warm/warm-no-momentum/cold)"
  - "SolverJobScheduler with debounce, stale-job cancellation, and intermediate result streaming"
  - "16 tests covering windowing math, warm-start classification, and cache lifecycle"
affects: [04-parameter-panel, 05-solver-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [overlap-and-discard-windowing, warm-start-strategy-classification, debounced-job-dispatch, stale-job-discard]

key-files:
  created:
    - src/lib/warm-start-cache.ts
    - src/lib/job-scheduler.ts
    - src/__tests__/job-scheduler.test.ts
  modified: []

key-decisions:
  - "5*tauDecay*fs padding for overlap-and-discard (research Pattern 3)"
  - "20% relative threshold for tau change warm-start classification (research Pattern 4)"
  - "30ms default debounce to group rapid slider movements"
  - "Stale job discard via counter (never terminate worker) per research anti-pattern guidance"
  - "Copy trace subarray before transfer to avoid detaching parent Float64Array"

patterns-established:
  - "Overlap-and-discard windowing: pad visible region, solve padded, extract visible slice from result"
  - "Warm-start strategy classification: lambda-only=warm, small tau=warm-no-momentum, large tau/window-shift=cold"
  - "Job counter cancellation: increment counter to make in-flight jobs stale, check on result arrival"
  - "Comlink.proxy for callbacks: wrap intermediate callback for cross-worker invocation"

# Metrics
duration: 3min
completed: 2026-02-11
---

# Phase 2 Plan 3: Job Scheduler and Warm-Start Summary

**Overlap-and-discard windowed computation with warm-start strategy classification and debounced job dispatch for interactive parameter tuning**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-11T04:43:44Z
- **Completed:** 2026-02-11T04:46:24Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Implemented overlap-and-discard windowing with 5*tauDecay*fs padding and edge clamping to prevent artifacts at visible region boundaries
- Built warm-start strategy classification that routes lambda-only changes to full warm-start, small tau changes to momentum-free warm-start, and large changes to cold start
- Created SolverJobScheduler with 30ms debounce, stale-job discard via job counter, and intermediate result streaming with visible-region extraction
- 16 new tests covering all windowing math edge cases and warm-start strategy classification; all 52 tests pass (16 new + 36 existing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement warm-start cache and overlap-and-discard windowing** - `383860d` (feat)
2. **Task 2: Implement job scheduler with debounce, cancellation, and streaming** - `75ee0d3` (feat)
3. **Task 3: Write tests for windowing math and warm-start classification** - `7667aaf` (test)

## Files Created/Modified
- `src/lib/warm-start-cache.ts` - computePaddedWindow, shouldWarmStart, WarmStartCache class with single-entry state storage
- `src/lib/job-scheduler.ts` - SolverJobScheduler with debounced dispatch, stale-job discard, window extraction, warm-start integration
- `src/__tests__/job-scheduler.test.ts` - 16 tests: 5 windowing, 8 warm-start strategy, 3 cache lifecycle

## Decisions Made

1. **5*tauDecay*fs padding** -- Per research Pattern 3, padding must be >= 5x the decay time constant (in samples) on each side of the visible window. This ensures the kernel's influence has decayed to <1% at the boundary, preventing edge artifacts in the overlap-and-discard scheme.

2. **20% relative tau threshold** -- Per research Pattern 4, a heuristic threshold of 20% relative change in tau parameters determines whether warm-start is beneficial. Below 20%, the kernel is similar enough that the previous solution's magnitude is useful (warm-no-momentum). Above 20%, the kernel has changed too much and cold start is faster.

3. **30ms default debounce** -- Groups rapid slider movements into a single solve dispatch. At 30ms, a user dragging a slider at 60fps generates at most one solve per 2 frames, which is imperceptible latency but prevents flooding the worker.

4. **Copy trace subarray before transfer** -- `fullTrace.subarray()` creates a view sharing the underlying ArrayBuffer. Transferring a view's buffer would detach the entire parent Float64Array (the user's full dataset). Copying to a new Float64Array before transfer isolates the transferred data.

5. **Stale job discard via counter** -- Per research anti-pattern guidance, never terminate the worker (destroying WASM instance and warm-start state). Instead, increment a job counter on each dispatch and check it when results arrive. Stale results are silently discarded.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 (WASM Solver) is now complete: Rust FISTA solver (02-01), WASM bridge and worker API (02-02), and windowed job scheduler with warm-start (02-03)
- The solver pipeline is ready for integration: UI components can import SolverJobScheduler from job-scheduler.ts and dispatch solve jobs with debounce, windowing, and warm-start automatically
- Phase 4 (parameter panel) will create the UI controls that call scheduler.dispatch()
- Phase 5 (solver integration) will wire the scheduler to visualization components

## Self-Check: PASSED

All 3 created files verified present on disk. All 3 task commits verified in git log.

---
*Phase: 02-wasm-solver*
*Completed: 2026-02-11*
