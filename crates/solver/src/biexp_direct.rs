/// Direct bi-exponential kernel estimation from traces and spike trains.
///
/// Instead of estimating a free-form kernel and then fitting a bi-exponential
/// to it (the two-step approach in kernel_est.rs + biexp_fit.rs), this function
/// directly optimizes (tau_r, tau_d) against trace reconstruction error:
///
///   min_{tau_r, tau_d}  Σ_i ||y_adj_i - alpha_i * K(tau_r, tau_d) * s_i - baseline_i||^2
///
/// where alpha_i and baseline_i are solved in closed form (lstsq) at each
/// candidate (tau_r, tau_d). This avoids the tau_rise collapse problem where
/// free-kernel artifacts bias the post-hoc biexp fit.

use crate::banded::BandedAR2;
use crate::biexp_fit::BiexpResult;
use crate::threshold::{boundary_padding, lstsq_alpha_baseline};

/// Direct bi-exponential kernel estimation from traces and spike trains.
///
/// Algorithm:
///   Phase 1: 20x20 log-spaced grid search over (tau_r, tau_d)
///   Phase 2: Golden-section refinement around the best grid point
///
/// At each candidate, we:
///   1. Validate the bi-exponential constraint (tau_d > tau_r, real non-oscillatory AR2 roots)
///   2. Build a BandedAR2 engine and convolve each trace's spikes in O(T)
///   3. Fit (alpha, baseline) per trace via closed-form normal equations
///   4. Sum the reconstruction SSR across all traces
///
/// Returns BiexpResult where residual is total trace reconstruction SSR
/// and beta is the median alpha across traces.
pub fn fit_biexp_direct(
    traces: &[f32],
    spike_trains: &[f32],
    trace_lengths: &[usize],
    fs: f64,
    refine: bool,
) -> BiexpResult {
    let total_len: usize = trace_lengths.iter().sum();
    if total_len == 0 || trace_lengths.is_empty() {
        return BiexpResult {
            tau_rise: 0.02,
            tau_decay: 0.4,
            beta: 0.0,
            residual: f64::INFINITY,
        };
    }

    assert_eq!(traces.len(), total_len);
    assert_eq!(spike_trains.len(), total_len);

    let max_trace_len = *trace_lengths.iter().max().unwrap();
    let mut conv_buf = vec![0.0_f32; max_trace_len];

    // Grid search ranges (same as biexp_fit.rs)
    let tau_r_lo = (2.0 / fs).max(0.005_f64);
    let tau_r_hi = 0.5_f64;
    let tau_d_lo = 0.05_f64;
    let tau_d_hi = 5.0_f64;

    let grid_n = 20;
    let log_tr_lo = tau_r_lo.ln();
    let log_tr_hi = tau_r_hi.ln();
    let log_td_lo = tau_d_lo.ln();
    let log_td_hi = tau_d_hi.ln();

    let mut best = BiexpResult {
        tau_rise: 0.02,
        tau_decay: 0.4,
        beta: 0.0,
        residual: f64::INFINITY,
    };

    // Phase 1: Grid search
    for i in 0..grid_n {
        let log_tr = log_tr_lo + (log_tr_hi - log_tr_lo) * i as f64 / (grid_n - 1) as f64;
        let tau_r = log_tr.exp();

        for j in 0..grid_n {
            let log_td = log_td_lo + (log_td_hi - log_td_lo) * j as f64 / (grid_n - 1) as f64;
            let tau_d = log_td.exp();

            if !is_valid_biexp(tau_r, tau_d, fs) {
                continue;
            }

            if let Some((median_alpha, total_ssr)) = eval_reconstruction(
                traces,
                spike_trains,
                trace_lengths,
                tau_r,
                tau_d,
                fs,
                &mut conv_buf,
            ) {
                if total_ssr < best.residual {
                    best = BiexpResult {
                        tau_rise: tau_r,
                        tau_decay: tau_d,
                        beta: median_alpha,
                        residual: total_ssr,
                    };
                }
            }
        }
    }

    // Phase 2: Optional golden-section refinement
    if refine {
        let (refined_tr, refined_td) = golden_section_refine(
            traces,
            spike_trains,
            trace_lengths,
            &best,
            fs,
            20,
            &mut conv_buf,
        );
        if let Some((median_alpha, total_ssr)) = eval_reconstruction(
            traces,
            spike_trains,
            trace_lengths,
            refined_tr,
            refined_td,
            fs,
            &mut conv_buf,
        ) {
            if total_ssr < best.residual {
                best = BiexpResult {
                    tau_rise: refined_tr,
                    tau_decay: refined_td,
                    beta: median_alpha,
                    residual: total_ssr,
                };
            }
        }
    }

    best
}

