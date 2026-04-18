//! Tests for `EvaluateSuffStats` — the SNR-gated recursive-mean update
//! for `W`, `M` (thesis §3.2.3, Eq. 3.25).
//!
//! Pins the three things that matter:
//! 1. The recursive-mean form: after frame t, `W` is exactly the average
//!    of the per-frame outer products `y_τ f(c_τ)ᵀ` over τ = 1..t.
//! 2. The SNR gate `f(c) = c · H(c − c₀)` zeros out contributions
//!    from components with traces below threshold, so footprints don't
//!    drift toward noise during inactive frames.
//! 3. The frame counter advances exactly once per call.

use calab_cala_core::assets::SuffStats;
use calab_cala_core::config::FitConfig;
use calab_cala_core::fitting::evaluate_suff_stats;

const F32_TOL: f32 = 1e-6;

fn assert_close(actual: f32, expected: f32, ctx: &str) {
    let diff = (actual - expected).abs();
    assert!(
        diff <= F32_TOL,
        "{ctx}: expected {expected}, got {actual} (diff {diff} > tol {F32_TOL})"
    );
}

// ----- First-frame contribution -----

#[test]
fn first_frame_sets_w_to_outer_product_of_y_and_c() {
    // At t=1 the (t-1)/t coefficient is 0, so W_1 = y_1 f(c_1)ᵀ.
    // With snr_c0 = 0 (default), f(c) = c for any c > 0.
    let mut ss = SuffStats::new(3, 2);
    let y = [1.0f32, 2.0, 3.0];
    let c = [0.5f32, 1.5];
    let cfg = FitConfig::default();
    evaluate_suff_stats(&mut ss, &y, &c, &cfg);
    // W[p, i] = y[p] * c[i]
    assert_close(ss.w_at(0, 0), 1.0 * 0.5, "W[0,0]");
    assert_close(ss.w_at(0, 1), 1.0 * 1.5, "W[0,1]");
    assert_close(ss.w_at(2, 0), 3.0 * 0.5, "W[2,0]");
    assert_close(ss.w_at(2, 1), 3.0 * 1.5, "W[2,1]");
    assert_eq!(ss.frames(), 1);
}

#[test]
fn first_frame_sets_m_to_outer_product_of_c() {
    let mut ss = SuffStats::new(2, 3);
    let y = [0.0f32, 0.0];
    let c = [2.0f32, 4.0, 0.5];
    let cfg = FitConfig::default();
    evaluate_suff_stats(&mut ss, &y, &c, &cfg);
    // M[i, j] = c[i] * f(c[j]); with c₀ = 0 and all c > 0, f(c) = c.
    // So M[i, j] = c[i] * c[j].
    assert_close(ss.m_at(0, 0), 4.0, "M[0,0]");
    assert_close(ss.m_at(0, 1), 8.0, "M[0,1]");
    assert_close(ss.m_at(0, 2), 1.0, "M[0,2]");
    assert_close(ss.m_at(1, 1), 16.0, "M[1,1]");
    assert_close(ss.m_at(2, 2), 0.25, "M[2,2]");
}

// ----- Recursive mean -----

#[test]
fn second_frame_averages_with_first() {
    // Two frames, each contributes y·cᵀ. After frame 2, W should
    // equal the arithmetic mean: W = 0.5 · (y1·c1ᵀ + y2·c2ᵀ).
    // y2·c2ᵀ pixel 0 col 0 = 4·2 = 8; y1·c1ᵀ pixel 0 col 0 = 2·1 = 2.
    // Mean = 5. With (t-1)/t=0.5 on frame 2: W_2[0,0] = 0.5·2 + 0.5·8 = 5.
    let mut ss = SuffStats::new(2, 1);
    let cfg = FitConfig::default();
    evaluate_suff_stats(&mut ss, &[2.0f32, 3.0], &[1.0f32], &cfg);
    evaluate_suff_stats(&mut ss, &[4.0f32, 5.0], &[2.0f32], &cfg);
    assert_eq!(ss.frames(), 2);
    // W[0, 0] = 0.5 · (2·1 + 4·2) = 0.5 · 10 = 5.0
    assert_close(ss.w_at(0, 0), 5.0, "W[0,0] after 2 frames");
    // W[1, 0] = 0.5 · (3·1 + 5·2) = 0.5 · 13 = 6.5
    assert_close(ss.w_at(1, 0), 6.5, "W[1,0] after 2 frames");
    // M[0, 0] = 0.5 · (1² + 2²) = 0.5 · 5 = 2.5
    assert_close(ss.m_at(0, 0), 2.5, "M[0,0] after 2 frames");
}

