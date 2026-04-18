//! Merge of two components via rank-1 NMF on their reconstructed
//! movie slice (thesis §3.3 MergeEstimators, Phase 3 Task 7).
//!
//! When the redundancy gate (overlap + trace correlation, Task 6)
//! flags a candidate–existing pair as redundant, we don't just pick
//! one and drop the other: we reconstruct their joint movie as
//! `a_i c_iᵀ + a_j c_jᵀ` over the union of their supports and run a
//! fresh rank-1 NMF on it. This preserves NMF's scale-invariance
//! (the merged result doesn't depend on the normalization of the
//! inputs) and yields a single clean component that covers the
//! union of the pair's pixels.

use std::cmp::Ordering;

use crate::extending::segment::{rank1_nmf, Rank1Nmf};

/// Merge outcome: the unified spatial factor on the union support
/// plus the merged trace and rank-1 NMF diagnostics.
#[derive(Debug, Clone)]
pub struct MergeResult {
    /// Union of the two input supports, strictly ascending.
    pub support: Vec<u32>,
    /// Merged spatial values on `support`, unit-L2 normalized.
    pub a_values: Vec<f32>,
    /// Merged trace, length `T`.
    pub c: Vec<f32>,
    /// `‖M − a_m c_mᵀ‖_F / ‖M‖_F` where M is the reconstructed movie
    /// slice. Low on redundant pairs, higher if the pair turns out
    /// not to be a single component.
    pub recon_error: f32,
    pub iterations: u32,
    pub converged: bool,
}

/// Merge two components by rank-1 NMF on their reconstructed movie.
///
/// Inputs are the two components' sparse footprints (sorted-ascending
/// support + aligned values) and their traces over the same `T`-frame
/// window. Both supports must address the same underlying pixel
/// index space (i.e. same full-frame row-major layout).
#[allow(clippy::too_many_arguments)]
pub fn merge_components(
    support_i: &[u32],
    a_values_i: &[f32],
    c_i: &[f32],
    support_j: &[u32],
    a_values_j: &[f32],
    c_j: &[f32],
    max_iter: u32,
    tol: f32,
) -> MergeResult {
    assert_eq!(
        support_i.len(),
        a_values_i.len(),
        "support_i / a_values_i length mismatch"
    );
    assert_eq!(
        support_j.len(),
        a_values_j.len(),
        "support_j / a_values_j length mismatch"
    );
    assert_eq!(
        c_i.len(),
        c_j.len(),
        "trace length mismatch: {} vs {}",
        c_i.len(),
        c_j.len()
    );

    // Union support via two-pointer merge; values retained as
    // (a_i[p], a_j[p]) pairs (0 where pixel is absent).
    let mut union: Vec<u32> = Vec::with_capacity(support_i.len() + support_j.len());
    let mut a_i_dense: Vec<f32> = Vec::new();
    let mut a_j_dense: Vec<f32> = Vec::new();
    let (mut ii, mut jj) = (0usize, 0usize);
    while ii < support_i.len() && jj < support_j.len() {
        match support_i[ii].cmp(&support_j[jj]) {
            Ordering::Less => {
                union.push(support_i[ii]);
                a_i_dense.push(a_values_i[ii]);
                a_j_dense.push(0.0);
                ii += 1;
            }
            Ordering::Greater => {
                union.push(support_j[jj]);
                a_i_dense.push(0.0);
                a_j_dense.push(a_values_j[jj]);
                jj += 1;
            }
            Ordering::Equal => {
                union.push(support_i[ii]);
                a_i_dense.push(a_values_i[ii]);
                a_j_dense.push(a_values_j[jj]);
                ii += 1;
                jj += 1;
            }
        }
    }
    while ii < support_i.len() {
        union.push(support_i[ii]);
        a_i_dense.push(a_values_i[ii]);
        a_j_dense.push(0.0);
        ii += 1;
    }
    while jj < support_j.len() {
        union.push(support_j[jj]);
        a_i_dense.push(0.0);
        a_j_dense.push(a_values_j[jj]);
        jj += 1;
    }

    let t = c_i.len();
    let p = union.len();

    // Reconstruct M[t, p] = a_i[p] * c_i[t] + a_j[p] * c_j[t].
    let mut movie = vec![0.0f32; t * p];
    for ti in 0..t {
        let row_base = ti * p;
        let ci = c_i[ti];
        let cj = c_j[ti];
        for pi in 0..p {
            movie[row_base + pi] = a_i_dense[pi] * ci + a_j_dense[pi] * cj;
        }
    }

    // Edge case: zero-pixel merge (both supports empty).
    if p == 0 {
        return MergeResult {
            support: union,
            a_values: Vec::new(),
            c: vec![0.0; t],
            recon_error: 0.0,
            iterations: 0,
            converged: true,
        };
    }

    let nmf: Rank1Nmf = rank1_nmf(&movie, t, p, max_iter, tol);
    MergeResult {
        support: union,
        a_values: nmf.a,
        c: nmf.c,
        recon_error: nmf.recon_error,
        iterations: nmf.iterations,
        converged: nmf.converged,
    }
}
