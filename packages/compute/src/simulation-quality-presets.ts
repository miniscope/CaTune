/**
 * Qualitative simulation presets per pipeline step.
 *
 * Each step has a flat array of level definitions. To add a level, add one
 * object to the array. To adjust values, edit the numbers here. Types are
 * derived from the arrays so they update automatically.
 *
 * The `buildSimulationConfig()` function composes a full SimulationConfig
 * from a QualitativeSimConfig (one level per step + indicator choice).
 */

import type {
  SimulationConfig,
  MarkovConfig,
  NoiseConfig,
  RandomWalkDrift,
  PhotobleachingConfig,
  SaturationConfig,
  CellVariationConfig,
} from './simulation-types.ts';
import { getSimulationPresetById } from './simulation-presets.ts';

// ── Indicator ───────────────────────────────────────────────────

export const INDICATOR_OPTIONS = [
  { id: 'gcamp6f', label: 'GCaMP6f', description: 'Fast GECI (Chen et al., 2013)' },
  { id: 'gcamp6s', label: 'GCaMP6s', description: 'Slow GECI, high SNR (Chen et al., 2013)' },
  { id: 'gcamp6m', label: 'GCaMP6m', description: 'Moderate GECI (Chen et al., 2013)' },
  { id: 'jgcamp8f', label: 'jGCaMP8f', description: 'Ultra-fast GECI (Zhang et al., 2023)' },
  { id: 'ogb1', label: 'OGB-1', description: 'Synthetic dye (Stosiek et al., 2003)' },
] as const;

export type IndicatorId = (typeof INDICATOR_OPTIONS)[number]['id'];

// ── Spike Activity (Markov HMM) ─────────────────────────────────

export const SPIKE_ACTIVITY_LEVELS = [
  {
    id: 'sparse',
    label: 'Sparse',
    p_silent_to_active: 0.005,
    p_active_to_silent: 0.3,
    p_spike_when_active: 0.5,
    p_spike_when_silent: 0.002,
  },
  {
    id: 'moderate',
    label: 'Moderate',
    p_silent_to_active: 0.01,
    p_active_to_silent: 0.2,
    p_spike_when_active: 0.7,
    p_spike_when_silent: 0.005,
  },
  {
    id: 'dense',
    label: 'Dense',
    p_silent_to_active: 0.03,
    p_active_to_silent: 0.1,
    p_spike_when_active: 0.8,
    p_spike_when_silent: 0.01,
  },
] as const;

export type SpikeActivityLevel = (typeof SPIKE_ACTIVITY_LEVELS)[number]['id'];

// ── Noise ───────────────────────────────────────────────────────

export const NOISE_LEVELS = [
  { id: 'clean', label: 'Clean', snr: 200, shot_noise_enabled: false, shot_noise_fraction: 0 },
  { id: 'low', label: 'Low', snr: 25, shot_noise_enabled: false, shot_noise_fraction: 0 },
  {
    id: 'moderate',
    label: 'Moderate',
    snr: 10,
    shot_noise_enabled: false,
    shot_noise_fraction: 0.3,
  },
  { id: 'high', label: 'High', snr: 5, shot_noise_enabled: true, shot_noise_fraction: 0.3 },
  {
    id: 'very_high',
    label: 'Very High',
    snr: 2,
    shot_noise_enabled: true,
    shot_noise_fraction: 0.5,
  },
] as const;

export type NoiseLevel = (typeof NOISE_LEVELS)[number]['id'];

// ── Drift (random walk) ─────────────────────────────────────────

export const DRIFT_LEVELS = [
  { id: 'none', label: 'None', step_std_fraction: 0.0, mean_reversion: 0.001 },
  { id: 'subtle', label: 'Subtle', step_std_fraction: 0.001, mean_reversion: 0.002 },
  { id: 'moderate', label: 'Moderate', step_std_fraction: 0.003, mean_reversion: 0.001 },
  { id: 'strong', label: 'Strong', step_std_fraction: 0.008, mean_reversion: 0.0005 },
] as const;

export type DriftLevel = (typeof DRIFT_LEVELS)[number]['id'];

// ── Photobleaching ──────────────────────────────────────────────

export const PHOTOBLEACHING_LEVELS = [
  { id: 'none', label: 'None', enabled: false, decay_time_constant_s: 600, amplitude_fraction: 0 },
  {
    id: 'mild',
    label: 'Mild',
    enabled: true,
    decay_time_constant_s: 900,
    amplitude_fraction: 0.08,
  },
  {
    id: 'moderate',
    label: 'Moderate',
    enabled: true,
    decay_time_constant_s: 600,
    amplitude_fraction: 0.15,
  },
  {
    id: 'severe',
    label: 'Severe',
    enabled: true,
    decay_time_constant_s: 300,
    amplitude_fraction: 0.3,
  },
] as const;

export type PhotobleachingLevel = (typeof PHOTOBLEACHING_LEVELS)[number]['id'];

// ── Saturation ──────────────────────────────────────────────────

export const SATURATION_LEVELS = [
  { id: 'none', label: 'None', enabled: false, hill_coefficient: 1.0, k_d: 5.0 },
  { id: 'mild', label: 'Mild', enabled: true, hill_coefficient: 1.5, k_d: 8.0 },
  { id: 'strong', label: 'Strong', enabled: true, hill_coefficient: 2.5, k_d: 3.0 },
] as const;

