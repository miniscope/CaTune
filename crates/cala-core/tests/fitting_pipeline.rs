//! Tests for `FitPipeline` — the per-frame OMF step composed out of
//! the fit primitives (thesis §3.2.3, Algorithm 6).
//!
//! These are orchestration tests: the primitive modules each pin their
//! own defining equations. Here we only care that `step` wires them
//! together correctly — state evolves, residual is returned, trace
//! history accumulates.

use calab_cala_core::assets::Footprints;
use calab_cala_core::config::FitConfig;
use calab_cala_core::fitting::FitPipeline;

const F32_TOL: f32 = 1e-4;

fn assert_close(actual: f32, expected: f32, ctx: &str) {
    let diff = (actual - expected).abs();
    assert!(
        diff <= F32_TOL,
        "{ctx}: expected {expected}, got {actual} (diff {diff} > tol {F32_TOL})"
    );
}

fn seed_single_gaussian_footprint(fp: &mut Footprints, height: usize, width: usize) {
    // 3×3 peaked footprint at the frame center — a simplified stand-in
    // for a neuron's spatial profile.
    let cy = height / 2;
    let cx = width / 2;
    let mut support = Vec::new();
    let mut values = Vec::new();
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            let y = cy as i32 + dy;
            let x = cx as i32 + dx;
            if y < 0 || y >= height as i32 || x < 0 || x >= width as i32 {
                continue;
            }
            let r2 = (dy * dy + dx * dx) as f32;
            let v = (-r2 / 2.0).exp();
            support.push((y as u32) * (width as u32) + x as u32);
            values.push(v);
        }
    }
    fp.push_component(support, values);
}

#[test]
fn new_pipeline_has_empty_trace_history() {
    let fp = Footprints::new(2, 2);
    let pipe = FitPipeline::new(fp, FitConfig::default());
    assert_eq!(pipe.traces().len(), 0);
    assert_eq!(pipe.suff_stats().frames(), 0);
}

#[test]
fn step_advances_frame_count_and_appends_trace() {
    let mut fp = Footprints::new(4, 4);
    seed_single_gaussian_footprint(&mut fp, 4, 4);
    let mut pipe = FitPipeline::new(fp, FitConfig::default());
    let y = vec![0.0f32; 16];
    pipe.step(&y);
    pipe.step(&y);
    pipe.step(&y);
    assert_eq!(pipe.traces().len(), 3, "three pushes into trace history");
    assert_eq!(
        pipe.suff_stats().frames(),
        3,
        "three frames seen by suff-stats"
    );
}

#[test]
fn step_returns_residual_of_pixel_length() {
    let mut fp = Footprints::new(3, 5); // pixels = 15
    seed_single_gaussian_footprint(&mut fp, 3, 5);
    let mut pipe = FitPipeline::new(fp, FitConfig::default());
    let y = vec![0.5f32; 15];
    let r = pipe.step(&y);
    assert_eq!(r.len(), 15);
}

#[test]
fn empty_footprints_pipeline_trivially_succeeds() {
    // With `k = 0`, `EvaluateTraces` returns `[]`, throttle / suff-stats
    // / footprints are no-ops; residual is just `y` verbatim because
    // `Ãc = 0` everywhere.
    let fp = Footprints::new(2, 2);
    let mut pipe = FitPipeline::new(fp, FitConfig::default());
    let y = [1.0f32, 2.0, 3.0, 4.0];
    let r = pipe.step(&y);
    assert_eq!(r, &y);
    assert_eq!(pipe.traces().len(), 1);
    assert!(pipe.traces().last().unwrap().is_empty());
}

// ----- Integration: recovery with a seeded correct footprint -----

#[test]
fn recovers_trace_from_exactly_seeded_footprint() {
    // Seed the one-and-only footprint at its true values. Feed frames
    // with y_t = Ã_true · c_t. Over several frames the pipeline should
    // report traces matching the ground truth within tolerance, and
    // the residual should be near zero (perfect noise-free fit).
    let height = 5usize;
    let width = 5usize;
    let mut fp = Footprints::new(height, width);
    seed_single_gaussian_footprint(&mut fp, height, width);

    // Snapshot the truth footprint so we can synthesize `y`.
    let truth_support = fp.support(0).to_vec();
    let truth_values = fp.values(0).to_vec();

    let cfg = FitConfig::default()
        .with_trace_max_iter(200)
        .with_trace_tol(1e-6);
    let mut pipe = FitPipeline::new(fp, cfg);

    let c_true_series = [1.0f32, 0.5, 2.5, 0.1, 3.0, 1.8];
    for &c_true in &c_true_series {
        let mut y = vec![0.0f32; height * width];
        for (&p, &v) in truth_support.iter().zip(&truth_values) {
            y[p as usize] = v * c_true;
        }
        let r = pipe.step(&y);
        let r_l2: f32 = r.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!(
            r_l2 < 1e-3,
            "residual L2 {r_l2} too large — pipeline failed to fit noiseless frame"
        );
    }

    // Compare recovered traces to ground truth.
    assert_eq!(pipe.traces().len(), c_true_series.len());
    for (t, &c_true) in c_true_series.iter().enumerate() {
        let c_est = pipe.traces().get(t).unwrap()[0];
        assert_close(c_est, c_true, &format!("recovered c at frame {t}"));
    }
}

// Note: a "perturb single footprint, watch residual shrink" test is
// not meaningful at K=1 because the single-component problem has a
// gauge ambiguity between trace amplitude and footprint magnitude
// (EvaluateTraces absorbs any scaling of Ã into c̃, so the residual
// is zero regardless). The end-to-end synthetic fit test covers the
// multi-component recovery case where the ambiguity is broken by
// differential support and trace variation across frames.

#[test]
#[should_panic(expected = "y length")]
fn step_rejects_mismatched_y_length() {
    let fp = Footprints::new(2, 2);
    let mut pipe = FitPipeline::new(fp, FitConfig::default());
    pipe.step(&[0.0f32; 3]);
}
