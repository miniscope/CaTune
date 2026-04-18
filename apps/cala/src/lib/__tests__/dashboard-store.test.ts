import { describe, it, expect, beforeEach } from 'vitest';
import type { PipelineEvent } from '@calab/cala-runtime';
import {
  dashboard,
  applyDump,
  recordFrameProcessed,
  resetDashboard,
  DEFAULT_EVENT_WINDOW,
} from '../dashboard-store.ts';

function birthEvent(t: number, id: number): PipelineEvent {
  return {
    kind: 'birth',
    t,
    id,
    patch: [0, 0],
    footprintSnap: {
      pixelIndices: new Uint32Array([id]),
      values: new Float32Array([1]),
    },
  };
}

function metricEvent(t: number, name: string, value: number): PipelineEvent {
  return { kind: 'metric', t, name, value };
}

describe('cala dashboard-store', () => {
  beforeEach(() => {
    resetDashboard();
  });

  it('applyDump replaces metrics and appends events with window trimming', () => {
    // Seed with a first dump of 3 events.
    applyDump({
      events: [birthEvent(1, 1), birthEvent(2, 2), birthEvent(3, 3)],
      metrics: { residual: 0.1, traces: 3 },
    });
    expect(dashboard.events.length).toBe(3);
    expect(dashboard.metrics).toEqual({ residual: 0.1, traces: 3 });
    expect(dashboard.lastDumpAt).not.toBeNull();

    // Oversized dump should be trimmed to DEFAULT_EVENT_WINDOW, keeping
    // the most recent events (from the tail).
    const big: PipelineEvent[] = [];
    for (let i = 0; i < DEFAULT_EVENT_WINDOW + 50; i += 1) {
      big.push(metricEvent(i, `m_${i}`, i));
    }
    applyDump({ events: big, metrics: { residual: 0.2 } });
    expect(dashboard.events.length).toBe(DEFAULT_EVENT_WINDOW);
    expect(dashboard.metrics).toEqual({ residual: 0.2 });

    // Tail should be the newest event from the dump, not an older one.
    const last = dashboard.events[dashboard.events.length - 1];
    expect(last.kind).toBe('metric');
    expect((last as { t: number }).t).toBe(DEFAULT_EVENT_WINDOW + 49);
  });

  it('recordFrameProcessed updates currentFrameIndex and currentEpoch atomically', () => {
    recordFrameProcessed(42, 7n);
    expect(dashboard.currentFrameIndex).toBe(42);
    expect(dashboard.currentEpoch).toBe(7n);

    recordFrameProcessed(100, 12n);
    expect(dashboard.currentFrameIndex).toBe(100);
    expect(dashboard.currentEpoch).toBe(12n);
  });

  it('resetDashboard clears events, metrics, timestamps, and frame state', () => {
    applyDump({ events: [birthEvent(1, 1)], metrics: { foo: 1 } });
    recordFrameProcessed(5, 3n);
    expect(dashboard.events.length).toBeGreaterThan(0);
    expect(dashboard.currentFrameIndex).not.toBeNull();

    resetDashboard();
    expect(dashboard.events.length).toBe(0);
    expect(dashboard.metrics).toEqual({});
    expect(dashboard.lastDumpAt).toBeNull();
    expect(dashboard.currentFrameIndex).toBeNull();
    expect(dashboard.currentEpoch).toBeNull();
  });

  it('interleaved applyDump + recordFrameProcessed do not corrupt each other', () => {
    recordFrameProcessed(1, 1n);
    applyDump({ events: [birthEvent(1, 1)], metrics: { a: 1 } });
    recordFrameProcessed(2, 2n);
    applyDump({ events: [birthEvent(2, 2)], metrics: { a: 2 } });

    expect(dashboard.currentFrameIndex).toBe(2);
    expect(dashboard.currentEpoch).toBe(2n);
    expect(dashboard.events.length).toBe(1); // latest dump
    expect(dashboard.metrics).toEqual({ a: 2 });
  });
});
