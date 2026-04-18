//! Trace throttling — underfit correction (thesis §3.2.3, Eq. 3.39).
//!
//! For each estimator `i`, on pixels in its exclusive support (i.e.
//! pixels in `supp(i)` and in no other component's support) with
//! negative residual, the estimated trace is too high — some of the
//! energy at those pixels is unexplained structure the model is
//! spreading onto `i` because no other component exists for it.
//! Throttling decrements `c_i` by
//! ```text
//! δ_i = mean_{p ∈ Γ_i} (−R(p, t) / Ã[p, i]),   Γ_i = {p : p ∈ supp(i), count(p) = 1, R(p) < 0}
//! ```
//! which drives residual on `Γ_i` to exactly zero (thesis Eq. 3.42).
//! The knock-on effect on overlap regions is what lets Extend discover
//! the missing overlapping component cleanly (Eq. 3.45).

use crate::assets::Footprints;

pub fn trace_throttle(fp: &Footprints, c: &mut [f32], residual: &[f32]) {
    let k = fp.len();
    if k == 0 {
        return;
    }
    assert_eq!(
        c.len(),
        k,
        "c length {} must equal number of components {}",
        c.len(),
        k
    );
    assert_eq!(
        residual.len(),
        fp.pixels(),
        "residual length {} must equal pixels {}",
        residual.len(),
        fp.pixels()
    );

    let counts = fp.pixel_component_counts();

    // Compute all δ_i from the current residual before applying any
    // to c — throttling one component changes the residual at shared
    // pixels, but per thesis the δ values are derived from the
    // *unmodified* residual (and applied only once per frame).
    for i in 0..k {
        let mut sum = 0.0f32;
        let mut n = 0u32;
        for (&p, &a_val) in fp.support(i).iter().zip(fp.values(i)) {
            let p = p as usize;
            if counts[p] == 1 && residual[p] < 0.0 {
                sum += -residual[p] / a_val;
                n += 1;
            }
        }
        if n > 0 {
            let delta = sum / n as f32;
            c[i] = (c[i] - delta).max(0.0);
        }
    }
}
