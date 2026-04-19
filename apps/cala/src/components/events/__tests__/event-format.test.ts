import { describe, expect, it } from 'vitest';
import type { PipelineEvent } from '@calab/cala-runtime';
import { describeEvent, idForEvent } from '../event-format.ts';

function emptySnap(): { pixelIndices: Uint32Array; values: Float32Array } {
  return { pixelIndices: new Uint32Array(), values: new Float32Array() };
}

describe('describeEvent', () => {
  it('formats birth with patch coordinates', () => {
    const e: PipelineEvent = {
      kind: 'birth',
      t: 1,
      id: 7,
      patch: [12, 34],
      footprintSnap: emptySnap(),
    };
    expect(describeEvent(e)).toBe('born @(12,34)');
  });

  it('formats merge as "ids → into"', () => {
    const e: PipelineEvent = {
      kind: 'merge',
      t: 1,
      ids: [3, 4],
      into: 3,
      footprintSnap: emptySnap(),
    };
    expect(describeEvent(e)).toBe('3+4 → 3');
  });

  it('formats split as "from → [children]"', () => {
    const e: PipelineEvent = {
      kind: 'split',
      t: 1,
      from: 9,
      into: [10, 11],
      footprintSnaps: [emptySnap(), emptySnap()],
    };
    expect(describeEvent(e)).toBe('9 → [10,11]');
  });

  it('formats metric with name=value(3dp)', () => {
    const e: PipelineEvent = { kind: 'metric', t: 1, name: 'fps', value: 30.1234 };
    expect(describeEvent(e)).toBe('fps=30.123');
  });

  it('formats footprint-snapshot with pixel count', () => {
    const e: PipelineEvent = {
      kind: 'footprint-snapshot',
      t: 1,
      neuronId: 5,
      footprint: { pixelIndices: new Uint32Array([1, 2, 3]), values: new Float32Array(3) },
    };
    expect(describeEvent(e)).toBe('id=5 (3px)');
  });

  it('formats reject with coordinates + reason', () => {
    const e: PipelineEvent = {
      kind: 'reject',
      t: 1,
      at: [4, 8],
      reason: 'low-snr',
    };
    expect(describeEvent(e)).toBe('@(4,8): low-snr');
  });

  it('formats deprecate with its reason', () => {
    const e: PipelineEvent = { kind: 'deprecate', t: 1, id: 5, reason: 'traceInactive' };
    expect(describeEvent(e)).toBe('traceInactive');
  });
});

describe('idForEvent', () => {
  it('returns the survivor id for merge with the arrow prefix', () => {
    const e: PipelineEvent = {
      kind: 'merge',
      t: 1,
      ids: [1, 2],
      into: 1,
      footprintSnap: emptySnap(),
    };
    expect(idForEvent(e)).toBe('→ #1');
  });

  it('returns the source id for split with trailing arrow', () => {
    const e: PipelineEvent = {
      kind: 'split',
      t: 1,
      from: 9,
      into: [10],
      footprintSnaps: [emptySnap()],
    };
    expect(idForEvent(e)).toBe('#9 →');
  });

  it('returns an empty string for metric + reject events', () => {
    expect(idForEvent({ kind: 'metric', t: 1, name: 'x', value: 0 })).toBe('');
    expect(idForEvent({ kind: 'reject', t: 1, at: [0, 0], reason: 'x' })).toBe('');
  });
});
