/**
 * Synthetic calcium trace generator for development visualization.
 * Generates mock deconvolved (spikes) and reconvolution (convolved fit) data
 * so the multi-panel trace view has something to display before the real solver
 * is wired in Phase 4.
 */

import { computeKernel } from './kernel-math';

/**
 * Generate mock deconvolved and reconvolution traces from a raw fluorescence signal.
 *
 * Strategy:
 * - Place random spikes (~2% of timepoints) with amplitude 1.0
 * - Convolve spikes with double-exponential kernel to produce reconvolution
 *
 * This is development-only; Phase 4 replaces with real solver output.
 *
 * @param rawTrace - The actual raw fluorescence trace (used for length reference)
 * @param tauRise - Rise time constant in seconds
 * @param tauDecay - Decay time constant in seconds
 * @param fs - Sampling rate in Hz
 * @returns Object with deconvolved (spike train) and reconvolution (fit) traces
 */
export function generateMockTraces(
  rawTrace: Float64Array,
  tauRise: number,
  tauDecay: number,
  fs: number,
): { deconvolved: Float64Array; reconvolution: Float64Array } {
  const n = rawTrace.length;

  // Generate spike train: ~2% of timepoints have a spike
  const deconvolved = new Float64Array(n);
  // Use a simple deterministic seeded approach based on trace values
  // so it is reproducible for same input
  for (let i = 0; i < n; i++) {
    // Simple hash-like deterministic pseudo-random based on index and trace value
    const hash = Math.abs(Math.sin(i * 12.9898 + 78.233) * 43758.5453);
    const frac = hash - Math.floor(hash);
    if (frac < 0.02) {
      deconvolved[i] = 1.0;
    }
  }

  // Compute kernel for convolution
  const kernel = computeKernel(tauRise, tauDecay, fs);
  const kernelY = kernel.y;
  const kLen = kernelY.length;

  // Direct convolution: reconvolution[t] = sum_k deconvolved[t-k] * kernel[k]
  const reconvolution = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    let sum = 0;
    const jMax = Math.min(kLen, t + 1);
    for (let k = 0; k < jMax; k++) {
      sum += deconvolved[t - k] * kernelY[k];
    }
    reconvolution[t] = sum;
  }

  // Scale reconvolution to roughly match raw trace amplitude
  let rawMax = 0;
  let reconvMax = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(rawTrace[i]) > rawMax) rawMax = Math.abs(rawTrace[i]);
    if (reconvolution[i] > reconvMax) reconvMax = reconvolution[i];
  }
  if (reconvMax > 0 && rawMax > 0) {
    const scale = rawMax / reconvMax * 0.8; // 80% of raw amplitude for visual clarity
    for (let i = 0; i < n; i++) {
      reconvolution[i] *= scale;
    }
  }

  return { deconvolved, reconvolution };
}
