import { describe, it, expect } from 'vitest';
import { quantizeToU8, writeGrayscaleToImageData } from '../frame-preview.ts';

describe('frame-preview helpers', () => {
  it('quantizeToU8 linearly autoscales min→0, max→255', () => {
    const frame = new Float32Array([1.5, 2.5, 3.5, 4.5]);
    const out = quantizeToU8(frame);
    expect(out[0]).toBe(0);
    expect(out[3]).toBe(255);
    // Middle values land inside the range.
    expect(out[1]).toBeGreaterThan(0);
    expect(out[1]).toBeLessThan(255);
  });

  it('quantizeToU8 returns mid-gray for flat frames', () => {
    const frame = new Float32Array([2, 2, 2, 2]);
    const out = quantizeToU8(frame);
    expect([...out]).toEqual([128, 128, 128, 128]);
  });

  it('quantizeToU8 handles empty frames without crashing', () => {
    const out = quantizeToU8(new Float32Array(0));
    expect(out.length).toBe(0);
  });

  it('writeGrayscaleToImageData expands gray → RGBA with opaque alpha', () => {
    const pixels = new Uint8ClampedArray([10, 200, 50, 255]);
    // Minimal ImageData stand-in that matches the interface the helper
    // uses — avoids needing a real canvas in node env.
    const rgba = new Uint8ClampedArray(pixels.length * 4);
    const imageData = { data: rgba } as unknown as ImageData;
    writeGrayscaleToImageData(pixels, imageData);
    // Spot-check the four channels of the second pixel (value 200).
    expect(rgba[4]).toBe(200);
    expect(rgba[5]).toBe(200);
    expect(rgba[6]).toBe(200);
    expect(rgba[7]).toBe(255);
  });
});
