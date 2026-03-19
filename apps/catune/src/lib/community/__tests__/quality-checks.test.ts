import { describe, it, expect } from 'vitest';
import { validateSubmission } from '../quality-checks.ts';

/** Helper that returns a valid baseline parameter set (tPeak/fwhm in seconds). */
function validParams() {
  return { tPeak: 0.08, fwhm: 0.5, lambda: 0.01, samplingRate: 30 };
}

describe('validateSubmission', () => {
  it('accepts valid params', () => {
    const result = validateSubmission(validParams());
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it('rejects tPeak at or below 0', () => {
    const result = validateSubmission({ ...validParams(), tPeak: 0 });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining('t_peak')]));
  });

  it('rejects tPeak at or above 1', () => {
    const result = validateSubmission({ ...validParams(), tPeak: 1 });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining('t_peak')]));
  });

  it('rejects fwhm at or below 0', () => {
    const result = validateSubmission({ ...validParams(), fwhm: 0 });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining('fwhm')]));
  });

  it('rejects fwhm at or above 10', () => {
    const result = validateSubmission({ ...validParams(), fwhm: 10 });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining('fwhm')]));
  });

  it('rejects lambda below min (0)', () => {
    const result = validateSubmission({ ...validParams(), lambda: 0 });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.stringContaining('lambda')]));
  });

  it('rejects samplingRate above max (1001)', () => {
    const result = validateSubmission({ ...validParams(), samplingRate: 1001 });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('sampling_rate')]),
    );
  });

  it('rejects invalid kernel shape (fwhm <= tPeak)', () => {
    const result = validateSubmission({ ...validParams(), tPeak: 0.5, fwhm: 0.3 });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('Invalid kernel shape')]),
    );
  });

  it('collects multiple violations in the issues array', () => {
    const result = validateSubmission({
      tPeak: 0,
      fwhm: 0,
      lambda: 0,
      samplingRate: 9999,
    });
    expect(result.valid).toBe(false);
    // At least t_peak, fwhm, lambda, sampling_rate, and invalid shape
    expect(result.issues.length).toBeGreaterThanOrEqual(4);
  });
});
