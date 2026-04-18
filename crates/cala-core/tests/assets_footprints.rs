//! Tests for the sparse footprint matrix `Ã` (thesis §3.2.3, Eq. 3.18).
//!
//! Footprints store one column per estimator, with only positive-support
//! pixels held in memory. The fit loop depends on three hot operations
//! (`Aᵀy`, `AᵀA`, positive-support column update) — design §5 names them
//! as the ops to benchmark in Phase 3. These tests pin their semantics
//! against the defining equations and synthetic ground truth so later
//! storage swaps (raw Vec-based today, `sprs` CSC later if profiling
//! demands) cannot silently change the math.

use calab_cala_core::assets::Footprints;

const F32_TOL: f32 = 1e-6;

fn assert_close(actual: f32, expected: f32, ctx: &str) {
    let diff = (actual - expected).abs();
    assert!(
        diff <= F32_TOL,
        "{ctx}: expected {expected}, got {actual} (diff {diff} > tol {F32_TOL})"
    );
}

fn assert_slice_close(actual: &[f32], expected: &[f32], ctx: &str) {
    assert_eq!(
        actual.len(),
        expected.len(),
        "{ctx}: length mismatch ({} vs {})",
        actual.len(),
        expected.len()
    );
    for (i, (a, e)) in actual.iter().zip(expected.iter()).enumerate() {
        let diff = (a - e).abs();
        assert!(
            diff <= F32_TOL,
            "{ctx}[{i}]: expected {e}, got {a} (diff {diff} > tol {F32_TOL})"
        );
    }
}

// ----- Shape + basic bookkeeping -----

#[test]
fn new_footprints_are_empty() {
    let fp = Footprints::new(4, 5);
    assert_eq!(fp.height(), 4);
    assert_eq!(fp.width(), 5);
    assert_eq!(fp.pixels(), 20);
    assert_eq!(fp.len(), 0);
    assert!(fp.is_empty());
}

#[test]
fn push_component_returns_sequential_indices() {
    let mut fp = Footprints::new(3, 3);
    let a = fp.push_component(vec![0, 1], vec![1.0, 2.0]);
    let b = fp.push_component(vec![4], vec![3.0]);
    assert_eq!(a, 0);
    assert_eq!(b, 1);
    assert_eq!(fp.len(), 2);
    assert!(!fp.is_empty());
}

#[test]
fn support_and_values_round_trip() {
    let mut fp = Footprints::new(2, 3);
    fp.push_component(vec![0, 2, 4], vec![0.25, 0.5, 0.25]);
    assert_eq!(fp.support(0), &[0u32, 2, 4]);
    assert_slice_close(fp.values(0), &[0.25, 0.5, 0.25], "values(0)");
}

// ----- Input validation -----

#[test]
#[should_panic(expected = "support / values length mismatch")]
fn push_rejects_mismatched_lengths() {
    let mut fp = Footprints::new(2, 2);
    fp.push_component(vec![0, 1], vec![1.0]);
}

#[test]
#[should_panic(expected = "support must be strictly ascending")]
fn push_rejects_unsorted_support() {
    let mut fp = Footprints::new(2, 2);
    fp.push_component(vec![1, 0], vec![1.0, 1.0]);
}

#[test]
#[should_panic(expected = "support must be strictly ascending")]
fn push_rejects_duplicate_support() {
    // Duplicates break the "each pixel contributes at most once per column"
    // invariant Aᵀy and AᵀA rely on. Also would let values silently double-count.
    let mut fp = Footprints::new(2, 2);
    fp.push_component(vec![1, 1], vec![1.0, 1.0]);
}

#[test]
#[should_panic(expected = "values must be positive")]
fn push_rejects_zero_value() {
    // Footprint values must be strictly positive — the whole point of the
    // sparse rep is that stored entries are on positive support.
    // `EvaluateFootprints` will zero some entries via the `max(·, 0)` step
    // in Algorithm 8, and `compact` is how they leave the rep.
    let mut fp = Footprints::new(2, 2);
    fp.push_component(vec![0, 1], vec![1.0, 0.0]);
}

