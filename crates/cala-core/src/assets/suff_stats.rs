//! Sufficient statistics storage `W` and `M` (thesis §3.2.3,
//! Eqs. 3.20–3.22).
//!
//! `W ∈ R^((xy) × k)` is the cumulative `y cᵀ` co-activation per
//! (pixel, component) pair; `M ∈ R^(k × k)` is the cumulative `c cᵀ`
//! co-activation between components. Both update recursively per
//! Eq. 3.22 / 3.25, eliminating the need to revisit past frames —
//! the *point* of the OMF formulation.
//!
//! The module here is just the container. Update math (with the
//! SNR-gated `f(c) = c · H(c − c₀)` from Eq. 3.25) lives in
//! `fitting::suff_stats`.

#[derive(Debug, Clone)]
pub struct SuffStats {
    pixels: usize,
    k: usize,
    frames: u64,
    /// Row-major `pixels × k` storage: `W[p, i]` at `p * k + i`.
    w: Vec<f32>,
    /// Row-major `k × k` storage: `M[i, j]` at `i * k + j`.
    m: Vec<f32>,
}

impl SuffStats {
    pub fn new(pixels: usize, k: usize) -> Self {
        assert!(pixels > 0, "pixels must be positive");
        Self {
            pixels,
            k,
            frames: 0,
            w: vec![0.0; pixels * k],
            m: vec![0.0; k * k],
        }
    }

    pub fn pixels(&self) -> usize {
        self.pixels
    }

    pub fn k(&self) -> usize {
        self.k
    }

    pub fn frames(&self) -> u64 {
        self.frames
    }

    pub fn increment_frames(&mut self) {
        self.frames += 1;
    }

    pub fn w(&self) -> &[f32] {
        &self.w
    }

    pub fn w_mut(&mut self) -> &mut [f32] {
        &mut self.w
    }

    pub fn m(&self) -> &[f32] {
        &self.m
    }

    pub fn m_mut(&mut self) -> &mut [f32] {
        &mut self.m
    }

    /// Flat index for `W[p, i]` in the row-major `(pixels, k)` layout.
    pub fn w_idx(&self, p: usize, i: usize) -> usize {
        p * self.k + i
    }

    /// Flat index for `M[i, j]` in the row-major `(k, k)` layout.
    pub fn m_idx(&self, i: usize, j: usize) -> usize {
        i * self.k + j
    }

    pub fn w_at(&self, p: usize, i: usize) -> f32 {
        self.w[self.w_idx(p, i)]
    }

    pub fn m_at(&self, i: usize, j: usize) -> f32 {
        self.m[self.m_idx(i, j)]
    }
}
