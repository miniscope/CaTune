//! Integration tests for MotionState (local anchor, task 7a).

use calab_cala_core::assets::{Frame, FrameMut};
use calab_cala_core::config::PreprocessConfig;
use calab_cala_core::preprocess::{MotionShift, MotionState};

fn make_gaussian_blob(h: usize, w: usize, cy: f32, cx: f32, sigma: f32) -> Vec<f32> {
    let mut out = vec![0.0f32; h * w];
    let s2 = 2.0 * sigma * sigma;
    for y in 0..h {
        for x in 0..w {
            let dy = y as f32 - cy;
            let dx = x as f32 - cx;
            out[y * w + x] = (-(dy * dy + dx * dx) / s2).exp();
        }
    }
    out
}

/// Circular shift: `out[y, x] = src[(y − dy) mod h, (x − dx) mod w]`.
/// Positive `dy`/`dx` move content DOWN / RIGHT.
fn roll_2d(src: &[f32], h: usize, w: usize, dy: isize, dx: isize) -> Vec<f32> {
    let mut out = vec![0.0f32; h * w];
    let h_i = h as isize;
    let w_i = w as isize;
    for y in 0..h {
        for x in 0..w {
            let sy = (y as isize - dy).rem_euclid(h_i) as usize;
            let sx = (x as isize - dx).rem_euclid(w_i) as usize;
            out[y * w + x] = src[sy * w + sx];
        }
    }
    out
}

fn correct(
    state: &mut MotionState,
    input: &[f32],
    h: usize,
    w: usize,
    cfg: &PreprocessConfig,
) -> (MotionShift, Vec<f32>) {
    let mut out = vec![0.0f32; h * w];
    let shift = state
        .motion_correct(
            Frame::new(input, h, w).unwrap(),
            &mut FrameMut::new(&mut out, h, w).unwrap(),
            cfg,
        )
        .unwrap();
    (shift, out)
}

#[test]
fn first_frame_emits_identity_and_becomes_anchor() {
    let (h, w) = (8, 8);
    let mut state = MotionState::new(h, w);
    let cfg = PreprocessConfig::default();
    let f = make_gaussian_blob(h, w, (h / 2) as f32, (w / 2) as f32, 2.0);
    let (shift, out) = correct(&mut state, &f, h, w, &cfg);
    assert_eq!(shift, MotionShift { dy: 0.0, dx: 0.0 });
    assert_eq!(out, f);
    assert!(state.has_anchor());
    assert_eq!(state.local_anchor().unwrap().pixels(), &f[..]);
}

#[test]
fn second_identical_frame_returns_zero_shift() {
    let (h, w) = (16, 16);
    let mut state = MotionState::new(h, w);
    let cfg = PreprocessConfig::default();
    let f = make_gaussian_blob(h, w, (h / 2) as f32, (w / 2) as f32, 2.0);
    correct(&mut state, &f, h, w, &cfg);
    let (shift, out) = correct(&mut state, &f, h, w, &cfg);
    assert!(shift.dy.abs() < 0.05, "dy = {}", shift.dy);
    assert!(shift.dx.abs() < 0.05, "dx = {}", shift.dx);
    let mean_err: f32 = out
        .iter()
        .zip(f.iter())
        .map(|(a, b)| (a - b).abs())
        .sum::<f32>()
        / out.len() as f32;
    assert!(mean_err < 1e-4, "mean abs err = {mean_err}");
}

#[test]
fn integer_translation_is_recovered() {
    let (h, w) = (32, 32);
    let anchor = make_gaussian_blob(h, w, (h / 2) as f32, (w / 2) as f32, 2.0);
    let (dy_true, dx_true) = (3isize, 2isize);
    let shifted = roll_2d(&anchor, h, w, dy_true, dx_true);

    let mut state = MotionState::new(h, w);
    let cfg = PreprocessConfig::default();
    let _ = correct(&mut state, &anchor, h, w, &cfg);
    let (shift, corrected) = correct(&mut state, &shifted, h, w, &cfg);

    assert!((shift.dy - 3.0).abs() < 0.05, "dy = {}", shift.dy);
    assert!((shift.dx - 2.0).abs() < 0.05, "dx = {}", shift.dx);

    // Interior pixels should match anchor within f32 FFT tolerance.
    let mut max_err: f32 = 0.0;
    for y in 5..(h - 5) {
        for x in 5..(w - 5) {
            let err = (corrected[y * w + x] - anchor[y * w + x]).abs();
            if err > max_err {
                max_err = err;
            }
        }
    }
    assert!(max_err < 1e-3, "max interior abs err = {max_err}");
}

#[test]
fn reset_forgets_anchor() {
    let (h, w) = (8, 8);
    let mut state = MotionState::new(h, w);
    let cfg = PreprocessConfig::default();
    let f = make_gaussian_blob(h, w, (h / 2) as f32, (w / 2) as f32, 2.0);
    correct(&mut state, &f, h, w, &cfg);
    assert!(state.has_anchor());

    state.reset();
    assert!(!state.has_anchor());

    let (shift, _) = correct(&mut state, &f, h, w, &cfg);
    assert_eq!(shift, MotionShift { dy: 0.0, dx: 0.0 });
    assert!(state.has_anchor());
}

#[test]
fn max_shift_clamps_search() {
    let (h, w) = (32, 32);
    let anchor = make_gaussian_blob(h, w, (h / 2) as f32, (w / 2) as f32, 2.0);
    // True shift of 10 is outside max_shift = 3; algorithm must return
    // something inside the search range regardless.
    let shifted = roll_2d(&anchor, h, w, 10, 0);

    let mut state = MotionState::new(h, w);
    let cfg = PreprocessConfig::default().with_motion_max_shift_px(3);
    let _ = correct(&mut state, &anchor, h, w, &cfg);
    let (shift, _) = correct(&mut state, &shifted, h, w, &cfg);
    // Bin search limited to |signed shift| ≤ 3; parabolic subpixel adds
    // at most 0.5, so returned shift satisfies |dy|, |dx| ≤ 3.5.
    assert!(shift.dy.abs() <= 3.5, "dy = {}", shift.dy);
    assert!(shift.dx.abs() <= 3.5, "dx = {}", shift.dx);
}

#[test]
fn shape_mismatch_input_errors() {
    let mut state = MotionState::new(4, 5);
    let input = vec![0.0f32; 12];
    let mut output = vec![0.0f32; 20];
    let cfg = PreprocessConfig::default();
    let res = state.motion_correct(
        Frame::new(&input, 3, 4).unwrap(),
        &mut FrameMut::new(&mut output, 4, 5).unwrap(),
        &cfg,
    );
    assert!(res.is_err());
}

#[test]
fn shape_mismatch_output_errors() {
    let mut state = MotionState::new(4, 5);
    let input = vec![0.0f32; 20];
    let mut output = vec![0.0f32; 12];
    let cfg = PreprocessConfig::default();
    let res = state.motion_correct(
        Frame::new(&input, 4, 5).unwrap(),
        &mut FrameMut::new(&mut output, 3, 4).unwrap(),
        &cfg,
    );
    assert!(res.is_err());
}
