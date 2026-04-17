//! Phase 1 end-to-end integration test.
//!
//! Drives synthetic frames through the *full* preprocess pipeline
//! (hot-pixel → Butterworth → band → motion → baseline) via an AVI
//! round-trip: in-memory AVI → AVI reader → PreprocessPipeline →
//! AVI writer → AVI reader. Pins composite invariants and checks
//! the reader + writer + pipeline agree on frame count and shape.

use calab_cala_core::assets::{Frame, FrameMut};
use calab_cala_core::config::{GrayscaleMethod, PreprocessConfig, RecordingMetadata};
use calab_cala_core::io::{write_uncompressed_avi_8bit, AviUncompressedReader};
use calab_cala_core::preprocess::PreprocessPipeline;

/// Build a short synthetic recording:
///   - constant background
///   - mild row + column gradient (exercises band subtraction)
///   - a bright square "neuron" that drifts a pixel every other frame
///     (exercises motion correction)
///   - gradually brightening (exercises baseline removal)
fn make_synthetic_frames(w: usize, h: usize, n: usize) -> Vec<Vec<u8>> {
    let mut frames = Vec::with_capacity(n);
    for t in 0..n {
        let brightness = 100 + ((t as i32 * 10).min(100)) as u8;
        let drift_y = (t % 3) as i32 - 1; // cycles through -1, 0, 1
        let drift_x = (t % 2) as i32;
        let center_y = (h / 2) as i32 + drift_y;
        let center_x = (w / 2) as i32 + drift_x;
        let radius: i32 = 2;
        let mut f = vec![50u8; w * h];
        for y in 0..h {
            for x in 0..w {
                let mut v: i32 = f[y * w + x] as i32 + (y as i32) + (x as i32);
                let dy = (y as i32 - center_y).abs();
                let dx = (x as i32 - center_x).abs();
                if dy <= radius && dx <= radius {
                    v += brightness as i32;
                }
                f[y * w + x] = v.clamp(0, 255) as u8;
            }
        }
        frames.push(f);
    }
    frames
}

struct PipelineRun {
    frame_count: u32,
    n: usize,
    u8_outputs: Vec<Vec<u8>>,
    min_raw: f32,
}

fn drive_pipeline(w: usize, h: usize, frames: &[Vec<u8>]) -> PipelineRun {
    let avi_bytes = write_uncompressed_avi_8bit(w as u32, h as u32, 20, frames);
    let reader = AviUncompressedReader::new(&avi_bytes).unwrap();
    assert_eq!(reader.width() as usize, w);
    assert_eq!(reader.height() as usize, h);
    assert_eq!(reader.frame_count() as usize, frames.len());

    let metadata = RecordingMetadata::new(2.0);
    let cfg = PreprocessConfig::default();
    let mut pipeline = PreprocessPipeline::new(h, w, &metadata, cfg);

    let n = h * w;
    let mut in_buf = vec![0.0_f32; n];
    let mut out_buf = vec![0.0_f32; n];
    let mut u8_outputs = Vec::with_capacity(frames.len());
    let mut min_raw = f32::INFINITY;

    for i in 0..reader.frame_count() {
        reader
            .read_frame_grayscale_f32(i, &mut in_buf, GrayscaleMethod::Green)
            .unwrap();
        pipeline
            .process_frame(
                Frame::new(&in_buf, h, w).unwrap(),
                &mut FrameMut::new(&mut out_buf, h, w).unwrap(),
            )
            .unwrap();
        for &v in &out_buf {
            if v < min_raw {
                min_raw = v;
            }
        }
        u8_outputs.push(
            out_buf
                .iter()
                .map(|&v| v.clamp(0.0, 255.0) as u8)
                .collect::<Vec<u8>>(),
        );
    }

    PipelineRun {
        frame_count: reader.frame_count(),
        n,
        u8_outputs,
        min_raw,
    }
}

