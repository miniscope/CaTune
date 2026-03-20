// CaTune parameter validation for community submissions.
// Hard limits block submission (validateSubmission).

import { shapeToTau } from '@calab/compute';
import type { SubmissionValidationResult } from '@calab/community';

/** Hard parameter range limits that block submission if violated. */
const HARD_LIMITS = {
  tauRise: { min: 0.001, max: 0.5, label: 'tau_rise' },
  tauDecay: { min: 0.01, max: 10, label: 'tau_decay' },
  lambda: { min: 1e-6, max: 10, label: 'lambda' },
  samplingRate: { min: 1, max: 1000, label: 'sampling_rate' },
} as const;

interface ValidationParams {
  tPeak: number;
  fwhm: number;
  lambda: number;
  samplingRate: number;
}

/**
 * Validate parameters against hard limits.
 * Returns valid=false with human-readable issues if any check fails.
 */
export function validateSubmission(params: ValidationParams): SubmissionValidationResult {
  const issues: string[] = [];

  // tPeak range check
  if (params.tPeak <= 0 || params.tPeak >= 1) {
    issues.push(`t_peak (${params.tPeak}s) is outside the valid range (0s, 1s)`);
  }

  // fwhm range check
  if (params.fwhm <= 0 || params.fwhm >= 10) {
    issues.push(`fwhm (${params.fwhm}s) is outside the valid range (0s, 10s)`);
  }

  // Convert tPeak/fwhm to tau values and validate them
  const tauResult = shapeToTau(params.tPeak, params.fwhm);
  if (!tauResult) {
    issues.push(`Invalid kernel shape: could not convert t_peak/fwhm to tau values`);
  } else {
    // tau_rise range check
    if (
      tauResult.tauRise < HARD_LIMITS.tauRise.min ||
      tauResult.tauRise > HARD_LIMITS.tauRise.max
    ) {
      issues.push(
        `tau_rise (${tauResult.tauRise}s) is outside the valid range [${HARD_LIMITS.tauRise.min}s, ${HARD_LIMITS.tauRise.max}s]`,
      );
    }

    // tau_decay range check
    if (
      tauResult.tauDecay < HARD_LIMITS.tauDecay.min ||
      tauResult.tauDecay > HARD_LIMITS.tauDecay.max
    ) {
      issues.push(
        `tau_decay (${tauResult.tauDecay}s) is outside the valid range [${HARD_LIMITS.tauDecay.min}s, ${HARD_LIMITS.tauDecay.max}s]`,
      );
    }
  }

  // lambda range check
  if (params.lambda < HARD_LIMITS.lambda.min || params.lambda > HARD_LIMITS.lambda.max) {
    issues.push(
      `lambda (${params.lambda}) is outside the valid range [${HARD_LIMITS.lambda.min}, ${HARD_LIMITS.lambda.max}]`,
    );
  }

  // sampling_rate range check
  if (
    params.samplingRate < HARD_LIMITS.samplingRate.min ||
    params.samplingRate > HARD_LIMITS.samplingRate.max
  ) {
    issues.push(
      `sampling_rate (${params.samplingRate} Hz) is outside the valid range [${HARD_LIMITS.samplingRate.min}, ${HARD_LIMITS.samplingRate.max}] Hz`,
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
