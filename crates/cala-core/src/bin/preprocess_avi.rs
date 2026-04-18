//! Phase 1 CLI harness: read an uncompressed 8-bit AVI, run the full
//! preprocess pipeline, write a new uncompressed 8-bit AVI.
//!
//! Gated behind the `native-cli` feature so WASM and PyO3 builds skip
//! it. Usage:
//!     cargo run --features native-cli --release \
//!         --bin cala-preprocess-avi -- INPUT.avi OUTPUT.avi [PIXEL_SIZE_UM] \
//!             [--raw] [--motion-log PATH] [--smooth-sigma SIGMA] \
//!             [--corr-crop FRAC] [--subpixel centroid|parabolic] \
//!             [--subpixel-radius N] [--denoise-ksize N] \
//!             [--enable-butter] [--enable-band]
//!
//! `PIXEL_SIZE_UM` defaults to 2.0 (only used when `--enable-butter`
//! is set). Override for non-standard recordings (miniscope V4 ~1.0).
//!
//! `--smooth-sigma SIGMA` overrides the motion-stage Gaussian pre-
//! smoothing (default 0). Bump to ~4 if the correlator needs extra
//! noise suppression on top of the upstream hot-pixel median.
//!
//! `--corr-crop FRAC` overrides the center-crop fraction fed to the
//! motion correlator (default 0.6). 1.0 disables cropping.
//!
//! `--denoise-ksize N` overrides the post-motion median kernel size
//! (default 1 = disabled). Must be odd. Pass 7 or 9 to enable.
//!
//! `--enable-butter` / `--enable-band` opt into the Butterworth and
//! band-subtraction stages, which are off by default per the
//! minimal-preprocessing design (§3.1). Use for ablation or for
//! recordings where OMF struggles with the structured background.
//!
//! By default the output is **autoscaled**: pipeline f32 outputs are
//! linearly rescaled so [global_min, global_max] → [0, 255] for visible
//! contrast when eyeballing in a video player. Pass `--raw` to skip the
//! rescale and clamp f32 directly to u8.

use std::process::ExitCode;

use calab_cala_core::assets::{Frame, FrameMut};
use calab_cala_core::config::{
    GrayscaleMethod, MotionSubpixel, PreprocessConfig, RecordingMetadata,
};
use calab_cala_core::io::{write_uncompressed_avi_8bit, AviUncompressedReader};
use calab_cala_core::preprocess::PreprocessPipeline;

/// Pull a `--flag VALUE` pair out of `argv` and return the value string.
/// Returns `None` if the flag isn't present or has no following arg.
fn take_flag_value<'a>(argv: &'a [String], flag: &str) -> Option<&'a str> {
    argv.iter()
        .position(|a| a == flag)
        .and_then(|i| argv.get(i + 1).map(String::as_str))
}