/// Validate that (tau_r, tau_d) produces a real, non-oscillatory bi-exponential kernel.
///
/// The AR2 recursion c[t] = g1*c[t-1] + g2*c[t-2] + s[t] produces a real,
/// non-oscillatory (i.e., physical calcium-like) impulse response ONLY when
/// the AR2 characteristic polynomial z^2 - g1*z - g2 = 0 has two distinct
/// real roots in (0, 1). For a bi-exponential kernel:
///   d = exp(-dt / tau_d) in (0,1)  [guaranteed by tau_d > 0]
///   r = exp(-dt / tau_r) in (0,1)  [guaranteed by tau_r > 0]
///   g1 = d + r,  g2 = -(d * r)
///   discriminant = g1^2 + 4*g2 = (d - r)^2 >= 0  [always non-negative]
///
/// So for positive taus with tau_d > tau_r, the roots are always real and
/// in (0,1). We enforce tau_d > tau_r and both > 0 to guarantee this.
fn is_valid_biexp(tau_r: f64, tau_d: f64, fs: f64) -> bool {
    // tau_d must be strictly greater than tau_r, and both must be positive
    if tau_r <= 0.0 || tau_d <= tau_r {
        return false;
    }
    // Additional guard: tau_r must be at least 1 sample (resolvable)
    let dt = 1.0 / fs;
    if tau_r < dt {
        return false;
    }
    true
}

/// Evaluate reconstruction error for a candidate (tau_r, tau_d).
///
/// For each trace: AR2-convolve spikes -> lstsq for (alpha, baseline) -> compute SSR.
/// Returns (median_alpha, total_ssr) or None if the candidate is invalid.
fn eval_reconstruction(
    traces: &[f32],
    spike_trains: &[f32],
    trace_lengths: &[usize],
    tau_r: f64,
    tau_d: f64,
    fs: f64,
    conv_buf: &mut [f32],
) -> Option<(f64, f64)> {
    if !is_valid_biexp(tau_r, tau_d, fs) {
        return None;
    }

    let banded = BandedAR2::new(tau_r, tau_d, fs);
    let pad = boundary_padding(tau_d, fs);

    let mut total_ssr = 0.0_f64;
    let mut alphas = Vec::with_capacity(trace_lengths.len());
    let mut offset = 0;

    for &len in trace_lengths {
        let trace_slice = &traces[offset..offset + len];
        let spike_slice = &spike_trains[offset..offset + len];

        // Convolve spikes through the AR2 model
        banded.convolve_forward(spike_slice, &mut conv_buf[..len]);

        // Fit (alpha, baseline) via closed-form normal equations
        let trace_pad = pad.min(len / 4);
        let (alpha, baseline) =
            lstsq_alpha_baseline(&conv_buf[..len], trace_slice, trace_pad, f64::INFINITY);

        alphas.push(alpha);

        // Compute SSR over the inner region (excluding boundary padding)
        let lo = trace_pad;
        let hi = len.saturating_sub(trace_pad);
        for i in lo..hi {
            let pred = alpha * conv_buf[i] as f64 + baseline;
            let d = trace_slice[i] as f64 - pred;
            total_ssr += d * d;
        }

        offset += len;
    }

    if alphas.is_empty() {
        return None;
    }

    // Median alpha across traces
    alphas.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median_alpha = if alphas.len() % 2 == 1 {
        alphas[alphas.len() / 2]
    } else {
        (alphas[alphas.len() / 2 - 1] + alphas[alphas.len() / 2]) / 2.0
    };

    Some((median_alpha, total_ssr))
}

