//! Tests for the Phase 3 Task 5 quality-gate + class-tag stage
//! (thesis Algorithm 9 lines 6–11, design §3.1 class priors).

use calab_cala_core::config::{ComponentClass, ExtendConfig, RecordingMetadata};
use calab_cala_core::extending::segment::{
    classify_candidate, support_area, support_mask, support_perimeter_4conn, ClassDecision,
    Rank1Nmf, RejectReason,
};

const F32_TOL: f32 = 1e-5;

fn approx(a: f32, b: f32, tol: f32, ctx: &str) {
    assert!((a - b).abs() <= tol, "{ctx}: {a} vs {b} (tol {tol})");
}

fn unit_l2(mut a: Vec<f32>) -> Vec<f32> {
    let n: f32 = a.iter().map(|v| v * v).sum::<f32>().sqrt();
    if n > 0.0 {
        a.iter_mut().for_each(|v| *v /= n);
    }
    a
}

fn clean_nmf(a: Vec<f32>) -> Rank1Nmf {
    Rank1Nmf {
        a: unit_l2(a),
        c: vec![1.0; 4],
        iterations: 5,
        converged: true,
        recon_error: 0.0,
    }
}

// ----- support_mask / area / perimeter -----

#[test]
fn support_mask_thresholds_relative_to_max() {
    let a = vec![0.0, 0.1, 0.5, 1.0, 0.04];
    let mask = support_mask(&a, 0.1);
    assert_eq!(mask, vec![false, false, true, true, false]);
}

#[test]
fn support_mask_all_false_when_a_is_zero() {
    let mask = support_mask(&[0.0, 0.0, 0.0], 0.1);
    assert_eq!(mask, vec![false; 3]);
}

#[test]
fn support_area_counts_true_pixels() {
    assert_eq!(support_area(&[true, false, true, true, false]), 3);
}

#[test]
fn perimeter_of_single_pixel_is_four() {
    let mask = vec![
        false, false, false, //
        false, true, false, //
        false, false, false,
    ];
    assert_eq!(support_perimeter_4conn(&mask, 3, 3), 4);
}

#[test]
fn perimeter_of_2x2_block_is_eight() {
    let mask = vec![
        true, true, false, //
        true, true, false, //
        false, false, false,
    ];
    assert_eq!(support_perimeter_4conn(&mask, 3, 3), 8);
}

#[test]
fn perimeter_of_frame_edge_pixel_counts_boundary() {
    // Corner pixel: 2 neighbors OOB, 2 internal — if all internal
    // neighbors are false, perimeter = 4. Covered by single-pixel
    // test at (1,1); here the pixel sits at (0,0) to exercise the
    // OOB branch.
    let mask = vec![
        true, false, //
        false, false,
    ];
    assert_eq!(support_perimeter_4conn(&mask, 2, 2), 4);
}

// ----- classify_candidate -----

fn metadata_for_10px_neurons() -> RecordingMetadata {
    // pixel_size_um = 1, neuron_diameter_um = 10 → neuron_d_px = 10.
    RecordingMetadata::new(1.0).with_neuron_diameter(10.0)
}

fn cell_blob_5x5() -> (Vec<f32>, usize, usize) {
    // Compact centered blob, ~9-pixel support inside a 5×5 patch.
    // Equivalent diameter = 2 * sqrt(9/pi) ≈ 3.39 px. At neuron_d=10 px,
    // d/neuron_d ≈ 0.34 — below default cell_min_d = 0.5. So for the
    // "cell" test we need a larger blob.
    let mut a = vec![0.0f32; 25];
    for y in 1..=3 {
        for x in 1..=3 {
            a[y * 5 + x] = 1.0;
        }
    }
    (a, 5, 5)
}

fn big_cell_blob() -> (Vec<f32>, usize, usize) {
    // 11×11 patch, 7×7 centered filled support → area = 49,
    // equivalent diameter = 2 * sqrt(49/π) ≈ 7.9 px. With
    // neuron_d_px = 10, d/neuron_d ≈ 0.79 → within cell range
    // [0.5, 1.5] by default.
    let h = 11usize;
    let w = 11usize;
    let mut a = vec![0.0f32; h * w];
    for y in 2..=8 {
        for x in 2..=8 {
            a[y * w + x] = 1.0;
        }
    }
    (a, h, w)
}