fn main() -> ExitCode {
    let raw_args: Vec<String> = std::env::args().collect();
    let autoscale = !raw_args.iter().any(|a| a == "--raw");
    let enable_butter = raw_args.iter().any(|a| a == "--enable-butter");
    let enable_band = raw_args.iter().any(|a| a == "--enable-band");
    let motion_log_path: Option<String> =
        take_flag_value(&raw_args, "--motion-log").map(String::from);
    let smooth_sigma_override: Option<f32> =
        take_flag_value(&raw_args, "--smooth-sigma").and_then(|s| s.parse().ok());
    let crop_frac_override: Option<f32> =
        take_flag_value(&raw_args, "--corr-crop").and_then(|s| s.parse().ok());
    let subpixel_override: Option<MotionSubpixel> = take_flag_value(&raw_args, "--subpixel")
        .and_then(|s| match s {
            "centroid" | "Centroid" => Some(MotionSubpixel::Centroid),
            "parabolic" | "Parabolic" => Some(MotionSubpixel::Parabolic),
            _ => None,
        });
    let subpixel_radius_override: Option<usize> =
        take_flag_value(&raw_args, "--subpixel-radius").and_then(|s| s.parse().ok());
    let denoise_ksize_override: Option<usize> =
        take_flag_value(&raw_args, "--denoise-ksize").and_then(|s| s.parse().ok());

    // Positional = everything that's not a flag and not a value that
    // follows one of the recognized flags above.
    let value_flags = [
        "--motion-log",
        "--smooth-sigma",
        "--corr-crop",
        "--subpixel",
        "--subpixel-radius",
        "--denoise-ksize",
    ];
    let args: Vec<&String> = raw_args
        .iter()
        .enumerate()
        .filter(|(i, a)| {
            if a.starts_with("--") {
                return false;
            }
            if *i > 0 && value_flags.contains(&raw_args[i - 1].as_str()) {
                return false;
            }
            true
        })
        .map(|(_, a)| a)
        .collect();

    if args.len() < 3 {
        eprintln!(
            "usage: {} INPUT.avi OUTPUT.avi [PIXEL_SIZE_UM] [--raw] \
             [--motion-log PATH] [--smooth-sigma SIGMA] [--corr-crop FRAC] \
             [--subpixel centroid|parabolic] [--subpixel-radius N] \
             [--denoise-ksize N] [--enable-butter] [--enable-band]",
            raw_args
                .first()
                .map(String::as_str)
                .unwrap_or("cala-preprocess-avi")
        );
        return ExitCode::from(2);
    }
    let input_path = args[1];
    let output_path = args[2];
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
    let mut cfg = PreprocessConfig::default()
        .with_high_pass_enabled(enable_butter)
        .with_band_enabled(enable_band);
    if let Some(s) = smooth_sigma_override {
        cfg = cfg.with_motion_smooth_sigma_px(s);
    }
    if let Some(f) = crop_frac_override {
        if !(f > 0.0 && f <= 1.0) {
            eprintln!("error: --corr-crop must be in (0, 1] (got {f})");
            return ExitCode::from(2);
        }
        cfg = cfg.with_motion_corr_crop_frac(f);
    }
    if let Some(m) = subpixel_override {
        cfg = cfg.with_motion_subpixel(m);
    }
    if let Some(r) = subpixel_radius_override {
        if r < 1 {
            eprintln!("error: --subpixel-radius must be ≥ 1 (got {r})");
            return ExitCode::from(2);
        }
        cfg = cfg.with_motion_subpixel_radius(r);
    }
    if let Some(k) = denoise_ksize_override {
        if k < 1 || k % 2 == 0 {
            eprintln!("error: --denoise-ksize must be odd and ≥ 1 (got {k})");
            return ExitCode::from(2);
        }
        cfg = cfg.with_denoise_median_ksize(k);
    }
    let mut pipeline = PreprocessPipeline::new(h, w, &metadata, cfg);
    eprintln!(
        "pixel_size_um = {pixel_size_um}, autoscale = {autoscale}\n\
         stages: butter={butter}, band={band}, motion_smooth={sigma}, \
         motion_crop={crop}, subpixel={subpx:?}(r={radius}), \
         denoise_ksize={ksize}",
        butter = cfg.high_pass_enabled,
        band = cfg.band_enabled,
        sigma = cfg.motion_smooth_sigma_px,
        crop = cfg.motion_corr_crop_frac,
        subpx = cfg.motion_subpixel,
        radius = cfg.motion_subpixel_radius,
        ksize = cfg.denoise_median_ksize,
    );

    let mut in_buf = vec![0.0_f32; n];
    let mut out_buf = vec![0.0_f32; n];
    // Hold every frame's f32 output so we can compute a global rescale
    // window after the full recording is seen. ~n_frames·H·W·4 bytes;
    // for 2000×752×480 that's ~2.8 GB. Dev-tooling only, so we eat it.
    let n_frames = reader.frame_count() as usize;
    let mut all_f32: Vec<f32> = Vec::with_capacity(n_frames * n);
    let mut vmin = f32::INFINITY;
    let mut vmax = f32::NEG_INFINITY;
    let mut motion_rows: Vec<(u32, f32, f32)> = Vec::with_capacity(if motion_log_path.is_some() {
        n_frames
    } else {
        0
    });

    for i in 0..reader.frame_count() {
        if let Err(e) = reader.read_frame_grayscale_f32(i, &mut in_buf, GrayscaleMethod::Green) {
            eprintln!("error reading frame {i}: {e:?}");
            return ExitCode::from(1);
        }
        let input = Frame::new(&in_buf, h, w).expect("in_buf shape invariant");
        let mut output = FrameMut::new(&mut out_buf, h, w).expect("out_buf shape invariant");
        let shift = match pipeline.process_frame(input, &mut output) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("pipeline error on frame {i}: {e:?}");
                return ExitCode::from(1);
            }
        };
        if motion_log_path.is_some() {
            motion_rows.push((i, shift.dy, shift.dx));
        }
        for &v in &out_buf {
            if v.is_finite() {
                if v < vmin {
                    vmin = v;
                }
                if v > vmax {
                    vmax = v;
                }
            }
        }
        all_f32.extend_from_slice(&out_buf);
    }

    if let Some(path) = &motion_log_path {
        use std::io::Write;
        match std::fs::File::create(path) {
            Ok(mut f) => {
                let _ = writeln!(f, "frame,dy,dx");
                for (idx, dy, dx) in &motion_rows {
                    let _ = writeln!(f, "{idx},{dy:.6},{dx:.6}");
                }
                eprintln!("wrote motion log {path} ({} rows)", motion_rows.len());
            }
            Err(e) => eprintln!("warning: failed to write motion log {path}: {e}"),
        }
    }

    eprintln!("pipeline f32 range: min={vmin:.4} max={vmax:.4}");

    let (scale_lo, scale_hi) = if autoscale {
        // Map [vmin, vmax] → [0, 255]. Degenerate range (all equal):
        // fall back to raw clamp so we don't divide by zero.
        if (vmax - vmin).abs() < 1e-6 {
            eprintln!("note: pipeline output has no dynamic range; writing raw clamp");
            (0.0_f32, 255.0_f32)
        } else {
            (vmin, vmax)
        }
    } else {
        (0.0_f32, 255.0_f32)
    };
    let scale_span = (scale_hi - scale_lo).max(1e-12);
    eprintln!("rescale window: [{scale_lo:.4}, {scale_hi:.4}] → [0, 255]");

    let mut u8_frames: Vec<Vec<u8>> = Vec::with_capacity(n_frames);
    let mut clamped_above: u64 = 0;
    let mut clamped_below: u64 = 0;
    for frame_slice in all_f32.chunks(n) {
        let u8_frame: Vec<u8> = frame_slice
            .iter()
            .map(|&v| {
                let scaled = (v - scale_lo) / scale_span * 255.0;
                if scaled > 255.0 {
                    clamped_above += 1;
                }
                if scaled < 0.0 {
                    clamped_below += 1;
                }
                scaled.clamp(0.0, 255.0) as u8
            })
            .collect();
        u8_frames.push(u8_frame);
    }
    drop(all_f32);

    if clamped_above > 0 {
        eprintln!("note: {clamped_above} pixel samples above upper window");
    }
    if clamped_below > 0 {
        eprintln!("note: {clamped_below} pixel samples below lower window");
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
