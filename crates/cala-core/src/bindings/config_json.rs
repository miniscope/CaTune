//! JSON round-trip for config structs at the binding boundary.
//!
//! Every tuning knob that matters to the algorithm lives in a config
//! struct (`PreprocessConfig`, `FitConfig`, `ExtendConfig`,
//! `RecordingMetadata`) with a `DEFAULT_*` constant per field. JS /
//! Python callers hand us a JSON string with only the fields they
//! want to override; everything else falls back to the `Default`
//! impl. This is how we enforce the "no magic numbers in the
//! binding" rule — there is no parallel set of defaults to drift
//! apart.
//!
//! The module is natively testable (see `tests/bindings_config_json.rs`).

use crate::config::{ExtendConfig, FitConfig, PreprocessConfig, RecordingMetadata};

/// A JSON parse failure at a binding entry point. Carries the config
/// family that failed (`"preprocess"`, `"fit"`, …) and the serde
/// error message so callers can surface actionable diagnostics.
#[derive(Debug, Clone)]
pub struct ConfigParseError {
    pub kind: &'static str,
    pub message: String,
}

impl std::fmt::Display for ConfigParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "cala-core {} config parse error: {}",
            self.kind, self.message
        )
    }
}

impl std::error::Error for ConfigParseError {}

fn parse<T: serde::de::DeserializeOwned>(
    kind: &'static str,
    json: &str,
) -> Result<T, ConfigParseError> {
    serde_json::from_str(json).map_err(|e| ConfigParseError {
        kind,
        message: e.to_string(),
    })
}

/// Parse a `PreprocessConfig` from JSON. Unspecified fields take
/// their `DEFAULT_*` value via `#[serde(default)]`.
pub fn parse_preprocess_config(json: &str) -> Result<PreprocessConfig, ConfigParseError> {
    parse("preprocess", json)
}

/// Parse a `FitConfig` from JSON. Unspecified fields take defaults.
pub fn parse_fit_config(json: &str) -> Result<FitConfig, ConfigParseError> {
    parse("fit", json)
}

/// Parse an `ExtendConfig` from JSON. Unspecified fields take defaults.
pub fn parse_extend_config(json: &str) -> Result<ExtendConfig, ConfigParseError> {
    parse("extend", json)
}

/// Parse a `RecordingMetadata` from JSON. `pixel_size_um` is required
/// (no sensible default). `neuron_diameter_um` falls back to
/// `DEFAULT_NEURON_DIAMETER_UM` when omitted.
pub fn parse_recording_metadata(json: &str) -> Result<RecordingMetadata, ConfigParseError> {
    parse("recording", json)
}
