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

    /// Grow `k` by 1, appending a zero column to `W` (per pixel) and
    /// a zero row + column to `M`. Used by Phase 3 apply when a new
    /// component is registered (merge or fresh discovery).
    pub fn insert_empty_component(&mut self) {
        let new_k = self
            .k
            .checked_add(1)
            .expect("SuffStats k overflowed usize on insert");
        let mut new_w = Vec::with_capacity(self.pixels * new_k);
        for p in 0..self.pixels {
            let row_start = p * self.k;
            new_w.extend_from_slice(&self.w[row_start..row_start + self.k]);
            new_w.push(0.0);
        }
        let mut new_m = vec![0.0f32; new_k * new_k];
        for i in 0..self.k {
            for j in 0..self.k {
                new_m[i * new_k + j] = self.m[i * self.k + j];
            }
        }
        self.k = new_k;
        self.w = new_w;
        self.m = new_m;
    }

    /// Remove the component at position `pos` — drops a column from
    /// `W` and a row + column from `M`. Panics on out-of-range index.
    pub fn remove_component(&mut self, pos: usize) {
        assert!(
            pos < self.k,
            "remove_component pos {pos} out of range (k = {})",
            self.k
        );
        let new_k = self.k - 1;
        if new_k == 0 {
            self.k = 0;
            self.w = Vec::new();
            self.m = Vec::new();
            return;
        }
        let mut new_w = Vec::with_capacity(self.pixels * new_k);
        for p in 0..self.pixels {
            let row_start = p * self.k;
            new_w.extend_from_slice(&self.w[row_start..row_start + pos]);
            new_w.extend_from_slice(&self.w[row_start + pos + 1..row_start + self.k]);
        }
        let mut new_m = Vec::with_capacity(new_k * new_k);
        for i in 0..self.k {
            if i == pos {
                continue;
            }
            let row_start = i * self.k;
            new_m.extend_from_slice(&self.m[row_start..row_start + pos]);
            new_m.extend_from_slice(&self.m[row_start + pos + 1..row_start + self.k]);
        }
        self.k = new_k;
        self.w = new_w;
        self.m = new_m;
    }
}