export type SaturationLevel = (typeof SATURATION_LEVELS)[number]['id'];

// ── Cell Variation ──────────────────────────────────────────────

export const CELL_VARIATION_LEVELS = [
  { id: 'none', label: 'None', alpha_cv: 0, tau_rise_cv: 0, tau_decay_cv: 0, snr_spread: 0 },
  { id: 'low', label: 'Low', alpha_cv: 0.15, tau_rise_cv: 0.05, tau_decay_cv: 0.05, snr_spread: 2 },
  {
    id: 'moderate',
    label: 'Moderate',
    alpha_cv: 0.3,
    tau_rise_cv: 0.1,
    tau_decay_cv: 0.1,
    snr_spread: 5,
  },
  { id: 'high', label: 'High', alpha_cv: 0.5, tau_rise_cv: 0.2, tau_decay_cv: 0.2, snr_spread: 8 },
] as const;

export type CellVariationLevel = (typeof CELL_VARIATION_LEVELS)[number]['id'];

// ── Qualitative Config ──────────────────────────────────────────

export interface QualitativeSimConfig {
  indicator: IndicatorId;
  spikeActivity: SpikeActivityLevel;
  noise: NoiseLevel;
  drift: DriftLevel;
  photobleaching: PhotobleachingLevel;
  saturation: SaturationLevel;
  cellVariation: CellVariationLevel;
}

export const DEFAULT_QUALITATIVE_CONFIG: QualitativeSimConfig = {
  indicator: 'gcamp6f',
  spikeActivity: 'moderate',
  noise: 'low',
  drift: 'subtle',
  photobleaching: 'none',
  saturation: 'none',
  cellVariation: 'low',
};

// ── Builder ─────────────────────────────────────────────────────

function findLevel<T extends { id: string }>(levels: readonly T[], id: string): T {
  const found = levels.find((l) => l.id === id);
  if (!found) throw new Error(`Unknown level: ${id}`);
  return found;
}

/**
 * Compose a full SimulationConfig from qualitative choices.
 *
 * Indicator contributes only kernel params (tau_rise, tau_decay).
 * All other parameters come from the qualitative level selections.
 */
export function buildSimulationConfig(
  q: QualitativeSimConfig,
  overrides?: {
    fs_hz?: number;
    num_timepoints?: number;
    num_cells?: number;
    seed?: number;
    spike_sim_hz?: number;
  },
): SimulationConfig {
  // Indicator → kernel params
  const preset = getSimulationPresetById(q.indicator);
  const kernel = preset ? preset.config.kernel : { tau_rise_s: 0.1, tau_decay_s: 0.6 };

  // Look up each qualitative level
  const spike = findLevel(SPIKE_ACTIVITY_LEVELS, q.spikeActivity);
  const noise = findLevel(NOISE_LEVELS, q.noise);
  const drift = findLevel(DRIFT_LEVELS, q.drift);
  const pb = findLevel(PHOTOBLEACHING_LEVELS, q.photobleaching);
  const sat = findLevel(SATURATION_LEVELS, q.saturation);
  const cv = findLevel(CELL_VARIATION_LEVELS, q.cellVariation);

  const spikeModel: MarkovConfig = {
    model_type: 'markov',
    p_silent_to_active: spike.p_silent_to_active,
    p_active_to_silent: spike.p_active_to_silent,
    p_spike_when_active: spike.p_spike_when_active,
    p_spike_when_silent: spike.p_spike_when_silent,
  };

  const noiseConfig: NoiseConfig = {
    snr: noise.snr,
    shot_noise_enabled: noise.shot_noise_enabled,
    shot_noise_fraction: noise.shot_noise_fraction,
  };

  const driftConfig: RandomWalkDrift = {
    model_type: 'random_walk',
    step_std_fraction: drift.step_std_fraction,
    mean_reversion: drift.mean_reversion,
  };

  const photobleachingConfig: PhotobleachingConfig = {
    enabled: pb.enabled,
    decay_time_constant_s: pb.decay_time_constant_s,
    amplitude_fraction: pb.amplitude_fraction,
  };

  const saturationConfig: SaturationConfig = {
    enabled: sat.enabled,
    hill_coefficient: sat.hill_coefficient,
    k_d: sat.k_d,
  };

  const cellVariationConfig: CellVariationConfig = {
    alpha_mean: 1.0,
    alpha_cv: cv.alpha_cv,
    tau_rise_cv: cv.tau_rise_cv,
    tau_decay_cv: cv.tau_decay_cv,
    snr_spread: cv.snr_spread,
  };

  return {
    fs_hz: overrides?.fs_hz ?? 30,
    num_timepoints: overrides?.num_timepoints ?? 27000,
    num_cells: overrides?.num_cells ?? 100,
    seed: overrides?.seed ?? 42,
    spike_sim_hz: overrides?.spike_sim_hz ?? 300,
    kernel,
    spike_model: spikeModel,
    noise: noiseConfig,
    drift: driftConfig,
    photobleaching: photobleachingConfig,
    saturation: saturationConfig,
    cell_variation: cellVariationConfig,
  };
}
