//! Tests for the reconstructed-movie rank-1 NMF merge
//! (thesis §3.3 MergeEstimators, Phase 3 Task 7).

use calab_cala_core::extending::merge::merge_components;

const F32_TOL: f32 = 1e-4;

fn approx(a: f32, b: f32, tol: f32, ctx: &str) {
    assert!((a - b).abs() <= tol, "{ctx}: {a} vs {b} (tol {tol})");
}

fn l2(v: &[f32]) -> f32 {
    v.iter().map(|&x| x * x).sum::<f32>().sqrt()
}

// ----- identical-source merge -----

#[test]
fn merge_of_identical_pair_recovers_the_same_source() {
    // Same support, same footprint, same trace. The reconstructed
    // movie is 2·a·cᵀ — still rank-1 → merge trivially recovers the
    // (scaled) original. Unit-L2 normalization makes `a` identical
    // to the normalized input, and `c` carries the 2× scale.
    let support = vec![0u32, 1, 2, 3];
    let a_raw = vec![0.2, 0.8, 0.8, 0.2];
    let a_norm = l2(&a_raw);
    let a: Vec<f32> = a_raw.iter().map(|v| v / a_norm).collect();
    let c = vec![0.1f32, 0.5, 1.2, 0.8, 0.3];

    let result = merge_components(&support, &a, &c, &support, &a, &c, 100, 1e-6);
    assert_eq!(result.support, support);
    approx(l2(&result.a_values), 1.0, F32_TOL, "merged ‖a‖ unit L2");
    // Merged a should match the input direction (unit vectors).
    for (i, (got, want)) in result.a_values.iter().zip(&a).enumerate() {
        approx(*got, *want, F32_TOL, &format!("a[{i}]"));
    }
    // Merged c should be 2× the input c.
    for (i, (got, want)) in result.c.iter().zip(&c).enumerate() {
        approx(*got, 2.0 * want, F32_TOL, &format!("c[{i}]"));
    }
    assert!(result.recon_error < 1e-5);
    assert!(result.converged);
}

// ----- redundant-but-scaled pair -----

#[test]
fn merge_of_scaled_copies_still_rank_one() {
    // Same support, same footprint direction, trace_j = 0.3 * trace_i.
    // Reconstructed movie = a_i (c_i + 0.3 c_i)ᵀ = a_i (1.3 c_i)ᵀ.
    // Rank-1 → recon_error ≈ 0.
    let support = vec![5u32, 6, 7, 8];
    let a_raw = vec![1.0f32, 2.0, 2.0, 1.0];
    let a_norm = l2(&a_raw);
    let a: Vec<f32> = a_raw.iter().map(|v| v / a_norm).collect();
    let c_i = vec![0.5f32, 1.5, 2.0, 1.0, 0.2];
    let c_j: Vec<f32> = c_i.iter().map(|v| 0.3 * v).collect();

    let result = merge_components(&support, &a, &c_i, &support, &a, &c_j, 100, 1e-6);
    approx(l2(&result.a_values), 1.0, F32_TOL, "unit L2");
    assert!(
        result.recon_error < 1e-5,
        "rank-1 merge should be clean (got {})",
        result.recon_error
    );
}

// ----- disjoint supports -----

#[test]
fn merge_of_disjoint_supports_uses_union_footprint() {
    // Two non-overlapping components with traces that look
    // proportional (0.5x scaling) — the reconstructed movie still
    // is rank-1: M[t,p] = (a_i[p] + 0.5 * a_j[p]) * c_i[t]. So NMF
    // nails it cleanly and the union support gets correct mass.
    let support_i = vec![0u32, 1, 2];
    let a_i = vec![0.6, 0.6, 0.6_f32];
    let support_j = vec![10u32, 11, 12];
    let a_j = vec![0.8, 0.8, 0.8_f32];
    let c_i = vec![1.0, 2.0, 3.0, 2.0, 1.0];
    let c_j: Vec<f32> = c_i.iter().map(|v| 0.5 * v).collect();

    let result = merge_components(&support_i, &a_i, &c_i, &support_j, &a_j, &c_j, 100, 1e-6);
    assert_eq!(result.support, vec![0, 1, 2, 10, 11, 12]);
    approx(l2(&result.a_values), 1.0, F32_TOL, "unit L2");
    assert!(
        result.recon_error < 1e-5,
        "scaled-proportional disjoint merge should be rank-1"
    );
    // Both sides of the union carry positive mass.
    for v in &result.a_values {
        assert!(*v > 0.0, "every union pixel should have non-zero value");
    }
}

