//! Trace history `C̃` (thesis §3.2.3).
//!
//! Row `t` is the trace vector `c̃_t ∈ R^k` for frame `t`. Stored as a
//! flat row-major `Vec<f32>` so the boundary layer can hand it to
//! numpy / xarray as a `(t, k)` view without any copy.
//!
//! Phase 2 holds the whole history in RAM; a `PersistentTraceBacking`
//! trait (design §5) will later back this onto Zarr / OPFS.

#[derive(Debug, Clone)]
pub struct Traces {
    k: usize,
    /// Row-major `len × k` storage. `len = data.len() / max(k, 1)`.
    data: Vec<f32>,
    /// Frame count tracked explicitly so a zero-component history
    /// (`k == 0`) can still advance a counter with each `push`.
    frames: usize,
}

impl Traces {
    pub fn new(k: usize) -> Self {
        Self {
            k,
            data: Vec::new(),
            frames: 0,
        }
    }

    /// Number of components per trace.
    pub fn k(&self) -> usize {
        self.k
    }

    /// Number of frames pushed.
    pub fn len(&self) -> usize {
        self.frames
    }

    pub fn is_empty(&self) -> bool {
        self.frames == 0
    }

    /// Append `c̃_t` for the next frame. `trace.len()` must equal `k()`.
    pub fn push(&mut self, trace: &[f32]) {
        assert_eq!(
            trace.len(),
            self.k,
            "trace length {} must equal k = {}",
            trace.len(),
            self.k
        );
        self.data.extend_from_slice(trace);
        self.frames += 1;
    }

    /// Slice `c̃_t` for frame `t`, or `None` if out of range.
    pub fn get(&self, t: usize) -> Option<&[f32]> {
        if t >= self.frames || self.k == 0 {
            if t >= self.frames {
                return None;
            }
            // k == 0 but frame is in range — return empty slice.
            return Some(&[]);
        }
        let start = t * self.k;
        Some(&self.data[start..start + self.k])
    }

    /// Most recently pushed trace.
    pub fn last(&self) -> Option<&[f32]> {
        if self.frames == 0 {
            None
        } else {
            self.get(self.frames - 1)
        }
    }

    /// Flat row-major `(len × k)` view of the full history.
    pub fn as_matrix(&self) -> &[f32] {
        &self.data
    }

    /// Append a new trace column initialized from `history`. `history`
    /// must have length `frames()` — one value per past frame. Used
    /// by Phase 3 apply when a new component is registered: fresh
    /// discoveries pass all-zeros, merges pass the sum of the two
    /// deprecated components' histories.
    pub fn insert_component_with_history(&mut self, history: &[f32]) {
        assert_eq!(
            history.len(),
            self.frames,
            "history length {} must equal frames {}",
            history.len(),
            self.frames
        );
        let new_k = self
            .k
            .checked_add(1)
            .expect("Traces k overflowed usize on insert");
        let mut new_data = Vec::with_capacity(self.frames * new_k);
        for t in 0..self.frames {
            let row_start = t * self.k;
            new_data.extend_from_slice(&self.data[row_start..row_start + self.k]);
            new_data.push(history[t]);
        }
        self.k = new_k;
        self.data = new_data;
    }

    /// Drop the column at `pos` from every past frame's trace.
    /// Component positions to the right shift down by one.
    pub fn remove_component(&mut self, pos: usize) {
        assert!(
            pos < self.k,
            "remove_component pos {pos} out of range (k = {})",
            self.k
        );
        let new_k = self.k - 1;
        if new_k == 0 {
            self.k = 0;
            self.data = Vec::new();
            return;
        }
        let mut new_data = Vec::with_capacity(self.frames * new_k);
        for t in 0..self.frames {
            let row_start = t * self.k;
            new_data.extend_from_slice(&self.data[row_start..row_start + pos]);
            new_data.extend_from_slice(&self.data[row_start + pos + 1..row_start + self.k]);
        }
        self.k = new_k;
        self.data = new_data;
    }

    /// Column `i`'s values across all frames, in push order.
    pub fn column(&self, i: usize) -> Vec<f32> {
        assert!(i < self.k, "column {i} out of range (k = {})", self.k);
        (0..self.frames)
            .map(|t| self.data[t * self.k + i])
            .collect()
    }
}
