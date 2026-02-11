---
phase: 02-wasm-solver
plan: 01
subsystem: solver
tags: [rust, fista, deconvolution, calcium-imaging, wasm-bindgen, double-exponential-kernel]

# Dependency graph
requires:
  - phase: 01-data-foundation
    provides: "Project scaffold, data types, reactive store for trace data"
provides:
  - "Rust catune-solver crate with FISTA solver, double-exponential kernel, AR(2) derivation"
  - "Pre-allocated buffer pattern for WASM memory efficiency"
  - "Warm-start state serialization (export_state/load_state)"
  - "Correct Lipschitz constant via DFT power spectrum"
affects: [02-wasm-solver, 08-python-companion]

# Tech tracking
tech-stack:
  added: [rust-1.93, wasm-bindgen-0.2, console_error_panic_hook-0.1, gcc-15-via-homebrew]
  patterns: [fista-with-adaptive-restart, dft-lipschitz-constant, grow-never-shrink-buffers, two-sequence-fista]

key-files:
  created:
    - wasm/catune-solver/Cargo.toml
    - wasm/catune-solver/src/lib.rs
    - wasm/catune-solver/src/kernel.rs
    - wasm/catune-solver/src/fista.rs
    - wasm/catune-solver/.cargo/config.toml
    - wasm/catune-solver/Cargo.lock
  modified: []

key-decisions:
  - "DFT-based Lipschitz constant instead of sum-of-squares (sum-of-squares is Frobenius norm, not operator norm)"
  - "FISTA with adaptive restart (O'Donoghue & Candes 2015) to prevent oscillation with non-negativity projection"
  - "Two-sequence FISTA formulation (x_k proximal, y_k extrapolated) instead of single-sequence with post-hoc momentum"
  - "Homebrew gcc-15 as C linker for Rust native tests (system lacks build-essential)"

patterns-established:
  - "Two-sequence FISTA: evaluate gradient at extrapolated point y_k, proximal step gives x_{k+1}, then extrapolate to y_{k+1}"
  - "Adaptive restart: reset t_fista to 1.0 when objective increases, preventing momentum-induced oscillation"
  - "DFT Lipschitz: compute max|H(w)|^2 via zero-padded DFT for tight step size bound"
  - "Grow-never-shrink buffers: all Vec<f64> buffers grow on larger traces but never shrink (WASM memory pattern)"

# Metrics
duration: 13min
completed: 2026-02-11
---

# Phase 2 Plan 1: Rust FISTA Solver Core Summary

**FISTA calcium deconvolution solver in Rust with double-exponential kernel, adaptive restart, DFT-based Lipschitz constant, and 16 passing tests on synthetic traces**

## Performance

- **Duration:** 13 min
- **Started:** 2026-02-11T04:17:44Z
- **Completed:** 2026-02-11T04:31:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Built complete Rust FISTA solver for L1-penalized non-negative deconvolution with Float64 precision
- Implemented peak-normalized double-exponential kernel, AR(2) derivation, and DFT-based Lipschitz constant
- FISTA with two-sequence formulation and adaptive restart converges correctly on synthetic calcium traces
- Warm-start state serialization enables faster reconvergence on parameter changes
- All 16 cargo tests pass: kernel normalization, impulse recovery, convergence, non-negativity, determinism, reconvolution quality, warm-start speedup

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Rust crate and implement double-exponential kernel with tests** - `e4b2b95` (feat)
2. **Task 2: Implement FISTA algorithm with convergence and verify on synthetic traces** - `9863191` (feat)

## Files Created/Modified
- `wasm/catune-solver/Cargo.toml` - Rust crate config with cdylib+rlib targets, wasm-bindgen dependency
- `wasm/catune-solver/src/lib.rs` - Solver struct with pre-allocated buffers, set_params, set_trace, getters, warm-start serialization
- `wasm/catune-solver/src/kernel.rs` - build_kernel (peak-normalized double-exp), tau_to_ar2, compute_lipschitz (DFT-based)
- `wasm/catune-solver/src/fista.rs` - FISTA step_batch with adaptive restart, forward/adjoint convolution, 8 synthetic trace tests
- `wasm/catune-solver/.cargo/config.toml` - Linker flags for glibc (Homebrew gcc-15)
- `wasm/catune-solver/Cargo.lock` - Locked dependency versions

## Decisions Made

