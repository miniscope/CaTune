//! Composite preprocess pipeline: hot-pixel → Butterworth high-pass
//! → band subtraction → dual-anchor motion correction → running-min
//! baseline. Owns ping-pong scratch buffers and the two stateful
//! stages (`MotionState`, `BaselineState`) so callers just push frames
//! through it one at a time.

use super::{
    band_subtract, butterworth_highpass, high_pass_cutoff_cycles_per_pixel, hot_pixel_median_3x3,
    BaselineState, MotionShift, MotionState,
};
use crate::assets::{Frame, FrameMut, ShapeError};
use crate::config::{PreprocessConfig, RecordingMetadata};

/// Streaming preprocess for a fixed-shape frame sequence. `process_frame`
/// runs all five preprocess stages and returns the detected motion shift
/// for the frame it just saw.
pub struct PreprocessPipeline {
    height: usize,
    width: usize,
    cfg: PreprocessConfig,
    butterworth_cutoff: f32,
    buf_a: Vec<f32>,
    buf_b: Vec<f32>,
    motion: MotionState,
    baseline: BaselineState,
}

impl PreprocessPipeline {
    pub fn new(
        height: usize,
        width: usize,
        metadata: &RecordingMetadata,
        cfg: PreprocessConfig,
    ) -> Self {
        let cutoff = high_pass_cutoff_cycles_per_pixel(metadata, &cfg);
        let n = height * width;
        Self {
            height,
            width,
            cfg,
            butterworth_cutoff: cutoff,
            buf_a: vec![0.0; n],
            buf_b: vec![0.0; n],
            motion: MotionState::new(height, width),
            baseline: BaselineState::new(height, width),
        }
    }

    pub fn height(&self) -> usize {
        self.height
    }

    pub fn width(&self) -> usize {
        self.width
    }

    pub fn config(&self) -> &PreprocessConfig {
        &self.cfg
    }

    pub fn motion_state(&self) -> &MotionState {
        &self.motion
    }

    pub fn baseline_state(&self) -> &BaselineState {
        &self.baseline
    }

    /// Reset all stateful stages. `process_frame` after this call
    /// behaves as first-frame (motion anchors empty, baseline +∞).
    pub fn reset(&mut self) {
        self.motion.reset();
        self.baseline = BaselineState::new(self.height, self.width);
    }

    /// Run the full preprocess pipeline on one frame.
    ///
    /// Buffers ping-pong:
    ///   input → [hot_pixel] → buf_a
    ///   buf_a → [butterworth] → buf_b
    ///   buf_b → [band]        → buf_a
    ///   buf_a → [motion]      → buf_b
    ///   buf_b → [baseline]    → output
    pub fn process_frame(
        &mut self,
        input: Frame<'_>,
        output: &mut FrameMut<'_>,
    ) -> Result<MotionShift, ShapeError> {
        let n = self.height * self.width;
        if input.height() != self.height || input.width() != self.width {
            return Err(ShapeError {
                expected: n,
                actual: input.pixels().len(),
            });
        }
        if output.height() != self.height || output.width() != self.width {
            return Err(ShapeError {
                expected: n,
                actual: output.pixels().len(),
            });
        }

        // 1. hot-pixel median: input → buf_a
        {
            let mut buf_a_mut = FrameMut::new(&mut self.buf_a, self.height, self.width)
                .expect("pipeline buf_a invariant");
            hot_pixel_median_3x3(input, &mut buf_a_mut)?;
        }

        // 2. Butterworth high-pass: buf_a → buf_b
        {
            let buf_a_view =
                Frame::new(&self.buf_a, self.height, self.width).expect("pipeline buf_a invariant");
            let mut buf_b_mut = FrameMut::new(&mut self.buf_b, self.height, self.width)
                .expect("pipeline buf_b invariant");
            butterworth_highpass(
                buf_a_view,
                &mut buf_b_mut,
                self.butterworth_cutoff,
                self.cfg.high_pass_order,
            )?;
        }

        // 3. Band (double-centering): buf_b → buf_a
        {
            let buf_b_view =
                Frame::new(&self.buf_b, self.height, self.width).expect("pipeline buf_b invariant");
            let mut buf_a_mut = FrameMut::new(&mut self.buf_a, self.height, self.width)
                .expect("pipeline buf_a invariant");
            band_subtract(buf_b_view, &mut buf_a_mut)?;
        }

        // 4. Motion correction (dual anchor): buf_a → buf_b
        let shift = {
            let buf_a_view =
                Frame::new(&self.buf_a, self.height, self.width).expect("pipeline buf_a invariant");
            let mut buf_b_mut = FrameMut::new(&mut self.buf_b, self.height, self.width)
                .expect("pipeline buf_b invariant");
            self.motion
                .motion_correct(buf_a_view, &mut buf_b_mut, &self.cfg)?
        };

        // 5. Baseline running-min: buf_b → output
        {
            let buf_b_view =
                Frame::new(&self.buf_b, self.height, self.width).expect("pipeline buf_b invariant");
            self.baseline.subtract_baseline(buf_b_view, output)?;
        }

        Ok(shift)
    }
}