#[test]
#[should_panic(expected = "values must be positive")]
fn push_rejects_negative_value() {
    let mut fp = Footprints::new(2, 2);
    fp.push_component(vec![0], vec![-1.0]);
}

#[test]
#[should_panic(expected = "pixel index")]
fn push_rejects_out_of_range_pixel() {
    let mut fp = Footprints::new(2, 2); // pixels = 4
    fp.push_component(vec![4], vec![1.0]);
}

// ----- Aᵀy -----

#[test]
fn aty_is_inner_product_on_support() {
    // Single component with support {0, 2, 4} and values {0.5, 0.5, 0.5}.
    // y = [1, 2, 3, 4, 5]. result[0] = 0.5*1 + 0.5*3 + 0.5*5 = 4.5.
    let mut fp = Footprints::new(1, 5);
    fp.push_component(vec![0, 2, 4], vec![0.5, 0.5, 0.5]);
    let y = [1.0f32, 2.0, 3.0, 4.0, 5.0];
    let u = fp.aty(&y);
    assert_slice_close(&u, &[4.5], "Aᵀy single component");
}

#[test]
fn aty_ignores_pixels_outside_support() {
    // Component with support only at pixel 0. Changing other pixels must
    // not change the result — that's what "sparse on positive support" means.
    let mut fp = Footprints::new(1, 3);
    fp.push_component(vec![0], vec![1.0]);
    let y1 = [2.0f32, 100.0, 100.0];
    let y2 = [2.0f32, -999.0, 42.0];
    let u1 = fp.aty(&y1);
    let u2 = fp.aty(&y2);
    assert_slice_close(&u1, &u2, "Aᵀy depends only on support");
}

#[test]
fn aty_produces_one_entry_per_component() {
    let mut fp = Footprints::new(2, 2);
    fp.push_component(vec![0, 1], vec![1.0, 1.0]);
    fp.push_component(vec![2, 3], vec![1.0, 1.0]);
    fp.push_component(vec![0, 3], vec![0.5, 0.5]);
    let y = [1.0f32, 2.0, 3.0, 4.0];
    let u = fp.aty(&y);
    assert_eq!(u.len(), 3);
    assert_slice_close(&u, &[3.0, 7.0, 2.5], "per-component Aᵀy");
}

#[test]
fn aty_on_empty_footprints_is_empty() {
    let fp = Footprints::new(1, 4);
    let y = [0.0f32; 4];
    let u = fp.aty(&y);
    assert!(u.is_empty());
}

#[test]
#[should_panic(expected = "y length")]
fn aty_rejects_wrong_length_y() {
    let fp = Footprints::new(2, 2);
    fp.aty(&[0.0f32; 3]);
}

// ----- AᵀA -----

#[test]
fn ata_diagonal_is_sum_of_squared_values() {
    // V[i, i] = Σ values[i]² — this is the denominator `v` in Algorithm 7
    // (line 3: v ← diag(V)). Critical: if this is wrong the BCD step size
    // is wrong and traces fail to converge.
    let mut fp = Footprints::new(1, 4);
    fp.push_component(vec![0, 1, 2], vec![1.0, 2.0, 2.0]);
    let v = fp.ata();
    // k = 1, so v is a 1×1: just [1 + 4 + 4] = 9.
    assert_slice_close(&v, &[9.0], "V[0,0]");
}

#[test]
fn ata_off_diagonal_is_inner_product_over_intersection() {
    // Two components:
    //   i=0: support {0, 1, 2}, values {1, 1, 1}
    //   i=1: support {1, 2, 3}, values {2, 2, 2}
    // Intersection {1, 2} → V[0,1] = 1*2 + 1*2 = 4.
    let mut fp = Footprints::new(1, 4);
    fp.push_component(vec![0, 1, 2], vec![1.0, 1.0, 1.0]);
    fp.push_component(vec![1, 2, 3], vec![2.0, 2.0, 2.0]);
    let v = fp.ata();
    // Row-major 2×2:
    //   [V00 V01]
    //   [V10 V11]
    // V00 = 3, V01 = V10 = 4, V11 = 12.
    assert_slice_close(&v, &[3.0, 4.0, 4.0, 12.0], "AᵀA with overlap");
}