#[test]
fn pipeline_preserves_frame_count_and_shape() {
    let (w, h) = (32, 32);
    let frames = make_synthetic_frames(w, h, 8);
    let run = drive_pipeline(w, h, &frames);
    assert_eq!(run.frame_count, frames.len() as u32);
    assert_eq!(run.u8_outputs.len(), frames.len());
    for f in &run.u8_outputs {
        assert_eq!(f.len(), run.n);
    }
}

#[test]
fn pipeline_output_is_nonnegative_after_baseline() {
    // Baseline stage subtracts a per-pixel running minimum; by
    // construction every output pixel is ≥ 0. Tiny negative values
    // from f32 roundoff are tolerated via a small epsilon.
    let (w, h) = (32, 32);
    let frames = make_synthetic_frames(w, h, 6);
    let run = drive_pipeline(w, h, &frames);
    assert!(
        run.min_raw >= -1e-4,
        "min post-baseline value = {} should be ~≥ 0",
        run.min_raw
    );
}

#[test]
fn pipeline_first_frame_baseline_is_zero() {
    // The very first frame is its own baseline, so frame 0 of the
    // pipeline output is all-zeros (within f32 roundoff).
    let (w, h) = (16, 16);
    let frames = make_synthetic_frames(w, h, 3);
    let run = drive_pipeline(w, h, &frames);
    let first = &run.u8_outputs[0];
    for (i, &v) in first.iter().enumerate() {
        assert_eq!(v, 0, "frame 0 pixel {i} = {v}, expected 0");
    }
}

#[test]
fn pipeline_reset_drops_motion_and_baseline_state() {
    let (w, h) = (16, 16);
    let frames = make_synthetic_frames(w, h, 3);
    let metadata = RecordingMetadata::new(2.0);
    let cfg = PreprocessConfig::default();
    let mut pipeline = PreprocessPipeline::new(h, w, &metadata, cfg);

    let n = h * w;
    let mut in_buf = vec![0.0_f32; n];
    let mut out_buf = vec![0.0_f32; n];
    // Run a couple frames directly (skip the AVI round-trip, this test
    // is about pipeline state only).
    for bytes in frames.iter().take(2) {
        for (i, &b) in bytes.iter().enumerate() {
            in_buf[i] = b as f32;
        }
        pipeline
            .process_frame(
                Frame::new(&in_buf, h, w).unwrap(),
                &mut FrameMut::new(&mut out_buf, h, w).unwrap(),
            )
            .unwrap();
    }
    assert!(pipeline.motion_state().has_anchor());
    assert!(pipeline
        .baseline_state()
        .min_image()
        .pixels()
        .iter()
        .any(|&v| v.is_finite()));

    pipeline.reset();
    assert!(!pipeline.motion_state().has_anchor());
    // After reset, baseline min_image should be +∞ everywhere.
    for &v in pipeline.baseline_state().min_image().pixels() {
        assert!(
            v.is_infinite() && v > 0.0,
            "min_image should be +∞ post-reset, got {v}"
        );
    }
}

#[test]
fn pipeline_output_roundtrips_through_avi_writer_and_reader() {
    // Write pipeline output back out as AVI, read it back, assert
    // the reader + writer agree on dimensions and frame bytes.
    let (w, h) = (32, 32);
    let frames = make_synthetic_frames(w, h, 4);
    let run = drive_pipeline(w, h, &frames);

    let out_bytes = write_uncompressed_avi_8bit(w as u32, h as u32, 20, &run.u8_outputs);
    let re_read = AviUncompressedReader::new(&out_bytes).unwrap();
    assert_eq!(re_read.width() as usize, w);
    assert_eq!(re_read.height() as usize, h);
    assert_eq!(re_read.frame_count() as usize, run.u8_outputs.len());
    for i in 0..run.u8_outputs.len() {
        assert_eq!(
            re_read.frame_bytes(i as u32).unwrap(),
            &run.u8_outputs[i][..],
            "frame {i} bytes disagree after round-trip"
        );
    }
}
