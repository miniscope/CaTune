//! Smoke test for the `cala-preprocess-avi` CLI: emits a synthetic
//! AVI, runs the binary end-to-end, reads the result back, and
//! verifies the round-trip preserves dimensions and frame count.
//!
//! Gated on the `native-cli` feature — the binary isn't built without
//! it, so this whole file compiles to an empty test module otherwise.

#![cfg(feature = "native-cli")]

use std::process::Command;

use calab_cala_core::io::{write_uncompressed_avi_8bit, AviUncompressedReader};

#[test]
fn cli_processes_synthetic_avi_and_produces_valid_output() {
    let (w, h) = (16u32, 16u32);
    let frame_size = (w * h) as usize;
    let frames: Vec<Vec<u8>> = (0..3)
        .map(|t| {
            // Constant fill + a moving bright square to give motion
            // correction something to chew on.
            let mut f = vec![42u8; frame_size];
            let center = (h / 2) as usize;
            for dy in 0..2 {
                for dx in 0..2 {
                    let y = center + dy;
                    let x = center + t + dx;
                    if y < h as usize && x < w as usize {
                        f[y * (w as usize) + x] = 180;
                    }
                }
            }
            f
        })
        .collect();

    let tmp = std::env::temp_dir();
    let input_path = tmp.join(format!("cala_cli_in_{}.avi", std::process::id()));
    let output_path = tmp.join(format!("cala_cli_out_{}.avi", std::process::id()));
    let bytes = write_uncompressed_avi_8bit(w, h, 20, &frames);
    std::fs::write(&input_path, &bytes).expect("write synth AVI");

    let bin = env!("CARGO_BIN_EXE_cala-preprocess-avi");
    let status = Command::new(bin)
        .arg(&input_path)
        .arg(&output_path)
        .status()
        .expect("spawn CLI");
    assert!(status.success(), "CLI exited with {:?}", status.code());

    let out_bytes = std::fs::read(&output_path).expect("read CLI output");
    let reader = AviUncompressedReader::new(&out_bytes).expect("parse CLI output AVI");
    assert_eq!(reader.width(), w);
    assert_eq!(reader.height(), h);
    assert_eq!(reader.frame_count() as usize, frames.len());

    // Best-effort cleanup; don't panic if the tmp files are already gone.
    let _ = std::fs::remove_file(&input_path);
    let _ = std::fs::remove_file(&output_path);
}
