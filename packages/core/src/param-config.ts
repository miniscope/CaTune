// Parameter range configuration and log-scale conversion helpers for interactive tuning.

/**
 * Scientifically reasonable parameter ranges for calcium imaging deconvolution.
 * Based on GCaMP6f/6s typical values from calcium imaging literature.
 */
export const PARAM_RANGES = {
  tPeak: {
    min: 0.005, // 5ms -- fastest plausible time-to-peak
    max: 0.5, // 500ms -- very slow indicators
    default: 0.008, // ≈ tauToShape(0.001, 3.0).tPeak
    step: 0.001, // 1ms resolution
    unit: 's',
  },
  fwhm: {
    min: 0.02, // 20ms -- narrowest plausible transient
    max: 3.0, // 3s -- very slow indicators
    default: 2.08, // ≈ tauToShape(0.001, 3.0).fwhm
    step: 0.001, // 1ms resolution
    unit: 's',
  },
  lambda: {
    min: 0, // No sparsity penalty
    max: 10, // High sparsity (only largest events)
    default: 0, // start at minimum sparsity
    logScale: false,
  },
} as const;
