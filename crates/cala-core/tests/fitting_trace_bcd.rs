//! Tests for `EvaluateTraces` (thesis §3.2.3, Algorithm 7).
//!
//! Invariants that pin the BCD step against its defining equation:
//! 1. Non-negativity (`max(·, 0)` guard)
//! 2. Exact recovery on orthogonal footprints (no coupling → one step
//!    solves each coord)
//! 3. Approximate recovery on overlapping footprints (coupling → BCD
//!    converges within tolerance)
//! 4. Zero-input gives zero trace (identity property)
//! 5. Latency bound (iter count ≤ `trace_max_iter` regardless of input)

use calab_cala_core::assets::{Footprints, Groups};
use calab_cala_core::config::FitConfig;
use calab_cala_core::fitting::evaluate_traces;

const F32_TOL: f32 = 1e-4;

fn assert_close(actual: f32, expected: f32, ctx: &str) {
    let diff = (actual - expected).abs();
    assert!(
        diff <= F32_TOL,
        "{ctx}: expected {expected}, got {actual} (diff {diff} > tol {F32_TOL})"
    );
}

fn make_frame(pixels: usize) -> Vec<f32> {
    vec![0.0f32; pixels]
}

// ----- Degenerate inputs -----

#[test]
fn zero_components_yields_empty_trace() {
    let fp = Footprints::new(2, 2);
    let groups = Groups::from_footprints(&fp);
    let y = make_frame(4);
    let cfg = FitConfig::default();
    let c = evaluate_traces(&fp, &groups, &y, &[], &cfg);
    assert!(c.is_empty());
}

#[test]
fn zero_frame_drives_trace_to_zero() {
    // y = 0 ⇒ all U = 0; coordinate updates go to max(c + (0 - Vc)/v, 0).
    // For any non-negative starting c, repeated updates must converge to 0.
    let mut fp = Footprints::new(2, 3); // pixels = 6
    fp.push_component(vec![0, 1, 2], vec![1.0, 1.0, 1.0]);
    fp.push_component(vec![3, 4, 5], vec![1.0, 1.0, 1.0]);
    let groups = Groups::from_footprints(&fp);
    let y = make_frame(6);
    let cfg = FitConfig::default();
    let c = evaluate_traces(&fp, &groups, &y, &[1.5f32, 2.0], &cfg);
    assert_eq!(c.len(), 2);
    assert_close(c[0], 0.0, "c[0] on zero frame");
    assert_close(c[1], 0.0, "c[1] on zero frame");
}

// ----- Exact recovery: orthogonal footprints -----

#[test]
fn orthogonal_footprints_recover_trace_exactly() {
    // Two disjoint unit footprints → AᵀA is diagonal. Single BCD pass
    // solves each coord exactly (no cross-coupling). Tighter than the
    // overlap case below, where we only assert tolerance recovery.
    let mut fp = Footprints::new(2, 3); // pixels = 6
    fp.push_component(vec![0, 1, 2], vec![1.0, 1.0, 1.0]);
    fp.push_component(vec![3, 4, 5], vec![1.0, 1.0, 1.0]);
    let groups = Groups::from_footprints(&fp);

    let c_true = [2.0f32, 5.0];
    // y = Ã · c_true: pixels 0..2 get 2·1, pixels 3..5 get 5·1.
    let mut y = vec![0.0f32; 6];
    fp.reconstruct(&c_true, &mut y);

    let cfg = FitConfig::default();
    let c_prev = [0.0f32, 0.0];
    let c = evaluate_traces(&fp, &groups, &y, &c_prev, &cfg);
    assert_close(c[0], c_true[0], "orthogonal recovery c[0]");
    assert_close(c[1], c_true[1], "orthogonal recovery c[1]");
}

// ----- Approximate recovery: overlapping footprints -----

#[test]
fn overlapping_footprints_recover_trace_within_tol() {
    // Shared pixel 2 forces cross-coupling in AᵀA. BCD still converges
    // given enough iterations; tighter tol allowed because the linear
    // system is well-conditioned (2×2 with a single off-diag term).
    let mut fp = Footprints::new(1, 5);
    fp.push_component(vec![0, 1, 2], vec![1.0, 1.0, 1.0]);
    fp.push_component(vec![2, 3, 4], vec![1.0, 1.0, 1.0]);
    let groups = Groups::from_footprints(&fp);
    assert_eq!(groups.len(), 1, "supports overlap at pixel 2");

    let c_true = [3.0f32, 7.0];
    let mut y = vec![0.0f32; 5];
    fp.reconstruct(&c_true, &mut y);

    // Tol tightened to 1e-5 so the fixed point is reached to well
    // within the test's F32_TOL. The default 1e-3 is correct for the
    // streaming fit (amortized over many frames) but too loose for a
    // single-frame recovery assertion.
    let cfg = FitConfig::default()
        .with_trace_max_iter(500)
        .with_trace_tol(1e-5);
    let c = evaluate_traces(&fp, &groups, &y, &[0.0f32, 0.0], &cfg);
    assert_close(c[0], c_true[0], "overlapping recovery c[0]");
    assert_close(c[1], c_true[1], "overlapping recovery c[1]");
}