#[test]
fn three_frame_rolling_mean_matches_closed_form() {
    // After N frames with same y, c, the rolling mean converges to the
    // static outer product. This is the defining property of the
    // recursive-mean update (Eq. 3.22 / 3.25).
    let mut ss = SuffStats::new(1, 1);
    let cfg = FitConfig::default();
    for _ in 0..3 {
        evaluate_suff_stats(&mut ss, &[7.0f32], &[3.0f32], &cfg);
    }
    // W[0, 0] = mean of {7·3, 7·3, 7·3} = 21.
    assert_close(ss.w_at(0, 0), 21.0, "W[0,0] steady state");
    assert_close(ss.m_at(0, 0), 9.0, "M[0,0] steady state");
    assert_eq!(ss.frames(), 3);
}

// ----- SNR gate -----

#[test]
fn component_below_c0_contributes_nothing_to_w_column() {
    // c[1] below threshold → f(c[1]) = 0 → column 1 of W (this frame)
    // gets a zero increment.
    let mut ss = SuffStats::new(2, 2);
    let cfg = FitConfig::default().with_snr_c0(1.0);
    let y = [5.0f32, 6.0];
    let c = [2.0f32, 0.5]; // c[1] = 0.5 < c₀ = 1.0
    evaluate_suff_stats(&mut ss, &y, &c, &cfg);
    assert_close(ss.w_at(0, 0), 10.0, "W[0,0] from active c[0]");
    assert_close(ss.w_at(0, 1), 0.0, "W[0,1] gated by inactive c[1]");
    assert_close(ss.w_at(1, 1), 0.0, "W[1,1] gated by inactive c[1]");
}

#[test]
fn gate_applies_to_m_column_only_per_thesis() {
    // Thesis Eq. 3.25: M_t = ((t-1)/t) M_{t-1} + (1/t) c̃_t f(c̃_t)ᵀ.
    // The outer product is c̃ (left) × f(c̃) (right, gated), so the
    // *column* of M indexed by an inactive component gets zero
    // contribution, but the *row* still accumulates c̃ at its raw
    // value. We implement exactly as written; see suff_stats.rs for
    // the symmetry-break rationale (EvaluateFootprints uses M[:, i]).
    let mut ss = SuffStats::new(1, 2);
    let cfg = FitConfig::default().with_snr_c0(1.0);
    let c = [2.0f32, 0.5]; // c[1] gated
    evaluate_suff_stats(&mut ss, &[0.0f32], &c, &cfg);
    // M[i, j] = c[i] * f(c[j]).
    assert_close(ss.m_at(0, 0), 4.0, "M[0,0]: c[0]*f(c[0]) = 2*2");
    assert_close(ss.m_at(0, 1), 0.0, "M[0,1]: c[0]*f(c[1]) = 2*0");
    assert_close(ss.m_at(1, 0), 1.0, "M[1,0]: c[1]*f(c[0]) = 0.5*2");
    assert_close(ss.m_at(1, 1), 0.0, "M[1,1]: c[1]*f(c[1]) = 0.5*0");
}

#[test]
fn inactive_frame_advances_counter_but_does_not_update_stats() {
    // If every component is below threshold, f(c) = 0 everywhere →
    // the new-frame contribution is zero and the (t-1)/t decay shrinks
    // the previous W/M by one step. Frame counter still advances: this
    // is the mechanism by which `W` approaches zero if an estimator
    // goes quiet for a long time (so its footprint can be retired).
    let mut ss = SuffStats::new(1, 1);
    let cfg = FitConfig::default().with_snr_c0(1.0);
    // Frame 1: active.
    evaluate_suff_stats(&mut ss, &[4.0f32], &[2.0f32], &cfg);
    assert_close(ss.w_at(0, 0), 8.0, "W after active frame");
    // Frame 2: inactive (c below c₀).
    evaluate_suff_stats(&mut ss, &[4.0f32], &[0.0f32], &cfg);
    // W_2 = (1/2) W_1 + 0 = 4.0. Counter now = 2.
    assert_close(ss.w_at(0, 0), 4.0, "W decayed under inactive frame");
    assert_eq!(ss.frames(), 2);
}

// ----- Input validation -----

#[test]
#[should_panic(expected = "y length")]
fn rejects_mismatched_y_length() {
    let mut ss = SuffStats::new(3, 2);
    let cfg = FitConfig::default();
    evaluate_suff_stats(&mut ss, &[1.0f32, 2.0], &[0.0f32, 0.0], &cfg);
}

#[test]
#[should_panic(expected = "c length")]
fn rejects_mismatched_c_length() {
    let mut ss = SuffStats::new(3, 2);
    let cfg = FitConfig::default();
    evaluate_suff_stats(&mut ss, &[1.0f32; 3], &[0.0f32], &cfg);
}
