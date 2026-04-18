//! `EvaluateTraces` — block-coordinate-descent NNLS solver for the
//! trace update (thesis §3.2.3, Algorithm 7).
//!
//! Solves `c̃_t ← argmin_{c ≥ 0} ‖y_t − Ã c‖²` by Gauss-Seidel
//! coordinate descent, grouped by the connected components of the
//! spatial-overlap graph. Groups are independent (their sub-problems
//! decouple since `V[G_i, G_j] = 0` across groups), so the ordering
//! within the outer `for g` loop does not change the fixed point.
//! Within a group, we update components one at a time using the
//! most recent trace values — the standard NNLS coordinate-descent
//! recipe, which is guaranteed monotone in the objective.

use crate::assets::{Footprints, Groups};
use crate::config::FitConfig;

/// One BCD solve of the trace update.
///
/// Returns `c̃_t` of length `fp.len()`. All entries are `≥ 0`.
/// Iterates at most `cfg.trace_max_iter` times; exits early when the
/// relative change falls below `cfg.trace_tol`.
pub fn evaluate_traces(
    fp: &Footprints,
    groups: &Groups,
    y: &[f32],
    c_prev: &[f32],
    cfg: &FitConfig,
) -> Vec<f32> {
    let k = fp.len();
    assert_eq!(
        y.len(),
        fp.pixels(),
        "y length {} must equal pixels {}",
        y.len(),
        fp.pixels()
    );
    assert_eq!(
        c_prev.len(),
        k,
        "c_prev length {} must equal k = {}",
        c_prev.len(),
        k
    );

    if k == 0 {
        return Vec::new();
    }

    // Precompute U = Aᵀy and V = AᵀA (Algorithm 7 lines 1–2). Both
    // stay constant for the duration of this call; only c changes.
    let u = fp.aty(y);
    let v = fp.ata();

    let mut c = c_prev.to_vec();
    let mut c_step = vec![0.0f32; k];

    let tol_sq = cfg.trace_tol * cfg.trace_tol;

    for _ in 0..cfg.trace_max_iter {
        c_step.copy_from_slice(&c);

        // Across groups: order-independent (V[Gᵢ, Gⱼ] = 0 for i ≠ j).
        // Within a group: Gauss-Seidel (each update uses the freshest
        // values of its neighbours).
        for g in 0..groups.len() {
            for &i in groups.group(g) {
                let vii = v[i * k + i];
                if vii <= 0.0 {
                    // Component has empty / degenerate support — no
                    // observation anchors its trace. Leave at 0.
                    c[i] = 0.0;
                    continue;
                }
                // V[i, :] · c
                let row_start = i * k;
                let vi_dot_c: f32 = (0..k).map(|j| v[row_start + j] * c[j]).sum();
                let delta = (u[i] - vi_dot_c) / vii;
                c[i] = (c[i] + delta).max(0.0);
            }
        }

        // Convergence: ‖c − c_step‖ < ε · ‖c_step‖ (thesis line 7).
        // Squared form avoids a sqrt per iteration. Skip the check on
        // the first sweep if `c_step` was all zero (no meaningful
        // relative threshold yet).
        let mut diff_sq = 0.0f32;
        let mut step_sq = 0.0f32;
        for (new_val, old_val) in c.iter().zip(&c_step) {
            let d = new_val - old_val;
            diff_sq += d * d;
            step_sq += old_val * old_val;
        }
        if step_sq > 0.0 && diff_sq < tol_sq * step_sq {
            break;
        }
    }

    c
}
