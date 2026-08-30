import { describe, it, expect } from 'vitest';
import type uPlot from 'uplot';

import { logSplits } from '../chart/axis-helpers.ts';

/**
 * `logSplits` replaces uPlot's built-in `logAxisSplits`, which could loop
 * without terminating even when handed valid bounds — the `splits.push` then
 * threw `RangeError: Invalid array length` from inside `axesCalc` and killed
 * the page mid-render.
 *
 * The bounds are unused by the implementation, so a cast is enough here.
 */
const U = null as unknown as uPlot;

describe('logSplits', () => {
  it('emits 1–9 per decade, in range', () => {
    const s = logSplits(U, 1, 1e-3, 1e-1);
    expect(s[0]).toBeCloseTo(1e-3, 12);
    expect(s[s.length - 1]).toBeLessThanOrEqual(1e-1);
    // strictly increasing
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
    // two full decades → 9 ticks each, plus the first tick of the third
    expect(s.length).toBeGreaterThanOrEqual(18);
    expect(s.length).toBeLessThanOrEqual(20);
  });

  it('never emits a tick below scaleMin', () => {
    // The decade floor for 3.2e-4 is 1e-4, so an unguarded implementation
    // emits 1e-4/2e-4/3e-4 below the axis minimum. uPlot does not clip splits
    // to the scale range, so those draw outside the plot rect. Every case here
    // uses a non-decade lower bound — with an exact decade the bug vanishes.
    for (const [lo, hi] of [
      [3.2e-4, 4.5e-2],
      [9.8e-3, 1.4e-2],
      [0.55, 7],
      [2.5, 900],
    ] as [number, number][]) {
      const s = logSplits(U, 1, lo, hi);
      expect(s.length).toBeGreaterThan(0);
      for (const v of s) expect(v).toBeGreaterThanOrEqual(lo);
    }
  });

  it('terminates and stays bounded across a very wide range', () => {
    // The regression: an unbounded tick loop. 300 decades must not blow up.
    const s = logSplits(U, 1, 1e-150, 1e150);
    expect(s.length).toBeLessThanOrEqual(2000);
    expect(Number.isFinite(s[s.length - 1])).toBe(true);
  });

  it('does not throw on non-finite or non-positive bounds', () => {
    for (const [lo, hi] of [
      [NaN, 1],
      [1, NaN],
      [Infinity, 1],
      [1, Infinity],
      [0, 1],
      [-1, 1],
      [1, 1], // zero width
      [2, 1], // inverted
    ] as [number, number][]) {
      const s = logSplits(U, 1, lo, hi);
      expect(Array.isArray(s)).toBe(true);
      expect(s.length).toBeGreaterThan(0);
      expect(s.length).toBeLessThanOrEqual(2000);
      for (const v of s) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('survives a denormal lower bound', () => {
    // 10 ** floor(log10(x)) underflows to exactly 0 here, which would make the
    // increment stand still.
    const s = logSplits(U, 1, 1e-320, 1);
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(2000);
    for (const v of s) expect(Number.isFinite(v)).toBe(true);
  });

  it('never returns an empty array', () => {
    for (const [lo, hi] of [
      [1e-6, 1e-6],
      [5, 5.0000001],
      [1e-3, 2e-3],
    ] as [number, number][]) {
      expect(logSplits(U, 1, lo, hi).length).toBeGreaterThan(0);
    }
  });
});