#[test]
fn ata_is_zero_for_disjoint_supports() {
    // V[i,j] = 0 when support(i) ∩ support(j) = ∅ — this is the structural
    // property `Groups` uses to partition components into independently
    // updatable blocks in the BCD inner loop.
    let mut fp = Footprints::new(2, 2); // pixels = 4
    fp.push_component(vec![0, 1], vec![1.0, 1.0]);
    fp.push_component(vec![2, 3], vec![1.0, 1.0]);
    let v = fp.ata();
    // V00 = 2, V01 = V10 = 0, V11 = 2.
    assert_slice_close(&v, &[2.0, 0.0, 0.0, 2.0], "AᵀA disjoint");
}

#[test]
fn ata_is_symmetric() {
    let mut fp = Footprints::new(3, 3); // pixels = 9
    fp.push_component(vec![0, 1, 4], vec![0.5, 1.0, 0.5]);
    fp.push_component(vec![1, 4, 7], vec![0.3, 0.6, 0.3]);
    fp.push_component(vec![2, 4, 5], vec![0.1, 0.4, 0.1]);
    let v = fp.ata();
    let k = fp.len();
    for i in 0..k {
        for j in 0..k {
            assert_close(
                v[i * k + j],
                v[j * k + i],
                &format!("V[{i},{j}] vs V[{j},{i}]"),
            );
        }
    }
}

#[test]
fn ata_on_empty_footprints_is_empty() {
    let fp = Footprints::new(1, 4);
    let v = fp.ata();
    assert!(v.is_empty());
}

// ----- reconstruct (Ãc) -----

#[test]
fn reconstruct_writes_zero_outside_all_supports() {
    // Pixels not in any component's support must be zero in Ãc.
    // This is what makes the residual `y - Ãc` carry the entire unmodeled
    // structure at those pixels.
    let mut fp = Footprints::new(1, 5);
    fp.push_component(vec![1, 3], vec![0.5, 0.5]);
    let c = [4.0f32];
    let mut out = [7.0f32; 5]; // non-zero to test that reconstruct overwrites
    fp.reconstruct(&c, &mut out);
    assert_slice_close(&out, &[0.0, 2.0, 0.0, 2.0, 0.0], "Ãc outside support");
}

#[test]
fn reconstruct_accumulates_across_components() {
    // Same pixel in multiple components: contributions sum.
    let mut fp = Footprints::new(1, 3);
    fp.push_component(vec![0, 1], vec![1.0, 1.0]);
    fp.push_component(vec![1, 2], vec![2.0, 2.0]);
    let c = [1.0f32, 1.0];
    let mut out = [0.0f32; 3];
    fp.reconstruct(&c, &mut out);
    // pixel 0: 1*1 = 1; pixel 1: 1*1 + 2*1 = 3; pixel 2: 2*1 = 2.
    assert_slice_close(&out, &[1.0, 3.0, 2.0], "Ãc across overlapping components");
}

#[test]
fn reconstruct_scales_linearly_with_c() {
    // Ã(αc) = α·Ãc — trivial linear-algebra invariant, worth pinning as a
    // sanity check for the accumulation path.
    let mut fp = Footprints::new(2, 2);
    fp.push_component(vec![0, 1], vec![0.5, 0.7]);
    let mut out1 = [0.0f32; 4];
    let mut out2 = [0.0f32; 4];
    fp.reconstruct(&[3.0], &mut out1);
    fp.reconstruct(&[6.0], &mut out2);
    for i in 0..4 {
        assert_close(out2[i], 2.0 * out1[i], &format!("pixel {i} scales"));
    }
}

#[test]
#[should_panic(expected = "c length")]
fn reconstruct_rejects_wrong_length_c() {
    let mut fp = Footprints::new(2, 2);
    fp.push_component(vec![0], vec![1.0]);
    let mut out = [0.0f32; 4];
    fp.reconstruct(&[1.0, 2.0], &mut out);
}