1. **DFT-based Lipschitz constant** -- The plan and research specified `L = sum(k^2)` (sum of kernel squared values), but this is the Frobenius norm of the convolution matrix, NOT the operator norm. The correct Lipschitz constant is `max_w |H(w)|^2` (max power spectrum), computed via direct DFT. For the default kernel (tau_rise=0.02, tau_decay=0.4, fs=30), the correct L=193.3 vs the incorrect L=7.8. Using the wrong value caused the step size to be 25x too large, resulting in divergent oscillation.

2. **FISTA adaptive restart** -- Standard FISTA with non-negativity projection oscillates because the momentum term can push the solution into the infeasible region, which gets clipped, corrupting the momentum direction. Adaptive restart (O'Donoghue & Candes 2015) resets momentum when the objective increases, stabilizing convergence.

3. **Two-sequence FISTA formulation** -- The plan described a single-sequence approach (gradient at x_k, then momentum). The correct FISTA maintains two sequences: x_k (proximal update) and y_k (extrapolated point where gradient is evaluated). This was necessary for convergence.

4. **Homebrew gcc-15 as linker** -- The WSL2 environment lacks build-essential/gcc. Installed via `brew install gcc glibc` and configured via `.cargo/config.toml` with linker flags.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Lipschitz constant computation**
- **Found during:** Task 2 (FISTA implementation -- all solver tests failing)
- **Issue:** `compute_lipschitz` used sum of kernel squared values (Frobenius norm), but the correct Lipschitz constant for the gradient of a convolution loss is the max power spectrum (operator norm). This caused a 25x overestimate of step size, leading to divergent oscillation.
- **Fix:** Reimplemented `compute_lipschitz` to compute `max_w |H(w)|^2` via direct DFT with zero-padding. Updated kernel test to validate bounds (>= sum-of-squares, <= L1-norm-squared).
- **Files modified:** wasm/catune-solver/src/kernel.rs
- **Verification:** All 16 tests pass. Solver converges monotonically on synthetic traces.
- **Committed in:** 9863191 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed FISTA formulation from single-sequence to two-sequence**
- **Found during:** Task 2 (FISTA implementation -- solver oscillating between solution and zero)
- **Issue:** The plan described a single-sequence FISTA where gradient is evaluated at x_k and momentum is applied post-hoc. This causes oscillation with non-negativity projection because the momentum direction is computed from an inconsistent state.
- **Fix:** Implemented correct two-sequence FISTA (Beck & Teboulle 2009): gradient evaluated at extrapolated point y_k, proximal step gives x_{k+1}, then extrapolate to y_{k+1}. Added `convolve_forward_from_prev` for gradient evaluation at y_k. Added adaptive restart when objective increases.
- **Files modified:** wasm/catune-solver/src/fista.rs
- **Verification:** Solver converges monotonically. Delta impulse recovery, reconvolution quality, and warm-start tests all pass.
- **Committed in:** 9863191 (Task 2 commit)

**3. [Rule 3 - Blocking] Installed Rust toolchain and C linker**
- **Found during:** Task 1 (crate scaffold -- Rust not installed)
- **Issue:** WSL2 environment had no Rust toolchain and no C compiler/linker for native test builds.
- **Fix:** Installed Rust 1.93 via rustup, added wasm32-unknown-unknown target, installed gcc-15 and glibc via Homebrew, configured `.cargo/config.toml` with linker flags.
- **Files modified:** wasm/catune-solver/.cargo/config.toml
- **Verification:** `cargo test` and `cargo build` both succeed.
- **Committed in:** e4b2b95 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes were essential for correctness. The Lipschitz constant and FISTA formulation fixes are mathematically important -- the research noted sum-of-squares as a bound but it was not a valid one for the operator norm. No scope creep.

## Issues Encountered
- The research document's Lipschitz constant formula (`sum(k^2)`) is a common misconception -- it equals the Frobenius norm of the convolution matrix, not the spectral norm. The correct bound requires computing the maximum of the kernel's power spectrum.
- Standard FISTA is known to be unstable with non-negativity constraints due to the interaction between momentum extrapolation and projection. Adaptive restart is a well-known fix in the optimization literature.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Rust crate compiles and all 16 tests pass on native target
- Solver struct has all public methods needed for WASM binding in Plan 02: new, set_params, set_trace, step_batch, converged, iteration_count, get_solution, get_reconvolution, reset_momentum, export_state, load_state
- wasm-bindgen attributes not yet added (deferred to Plan 02 per spec)
- No f32 anywhere in computation (Float64 throughout per COMP-07)

## Self-Check: PASSED

All 6 created files verified present on disk. Both task commits (e4b2b95, 9863191) verified in git log. 16/16 cargo tests pass.

---
*Phase: 02-wasm-solver*
*Completed: 2026-02-11*
