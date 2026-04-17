//! Emit uncompressed 8-bit RIFF-AVI files.
//!
//! The writer produces the same minimal structural variant the reader
//! in `avi_uncompressed.rs` parses, so the two form a round-trip. Used
//! by the Phase 1 CLI harness and by tests that want to inspect
//! pipeline output as a video.
//!
//! Phase 1 scope: 8-bit grayscale output only. 24-bit BGR output can
//! land behind the same API if a caller needs it; miniscope operators
//! typically want to view preprocess results back in grayscale though,
//! so 8-bit is the one path that matters.

/// Serialize a sequence of 8-bit grayscale frames into an uncompressed
/// AVI byte buffer. Each frame slice must be exactly `width·height`
/// bytes; the function panics otherwise (this is an internal tool —
/// wrong-sized frames are a programmer error, not a runtime condition).
pub fn write_uncompressed_avi_8bit(
    width: u32,
    height: u32,
    fps: u32,
    frames: &[Vec<u8>],
) -> Vec<u8> {
    let frame_size = (width as usize) * (height as usize);
    for (i, f) in frames.iter().enumerate() {
        assert_eq!(
            f.len(),
            frame_size,
            "frame {i}: expected {} bytes, got {}",
            frame_size,
            f.len()
        );
    }
    let fps = fps.max(1);

    let mut out = Vec::<u8>::new();

    // RIFF + AVI
    out.extend_from_slice(b"RIFF");
    let riff_size_pos = out.len();
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(b"AVI ");

    // LIST hdrl
    out.extend_from_slice(b"LIST");
    let hdrl_size_pos = out.len();
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(b"hdrl");

    // avih (56 bytes of u32 fields)
    out.extend_from_slice(b"avih");
    out.extend_from_slice(&56u32.to_le_bytes());
    let micro_sec_per_frame = 1_000_000u32 / fps;
    let max_bytes_per_sec = (frame_size as u32).saturating_mul(fps);
    for &v in &[
        micro_sec_per_frame, // dwMicroSecPerFrame
        max_bytes_per_sec,   // dwMaxBytesPerSec
        0u32,                // dwPaddingGranularity
        0u32,                // dwFlags
        frames.len() as u32, // dwTotalFrames
        0u32,                // dwInitialFrames
        1u32,                // dwStreams
        frame_size as u32,   // dwSuggestedBufferSize
        width,               // dwWidth
        height,              // dwHeight
        0,
        0,
        0,
        0, // dwReserved[4]
    ] {
        out.extend_from_slice(&v.to_le_bytes());
    }

    // LIST strl
    out.extend_from_slice(b"LIST");
    let strl_size_pos = out.len();
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(b"strl");

    // strh (56 bytes)
    out.extend_from_slice(b"strh");
    out.extend_from_slice(&56u32.to_le_bytes());
    out.extend_from_slice(b"vids"); // fccType
    out.extend_from_slice(&0u32.to_le_bytes()); // fccHandler
    out.extend_from_slice(&0u32.to_le_bytes()); // dwFlags
    out.extend_from_slice(&0u16.to_le_bytes()); // wPriority
    out.extend_from_slice(&0u16.to_le_bytes()); // wLanguage
    out.extend_from_slice(&0u32.to_le_bytes()); // dwInitialFrames
    out.extend_from_slice(&1u32.to_le_bytes()); // dwScale
    out.extend_from_slice(&fps.to_le_bytes()); // dwRate
    out.extend_from_slice(&0u32.to_le_bytes()); // dwStart
    out.extend_from_slice(&(frames.len() as u32).to_le_bytes()); // dwLength
    out.extend_from_slice(&(frame_size as u32).to_le_bytes()); // dwSuggestedBufferSize
    out.extend_from_slice(&0xFFFFFFFFu32.to_le_bytes()); // dwQuality = -1
    out.extend_from_slice(&(frame_size as u32).to_le_bytes()); // dwSampleSize
    for &v in &[0i16, 0i16, width as i16, height as i16] {
        out.extend_from_slice(&v.to_le_bytes());
    }

    // strf: BITMAPINFOHEADER (40) + identity 256-entry palette
    let palette_size = 256 * 4;
    let strf_body_size = 40 + palette_size;
    out.extend_from_slice(b"strf");
    out.extend_from_slice(&(strf_body_size as u32).to_le_bytes());
    out.extend_from_slice(&40u32.to_le_bytes()); // biSize
    out.extend_from_slice(&(width as i32).to_le_bytes()); // biWidth
    out.extend_from_slice(&(height as i32).to_le_bytes()); // biHeight
    out.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    out.extend_from_slice(&8u16.to_le_bytes()); // biBitCount
    out.extend_from_slice(&0u32.to_le_bytes()); // biCompression = BI_RGB
    out.extend_from_slice(&(frame_size as u32).to_le_bytes()); // biSizeImage
    out.extend_from_slice(&0i32.to_le_bytes()); // biXPelsPerMeter
    out.extend_from_slice(&0i32.to_le_bytes()); // biYPelsPerMeter
    out.extend_from_slice(&0u32.to_le_bytes()); // biClrUsed
    out.extend_from_slice(&0u32.to_le_bytes()); // biClrImportant
    for i in 0..256u32 {
        out.extend_from_slice(&[i as u8, i as u8, i as u8, 0]);
    }

    patch_size_from(&mut out, strl_size_pos);
    patch_size_from(&mut out, hdrl_size_pos);

    // LIST movi
    out.extend_from_slice(b"LIST");
    let movi_size_pos = out.len();
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(b"movi");
    for frame in frames {
        out.extend_from_slice(b"00db");
        out.extend_from_slice(&(frame.len() as u32).to_le_bytes());
        out.extend_from_slice(frame);
        if frame.len() % 2 == 1 {
            out.push(0);
        }
    }
    patch_size_from(&mut out, movi_size_pos);
    patch_size_from(&mut out, riff_size_pos);
    out
}

fn patch_size_from(out: &mut [u8], size_pos: usize) {
    let size = (out.len() - size_pos - 4) as u32;
    out[size_pos..size_pos + 4].copy_from_slice(&size.to_le_bytes());
}
