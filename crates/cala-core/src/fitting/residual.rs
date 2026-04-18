//! `EvaluateResidual` — compute the per-frame reconstruction residual
//! `R_t = y_t − Ã c̃_t` (thesis §3.2.3, Eq. 3.24).
//!
//! Two roles:
//! 1. Feeds the Extend loop's segmentation search for unexplained
//!    structure (thesis §3.2.4).
//! 2. Drives trace throttling (`fitting::throttle`, thesis Eq. 3.39):
//!    negative residual on a component's exclusive support signals an
//!    over-estimated trace.

use crate::assets::Footprints;

pub fn evaluate_residual(fp: &Footprints, c: &[f32], y: &[f32], out: &mut [f32]) {
    assert_eq!(
        y.len(),
        fp.pixels(),
        "y length {} must equal pixels {}",
        y.len(),
        fp.pixels()
    );
    assert_eq!(
        out.len(),
        fp.pixels(),
        "out length {} must equal pixels {}",
        out.len(),
        fp.pixels()
    );
    // reconstruct writes `Ãc` into out and fills the rest with 0.
    fp.reconstruct(c, out);
    for (o, &yp) in out.iter_mut().zip(y) {
        *o = yp - *o;
    }
}
