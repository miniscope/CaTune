---
phase: 01-data-foundation
plan: 02
subsystem: parsing
tags: [npy, npz, numpy, binary-parser, fflate, validation, tdd, vitest]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Vite 7 + SolidJS + TypeScript scaffold, shared types (NpyResult, NpzResult, ValidationResult), Vitest infrastructure"
provides:
  - "parseNpy function for .npy binary format with v1/v2 header support"
  - "parseNpz function for .npz zip archive decompression and parsing"
  - "validateTraceData function for data quality checks (NaN, Inf, shape, stats)"
  - "36 passing tests covering all happy paths, error cases, and edge cases"
affects: [01-03, 02-solver, 03-visualization]

# Tech tracking
tech-stack:
  added: []
  patterns: [zero-copy-typed-array-view, single-pass-validation, npy-header-regex-parsing, fflate-unzipSync-with-buffer-copy]

key-files:
  created:
    - src/lib/npy-parser.ts
    - src/lib/npz-parser.ts
    - src/lib/validation.ts
    - src/lib/__tests__/npy-parser.test.ts
    - src/lib/__tests__/npz-parser.test.ts
    - src/lib/__tests__/validation.test.ts
  modified:
    - vitest.config.ts

key-decisions:
  - "Zero-copy typed array view on aligned data, copy fallback on unaligned offsets"
  - "Regex header parsing (no eval/Function) for .npy Python dict literals"
  - "Big-endian rejection with helpful re-save message rather than byte-swapping"
  - "Single-pass stats computation for validation efficiency"
  - "Negative values tracked in stats but no warning (deltaF/F can be negative)"

patterns-established:
  - "TDD red-green-refactor with makeNpyBuffer test helper for programmatic .npy construction"
  - "fflate unzipSync with Uint8Array copy for standalone ArrayBuffer (avoids shared buffer issues)"
  - "Node environment for pure function tests via vitest environmentMatchGlobs"

# Metrics
duration: 5min
completed: 2026-02-11
---

# Phase 1 Plan 2: Data Parsing and Validation Summary

**Custom .npy/.npz parser with zero-copy typed arrays and single-pass trace data validation, fully tested via TDD with 35 tests covering all NumPy format edge cases**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-11T02:35:09Z
- **Completed:** 2026-02-11T02:40:26Z
- **Tasks:** 3 (TDD red-green-refactor for each)
- **Files created:** 6
- **Files modified:** 1

## Accomplishments
- Custom .npy parser handling v1 and v2 headers, 10 dtypes, big-endian rejection, truncation detection, and alignment-aware zero-copy typed arrays
- .npz parser using fflate unzipSync with proper buffer isolation for each decompressed .npy entry
- Single-pass validateTraceData computing min/max/mean/nanCount/infCount/negativeCount while detecting NaN, Inf, non-2D, empty, all-NaN, and suspicious shapes
- 35 targeted tests (17 npy + 5 npz + 13 validation) covering all behavior specified in the plan, all passing
- Zero `any` types in implementation code; full TypeScript strict mode compliance

## Task Commits

Each task was committed atomically using TDD (test -> feat -> refactor):

1. **Task 1: parseNpy** (TDD)
   - RED: `24df585` - add failing tests for .npy parser (17 test cases)
   - GREEN: `d16635b` - implement .npy parser with zero-copy typed arrays
2. **Task 2: parseNpz** (TDD)
   - RED: `a69ec38` - add failing tests for .npz parser (5 test cases)
   - GREEN: `0768dc9` - implement .npz parser with fflate decompression
3. **Task 3: validateTraceData** (TDD)
   - RED: `3a5907e` - add failing tests for data validation (13 test cases)
   - GREEN: `fe7e9ee` - implement trace data validation with single-pass stats
4. **Deviation fix:** `2389cc7` - fix TypeScript strict mode ArrayBuffer type errors

