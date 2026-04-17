//! 2D Butterworth high-pass filter (FFT-based) for illumination-glow
//! removal, plus the metadata-driven cutoff derivation.
//!
//! The filter takes a raw cutoff frequency in cycles/pixel so the
//! numerics stay decoupled from biology. `high_pass_cutoff_cycles_per_pixel`
//! is the convenience derivation that turns recording metadata +
//! preprocess config into that cutoff.

use std::sync::Arc;

use rustfft::{num_complex::Complex32, FftPlanner};

use crate::assets::{Frame, FrameMut, ShapeError};
use crate::config::{PreprocessConfig, RecordingMetadata};

/// Derive the Butterworth high-pass cutoff frequency (cycles per pixel)
/// from recording metadata + preprocess config.
///
/// Cutoff period in pixels = `cfg.high_pass_diameters × (neuron_diameter_um /
/// pixel_size_um)`; cutoff frequency is its reciprocal. Callers can override
/// the result by computing their own cutoff and passing it directly into
/// `butterworth_highpass`.
pub fn high_pass_cutoff_cycles_per_pixel(
    metadata: &RecordingMetadata,
    cfg: &PreprocessConfig,
) -> f32 {
    let neuron_px = metadata.neuron_diameter_um / metadata.pixel_size_um;
    let cutoff_period_px = cfg.high_pass_diameters * neuron_px;
    1.0 / cutoff_period_px
}

/// Apply a 2D Butterworth high-pass filter from `input` into `output`.
///
/// Cutoff is given in cycles per pixel (Nyquist = 0.5). Order controls
/// rolloff steepness. DC is always zeroed exactly. Input and output must
/// have identical shape.
pub fn butterworth_highpass(
    input: Frame<'_>,
    output: &mut FrameMut<'_>,
    cutoff_cycles_per_pixel: f32,
    order: u32,
) -> Result<(), ShapeError> {
    let h = input.height();
    let w = input.width();
    if h != output.height() || w != output.width() {
        return Err(ShapeError {
            expected: h * w,
            actual: output.pixels().len(),
        });
    }

    let mut buf: Vec<Complex32> = input
        .pixels()
        .iter()
        .map(|&r| Complex32::new(r, 0.0))
        .collect();

    let mut planner = FftPlanner::<f32>::new();
    let row_fft = planner.plan_fft_forward(w);
    let col_fft = planner.plan_fft_forward(h);
    let row_ifft = planner.plan_fft_inverse(w);
    let col_ifft = planner.plan_fft_inverse(h);

    fft_rows(&mut buf, h, w, &row_fft);
    fft_columns(&mut buf, h, w, &col_fft);

    apply_highpass_gain(&mut buf, h, w, cutoff_cycles_per_pixel, order);

    fft_columns(&mut buf, h, w, &col_ifft);
    fft_rows(&mut buf, h, w, &row_ifft);

    let norm = 1.0 / (h * w) as f32;
    for y in 0..h {
        for x in 0..w {
            *output.get_mut(y, x) = buf[y * w + x].re * norm;
        }
    }
    Ok(())
}

fn fft_rows(buf: &mut [Complex32], h: usize, w: usize, fft: &Arc<dyn rustfft::Fft<f32>>) {
    for y in 0..h {
        fft.process(&mut buf[y * w..(y + 1) * w]);
    }
}

fn fft_columns(buf: &mut [Complex32], h: usize, w: usize, fft: &Arc<dyn rustfft::Fft<f32>>) {
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

fn apply_highpass_gain(buf: &mut [Complex32], h: usize, w: usize, cutoff: f32, order: u32) {
    let two_n = 2.0 * order as f32;
    let h_f = h as f32;
    let w_f = w as f32;
    for ky in 0..h {
        // Map bin index to signed frequency in cycles per pixel.
        let fy = if ky <= h / 2 {
            ky as f32 / h_f
        } else {
            (ky as f32 - h_f) / h_f
        };
        for kx in 0..w {
            let fx = if kx <= w / 2 {
                kx as f32 / w_f
            } else {
                (kx as f32 - w_f) / w_f
            };
            let f = (fx * fx + fy * fy).sqrt();
            let gain = if f == 0.0 {
                0.0
            } else {
                1.0 / (1.0 + (cutoff / f).powf(two_n)).sqrt()
            };
            buf[ky * w + kx] *= gain;
        }
    }
}