// ----- Non-negativity -----

#[test]
fn trace_update_clamps_to_zero() {
    // Construct a frame that would push c[0] negative in an unconstrained
    // LS fit (value at pixel 0 smaller than the footprint weight there
    // times the neighbour's contribution). The `max(·, 0)` clamp must
    // floor the output at 0.
    let mut fp = Footprints::new(1, 3);
    fp.push_component(vec![0, 1], vec![1.0, 1.0]);
    fp.push_component(vec![1, 2], vec![1.0, 1.0]);
    let groups = Groups::from_footprints(&fp);

    // y = Ãc with c = (-1, 5). Unconstrained fit would recover that;
    // NNLS clamps c[0] to 0 and adjusts c[1] to the best non-negative fit.
    let y = [-1.0f32, 4.0, 5.0];
    let cfg = FitConfig::default().with_trace_max_iter(200);
    let c = evaluate_traces(&fp, &groups, &y, &[0.0f32, 0.0], &cfg);
    assert!(
        c[0] >= 0.0 && c[1] >= 0.0,
        "NNLS must not return negative c (got {c:?})"
    );
    assert_close(c[0], 0.0, "c[0] clamped to 0 under NNLS");
}

// ----- Latency bound -----

#[test]
fn iteration_bound_is_respected() {
    // Even on a deliberately under-determined setup (tiny max_iter on a
    // problem that needs many iters), the function must return — that
    // is the whole "bounded latency" promise of the `trace_max_iter` knob.
    let mut fp = Footprints::new(1, 3);
    fp.push_component(vec![0, 1, 2], vec![1.0, 1.0, 1.0]);
    fp.push_component(vec![0, 1, 2], vec![1.0, 1.0, 1.0]); // same support
    let groups = Groups::from_footprints(&fp);
    let y = [1.0f32, 2.0, 3.0];
    let cfg = FitConfig::default().with_trace_max_iter(1);
    let c = evaluate_traces(&fp, &groups, &y, &[0.0f32, 0.0], &cfg);
    assert_eq!(c.len(), 2);
    // With max_iter=1 and starting from zero, we did exactly one sweep —
    // no assertion on value other than non-negativity.
    assert!(c.iter().all(|&x| x >= 0.0));
}

// ----- Convergence -----

#[test]
fn tight_tolerance_terminates_early_on_exact_fit() {
    // Orthogonal problem converges in one sweep. Even with huge
    // max_iter, the tolerance check should let us short-circuit.
    // We don't assert the iter count directly (the function doesn't
    // return it) — we just check the answer is exact with max_iter=2.
    let mut fp = Footprints::new(1, 2);
    fp.push_component(vec![0], vec![1.0]);
    fp.push_component(vec![1], vec![1.0]);
    let groups = Groups::from_footprints(&fp);
    let y = [2.0f32, 5.0];
    let cfg = FitConfig::default().with_trace_max_iter(2);
    let c = evaluate_traces(&fp, &groups, &y, &[0.0f32, 0.0], &cfg);
    assert_close(c[0], 2.0, "orthogonal fit after 1 sweep");
    assert_close(c[1], 5.0, "orthogonal fit after 1 sweep");
}

// ----- Input validation -----

#[test]
#[should_panic(expected = "y length")]
fn rejects_mismatched_y_length() {
    let mut fp = Footprints::new(2, 2);
    fp.push_component(vec![0], vec![1.0]);
    let groups = Groups::from_footprints(&fp);
    let cfg = FitConfig::default();
    let _ = evaluate_traces(&fp, &groups, &[0.0f32; 3], &[0.0f32], &cfg);
}

#[test]
#[should_panic(expected = "c_prev length")]
fn rejects_mismatched_c_prev_length() {
    let mut fp = Footprints::new(2, 2);
    fp.push_component(vec![0], vec![1.0]);
    let groups = Groups::from_footprints(&fp);
    let cfg = FitConfig::default();
    let _ = evaluate_traces(&fp, &groups, &[0.0f32; 4], &[0.0f32, 0.0], &cfg);
}
