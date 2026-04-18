//! Tests for the sufficient-statistics storage `W`, `M` (thesis
//! §3.2.3, Eqs. 3.20–3.22).
//!
//! The asset here is *just the container*: shape, zero-init, writable
//! slices, frame counter. The SNR-gated update rule lives in
//! `fitting::suff_stats` and is tested separately against its defining
//! recursive-mean equation (Eq. 3.25).

use calab_cala_core::assets::SuffStats;

#[test]
fn new_suff_stats_are_zero_and_at_frame_zero() {
    let s = SuffStats::new(10, 3);
    assert_eq!(s.pixels(), 10);
    assert_eq!(s.k(), 3);
    assert_eq!(s.frames(), 0);
    assert_eq!(s.w().len(), 30); // pixels × k
    assert_eq!(s.m().len(), 9); //  k × k
    assert!(s.w().iter().all(|&v| v == 0.0));
    assert!(s.m().iter().all(|&v| v == 0.0));
}

#[test]
fn w_index_is_row_major_p_times_k_plus_i() {
    // Row-major (pixels, k) layout: W[p, i] ↔ index p*k + i. Pinning
    // this matches the existing Frame row-major convention so the
    // boundary layer can hand `W` to numpy / xarray without transposing.
    let s = SuffStats::new(4, 3); // pixels=4, k=3
    assert_eq!(s.w_idx(0, 0), 0);
    assert_eq!(s.w_idx(0, 2), 2);
    assert_eq!(s.w_idx(1, 0), 3);
    assert_eq!(s.w_idx(3, 2), 11);
}

#[test]
fn m_index_is_row_major_i_times_k_plus_j() {
    let s = SuffStats::new(4, 3);
    assert_eq!(s.m_idx(0, 0), 0);
    assert_eq!(s.m_idx(0, 2), 2);
    assert_eq!(s.m_idx(2, 1), 7);
}

#[test]
fn w_mut_and_m_mut_write_through_to_storage() {
    // The `fitting::suff_stats` update step needs to mutate `W` and
    // `M` in place — this test verifies the write path is wired.
    let mut s = SuffStats::new(2, 2);
    s.w_mut()[3] = 1.5; // W[1, 1]
    s.m_mut()[1] = 2.5; // M[0, 1]
    assert_eq!(s.w()[3], 1.5);
    assert_eq!(s.m()[1], 2.5);
}

#[test]
fn increment_frames_advances_counter() {
    // The recursive mean formula needs `t` to compute the `(t-1)/t`
    // and `1/t` weights. `increment_frames` is how the update step
    // advances the counter after applying the new-frame contribution.
    let mut s = SuffStats::new(1, 1);
    assert_eq!(s.frames(), 0);
    s.increment_frames();
    assert_eq!(s.frames(), 1);
    s.increment_frames();
    assert_eq!(s.frames(), 2);
}

#[test]
fn w_col_slice_is_strided_access_helper() {
    // `EvaluateFootprints` reads W[:, i] across sparse pixel indices
    // on the component's positive support. The asset exposes a
    // column accessor so the fit code does not re-derive the offset.
    let mut s = SuffStats::new(3, 2);
    let (i01, i11, i21) = (s.w_idx(0, 1), s.w_idx(1, 1), s.w_idx(2, 1));
    let w = s.w_mut();
    w[i01] = 10.0;
    w[i11] = 20.0;
    w[i21] = 30.0;
    assert_eq!(s.w_at(0, 1), 10.0);
    assert_eq!(s.w_at(1, 1), 20.0);
    assert_eq!(s.w_at(2, 1), 30.0);
}

#[test]
#[should_panic(expected = "pixels")]
fn new_rejects_zero_pixels() {
    let _ = SuffStats::new(0, 3);
}