fn neuropil_blob() -> (Vec<f32>, usize, usize) {
    // 31×31 patch, 23×23 filled square → area = 529,
    // equivalent diameter ≈ 25.9 px. With neuron_d_px = 10,
    // d/neuron_d ≈ 2.6 → within neuropil default range [2, 10].
    let h = 31usize;
    let w = 31usize;
    let mut a = vec![0.0f32; h * w];
    for y in 4..=26 {
        for x in 4..=26 {
            a[y * w + x] = 1.0;
        }
    }
    (a, h, w)
}

fn full_support_patch(h: usize, w: usize) -> (Vec<f32>, usize, usize) {
    (vec![1.0; h * w], h, w)
}

#[test]
fn classify_accepts_cell_class_on_compact_blob() {
    let (a, h, w) = big_cell_blob();
    let nmf = clean_nmf(a);
    let decision = classify_candidate(
        &nmf,
        &metadata_for_10px_neurons(),
        &ExtendConfig::default(),
        h,
        w,
    );
    match decision {
        ClassDecision::Accept {
            class,
            diameter_px,
            compactness,
            area_px,
        } => {
            assert_eq!(class, ComponentClass::Cell);
            approx(
                diameter_px,
                2.0 * (49.0f32 / std::f32::consts::PI).sqrt(),
                1e-4,
                "d",
            );
            assert_eq!(area_px, 49);
            assert!(
                compactness > 0.5,
                "square compactness should clear default floor (got {compactness})"
            );
        }
        other => panic!("expected Cell accept, got {other:?}"),
    }
}

#[test]
fn classify_accepts_neuropil_class_on_large_smooth_blob() {
    let (a, h, w) = neuropil_blob();
    let nmf = clean_nmf(a);
    let decision = classify_candidate(
        &nmf,
        &metadata_for_10px_neurons(),
        &ExtendConfig::default(),
        h,
        w,
    );
    match decision {
        ClassDecision::Accept { class, .. } => {
            assert_eq!(class, ComponentClass::Neuropil);
        }
        other => panic!("expected Neuropil accept, got {other:?}"),
    }
}

#[test]
fn classify_accepts_slow_baseline_when_very_large() {
    // Full-support 151×151 patch → area = 22801, diameter ≈ 170 px.
    // At neuron_d_px = 10, d/neuron_d = 17 → beyond neuropil_max (10)
    // → SlowBaseline class.
    let (a, h, w) = full_support_patch(151, 151);
    let nmf = clean_nmf(a);
    let decision = classify_candidate(
        &nmf,
        &metadata_for_10px_neurons(),
        &ExtendConfig::default(),
        h,
        w,
    );
    match decision {
        ClassDecision::Accept { class, .. } => {
            assert_eq!(class, ComponentClass::SlowBaseline);
        }
        other => panic!("expected SlowBaseline accept, got {other:?}"),
    }
}

#[test]
fn classify_rejects_tiny_blobs_below_cell_min() {
    // 5×5 single-pixel blob → area 1, diameter ≈ 1.13 px,
    // d/neuron_d = 0.113 — below default cell_min_d = 0.5.
    let (_, h, w) = cell_blob_5x5();
    let mut a = vec![0.0f32; h * w];
    a[2 * w + 2] = 1.0;
    let nmf = clean_nmf(a);
    let decision = classify_candidate(
        &nmf,
        &metadata_for_10px_neurons(),
        &ExtendConfig::default(),
        h,
        w,
    );
    match decision {
        ClassDecision::Reject(RejectReason::BelowCellMin { .. }) => {}
        other => panic!("expected BelowCellMin reject, got {other:?}"),
    }
}

