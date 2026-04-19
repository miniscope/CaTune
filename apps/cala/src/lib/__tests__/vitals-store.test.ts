import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveClient, TimeseriesReply } from '../archive-client.ts';
import { resetVitals, startVitalsPolling, vitals } from '../vitals-store.ts';
import { METRIC_CELL_COUNT, METRIC_FPS } from '../vitals.ts';

function tsReply(name: string, l1: number[], l2: number[] = []): TimeseriesReply {
  return {
    name,
    l1Times: new Float32Array(l1.map((_, i) => i)),
    l1Values: new Float32Array(l1),
    l2Times: new Float32Array(l2.map((_, i) => i)),
    l2Values: new Float32Array(l2),
  };
}

function makeFakeClient(responses: Record<string, TimeseriesReply>): ArchiveClient {
  return {
    requestDump: vi.fn(),
    requestTimeseries: vi.fn(async (name: string) => {
      if (!responses[name]) throw new Error(`no canned reply for ${name}`);
      return responses[name];
    }),
    requestEventsForNeuron: vi.fn(),
    requestFootprintHistory: vi.fn(),
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    onEvent: vi.fn(() => () => {}),
    dispose: vi.fn(),
  } as unknown as ArchiveClient;
}

describe('vitals-store', () => {
  beforeEach(() => {
    resetVitals();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('populates seriesByName + latestByName from one poll cycle', async () => {
    const client = makeFakeClient({
      [METRIC_CELL_COUNT]: tsReply(METRIC_CELL_COUNT, [5, 6, 7]),
      [METRIC_FPS]: tsReply(METRIC_FPS, [30, 29, 30], [20, 25]),
    });
    const handle = startVitalsPolling(client, {
      names: [METRIC_CELL_COUNT, METRIC_FPS],
      intervalMs: 500,
      windowSamples: 100,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1);
    // A few microtask flushes for the async pollOnce() awaits.
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    expect(Array.from(vitals.seriesByName[METRIC_CELL_COUNT])).toEqual([5, 6, 7]);
    // fps merges L2 (20, 25) + L1 (30, 29, 30) in time order.
    expect(Array.from(vitals.seriesByName[METRIC_FPS])).toEqual([20, 25, 30, 29, 30]);
    expect(vitals.latestByName[METRIC_CELL_COUNT]).toBe(7);
    expect(vitals.latestByName[METRIC_FPS]).toBe(30);

    handle.stop();
  });

  it('trims the merged series to windowSamples entries', async () => {
    const manyValues = Array.from({ length: 200 }, (_, i) => i);
    const client = makeFakeClient({ [METRIC_FPS]: tsReply(METRIC_FPS, manyValues) });
    const handle = startVitalsPolling(client, {
      names: [METRIC_FPS],
      intervalMs: 500,
      windowSamples: 50,
    });
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(vitals.seriesByName[METRIC_FPS].length).toBe(50);
    // Must be the newest 50 — last element matches the tail.
    expect(vitals.seriesByName[METRIC_FPS][49]).toBe(199);
    handle.stop();
  });

  it('stop halts further polling', async () => {
    const client = makeFakeClient({ [METRIC_FPS]: tsReply(METRIC_FPS, [1]) });
    const handle = startVitalsPolling(client, {
      names: [METRIC_FPS],
      intervalMs: 100,
    });
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    handle.stop();
    const before = (client.requestTimeseries as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect((client.requestTimeseries as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before);
  });

  it('swallows rejections so a transient failure leaves earlier data intact', async () => {
    const client = makeFakeClient({ [METRIC_FPS]: tsReply(METRIC_FPS, [1, 2]) });
    const handle = startVitalsPolling(client, {
      names: [METRIC_FPS, METRIC_CELL_COUNT],
      intervalMs: 500,
    });
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    // METRIC_CELL_COUNT had no canned reply — the failure should be
    // swallowed and the successful METRIC_FPS entry should still land.
    expect(Array.from(vitals.seriesByName[METRIC_FPS])).toEqual([1, 2]);
    expect(vitals.seriesByName[METRIC_CELL_COUNT].length).toBe(0);
    handle.stop();
  });
});
