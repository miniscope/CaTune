//! Shared 2D FFT helpers used by preprocess nodes that work in the
//! frequency domain (Butterworth filter, phase-correlation motion
//! estimation). Row-pass + column-pass decomposition of a 2D FFT
//! using 1D `rustfft` plans.

use std::sync::Arc;

use rustfft::{num_complex::Complex32, Fft};

pub(super) fn fft_rows(buf: &mut [Complex32], h: usize, w: usize, fft: &Arc<dyn Fft<f32>>) {
    for y in 0..h {
        fft.process(&mut buf[y * w..(y + 1) * w]);
    }
}

pub(super) fn fft_cols(buf: &mut [Complex32], h: usize, w: usize, fft: &Arc<dyn Fft<f32>>) {
    let mut col: Vec<Complex32> = vec![Complex32::new(0.0, 0.0); h];
    for x in 0..w {
        for y in 0..h {
            col[y] = buf[y * w + x];
        }
        fft.process(&mut col);
        for y in 0..h {
            buf[y * w + x] = col[y];
        }
    }
}
