import { describe, it, expect } from 'vitest';
import { PARAM_RANGES } from '../param-config.ts';

describe('PARAM_RANGES', () => {
  it('has expected keys: tPeak, fwhm, lambda', () => {
    expect(PARAM_RANGES).toHaveProperty('tPeak');
    expect(PARAM_RANGES).toHaveProperty('fwhm');
    expect(PARAM_RANGES).toHaveProperty('lambda');
  });

  it('has min < max for each parameter', () => {
    expect(PARAM_RANGES.tPeak.min).toBeLessThan(PARAM_RANGES.tPeak.max);
    expect(PARAM_RANGES.fwhm.min).toBeLessThan(PARAM_RANGES.fwhm.max);
    expect(PARAM_RANGES.lambda.min).toBeLessThan(PARAM_RANGES.lambda.max);
  });

  it('has default within [min, max] for each parameter', () => {
    for (const key of ['tPeak', 'fwhm', 'lambda'] as const) {
      const range = PARAM_RANGES[key];
      expect(range.default).toBeGreaterThanOrEqual(range.min);
      expect(range.default).toBeLessThanOrEqual(range.max);
    }
  });

  it('has step > 0 for tPeak and fwhm', () => {
    expect(PARAM_RANGES.tPeak.step).toBeGreaterThan(0);
    expect(PARAM_RANGES.fwhm.step).toBeGreaterThan(0);
  });
});
