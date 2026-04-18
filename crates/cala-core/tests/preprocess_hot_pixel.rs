//! Tests for the 3x3 median hot-pixel filter.
//!
//! Semantics pinned here (since we do not assert parity with Chang's
//! reference): **pure 3x3 median on every pixel, with replicate
//! boundary conditions on edges**. No threshold — the filter runs
//! unconditionally. This is the standard CaImAn-family hot-pixel
//! filter and gives determinism without a tuning parameter.

use calab_cala_core::assets::{Frame, FrameMut};
use calab_cala_core::preprocess::hot_pixel_median_3x3;

const TOL: f32 = 1e-6;

fn assert_close(actual: f32, expected: f32, tol: f32, ctx: &str) {
    let diff = (actual - expected).abs();
    assert!(
        diff <= tol,
        "{ctx}: expected {expected}, got {actual} (diff {diff} > tol {tol})"
    );
}

#[test]
fn linear_ramp_interior_pixels_unchanged() {
    // On a linear ramp f(y,x) = a*y + b*x + c, the median of any 3x3
    // neighborhood equals the center pixel (8 symmetric offsets +/- the
    // center). So the filter is the identity on interior pixels within
    // f32 epsilon. This pins the "smooth input passes through" invariant.
    let h = 7;
    let w = 9;
    let (a, b, c) = (2.5_f32, 1.25_f32, 10.0_f32);
    let input: Vec<f32> = (0..h)
        .flat_map(|y| (0..w).map(move |x| c + a * y as f32 + b * x as f32))
        .collect();
    let mut output = vec![0.0_f32; h * w];

    hot_pixel_median_3x3(
        Frame::new(&input, h, w).unwrap(),
        &mut FrameMut::new(&mut output, h, w).unwrap(),
    )
    .unwrap();

    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let idx = y * w + x;
            assert_close(output[idx], input[idx], TOL, &format!("interior ({y},{x})"));
        }
    }
}

#[test]
fn single_hot_pixel_is_replaced_by_neighborhood_value() {
    // Constant-background image with one injected hot pixel.
    // Median of (8 background values + 1 hot) is background.
    let h = 5;
    let w = 5;
    let background = 3.0_f32;
    let mut input = vec![background; h * w];
    input[2 * w + 2] = 255.0; // center is hot

    let mut output = vec![0.0_f32; h * w];
    hot_pixel_median_3x3(
        Frame::new(&input, h, w).unwrap(),
        &mut FrameMut::new(&mut output, h, w).unwrap(),
    )
    .unwrap();

    assert_close(output[2 * w + 2], background, TOL, "hot center");
    // Surrounding pixels have 1 hot value in their 3x3 neighborhood,
    // so their median is still the 5th-of-9 sorted value = background.
    for y in 1..=3 {
        for x in 1..=3 {
            if (y, x) == (2, 2) {
                continue;
            }
            assert_close(
                output[y * w + x],
                background,
                TOL,
                &format!("neighbor ({y},{x})"),
            );
        }
    }
}

#[test]
fn salt_and_pepper_is_suppressed() {
    // Scatter impulses — as long as no 3x3 neighborhood has 5+ impulses,
    // every impulse is replaced by background.
    let h = 7;
    let w = 7;
    let background = 1.0_f32;
    let mut input = vec![background; h * w];
    // Sparse impulses (at least 2 apart so no neighborhood has >1)
    let impulses = [(1, 1), (1, 5), (3, 3), (5, 1), (5, 5)];
    for (y, x) in impulses.iter() {
        input[y * w + x] = -999.0;
    }

    let mut output = vec![0.0_f32; h * w];
    hot_pixel_median_3x3(
        Frame::new(&input, h, w).unwrap(),
        &mut FrameMut::new(&mut output, h, w).unwrap(),
    )
    .unwrap();

    for (y, x) in impulses.iter() {
        assert_close(
            output[y * w + x],
            background,
            TOL,
            &format!("impulse ({y},{x})"),
        );
    }
}

#[test]
fn replicate_boundary_corner_matches_hand_computed_median() {
    // 3x3 input:
    //   1 2 3
    //   4 5 6
    //   7 8 9
    // Corner (0,0) with replicate boundary sees 3x3 neighborhood:
    //   {(0,0), (0,0), (0,1),
    //    (0,0), (0,0), (0,1),
    //    (1,0), (1,0), (1,1)}
    // = [1,1,2, 1,1,2, 4,4,5]
    // Sorted: [1,1,1,1,2,2,4,4,5]  →  median = 2.
    let input: [f32; 9] = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
    let mut output = [0.0_f32; 9];
    hot_pixel_median_3x3(
        Frame::new(&input, 3, 3).unwrap(),
        &mut FrameMut::new(&mut output, 3, 3).unwrap(),
    )
    .unwrap();

    assert_close(output[0], 2.0, TOL, "corner (0,0)"); // replicate
    assert_close(output[4], 5.0, TOL, "center (1,1)"); // interior: median = center
    assert_close(output[8], 8.0, TOL, "corner (2,2)"); // replicate
}

#[test]
fn shape_mismatch_between_input_and_output_errors() {
    let input = [0.0_f32; 12];
    let mut output = [0.0_f32; 6];
    let res = hot_pixel_median_3x3(
        Frame::new(&input, 3, 4).unwrap(),
        &mut FrameMut::new(&mut output, 2, 3).unwrap(),
    );
    assert!(res.is_err());
}
