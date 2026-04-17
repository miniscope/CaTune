//! Tests for the uncompressed-AVI reader.
//!
//! Oracles are analytic: each test builds a valid AVI byte buffer in
//! memory with known pixel values, parses it back, and asserts on
//! specific metadata and decoded samples. No external sample files.

use calab_cala_core::config::GrayscaleMethod;
use calab_cala_core::io::{AviError, AviUncompressedReader};

// ---- Synthetic AVI builder ----
//
// Emits a minimal but spec-valid RIFF-AVI with one video stream.
// Supports 8-bit grayscale (identity palette) and 24-bit BGR.
// `include_idx` adds an `idx1` chunk — the reader ignores its contents
// and falls back to a movi scan, so this test knob just verifies we
// don't choke on extra chunks.

struct AviOpts {
    width: u32,
    height: u32,
    fps: u32,
    bit_depth: u16,
    include_idx: bool,
}

fn build_avi(opts: &AviOpts, frames: &[Vec<u8>]) -> Vec<u8> {
    let channels: u32 = match opts.bit_depth {
        8 => 1,
        24 => 3,
        _ => panic!("test builder supports 8 or 24 bit only"),
    };
    let frame_size = (opts.width * opts.height * channels) as usize;
    for (i, f) in frames.iter().enumerate() {
        assert_eq!(
            f.len(),
            frame_size,
            "frame {i}: expected {} bytes, got {}",
            frame_size,
            f.len()
        );
    }

    let mut out = Vec::<u8>::new();

    out.extend_from_slice(b"RIFF");
    let riff_size_pos = out.len();
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(b"AVI ");

    // --- LIST hdrl ---
    out.extend_from_slice(b"LIST");
    let hdrl_size_pos = out.len();
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(b"hdrl");

    // avih chunk
    out.extend_from_slice(b"avih");
    out.extend_from_slice(&56u32.to_le_bytes());
    let micro_sec_per_frame = 1_000_000u32 / opts.fps.max(1);
    let max_bytes_per_sec = (frame_size as u32).saturating_mul(opts.fps);
    let flags: u32 = if opts.include_idx { 0x10 } else { 0 };
    for &v in &[
        micro_sec_per_frame,
        max_bytes_per_sec,
        0u32,
        flags,
        frames.len() as u32,
        0u32,
        1u32,
        frame_size as u32,
        opts.width,
        opts.height,
        0,
        0,
        0,
        0,
    ] {
        out.extend_from_slice(&v.to_le_bytes());
    }

    // --- LIST strl ---
    out.extend_from_slice(b"LIST");
    let strl_size_pos = out.len();
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(b"strl");

    // strh chunk (56 bytes)
    out.extend_from_slice(b"strh");
    out.extend_from_slice(&56u32.to_le_bytes());
    out.extend_from_slice(b"vids"); // fccType
    out.extend_from_slice(&0u32.to_le_bytes()); // fccHandler = 0 (uncompressed)
    out.extend_from_slice(&0u32.to_le_bytes()); // dwFlags
    out.extend_from_slice(&0u16.to_le_bytes()); // wPriority
    out.extend_from_slice(&0u16.to_le_bytes()); // wLanguage
    out.extend_from_slice(&0u32.to_le_bytes()); // dwInitialFrames
    out.extend_from_slice(&1u32.to_le_bytes()); // dwScale
    out.extend_from_slice(&opts.fps.to_le_bytes()); // dwRate
    out.extend_from_slice(&0u32.to_le_bytes()); // dwStart
    out.extend_from_slice(&(frames.len() as u32).to_le_bytes()); // dwLength
    out.extend_from_slice(&(frame_size as u32).to_le_bytes()); // dwSuggestedBufferSize
    out.extend_from_slice(&0xFFFFFFFFu32.to_le_bytes()); // dwQuality = -1
    out.extend_from_slice(&(frame_size as u32).to_le_bytes()); // dwSampleSize
                                                               // rcFrame (4 i16s = 8 bytes)
    for &v in &[0i16, 0i16, opts.width as i16, opts.height as i16] {
        out.extend_from_slice(&v.to_le_bytes());
    }

    // strf chunk: BITMAPINFOHEADER + optional palette
    let palette_size = if opts.bit_depth == 8 { 256 * 4 } else { 0 };
    let strf_body_size = 40 + palette_size;
    out.extend_from_slice(b"strf");
    out.extend_from_slice(&(strf_body_size as u32).to_le_bytes());
    out.extend_from_slice(&40u32.to_le_bytes()); // biSize
    out.extend_from_slice(&(opts.width as i32).to_le_bytes());
    out.extend_from_slice(&(opts.height as i32).to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    out.extend_from_slice(&opts.bit_depth.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes()); // biCompression (BI_RGB)
    out.extend_from_slice(&(frame_size as u32).to_le_bytes()); // biSizeImage
    out.extend_from_slice(&0i32.to_le_bytes()); // biXPelsPerMeter
    out.extend_from_slice(&0i32.to_le_bytes()); // biYPelsPerMeter
    out.extend_from_slice(&0u32.to_le_bytes()); // biClrUsed
    out.extend_from_slice(&0u32.to_le_bytes()); // biClrImportant
    if opts.bit_depth == 8 {
        for i in 0..256u32 {
            out.extend_from_slice(&[i as u8, i as u8, i as u8, 0]);
        }
    }

    // Fill in strl size and hdrl size.
    patch_size_from(&mut out, strl_size_pos);
    patch_size_from(&mut out, hdrl_size_pos);

    // --- LIST movi ---
    out.extend_from_slice(b"LIST");
    let movi_size_pos = out.len();
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(b"movi");
    let movi_data_start = out.len();

    let mut frame_offsets_in_movi: Vec<u32> = Vec::with_capacity(frames.len());
    for frame in frames {
        frame_offsets_in_movi.push((out.len() - movi_data_start) as u32);
        out.extend_from_slice(b"00db");
        out.extend_from_slice(&(frame.len() as u32).to_le_bytes());
        out.extend_from_slice(frame);
        if frame.len() % 2 == 1 {
            out.push(0);
        }
    }

    patch_size_from(&mut out, movi_size_pos);

    // Optional idx1
    if opts.include_idx {
        out.extend_from_slice(b"idx1");
        out.extend_from_slice(&((frames.len() * 16) as u32).to_le_bytes());
        for (i, frame) in frames.iter().enumerate() {
            out.extend_from_slice(b"00db");
            out.extend_from_slice(&0x10u32.to_le_bytes()); // AVIIF_KEYFRAME
            out.extend_from_slice(&frame_offsets_in_movi[i].to_le_bytes());
            out.extend_from_slice(&(frame.len() as u32).to_le_bytes());
        }
    }

    patch_size_from(&mut out, riff_size_pos);
    out
}

/// Patch a u32-LE size field: assumes `size_pos` points at the size
/// field; the size covers everything from `size_pos + 4` to the current
/// buffer end.
fn patch_size_from(out: &mut [u8], size_pos: usize) {
    let size = (out.len() - size_pos - 4) as u32;
    out[size_pos..size_pos + 4].copy_from_slice(&size.to_le_bytes());
}

// ---- Tests ----

#[test]
fn parses_minimal_8bit_grayscale_file() {
    let opts = AviOpts {
        width: 2,
        height: 2,
        fps: 30,
        bit_depth: 8,
        include_idx: false,
    };
    let frames = vec![
        vec![1u8, 2, 3, 4],
        vec![5u8, 6, 7, 8],
        vec![9u8, 10, 11, 12],
    ];
    let bytes = build_avi(&opts, &frames);

    let reader = AviUncompressedReader::new(&bytes).unwrap();
    assert_eq!(reader.width(), 2);
    assert_eq!(reader.height(), 2);
    assert_eq!(reader.frame_count(), 3);
    assert_eq!(reader.bit_depth(), 8);
    assert_eq!(reader.channels(), 1);
    assert!((reader.fps() - 30.0).abs() < 0.5);

    for (i, expected) in frames.iter().enumerate() {
        assert_eq!(reader.frame_bytes(i as u32).unwrap(), &expected[..]);
    }
}

#[test]
fn parses_8bit_grayscale_with_idx1_present() {
    // idx1 chunks must not confuse the reader — we skip them and rely
    // on the movi scan.
    let opts = AviOpts {
        width: 2,
        height: 2,
        fps: 30,
        bit_depth: 8,
        include_idx: true,
    };
    let frames = vec![vec![10u8, 20, 30, 40], vec![50u8, 60, 70, 80]];
    let bytes = build_avi(&opts, &frames);
    let reader = AviUncompressedReader::new(&bytes).unwrap();
    assert_eq!(reader.frame_count(), 2);
    assert_eq!(reader.frame_bytes(0).unwrap(), &frames[0][..]);
    assert_eq!(reader.frame_bytes(1).unwrap(), &frames[1][..]);
}

#[test]
fn read_frame_grayscale_f32_casts_8bit_bytes_to_f32() {
    let opts = AviOpts {
        width: 2,
        height: 2,
        fps: 30,
        bit_depth: 8,
        include_idx: false,
    };
    let frames = vec![vec![0u8, 128, 200, 255]];
    let bytes = build_avi(&opts, &frames);
    let reader = AviUncompressedReader::new(&bytes).unwrap();

    let mut out = vec![0.0_f32; 4];
    reader
        .read_frame_grayscale_f32(0, &mut out, GrayscaleMethod::Green)
        .unwrap();
    assert_eq!(out, vec![0.0, 128.0, 200.0, 255.0]);
}

#[test]
fn read_frame_grayscale_f32_picks_green_from_24bit_bgr() {
    let opts = AviOpts {
        width: 2,
        height: 1,
        fps: 10,
        bit_depth: 24,
        include_idx: false,
    };
    // Pixel 0: B=10, G=20, R=30. Pixel 1: B=40, G=50, R=60.
    let frames = vec![vec![10u8, 20, 30, 40, 50, 60]];
    let bytes = build_avi(&opts, &frames);
    let reader = AviUncompressedReader::new(&bytes).unwrap();
    assert_eq!(reader.channels(), 3);

    let mut out = vec![0.0_f32; 2];
    reader
        .read_frame_grayscale_f32(0, &mut out, GrayscaleMethod::Green)
        .unwrap();
    assert_eq!(out, vec![20.0, 50.0]);
}

#[test]
fn read_frame_grayscale_f32_computes_rec601_luminance() {
    let opts = AviOpts {
        width: 2,
        height: 1,
        fps: 10,
        bit_depth: 24,
        include_idx: false,
    };
    let frames = vec![vec![10u8, 20, 30, 40, 50, 60]];
    let bytes = build_avi(&opts, &frames);
    let reader = AviUncompressedReader::new(&bytes).unwrap();

    let mut out = vec![0.0_f32; 2];
    reader
        .read_frame_grayscale_f32(0, &mut out, GrayscaleMethod::Luminance)
        .unwrap();

    // 0.299·R + 0.587·G + 0.114·B
    let expected0 = 0.299 * 30.0 + 0.587 * 20.0 + 0.114 * 10.0;
    let expected1 = 0.299 * 60.0 + 0.587 * 50.0 + 0.114 * 40.0;
    assert!((out[0] - expected0).abs() < 1e-5, "pixel 0: {}", out[0]);
    assert!((out[1] - expected1).abs() < 1e-5, "pixel 1: {}", out[1]);
}

#[test]
fn frame_out_of_range_returns_error() {
    let opts = AviOpts {
        width: 2,
        height: 2,
        fps: 30,
        bit_depth: 8,
        include_idx: false,
    };
    let frames = vec![vec![0u8; 4], vec![1u8; 4]];
    let bytes = build_avi(&opts, &frames);
    let reader = AviUncompressedReader::new(&bytes).unwrap();

    assert_eq!(reader.frame_bytes(2), Err(AviError::FrameOutOfRange(2)));
    let mut buf = vec![0.0_f32; 4];
    assert!(matches!(
        reader.read_frame_grayscale_f32(5, &mut buf, GrayscaleMethod::Green),
        Err(AviError::FrameOutOfRange(5))
    ));
}

#[test]
fn wrong_output_buffer_length_errors() {
    let opts = AviOpts {
        width: 2,
        height: 2,
        fps: 30,
        bit_depth: 8,
        include_idx: false,
    };
    let frames = vec![vec![0u8; 4]];
    let bytes = build_avi(&opts, &frames);
    let reader = AviUncompressedReader::new(&bytes).unwrap();

    let mut too_small = vec![0.0_f32; 3];
    assert!(matches!(
        reader.read_frame_grayscale_f32(0, &mut too_small, GrayscaleMethod::Green),
        Err(AviError::OutputLengthMismatch {
            expected: 4,
            actual: 3
        })
    ));
}

#[test]
fn non_avi_bytes_error_early() {
    let bytes = b"NOT_AN_AVI_FILE_AT_ALL_".to_vec();
    assert_eq!(
        AviUncompressedReader::new(&bytes).unwrap_err(),
        AviError::NotAvi
    );
}

#[test]
fn truncated_buffer_errors() {
    let opts = AviOpts {
        width: 2,
        height: 2,
        fps: 30,
        bit_depth: 8,
        include_idx: false,
    };
    let frames = vec![vec![0u8; 4]];
    let mut bytes = build_avi(&opts, &frames);
    bytes.truncate(bytes.len() / 2);
    let err = AviUncompressedReader::new(&bytes).unwrap_err();
    assert!(matches!(
        err,
        AviError::Truncated(_) | AviError::BadHeader(_) | AviError::NotAvi
    ));
}
