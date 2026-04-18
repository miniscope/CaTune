//! Tests for `EvaluateResidual` (thesis §3.2.3, Eq. 3.24).

use calab_cala_core::assets::Footprints;
use calab_cala_core::fitting::evaluate_residual;

const F32_TOL: f32 = 1e-6;

fn assert_slice_close(actual: &[f32], expected: &[f32], ctx: &str) {
    assert_eq!(actual.len(), expected.len());
    for (i, (a, e)) in actual.iter().zip(expected.iter()).enumerate() {
        let diff = (a - e).abs();
        assert!(
            diff <= F32_TOL,
            "{ctx}[{i}]: expected {e}, got {a} (diff {diff} > tol {F32_TOL})"
        );
    }
}

#[test]
fn residual_is_y_minus_reconstruction() {
    let mut fp = Footprints::new(1, 4);
    fp.push_component(vec![0, 1], vec![1.0, 2.0]);
    let c = [3.0f32];
    // Ãc = [3, 6, 0, 0]
    let y = [10.0f32, 10.0, 7.0, 1.0];
    let mut r = [0.0f32; 4];
    evaluate_residual(&fp, &c, &y, &mut r);
    assert_slice_close(&r, &[7.0, 4.0, 7.0, 1.0], "y − Ãc");
}

#[test]
fn residual_equals_y_where_no_component_covers() {
    // Pixels outside every component's support get Ãc = 0, so
    // residual = y. This is the property Extend relies on — the
    // residual buffer carries unexplained signal verbatim at
    // un-modeled regions.
    let mut fp = Footprints::new(1, 5);
    fp.push_component(vec![0], vec![1.0]);
    fp.push_component(vec![4], vec![2.0]);
    let c = [1.0f32, 1.0];
    let y = [1.0f32, 5.0, 7.0, 9.0, 2.0];
    let mut r = [0.0f32; 5];
    evaluate_residual(&fp, &c, &y, &mut r);
    // At 0: y=1, Ãc = 1 → r = 0. At 4: y=2, Ãc = 2 → r = 0.
    // Between: y passes through unchanged.
    assert_slice_close(
        &r,
        &[0.0, 5.0, 7.0, 9.0, 0.0],
        "residual on uncovered pixels",
    );
}

#[test]
fn residual_of_zero_components_is_y() {
    let fp = Footprints::new(1, 3);
    let y = [1.0f32, 2.0, 3.0];
    let mut r = [9.0f32; 3]; // scratch value to verify overwrite
    evaluate_residual(&fp, &[], &y, &mut r);
    assert_slice_close(&r, &y, "k=0 → residual = y");
}

#[test]
#[should_panic(expected = "y length")]
fn rejects_mismatched_y_length() {
    let fp = Footprints::new(2, 2);
    let mut r = [0.0f32; 4];
    evaluate_residual(&fp, &[], &[0.0f32; 3], &mut r);
}

#[test]
#[should_panic(expected = "out length")]
fn rejects_mismatched_out_length() {
    let fp = Footprints::new(2, 2);
    let mut r = [0.0f32; 3];
    evaluate_residual(&fp, &[], &[0.0f32; 4], &mut r);
}