#[test]
fn classify_rejects_elongated_cell_on_compactness_gate() {
    // 11×11 patch with a 1-pixel-wide line of 9 pixels — area = 9,
    // perimeter = 20 (two long edges + two short), compactness ≈
    // 4π·9 / 20² ≈ 0.283. Diameter = 2*sqrt(9/π) ≈ 3.38 px, which
    // with neuron_d=10 is d/neuron_d=0.338 — below cell_min_d (0.5),
    // so rejects as BelowCellMin instead of CellFailsCompactness.
    // Use a smaller neuron diameter to push the line into cell-size
    // territory.
    let h = 11usize;
    let w = 11usize;
    let mut a = vec![0.0f32; h * w];
    for x in 1..=9 {
        a[5 * w + x] = 1.0;
    }
    let nmf = clean_nmf(a);
    let md = RecordingMetadata::new(1.0).with_neuron_diameter(4.0);
    // neuron_d_px = 4, cell_min_d=0.5 → cell_min_px=2, cell_max_px=6.
    // diameter ≈ 3.38 px → within cell range. compactness ≈ 0.28 <
    // default 0.5 — expect CellFailsCompactness.
    let decision = classify_candidate(&nmf, &md, &ExtendConfig::default(), h, w);
    match decision {
        ClassDecision::Reject(RejectReason::CellFailsCompactness { q, min_q }) => {
            assert!(q < min_q, "q={q} should be below min_q={min_q}");
        }
        other => panic!("expected CellFailsCompactness reject, got {other:?}"),
    }
}

#[test]
fn classify_rejects_recon_error_candidate() {
    let (a, h, w) = big_cell_blob();
    let mut nmf = clean_nmf(a);
    nmf.recon_error = 0.9; // > default 0.5
    let decision = classify_candidate(
        &nmf,
        &metadata_for_10px_neurons(),
        &ExtendConfig::default(),
        h,
        w,
    );
    match decision {
        ClassDecision::Reject(RejectReason::ReconstructionError { error, max }) => {
            approx(error, 0.9, F32_TOL, "error");
            approx(max, 0.5, F32_TOL, "max");
        }
        other => panic!("expected ReconstructionError reject, got {other:?}"),
    }
}

#[test]
fn classify_rejects_empty_support() {
    // All-zero spatial factor — support mask is empty.
    let h = 5usize;
    let w = 5usize;
    let nmf = Rank1Nmf {
        a: vec![0.0; h * w],
        c: vec![0.0; 4],
        iterations: 0,
        converged: true,
        recon_error: 0.0,
    };
    let decision = classify_candidate(
        &nmf,
        &metadata_for_10px_neurons(),
        &ExtendConfig::default(),
        h,
        w,
    );
    assert_eq!(decision, ClassDecision::Reject(RejectReason::SupportEmpty));
}

#[test]
fn classify_rejects_ambiguous_diameter_between_classes() {
    // Diameter that lands above cell_max but below neuropil_min.
    // Default cell_max_d = 1.5, neuropil_min_d = 2.0 → ambiguous
    // band d ∈ (1.5, 2.0) × neuron_d_px. At neuron_d_px = 10 that's
    // 15 < d < 20 px. Fill a 15×15 patch → area = 225, diameter
    // ≈ 16.9 px → in the gap.
    let h = 15usize;
    let w = 15usize;
    let a = vec![1.0; h * w];
    let nmf = clean_nmf(a);
    let decision = classify_candidate(
        &nmf,
        &metadata_for_10px_neurons(),
        &ExtendConfig::default(),
        h,
        w,
    );
    match decision {
        ClassDecision::Reject(RejectReason::AmbiguousDiameter { diameter_px }) => {
            assert!(
                diameter_px > 15.0 && diameter_px < 20.0,
                "diameter {diameter_px} should be in ambiguous gap"
            );
        }
        other => panic!("expected AmbiguousDiameter reject, got {other:?}"),
    }
}

#[test]
fn class_boundaries_track_neuron_diameter_override() {
    // Same candidate, smaller neurons → diameter ratio rises, class
    // should shift from Cell to Neuropil territory.
    let (a, h, w) = big_cell_blob(); // diameter ≈ 7.9 px
    let nmf = clean_nmf(a);
    // With tiny neurons (d_px = 3), d/neuron_d ≈ 2.63 → Neuropil.
    let md = RecordingMetadata::new(1.0).with_neuron_diameter(3.0);
    let decision = classify_candidate(&nmf, &md, &ExtendConfig::default(), h, w);
    match decision {
        ClassDecision::Accept { class, .. } => {
            assert_eq!(class, ComponentClass::Neuropil);
        }
        other => panic!("expected Neuropil accept with tiny neurons, got {other:?}"),
    }
}
