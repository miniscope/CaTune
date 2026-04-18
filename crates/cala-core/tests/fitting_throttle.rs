//! Tests for `trace_throttle` (thesis §3.2.3, Eq. 3.39).
//!
//! The throttle decrements `c_i` by `mean(−R/Ã_i)` over the exclusive
//! support of `i` where the residual is negative. Its job is to make
//! the residual at those exclusive pixels go to zero, converting a
//! single over-estimated trace into a correct one on frames where a
//! missing overlapping component forced the inflation.

use calab_cala_core::assets::Footprints;
use calab_cala_core::fitting::{evaluate_residual, trace_throttle};

const F32_TOL: f32 = 1e-6;

fn assert_close(actual: f32, expected: f32, ctx: &str) {
    let diff = (actual - expected).abs();
    assert!(
        diff <= F32_TOL,
        "{ctx}: expected {expected}, got {actual} (diff {diff} > tol {F32_TOL})"
    );
}

// ----- No-op cases -----

#[test]
fn empty_footprints_is_noop() {
    let fp = Footprints::new(2, 2);
    let mut c: Vec<f32> = Vec::new();
    trace_throttle(&fp, &mut c, &[0.0f32; 4]);
    assert!(c.is_empty());
}

#[test]
fn zero_residual_leaves_c_unchanged() {
    let mut fp = Footprints::new(1, 3);
    fp.push_component(vec![0, 1, 2], vec![1.0, 1.0, 1.0]);
    let mut c = [2.5f32];
    trace_throttle(&fp, &mut c, &[0.0f32; 3]);
    assert_close(c[0], 2.5, "c untouched on zero residual");
}

#[test]
fn positive_residual_is_not_throttled() {
    // Undershoot (R > 0, reconstruction < observation) is Extend's
    // signal for a missing component — throttle specifically handles
    // overshoot (R < 0 on exclusive support). Verify no decrement.
    let mut fp = Footprints::new(1, 3);
    fp.push_component(vec![0, 1, 2], vec![1.0, 1.0, 1.0]);
    let mut c = [1.0f32];
    trace_throttle(&fp, &mut c, &[0.5f32, 0.3, 0.8]);
    assert_close(c[0], 1.0, "positive residual → no throttle");
}

// ----- Core case: over-estimated trace on exclusive support -----

#[test]
fn overshoot_on_exclusive_support_drives_residual_to_zero() {
    // K = 1, uniform footprint [1, 1, 1]. Actual `c_true = 1` but
    // we fed the model `c_est = 2`. Residual: [-1, -1, -1]
    // δ = mean((-(-1))/1) = 1 → c ← 2 − 1 = 1 (exact recovery).
    let mut fp = Footprints::new(1, 3);
    fp.push_component(vec![0, 1, 2], vec![1.0, 1.0, 1.0]);
    let mut c = [2.0f32];
    let c_true = [1.0f32];
    let y = [1.0f32, 1.0, 1.0];
    let mut r = [0.0f32; 3];
    evaluate_residual(&fp, &c, &y, &mut r);
    assert_eq!(r, [-1.0, -1.0, -1.0]);
    trace_throttle(&fp, &mut c, &r);
    assert_close(c[0], c_true[0], "throttle recovers true c");
}

#[test]
fn throttle_clamps_c_to_zero_not_negative() {
    // If δ exceeds current c, the max(·, 0) clamp prevents c going
    // negative — we never have a "phantom" trace with the opposite sign.
    let mut fp = Footprints::new(1, 2);
    fp.push_component(vec![0, 1], vec![1.0, 1.0]);
    let mut c = [1.0f32];
    let residual = [-5.0f32, -5.0]; // δ = 5; c - δ = -4 clamped to 0.
    trace_throttle(&fp, &mut c, &residual);
    assert_close(c[0], 0.0, "c clamped at 0");
}

// ----- Exclusive-support gating -----

#[test]
fn overshoot_on_shared_pixel_does_not_throttle() {
    // Two components both cover pixel 1; the residual there is
    // negative, but because pixel 1 is shared, it is NOT in Γ for
    // either component. No throttle should apply.
    let mut fp = Footprints::new(1, 3);
    fp.push_component(vec![0, 1], vec![1.0, 1.0]);
    fp.push_component(vec![1, 2], vec![1.0, 1.0]);
    let mut c = [2.0f32, 2.0];
    // Exclusive pixels: 0 (only in comp 0), 2 (only in comp 1). R ≥ 0 on both.
    // Shared pixel: 1. R < 0 on it — but gated out.
    let residual = [0.0f32, -5.0, 0.0];
    trace_throttle(&fp, &mut c, &residual);
    assert_close(c[0], 2.0, "comp 0 unchanged (exclusive R=0)");
    assert_close(c[1], 2.0, "comp 1 unchanged (exclusive R=0)");
}

#[test]
fn throttle_mixes_only_exclusive_pixels_with_negative_residual() {
    // Component 0 has support {0, 1, 2}. Only pixel 0 is exclusive.
    // R[0] = -2, R[1] = -4, R[2] = +1 (not used anyway). Only pixel 0
    // counts → δ = -(-2)/1 = 2. c[0] ← max(3 − 2, 0) = 1.
    let mut fp = Footprints::new(1, 3);
    fp.push_component(vec![0, 1, 2], vec![1.0, 1.0, 1.0]);
    fp.push_component(vec![1, 2], vec![1.0, 1.0]); // shares 1, 2
    let mut c = [3.0f32, 1.0];
    let residual = [-2.0f32, -4.0, 1.0];
    trace_throttle(&fp, &mut c, &residual);
    assert_close(c[0], 1.0, "c[0] throttled by 2");
    // Component 1's support {1, 2} has no exclusive pixels — every
    // pixel is shared with component 0. So c[1] is untouched.
    assert_close(c[1], 1.0, "c[1] untouched (no exclusive support)");
}

#[test]
fn delta_uses_a_i_weighting_not_unweighted_mean() {
    // Pinning Eq. 3.39 exactly: δ = mean(−R / Ã[p, i]). Non-uniform
    // footprint values exercise the weighting — without it the test
    // would still pass on a uniform footprint by coincidence.
    //
    // Support {0, 1}, values [1, 2]. R = [-3, -4].
    // −R/a = [3/1, 4/2] = [3, 2]. mean = 2.5. c ← 5 − 2.5 = 2.5.
    let mut fp = Footprints::new(1, 2);
    fp.push_component(vec![0, 1], vec![1.0, 2.0]);
    let mut c = [5.0f32];
    trace_throttle(&fp, &mut c, &[-3.0f32, -4.0]);
    assert_close(c[0], 2.5, "weighted mean of −R/a");
}
