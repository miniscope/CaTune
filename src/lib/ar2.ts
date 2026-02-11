/**
 * AR(2) coefficient derivation from tau parameters.
 *
 * TypeScript port of `tau_to_ar2` from wasm/catune-solver/src/kernel.rs (lines 40-49).
 * Same formula, same variable names.
 *
 * The AR(2) process: c[t] = g1*c[t-1] + g2*c[t-2] + s[t]
 * Characteristic roots: d = exp(-dt/tau_decay), r = exp(-dt/tau_rise)
 * g1 = d + r (sum of roots), g2 = -(d * r) (negative product of roots)
 */

export interface AR2Coefficients {
  g1: number; // d + r (sum of AR2 roots)
  g2: number; // -(d * r) (negative product of roots)
  d: number; // exp(-dt/tau_decay) decay eigenvalue
  r: number; // exp(-dt/tau_rise) rise eigenvalue
}

export function computeAR2(
  tauRise: number,
  tauDecay: number,
  fs: number,
): AR2Coefficients {
  const dt = 1 / fs;
  const d = Math.exp(-dt / tauDecay);
  const r = Math.exp(-dt / tauRise);
  return { g1: d + r, g2: -(d * r), d, r };
}
