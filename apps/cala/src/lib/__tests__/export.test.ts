import { describe, it, expect } from 'vitest';
import { parseNpz } from '@calab/io';
import { buildCalaExportNpz } from '../export.ts';

describe('buildCalaExportNpz', () => {
  it('round-trips through parseNpz with the expected CSC + K×T shapes', () => {
    // Two neurons. #3 has support at pixels (0, 1), #7 at pixel 5.
    const footprints = {
      ids: Uint32Array.of(3, 7),
      pixelIndices: [Uint32Array.of(0, 1), Uint32Array.of(5)],
      values: [Float32Array.of(0.5, 0.5), Float32Array.of(0.9)],
    };
    // Traces sampled at t=10, 20 for #3 and t=20, 30 for #7.
    const traces = {
      ids: Uint32Array.of(3, 7),
      times: [Float32Array.of(10, 20), Float32Array.of(20, 30)],
      values: [Float32Array.of(0.1, 0.2), Float32Array.of(0.7, 0.8)],
    };
    const meta = { height: 2, width: 4 };

    const npz = buildCalaExportNpz({ footprints, traces, meta });
    const parsed = parseNpz(npz.buffer as ArrayBuffer);

    // CSC: 3 non-zeros total. indptr = [0, 2, 3].
    const aData = parsed.arrays.A_data.data;
    const aIndices = parsed.arrays.A_indices.data;
    const aIndptr = parsed.arrays.A_indptr.data;
    const aShape = parsed.arrays.A_shape.data;
    expect(aData.length).toBe(3);
    expect(Array.from(aIndices)).toEqual([0, 1, 5]);
    expect(Array.from(aIndptr)).toEqual([0, 2, 3]);
    expect(Array.from(aShape)).toEqual([8, 2]); // 2·4 pixels, 2 components

    // Union time axis = [10, 20, 30]. K=2.
    const cTimes = parsed.arrays.C_times.data;
    expect(Array.from(cTimes)).toEqual([10, 20, 30]);
    const cShape = parsed.arrays.C.shape;
    expect(cShape).toEqual([2, 3]);

    // Row-major K×T: row 0 = #3's trace at [10, 20, 30]; NaN at 30.
    const cFlat = parsed.arrays.C.data;
    expect(cFlat[0]).toBeCloseTo(0.1);
    expect(cFlat[1]).toBeCloseTo(0.2);
    expect(Number.isNaN(cFlat[2])).toBe(true);
    // Row 1 = #7's trace: NaN at 10, then samples.
    expect(Number.isNaN(cFlat[3])).toBe(true);
    expect(cFlat[4]).toBeCloseTo(0.7);
    expect(cFlat[5]).toBeCloseTo(0.8);

    expect(Array.from(parsed.arrays.height.data)).toEqual([2]);
    expect(Array.from(parsed.arrays.width.data)).toEqual([4]);
    expect(Array.from(parsed.arrays.footprint_ids.data)).toEqual([3, 7]);
    expect(Array.from(parsed.arrays.C_ids.data)).toEqual([3, 7]);
  });

  it('handles zero footprints / zero traces without crashing', () => {
    const footprints = {
      ids: new Uint32Array(0),
      pixelIndices: [],
      values: [],
    };
    const traces = {
      ids: new Uint32Array(0),
      times: [],
      values: [],
    };
    const meta = { height: 4, width: 4 };
    const npz = buildCalaExportNpz({ footprints, traces, meta });
    const parsed = parseNpz(npz.buffer as ArrayBuffer);
    expect(parsed.arrays.A_data.data.length).toBe(0);
    expect(Array.from(parsed.arrays.A_indptr.data)).toEqual([0]);
    expect(parsed.arrays.C.shape).toEqual([0, 0]);
  });
});
