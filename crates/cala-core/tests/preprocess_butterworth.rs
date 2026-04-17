//! Tests for the 2D Butterworth high-pass filter.
//!
//! Oracles are analytic: the Butterworth magnitude response is a closed
//! form, so every test asserts the output matches the predicted response
//! within explicit f32 tolerance. No comparison against Chang's reference.

use calab_cala_core::assets::{Frame, FrameMut};
use calab_cala_core::preprocess::butterworth_highpass;
use std::f32::consts::PI;

/// Butterworth high-pass magnitude at frequency `f` (cycles/pixel) for
/// cutoff `f_c` and order `n`: `|H(f)| = 1 / sqrt(1 + (f_c/f)^(2n))`.
fn butterworth_magnitude(f: f32, f_c: f32, order: u32) -> f32 {
    if f == 0.0 {
        return 0.0;
    }
    let two_n = 2.0 * order as f32;
    1.0 / (1.0 + (f_c / f).powf(two_n)).sqrt()
}

fn assert_close(actual: f32, expected: f32, tol: f32, ctx: &str) {
    let diff = (actual - expected).abs();
    assert!(
        diff <= tol,
        "{ctx}: expected {expected}, got {actual} (diff {diff} > tol {tol})"
    );
}

fn run(input: &[f32], h: usize, w: usize, cutoff: f32, order: u32) -> Vec<f32> {
    let mut output = vec![0.0_f32; h * w];
    butterworth_highpass(
        Frame::new(input, h, w).unwrap(),
        &mut FrameMut::new(&mut output, h, w).unwrap(),
        cutoff,
        order,
    )
    .unwrap();
    output
}

fn mean(xs: &[f32]) -> f32 {
    xs.iter().sum::<f32>() / xs.len() as f32
}

#[test]
fn constant_input_has_dc_removed() {
    // DC bin gain is exactly 0 → output mean ~ 0 within roundoff.
    let (h, w) = (16, 16);
    let input = vec![7.5_f32; h * w];
    let out = run(&input, h, w, 1.0 / 15.0, 4);
    for (i, &v) in out.iter().enumerate() {
        assert!(
            v.abs() < 1e-5,
            "pixel {i}: {v} should be ~0 after DC removal"
        );
    }
}

#[test]
fn linear_ramp_dc_component_is_removed() {
    // A ramp has a nonzero mean (strong DC) plus higher-frequency content.
    // After high-pass the DC must be gone, so the output mean ~ 0.
    let (h, w) = (32, 32);
    let mut input = vec![0.0_f32; h * w];
    for y in 0..h {
        for x in 0..w {
            input[y * w + x] = y as f32 + x as f32 + 5.0;
        }
    }
    let out = run(&input, h, w, 1.0 / 15.0, 4);
    assert!(
        mean(&out).abs() < 1e-4,
        "ramp output mean should be ~0, got {}",
        mean(&out)
    );
}

#[test]
fn pure_sinusoid_is_attenuated_by_analytic_response() {
    // Inject a 2D cosine `cos(2π·x·kx/W)` with an amplitude of 1 at a
    // cleanly-representable frequency (bin-aligned). The filter output
    // should be the same cosine scaled by |H(f)|. We extract the scaling
    // by taking the max absolute value (the cosine peaks at ±amplitude).
    let (h, w) = (32, 32);
    let kx = 2; // wavelength = W/kx = 16 px → f = kx/W = 1/16 cycles/px
    let f = kx as f32 / w as f32;
    let mut input = vec![0.0_f32; h * w];
    for y in 0..h {
        for x in 0..w {
            input[y * w + x] = (2.0 * PI * kx as f32 * x as f32 / w as f32).cos();
        }
    }

    let cutoff = 1.0 / 15.0;
    let order = 4;
    let out = run(&input, h, w, cutoff, order);

    let peak = out.iter().fold(0.0_f32, |m, &v| m.max(v.abs()));
    let expected = butterworth_magnitude(f, cutoff, order);

    // Tolerance accounts for f32 FFT error on a 32×32 transform.
    assert_close(peak, expected, 5e-5, "bin-aligned sinusoid gain");
}

#[test]
fn high_frequency_checkerboard_is_preserved() {
    // Checkerboard = Nyquist sinusoid at (fy, fx) = (0.5, 0.5), well above
    // any reasonable cutoff, so gain ≈ 1 and output ≈ input.
    let (h, w) = (16, 16);
    let mut input = vec![0.0_f32; h * w];
    for y in 0..h {
        for x in 0..w {
            input[y * w + x] = if (y + x) % 2 == 0 { 1.0 } else { -1.0 };
        }
    }
    let out = run(&input, h, w, 1.0 / 15.0, 4);
    for i in 0..h * w {
        assert_close(out[i], input[i], 1e-4, &format!("checkerboard pixel {i}"));
    }
}

#[test]
fn filter_is_linear() {
    // For a linear operator f, f(a·x + b·y) == a·f(x) + b·f(y) within
    // numerical tolerance. High-pass is linear; this test just guards
    // against accidental non-linearities.
    let (h, w) = (16, 16);
    let mut a_in = vec![0.0_f32; h * w];
    let mut b_in = vec![0.0_f32; h * w];
    for y in 0..h {
        for x in 0..w {
            a_in[y * w + x] = (2.0 * PI * 2.0 * x as f32 / w as f32).cos();
            b_in[y * w + x] = (2.0 * PI * 3.0 * y as f32 / h as f32).sin();
        }
    }
    let (alpha, beta) = (1.7_f32, -0.4_f32);
    let mut sum_in = vec![0.0_f32; h * w];
    for i in 0..h * w {
        sum_in[i] = alpha * a_in[i] + beta * b_in[i];
    }

    let cutoff = 1.0 / 15.0;
    let order = 4;
    let fa = run(&a_in, h, w, cutoff, order);
    let fb = run(&b_in, h, w, cutoff, order);
    let fsum = run(&sum_in, h, w, cutoff, order);

    for i in 0..h * w {
        let expected = alpha * fa[i] + beta * fb[i];
        assert_close(fsum[i], expected, 5e-5, &format!("linearity pixel {i}"));
    }
}

#[test]
fn shape_mismatch_errors() {
    let input = vec![0.0_f32; 12];
    let mut output = vec![0.0_f32; 6];
    let res = butterworth_highpass(
        Frame::new(&input, 3, 4).unwrap(),
        &mut FrameMut::new(&mut output, 2, 3).unwrap(),
        0.1,
        4,
    );
    assert!(res.is_err());
}
