# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-10)

**Core value:** Neuroscientists can interactively tune deconvolution parameters on their own calcium imaging data, see immediate visual feedback of fit quality, and learn the tuning workflow through progressive guided tutorials -- all in the browser with zero setup.
**Current focus:** Phase 2 - WASM Solver

## Current Position

Phase: 2 of 8 (WASM Solver)
Plan: 2 of 3 in current phase
Status: Executing
Last activity: 2026-02-11 -- Completed 02-02 (WASM Bridge and Worker API)

Progress: [██████░░░░] 2/3 Phase 2

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 6 min
- Total execution time: 27 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-data-foundation | 3/3 | 8 min | 3 min |
| 02-wasm-solver | 2/3 | 19 min | 10 min |

**Recent Trend:**
- Last 5 plans: 01-02 (5 min), 01-03 (?), 02-01 (13 min), 02-02 (6 min)
- Trend: 02-02 faster than 02-01 (no algorithm debugging, mostly wiring)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Custom ISTA solver in Rust over OSQP-WASM (per research recommendation)
- [Roadmap]: Transferable ArrayBuffer ping-pong for worker communication (GitHub Pages cannot serve COOP/COEP headers for SharedArrayBuffer)
- [Roadmap]: Phases 2 (solver) and 3 (visualization) can develop in parallel
- [01-01]: Manual project scaffold instead of npm init solid for precise Vite 7 version control
- [01-01]: Individual SolidJS signals (createSignal) instead of createStore for linear import flow
- [01-01]: jsdom added as devDependency for Vitest DOM test environment
- [01-02]: Zero-copy typed array view with copy fallback for unaligned offsets
- [01-02]: Regex header parsing for .npy Python dict literals (no eval/Function)
- [01-02]: Big-endian rejection with helpful message rather than byte-swapping
- [01-02]: Negative values tracked in stats but no warning (deltaF/F can be negative)
- [02-01]: DFT-based Lipschitz constant instead of sum-of-squares (operator norm, not Frobenius norm)
- [02-01]: FISTA with adaptive restart (O'Donoghue & Candes 2015) to prevent oscillation with non-negativity
- [02-01]: Two-sequence FISTA formulation (x_k proximal, y_k extrapolated) for correct convergence
- [02-01]: Homebrew gcc-15 as C linker for Rust native tests (WSL2 lacks build-essential)
- [02-02]: Disabled wasm-opt (bundled version incompatible with Rust 1.93 bulk-memory ops)
- [02-02]: LIBRARY_PATH env var for wasm-pack host-target build script compilation
- [02-02]: Worker singleton pattern (create once, never terminate) for WASM instance reuse

### Pending Todos

None yet.

### Blockers/Concerns

- ~~Library version verification needed before Phase 1 scaffolding~~ RESOLVED: Vite 7.3.1, SolidJS 1.9.x, Vitest 4.0.18 all verified and installed

## Session Continuity

Last session: 2026-02-11
Stopped at: Completed 02-02-PLAN.md (WASM Bridge and Worker API)
Resume file: .planning/phases/02-wasm-solver/02-02-SUMMARY.md
