/**
 * Double-exponential calcium kernel computation.
 * h(t) = exp(-t/tauDecay) - exp(-t/tauRise), normalized to peak = 1.
 */

/**
 * Compute a double-exponential calcium impulse response kernel.
 *
 * @param tauRise - Rise time constant in seconds (e.g., 0.02)
 * @param tauDecay - Decay time constant in seconds (e.g., 0.4)
 * @param fs - Sampling rate in Hz (e.g., 30)
 * @param durationMultiple - Multiple of tauDecay for kernel duration (default 5)
 * @returns Object with x (time in seconds) and y (kernel amplitude) as number[]
 */
export function computeKernel(
  tauRise: number,
  tauDecay: number,
  fs: number,
  durationMultiple: number = 5,
): { x: number[]; y: number[] } {
  const dt = 1 / fs;
  const duration = durationMultiple * tauDecay;
  const numPoints = Math.ceil(duration * fs);

  const x: number[] = new Array(numPoints);
  const y: number[] = new Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    const t = i * dt;
    x[i] = t;
    y[i] = Math.exp(-t / tauDecay) - Math.exp(-t / tauRise);
  }

  // Normalize to peak = 1
  let peak = 0;
  for (let i = 0; i < numPoints; i++) {
    if (y[i] > peak) peak = y[i];
  }
  if (peak > 0) {
    for (let i = 0; i < numPoints; i++) {
      y[i] /= peak;
    }
  }

  return { x, y };
}