## Files Created/Modified
- `src/lib/npy-parser.ts` - .npy binary format parser with v1/v2 header support, 10 dtype mappings, zero-copy typed array views
- `src/lib/npz-parser.ts` - .npz zip archive decompression using fflate, iterates and parses contained .npy entries
- `src/lib/validation.ts` - Single-pass trace data validation with stats computation, error/warning classification
- `src/lib/__tests__/npy-parser.test.ts` - 17 tests: happy path (8 dtypes, versions, shapes), errors (7 failure modes), edge cases (2)
- `src/lib/__tests__/npz-parser.test.ts` - 5 tests: single array, multiple arrays, non-.npy skipping, empty npz, corrupted zip
- `src/lib/__tests__/validation.test.ts` - 13 tests: valid data, NaN/Inf/shape warnings, error cases, stats accuracy, negative value handling
- `vitest.config.ts` - Added node environment for lib/__tests__/ via environmentMatchGlobs

## Decisions Made
- **Zero-copy with copy fallback:** TypedArray views are created directly on the ArrayBuffer when data offset is aligned to dtype byte size (the normal case). For the rare unaligned case, data is copied to a new buffer. This avoids the 2x memory cost of always copying while handling edge cases correctly.
- **Regex header parsing:** The .npy header is a Python dict literal. Parsing via regex is safe and avoids any code execution (eval/Function). The three required fields (descr, fortran_order, shape) are extracted individually.
- **Big-endian rejection:** Rather than implementing byte-swapping (complex, rarely needed), big-endian arrays produce a clear error message suggesting the user re-save in little-endian format. All modern lab machines are little-endian.
- **Negative values are informational only:** deltaF/F calcium traces frequently contain negative values. The validator tracks negativeCount in stats but does not produce a warning, avoiding false alarms for valid data.
- **fflate buffer isolation:** fflate's unzipSync returns Uint8Array views on a shared buffer. Passing these directly to parseNpy would fail because the typed array constructor receives the wrong offset/length. Copying via `new Uint8Array(data)` creates a standalone buffer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode ArrayBuffer type errors**
- **Found during:** Overall verification (tsc --noEmit after all GREEN phases)
- **Issue:** `Uint8Array.prototype.buffer` returns `ArrayBuffer | SharedArrayBuffer` in TypeScript strict mode. The `buffer.slice()` call in npz-parser and its test produced a type error because `parseNpy` expects `ArrayBuffer`.
- **Fix:** Changed buffer isolation from `.buffer.slice()` to `new Uint8Array(data)` copy with `as ArrayBuffer` cast. This creates a proper standalone ArrayBuffer.
- **Files modified:** src/lib/npz-parser.ts, src/lib/__tests__/npz-parser.test.ts
- **Verification:** `npx tsc --noEmit` exits 0, all 36 tests pass
- **Committed in:** `2389cc7`

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Type error fix necessary for TypeScript strict mode compliance. No scope creep.

## Issues Encountered
None beyond the deviation noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All parser and validation functions exported and ready for Plan 03 (import UI components)
- FileDropZone component can call parseNpy/parseNpz with the ArrayBuffer from file.arrayBuffer()
- DimensionConfirmation component can use shape from NpyResult
- DataValidationReport component can display ValidationResult warnings/errors
- All types from types.ts (NpyResult, NpzResult, ValidationResult, DataStats) are fully exercised

## Self-Check: PASSED

- All 6 created files verified on disk
- Commit 24df585 verified in git log
- Commit d16635b verified in git log
- Commit a69ec38 verified in git log
- Commit 0768dc9 verified in git log
- Commit 3a5907e verified in git log
- Commit fe7e9ee verified in git log
- Commit 2389cc7 verified in git log
- `npm run test` exits 0 (36 tests passing)
- `npx tsc --noEmit` exits 0
- No `any` types in src/lib/*.ts

---
*Phase: 01-data-foundation*
*Completed: 2026-02-11*