#[test]
#[should_panic(expected = "out length")]
fn reconstruct_rejects_wrong_length_out() {
    let mut fp = Footprints::new(2, 2);
    fp.push_component(vec![0], vec![1.0]);
    let mut out = [0.0f32; 3];
    fp.reconstruct(&[1.0], &mut out);
}

// ----- values_mut + compact -----

#[test]
fn values_mut_exposes_writable_slice() {
    // `EvaluateFootprints` needs to modify values in place — that's
    // Algorithm 8 line 5. This path verifies the caller can actually
    // write through to storage.
    let mut fp = Footprints::new(1, 3);
    fp.push_component(vec![0, 1, 2], vec![0.1, 0.2, 0.3]);
    {
        let vals = fp.values_mut(0);
        vals[1] = 9.0;
    }
    assert_slice_close(fp.values(0), &[0.1, 9.0, 0.3], "values_mut writes");
}

#[test]
fn compact_removes_zeroed_entries() {
    // After an `EvaluateFootprints` sweep that zeroes some values, `compact`
    // shrinks the support so the sparse rep reflects morphological shrink.
    let mut fp = Footprints::new(1, 5);
    fp.push_component(vec![0, 1, 2, 3, 4], vec![0.5, 0.5, 0.5, 0.5, 0.5]);
    {
        let vals = fp.values_mut(0);
        vals[1] = 0.0;
        vals[3] = 0.0;
    }
    fp.compact(0);
    assert_eq!(fp.support(0), &[0u32, 2, 4]);
    assert_slice_close(fp.values(0), &[0.5, 0.5, 0.5], "compacted values");
}

#[test]
fn compact_noop_when_all_values_positive() {
    let mut fp = Footprints::new(1, 3);
    fp.push_component(vec![0, 1, 2], vec![1.0, 2.0, 3.0]);
    fp.compact(0);
    assert_eq!(fp.support(0), &[0u32, 1, 2]);
    assert_slice_close(fp.values(0), &[1.0, 2.0, 3.0], "compact noop");
}

#[test]
fn compact_also_clamps_negative_values_out_of_support() {
    // Algorithm 8's max(·, 0) guard means the caller should not produce
    // negatives, but compact is defensive: anything ≤ 0 is dropped.
    // This keeps the "values are strictly positive" invariant intact.
    let mut fp = Footprints::new(1, 4);
    fp.push_component(vec![0, 1, 2, 3], vec![1.0, 2.0, 3.0, 4.0]);
    {
        let vals = fp.values_mut(0);
        vals[2] = -0.5;
    }
    fp.compact(0);
    assert_eq!(fp.support(0), &[0u32, 1, 3]);
    assert_slice_close(fp.values(0), &[1.0, 2.0, 4.0], "compact drops negatives");
}

// ----- pixel_component_counts (used by trace throttle) -----

#[test]
fn pixel_counts_tally_membership() {
    // pixel_component_counts[p] = |{i : p ∈ support(i)}|.
    // Trace throttle uses this to identify pixels in exactly one component's
    // footprint (the "exclusive" pixels where underfit correction applies).
    let mut fp = Footprints::new(1, 4);
    fp.push_component(vec![0, 1, 2], vec![1.0, 1.0, 1.0]);
    fp.push_component(vec![1, 2, 3], vec![1.0, 1.0, 1.0]);
    fp.push_component(vec![2], vec![1.0]);
    // pixel 0 ∈ {0} → 1
    // pixel 1 ∈ {0, 1} → 2
    // pixel 2 ∈ {0, 1, 2} → 3
    // pixel 3 ∈ {1} → 1
    let counts = fp.pixel_component_counts();
    assert_eq!(counts, vec![1u32, 2, 3, 1]);
}

#[test]
fn pixel_counts_length_is_full_frame() {
    let fp = Footprints::new(2, 3); // pixels = 6
    let counts = fp.pixel_component_counts();
    assert_eq!(counts.len(), 6);
    assert!(counts.iter().all(|&c| c == 0));
}
