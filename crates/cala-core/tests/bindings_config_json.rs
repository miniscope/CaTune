//! Tests for the JSON config surface used by the WASM / PyO3 bindings
//! (design §4.1, test-first). These exercise the shape and override
//! semantics of every config struct that crosses the binding boundary
//! so that JS / Python can trust "only specify what I want to change".
//!
//! The binding wrappers (`bindings/wasm.rs`, PyO3 equivalent) forward
//! their JSON strings through the `bindings::config_json` helpers —
//! fixing any defect here catches regressions at both targets at once.

use calab_cala_core::bindings::config_json::{
    parse_extend_config, parse_fit_config, parse_preprocess_config, parse_recording_metadata,
};
use calab_cala_core::config::{
    ExtendConfig, FitConfig, GrayscaleMethod, MotionCorrelation, MotionSubpixel, PreprocessConfig,
    RecordingMetadata,
};

#[test]
fn empty_preprocess_json_returns_defaults() {
    // `{}` should decode to the same value as `PreprocessConfig::default()`.
    // That's the contract the binding layer depends on: JS can send
    // `JSON.stringify({})` and get defaults.
    let parsed = parse_preprocess_config("{}").expect("empty JSON must parse");
    assert_eq!(parsed, PreprocessConfig::default());
}

#[test]
fn preprocess_override_only_touches_named_fields() {
    let parsed = parse_preprocess_config(r#"{"high_pass_enabled":true,"motion_max_shift_px":48}"#)
        .expect("override JSON must parse");
    let defaults = PreprocessConfig::default();
    // Overridden fields reflect the JSON.
    assert!(parsed.high_pass_enabled);
    assert_eq!(parsed.motion_max_shift_px, 48);
    // Untouched fields retain defaults — no hidden drift.
    assert_eq!(parsed.band_enabled, defaults.band_enabled);
    assert_eq!(parsed.motion_corr_crop_frac, defaults.motion_corr_crop_frac);
    assert_eq!(parsed.motion_correlation, defaults.motion_correlation);
}

#[test]
fn preprocess_enums_round_trip_as_tagged_strings() {
    // Serde's default enum tagging for unit variants is `"Variant"` —
    // verify that so JS can send `{"motion_correlation":"Phase"}`.
    let parsed =
        parse_preprocess_config(r#"{"motion_correlation":"Phase","motion_subpixel":"Parabolic"}"#)
            .expect("enum JSON must parse");
    assert_eq!(parsed.motion_correlation, MotionCorrelation::Phase);
    assert_eq!(parsed.motion_subpixel, MotionSubpixel::Parabolic);
}

#[test]
fn preprocess_round_trip_preserves_full_config() {
    let original = PreprocessConfig::default()
        .with_high_pass_enabled(true)
        .with_band_enabled(true)
        .with_motion_corr_crop_frac(0.8)
        .with_motion_subpixel_radius(3);
    let json = serde_json::to_string(&original).unwrap();
    let round_trip = parse_preprocess_config(&json).unwrap();
    assert_eq!(round_trip, original);
}

#[test]
fn fit_json_defaults_and_override() {
    let empty = parse_fit_config("{}").unwrap();
    assert_eq!(empty, FitConfig::default());

    let parsed = parse_fit_config(r#"{"trace_max_iter":40,"snr_c0":0.5}"#).unwrap();
    assert_eq!(parsed.trace_max_iter, 40);
    assert!((parsed.snr_c0 - 0.5).abs() < 1e-7);
    assert_eq!(parsed.trace_tol, FitConfig::default().trace_tol);
}

#[test]
fn extend_json_defaults_and_override() {
    let empty = parse_extend_config("{}").unwrap();
    assert_eq!(empty, ExtendConfig::default());

    let parsed = parse_extend_config(
        r#"{"mutation_queue_capacity":64,"proposals_per_cycle_max":2,"trace_corr_min":0.9}"#,
    )
    .unwrap();
    assert_eq!(parsed.mutation_queue_capacity, 64);
    assert_eq!(parsed.proposals_per_cycle_max, 2);
    assert!((parsed.trace_corr_min - 0.9).abs() < 1e-7);
}

#[test]
fn recording_metadata_requires_pixel_size() {
    // `pixel_size_um` has no sensible default — omitting it must fail
    // rather than silently default to zero.
    let err = parse_recording_metadata("{}").unwrap_err();
    assert_eq!(err.kind, "recording");
    // Parsing an explicit value succeeds; neuron diameter falls back
    // to DEFAULT_NEURON_DIAMETER_UM when omitted.
    let parsed = parse_recording_metadata(r#"{"pixel_size_um":2.0}"#).unwrap();
    assert!((parsed.pixel_size_um - 2.0).abs() < 1e-7);
    assert_eq!(
        parsed.neuron_diameter_um,
        RecordingMetadata::new(2.0).neuron_diameter_um
    );
}

#[test]
fn malformed_json_returns_error_tagged_with_config_kind() {
    let err = parse_preprocess_config("not-json").unwrap_err();
    assert_eq!(err.kind, "preprocess");
    assert!(
        !err.message.is_empty(),
        "error message must carry serde's diagnostic"
    );
}

#[test]
fn grayscale_method_round_trips_for_avi_reader() {
    // `GrayscaleMethod` flows through the WASM AviReader binding — keep
    // its serialized shape stable so JS can pass `"Green"` / `"Luminance"`.
    for m in [GrayscaleMethod::Green, GrayscaleMethod::Luminance] {
        let json = serde_json::to_string(&m).unwrap();
        let back: GrayscaleMethod = serde_json::from_str(&json).unwrap();
        assert_eq!(m, back);
    }
}
