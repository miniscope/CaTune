//! Phase 1 CLI harness: read an uncompressed 8-bit AVI, run the full
//! preprocess pipeline, write a new uncompressed 8-bit AVI.
//!
//! Gated behind the `native-cli` feature so WASM and PyO3 builds skip
//! it. Usage:
//!     cargo run --features native-cli --release \
//!         --bin cala-preprocess-avi -- INPUT.avi OUTPUT.avi [PIXEL_SIZE_UM]
//!
//! `PIXEL_SIZE_UM` defaults to 2.0 (the value the Butterworth cutoff is
//! derived from). Override when feeding non-standard recordings.

use std::process::ExitCode;

use calab_cala_core::assets::{Frame, FrameMut};
use calab_cala_core::config::{GrayscaleMethod, PreprocessConfig, RecordingMetadata};
use calab_cala_core::io::{write_uncompressed_avi_8bit, AviUncompressedReader};
use calab_cala_core::preprocess::PreprocessPipeline;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!(
            "usage: {} INPUT.avi OUTPUT.avi [PIXEL_SIZE_UM]",
            args.first()
                .map(String::as_str)
                .unwrap_or("cala-preprocess-avi")
        );
        return ExitCode::from(2);
    }
    let input_path = &args[1];
    let output_path = &args[2];
    let pixel_size_um: f32 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(2.0);

    let bytes = match std::fs::read(input_path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("error reading {input_path}: {e}");
            return ExitCode::from(1);
        }
    };
    let reader = match AviUncompressedReader::new(&bytes) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("error parsing AVI: {e:?}");
            return ExitCode::from(1);
        }
    };

    let h = reader.height() as usize;
    let w = reader.width() as usize;
    let n = h * w;
    eprintln!(
        "input: {}x{}, {} frames, {:.2} fps, {}-bit {}-channel",
        w,
        h,
        reader.frame_count(),
        reader.fps(),
        reader.bit_depth(),
        reader.channels()
    );

    let metadata = RecordingMetadata::new(pixel_size_um);
    let cfg = PreprocessConfig::default();
    let mut pipeline = PreprocessPipeline::new(h, w, &metadata, cfg);

    let mut in_buf = vec![0.0_f32; n];
    let mut out_buf = vec![0.0_f32; n];
    let mut u8_frames: Vec<Vec<u8>> = Vec::with_capacity(reader.frame_count() as usize);
    let mut clamped_above: u64 = 0;

    for i in 0..reader.frame_count() {
        if let Err(e) = reader.read_frame_grayscale_f32(i, &mut in_buf, GrayscaleMethod::Green) {
            eprintln!("error reading frame {i}: {e:?}");
            return ExitCode::from(1);
        }
        let input = Frame::new(&in_buf, h, w).expect("in_buf shape invariant");
        let mut output = FrameMut::new(&mut out_buf, h, w).expect("out_buf shape invariant");
        if let Err(e) = pipeline.process_frame(input, &mut output) {
            eprintln!("pipeline error on frame {i}: {e:?}");
            return ExitCode::from(1);
        }

        let u8_frame: Vec<u8> = out_buf
            .iter()
            .map(|&v| {
                if v > 255.0 {
                    clamped_above += 1;
                }
                v.clamp(0.0, 255.0) as u8
            })
            .collect();
        u8_frames.push(u8_frame);
    }

    if clamped_above > 0 {
        eprintln!("note: {clamped_above} pixel samples were clamped above 255");
    }

    let fps = reader.fps().round().max(1.0) as u32;
    let out_bytes = write_uncompressed_avi_8bit(reader.width(), reader.height(), fps, &u8_frames);
    if let Err(e) = std::fs::write(output_path, &out_bytes) {
        eprintln!("error writing {output_path}: {e}");
        return ExitCode::from(1);
    }
    eprintln!(
        "wrote {output_path} ({} frames, {} bytes)",
        u8_frames.len(),
        out_bytes.len()
    );
    ExitCode::SUCCESS
}