#[test]
fn merge_overlapping_supports_adds_at_shared_pixels() {
    // i has pixels {0, 1}, j has {1, 2}. Same trace direction, so the
    // reconstructed movie is rank-1. At pixel 1 the merged mass
    // combines both contributions.
    let support_i = vec![0u32, 1];
    let a_i = vec![0.6, 0.8_f32];
    let support_j = vec![1u32, 2];
    let a_j = vec![0.5, 0.8_f32];
    let c = vec![1.0f32, 2.0, 1.5, 0.5];

    let result = merge_components(&support_i, &a_i, &c, &support_j, &a_j, &c, 100, 1e-6);
    assert_eq!(result.support, vec![0, 1, 2]);
    // Merged spatial mass = a_i + a_j at the union = [0.6, 1.3, 0.8], then normalized.
    let expected_raw = [0.6, 1.3, 0.8];
    let expected_norm = l2(&expected_raw);
    let expected: Vec<f32> = expected_raw.iter().map(|v| v / expected_norm).collect();
    for (i, (got, want)) in result.a_values.iter().zip(&expected).enumerate() {
        approx(*got, *want, F32_TOL, &format!("merged a[{i}]"));
    }
    assert!(result.recon_error < 1e-5);
}

// ----- distinct-source pair -----

#[test]
fn merge_of_genuinely_distinct_pair_leaves_residual_error() {
    // Two components with different spatial and different temporal
    // patterns. Reconstructed movie has rank 2 → rank-1 NMF cannot
    // fit it cleanly, and recon_error is well above 0. This is the
    // signal a caller uses to detect "merge shouldn't have fired".
    let support_i = vec![0u32, 1, 2];
    let a_i = vec![0.8, 0.4, 0.2_f32];
    let support_j = vec![3u32, 4, 5];
    let a_j = vec![0.2, 0.4, 0.8_f32];
    let c_i = vec![1.0f32, 0.0, 1.0, 0.0, 1.0];
    let c_j = vec![0.0f32, 1.0, 0.0, 1.0, 0.0];

    let result = merge_components(&support_i, &a_i, &c_i, &support_j, &a_j, &c_j, 200, 1e-8);
    assert!(
        result.recon_error > 0.1,
        "distinct-source merge should leave residual (got {})",
        result.recon_error
    );
}

// ----- bookkeeping -----

#[test]
fn merge_preserves_support_sort_order() {
    let support_i = vec![2u32, 5, 9];
    let a_i = vec![0.5, 0.5, 0.5];
    let support_j = vec![3u32, 5, 8, 12];
    let a_j = vec![0.3, 0.3, 0.3, 0.3];
    let c = vec![1.0f32, 2.0, 3.0];

    let result = merge_components(&support_i, &a_i, &c, &support_j, &a_j, &c, 50, 1e-5);
    assert_eq!(result.support, vec![2, 3, 5, 8, 9, 12]);
    for win in result.support.windows(2) {
        assert!(win[0] < win[1]);
    }
}

#[test]
fn merge_returns_correct_trace_length() {
    let support = vec![0u32, 1];
    let a = vec![0.5, 0.5];
    let c = vec![0.0f32; 17]; // arbitrary length
    let result = merge_components(&support, &a, &c, &support, &a, &c, 10, 1e-5);
    assert_eq!(result.c.len(), 17);
}

#[test]
#[should_panic(expected = "support_i / a_values_i length mismatch")]
fn merge_panics_on_support_i_shape_mismatch() {
    let _ = merge_components(
        &[0, 1],
        &[0.5],
        &[1.0, 2.0],
        &[2],
        &[0.5],
        &[1.0, 2.0],
        10,
        1e-5,
    );
}

#[test]
#[should_panic(expected = "trace length mismatch")]
fn merge_panics_on_trace_length_mismatch() {
    let _ = merge_components(
        &[0],
        &[1.0],
        &[1.0, 2.0],
        &[1],
        &[1.0],
        &[1.0, 2.0, 3.0],
        10,
        1e-5,
    );
}
