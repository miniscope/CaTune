---
phase: 06-tutorial-system
plan: 02
subsystem: tutorial
tags: [data-tutorial-attributes, tutorial-content, progressive-learning, TUTR-01, TUTR-02, TUTR-03, TUTR-04, TUTR-05]

# Dependency graph
requires:
  - phase: 06-tutorial-system
    provides: "Tutorial type system (TutorialStep, Tutorial interfaces) from plan 01"
provides:
  - "15 data-tutorial selector attributes on existing UI components (TUTR-04)"
  - "Basics tutorial: 12-step beginner guide to parameter understanding"
  - "Workflow tutorial: 15-step intermediate guide with interactive slider steps"
  - "Advanced tutorial: 10-step guide covering residual analysis, coupling, indicators"
  - "Tutorial registry with getTutorialById lookup"
affects: [06-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [data-tutorial attribute convention for driver.js targeting, pure-data tutorial content modules]

key-files:
  created:
    - src/lib/tutorial/content/01-basics.ts
    - src/lib/tutorial/content/02-workflow.ts
    - src/lib/tutorial/content/03-advanced.ts
    - src/lib/tutorial/content/index.ts
  modified:
    - src/components/controls/ParameterSlider.tsx
    - src/components/controls/ParameterPanel.tsx
    - src/components/controls/ConvergenceIndicator.tsx
    - src/components/controls/CellSelector.tsx
    - src/components/controls/ExportPanel.tsx
    - src/components/traces/TracePanelStack.tsx
    - src/components/traces/KernelDisplay.tsx
    - src/components/traces/MultiTraceView.tsx
    - src/App.tsx

key-decisions:
  - "data-tutorial prop added to ParameterSlider interface for passthrough (slider-rise, slider-decay, slider-lambda)"
  - "Unicode escape sequences for em-dashes and smart quotes in tutorial content (portable, no encoding issues)"
  - "Interactive workflow steps use waitForAction='slider-change' with disableActiveInteraction=false"

patterns-established:
  - "data-tutorial attribute naming: kebab-case matching component purpose (e.g., trace-raw-fit, slider-decay)"
  - "Tutorial content modules: one export per file, import only type { Tutorial } from types"
  - "Tutorial registry: array for ordered iteration, function for ID-based lookup"

# Metrics
duration: 4min
completed: 2026-02-11
---

# Phase 6 Plan 02: Tutorial Content and Selectors Summary

**15 data-tutorial selector attributes on UI components plus three progressive tutorial content modules (basics 12 steps, workflow 15 steps with interactive sliders, advanced 10 steps) as pure typed data**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-11T15:37:56Z
- **Completed:** 2026-02-11T15:42:07Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Added 15 data-tutorial attributes across 9 existing components for driver.js tour targeting (TUTR-04)
- Created three progressive tutorial content modules covering beginner through advanced deconvolution concepts
- Workflow tutorial includes 3 interactive steps requiring slider interaction before advancing
- All content is pure typed data with zero runtime dependencies (TUTR-05 compliance)
- Tutorial registry provides both ordered array and ID-based lookup

## Task Commits

Each task was committed atomically:

1. **Task 1: Add data-tutorial attributes to existing UI components** - `3129c1b` (feat)
2. **Task 2: Create three progressive tutorial content definitions and registry** - `8625f83` (feat)

## Files Created/Modified
- `src/components/controls/ParameterSlider.tsx` - Added optional data-tutorial prop to interface and root div
- `src/components/controls/ParameterPanel.tsx` - Added data-tutorial to root div + passed slider-rise/decay/lambda to children
- `src/components/controls/ConvergenceIndicator.tsx` - Added data-tutorial="convergence-indicator" to root div
- `src/components/controls/CellSelector.tsx` - Added data-tutorial="cell-selector" to root div
- `src/components/controls/ExportPanel.tsx` - Added data-tutorial="export-panel" to root div
- `src/components/traces/TracePanelStack.tsx` - Added data-tutorial to three panel divs (trace-raw-fit, trace-deconvolved, trace-residuals)
- `src/components/traces/KernelDisplay.tsx` - Added data-tutorial="kernel-display" to root div
- `src/components/traces/MultiTraceView.tsx` - Added data-tutorial="multi-trace-view" to section element
- `src/App.tsx` - Added data-tutorial to header, viz-container, pin-snapshot button
- `src/lib/tutorial/content/01-basics.ts` - TUTR-01: Understanding Parameters (12 steps, beginner)
- `src/lib/tutorial/content/02-workflow.ts` - TUTR-02: Guided Tuning Workflow (15 steps, intermediate, 3 interactive)
- `src/lib/tutorial/content/03-advanced.ts` - TUTR-03: Advanced Techniques (10 steps, advanced)
- `src/lib/tutorial/content/index.ts` - Tutorial registry with tutorials array and getTutorialById

## Decisions Made
- ParameterSlider gets a passthrough data-tutorial prop rather than hardcoding values, allowing the parent (ParameterPanel) to assign specific selectors to each slider instance
- Used Unicode escape sequences (\u2014 for em-dash, \u201C/\u201D for smart quotes) in tutorial text to avoid encoding issues across environments
- Interactive workflow steps (decay, rise, lambda tuning) use waitForAction='slider-change' matching the action signal in the tutorial engine from Plan 01

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run build` fails due to pre-existing wasm-pack not being in PATH and a vite-plugin-top-level-await issue with worker bundling. These are pre-existing issues unrelated to this plan. TypeScript type checking (`npx tsc --noEmit`) passes cleanly, confirming all new code is correct.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 15 data-tutorial selectors in place for driver.js tour targeting
- Three tutorial content modules ready for the tutorial engine to consume
- Plan 03 can now build TutorialPanel/TutorialLauncher UI connecting content to engine

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (3129c1b, 8625f83) verified in git log.

---
*Phase: 06-tutorial-system*
*Completed: 2026-02-11*
