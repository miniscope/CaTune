//! `EvaluateSuffStats` — SNR-gated recursive-mean update of `W`, `M`
//! (thesis §3.2.3, Eq. 3.25).
//!
//! At frame `t`:
//! ```text
//! W_t = ((t-1)/t) W_{t-1} + (1/t) · y_t · f(c̃_t)ᵀ
//! M_t = ((t-1)/t) M_{t-1} + (1/t) · c̃_t · f(c̃_t)ᵀ
//! ```
//! where `f(c) = c · H(c − c₀)` zeros out contributions from
//! components whose trace is below the SNR threshold, so long quiet
//! stretches do not drift footprints toward noise (thesis §3.2.3,
//! "SNR-weighted Fitting" discussion).
//!
//! The asymmetric outer product `c̃_t · f(c̃_t)ᵀ` for `M` is written
//! exactly as in Eq. 3.25. `EvaluateFootprints` reads `M[:, i]` (the
//! column indexed by the footprint being updated), so the gate on
//! column `j` via `f(c̃_t)[j]` is what freezes j's footprint when j
//! is inactive while leaving other footprints free to learn.

use crate::assets::SuffStats;
use crate::config::FitConfig;

pub fn evaluate_suff_stats(ss: &mut SuffStats, y: &[f32], c: &[f32], cfg: &FitConfig) {
    assert_eq!(
        y.len(),
        ss.pixels(),
        "y length {} must equal pixels {}",
        y.len(),
        ss.pixels()
    );
    assert_eq!(
        c.len(),
        ss.k(),
        "c length {} must equal k = {}",
        c.len(),
        ss.k()
    );

    // Advance the frame counter first: the recursive-mean weights are
    // `(t-1)/t` on the previous state and `1/t` on the new outer
    // product, where `t` is the index of *this* frame (1-based).
    ss.increment_frames();
    let t = ss.frames();
    let inv_t = 1.0f32 / (t as f32);
    let decay = (t - 1) as f32 * inv_t;

    // Apply the Heaviside gate: f_c[i] = c[i] if c[i] > c₀, else 0.
    let k = ss.k();
    let mut f_c = vec![0.0f32; k];
    for (i, &ci) in c.iter().enumerate() {
        if ci > cfg.snr_c0 {
            f_c[i] = ci;
        }
    }

    // W update: W[p, i] = decay * W[p, i] + inv_t * y[p] * f_c[i].
    {
        let w = ss.w_mut();
        for p in 0..y.len() {
            let yp = y[p];
            let row = p * k;
            for i in 0..k {
                let prev = w[row + i];
                w[row + i] = decay * prev + inv_t * yp * f_c[i];
            }
        }
    }

    // M update: M[i, j] = decay * M[i, j] + inv_t * c[i] * f_c[j].
    {
        let m = ss.m_mut();
        for i in 0..k {
            let ci = c[i];
            let row = i * k;
            for j in 0..k {
                let prev = m[row + j];
                m[row + j] = decay * prev + inv_t * ci * f_c[j];
            }
        }
    }
}