/// Golden-section refinement around the best grid point.
/// Alternates refining tau_r and tau_d for `max_steps` total.
fn golden_section_refine(
    traces: &[f32],
    spike_trains: &[f32],
    trace_lengths: &[usize],
    best: &BiexpResult,
    fs: f64,
    max_steps: usize,
    conv_buf: &mut [f32],
) -> (f64, f64) {
    let phi = (5.0_f64.sqrt() - 1.0) / 2.0;
    let dt = 1.0 / fs;

    let mut tau_r = best.tau_rise;
    let mut tau_d = best.tau_decay;

    for step in 0..max_steps {
        if step % 2 == 0 {
            // Refine tau_r (floor at 1 sample)
            let mut lo = (tau_r * 0.5).max(dt);
            let mut hi = tau_r * 2.0;
            hi = hi.min(tau_d * 0.99);
            if lo >= hi {
                continue;
            }

            for _ in 0..10 {
                let x1 = hi - phi * (hi - lo);
                let x2 = lo + phi * (hi - lo);
                let r1 = eval_reconstruction(
                    traces,
                    spike_trains,
                    trace_lengths,
                    x1,
                    tau_d,
                    fs,
                    conv_buf,
                )
                .map(|(_, ssr)| ssr)
                .unwrap_or(f64::INFINITY);
                let r2 = eval_reconstruction(
                    traces,
                    spike_trains,
                    trace_lengths,
                    x2,
                    tau_d,
                    fs,
                    conv_buf,
                )
                .map(|(_, ssr)| ssr)
                .unwrap_or(f64::INFINITY);
                if r1 < r2 {
                    hi = x2;
                } else {
                    lo = x1;
                }
            }
            tau_r = (lo + hi) / 2.0;
        } else {
            // Refine tau_d
            let lo = (tau_d * 0.5).max(tau_r * 1.01);
            let hi = tau_d * 2.0;
            if lo >= hi {
                continue;
            }

            let mut lo_inner = lo;
            let mut hi_inner = hi;
            for _ in 0..10 {
                let x1 = hi_inner - phi * (hi_inner - lo_inner);
                let x2 = lo_inner + phi * (hi_inner - lo_inner);
                let r1 = eval_reconstruction(
                    traces,
                    spike_trains,
                    trace_lengths,
                    tau_r,
                    x1,
                    fs,
                    conv_buf,
                )
                .map(|(_, ssr)| ssr)
                .unwrap_or(f64::INFINITY);
                let r2 = eval_reconstruction(
                    traces,
                    spike_trains,
                    trace_lengths,
                    tau_r,
                    x2,
                    fs,
                    conv_buf,
                )
                .map(|(_, ssr)| ssr)
                .unwrap_or(f64::INFINITY);
                if r1 < r2 {
                    hi_inner = x2;
                } else {
                    lo_inner = x1;
                }
            }
            tau_d = (lo_inner + hi_inner) / 2.0;
        }
    }

    (tau_r, tau_d)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::banded::BandedAR2;

    /// Generate synthetic traces from known spikes and kernel parameters.
    fn make_synthetic_data(
        tau_r: f64,
        tau_d: f64,
        fs: f64,
        n_traces: usize,
        trace_len: usize,
    ) -> (Vec<f32>, Vec<f32>, Vec<usize>) {
        let banded = BandedAR2::new(tau_r, tau_d, fs);
        let mut all_traces = Vec::new();
        let mut all_spikes = Vec::new();
        let mut trace_lengths = Vec::new();

        for i in 0..n_traces {
            let mut spikes = vec![0.0_f32; trace_len];
            // Place spikes at deterministic positions
            let positions = [
                20 + i * 7,
                80 + i * 3,
                150 + i * 5,
                220 + i * 2,
            ];
            for &pos in &positions {
                if pos < trace_len {
                    spikes[pos] = 1.0;
                }
            }

            let mut conv = vec![0.0_f32; trace_len];
            banded.convolve_forward(&spikes, &mut conv);

            // trace = alpha * conv + baseline
            let alpha = 3.0 + i as f32 * 0.5;
            let baseline = 1.0 + i as f32 * 0.2;
            let trace: Vec<f32> = conv.iter().map(|&c| alpha * c + baseline).collect();

            all_traces.extend_from_slice(&trace);
            all_spikes.extend_from_slice(&spikes);
            trace_lengths.push(trace_len);
        }

        (all_traces, all_spikes, trace_lengths)
    }

    #[test]
    fn recovers_known_taus() {
        let tau_r_true = 0.08;
        let tau_d_true = 0.5;
        let fs = 30.0;
        let (traces, spikes, lengths) = make_synthetic_data(tau_r_true, tau_d_true, fs, 3, 300);

        let result = fit_biexp_direct(&traces, &spikes, &lengths, fs, true);

        let tr_err = (result.tau_rise - tau_r_true).abs() / tau_r_true;
        let td_err = (result.tau_decay - tau_d_true).abs() / tau_d_true;

        assert!(
            tr_err < 0.15,
            "Tau rise error {:.1}% (got {:.4}, expected {:.4})",
            tr_err * 100.0,
            result.tau_rise,
            tau_r_true
        );
        assert!(
            td_err < 0.15,
            "Tau decay error {:.1}% (got {:.4}, expected {:.4})",
            td_err * 100.0,
            result.tau_decay,
            tau_d_true
        );
    }

    #[test]
    fn tau_d_greater_than_tau_r() {
        let (traces, spikes, lengths) = make_synthetic_data(0.05, 0.8, 30.0, 2, 300);
        let result = fit_biexp_direct(&traces, &spikes, &lengths, 30.0, true);

        assert!(
            result.tau_decay > result.tau_rise,
            "tau_d ({}) should be > tau_r ({})",
            result.tau_decay,
            result.tau_rise
        );
    }

    #[test]
    fn validation_rejects_invalid() {
        // tau_r >= tau_d
        assert!(!is_valid_biexp(0.5, 0.3, 30.0));
        // tau_r == tau_d
        assert!(!is_valid_biexp(0.3, 0.3, 30.0));
        // negative tau_r
        assert!(!is_valid_biexp(-0.1, 0.5, 30.0));
        // tau_r below 1 sample
        assert!(!is_valid_biexp(0.01, 0.5, 30.0)); // dt = 1/30 ≈ 0.033
    }

    #[test]
    fn validation_accepts_valid() {
        assert!(is_valid_biexp(0.05, 0.5, 30.0));
        assert!(is_valid_biexp(0.08, 1.0, 30.0));
        assert!(is_valid_biexp(0.02, 0.4, 100.0)); // dt = 0.01, tau_r = 0.02 > dt
    }

    #[test]
    fn refinement_improves_fit() {
        let (traces, spikes, lengths) = make_synthetic_data(0.04, 0.6, 30.0, 3, 300);

        let coarse = fit_biexp_direct(&traces, &spikes, &lengths, 30.0, false);
        let refined = fit_biexp_direct(&traces, &spikes, &lengths, 30.0, true);

        assert!(
            refined.residual <= coarse.residual + 1e-10,
            "Refinement should not worsen fit: refined {} vs coarse {}",
            refined.residual,
            coarse.residual
        );
    }

    #[test]
    fn empty_input() {
        let result = fit_biexp_direct(&[], &[], &[], 30.0, true);
        assert_eq!(result.residual, f64::INFINITY);
    }

    #[test]
    fn single_trace() {
        let (traces, spikes, lengths) = make_synthetic_data(0.06, 0.4, 30.0, 1, 300);
        let result = fit_biexp_direct(&traces, &spikes, &lengths, 30.0, true);

        assert!(
            result.tau_decay > result.tau_rise,
            "tau_d ({}) should be > tau_r ({})",
            result.tau_decay,
            result.tau_rise
        );
        assert!(
            result.residual < f64::INFINITY,
            "Should produce finite residual"
        );
    }
}
