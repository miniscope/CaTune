//! Recording metadata and pipeline configuration.
//!
//! **Rule:** algorithm code never reads `DEFAULT_*` constants directly.
//! It reads from a config struct the caller passed in. The `DEFAULT_*`
//! constants are only the *source* of each builder's initial value —
//! they set the default, they don't control behavior at call sites.
//! This keeps every tuning knob overridable without source edits.

/// Default assumption for neuron cell-body diameter, used when the caller
/// doesn't specify one on `RecordingMetadata`.
pub const DEFAULT_NEURON_DIAMETER_UM: f32 = 10.0;

/// Default Butterworth high-pass cutoff period, expressed as a multiple
/// of neuron diameters. Cutoff period (pixels) = this × neuron diameter
/// in pixels. K = 3 attenuates spatial features larger than ~3 cell
/// bodies (illumination glow, broad shading) while letting neuron-scale
/// content pass untouched.
pub const DEFAULT_HIGH_PASS_DIAMETERS: f32 = 3.0;

/// Default Butterworth filter order. Higher = sharper rolloff; 4 is a
/// common compromise between sharpness and avoiding ringing artifacts.
pub const DEFAULT_HIGH_PASS_ORDER: u32 = 4;

/// Physical properties of a recording.
///
/// Required: `pixel_size_um`. Every other field has a documented default
/// that can be overridden with `with_*` builder methods.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RecordingMetadata {
    /// Physical size of one image pixel in micrometers.
    pub pixel_size_um: f32,
    /// Typical neuron cell-body diameter in micrometers. Used for
    /// downstream cutoff derivations.
    pub neuron_diameter_um: f32,
}

impl RecordingMetadata {
    /// Construct metadata with the given pixel size and the default
    /// neuron diameter (`DEFAULT_NEURON_DIAMETER_UM`). Override the
    /// neuron diameter with `with_neuron_diameter`.
    pub fn new(pixel_size_um: f32) -> Self {
        Self {
            pixel_size_um,
            neuron_diameter_um: DEFAULT_NEURON_DIAMETER_UM,
        }
    }

    pub fn with_neuron_diameter(mut self, um: f32) -> Self {
        self.neuron_diameter_um = um;
        self
    }
}

/// Per-stage tuning for the preprocess pipeline. Every field is
/// overridable; `PreprocessConfig::default()` reads each field's value
/// from its `DEFAULT_*` constant so defaults stay in one place.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PreprocessConfig {
    /// Butterworth high-pass cutoff period, as a multiple of the neuron
    /// diameter in pixels. See `high_pass_cutoff_cycles_per_pixel` for
    /// the derivation.
    pub high_pass_diameters: f32,
    /// Butterworth filter order (number of poles).
    pub high_pass_order: u32,
}

impl Default for PreprocessConfig {
    fn default() -> Self {
        Self {
            high_pass_diameters: DEFAULT_HIGH_PASS_DIAMETERS,
            high_pass_order: DEFAULT_HIGH_PASS_ORDER,
        }
    }
}

impl PreprocessConfig {
    pub fn with_high_pass_diameters(mut self, k: f32) -> Self {
        self.high_pass_diameters = k;
        self
    }

    pub fn with_high_pass_order(mut self, order: u32) -> Self {
        self.high_pass_order = order;
        self
    }
}
