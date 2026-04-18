import { describe, it, expect } from 'vitest';
import {
  EventBus,
  EventBusSubscriberError,
  type EventBusConfig,
  type FootprintSnap,
  type PipelineEvent,
} from '../events.ts';

const BASE_CFG: EventBusConfig = {
  capacity: 4,
  maxSubscribers: 4,
};

function snap(seed: number): FootprintSnap {
  return {
    pixelIndices: new Uint32Array([seed, seed + 1, seed + 2]),
    values: new Float32Array([seed * 0.5, seed * 0.25, seed * 0.125]),
  };
}

describe('EventBus config validation', () => {
  it('rejects non-positive capacity', () => {
    expect(() => new EventBus({ ...BASE_CFG, capacity: 0 })).toThrow(/capacity/);
    expect(() => new EventBus({ ...BASE_CFG, capacity: -1 })).toThrow(/capacity/);
  });

  it('rejects non-integer capacity', () => {
    expect(() => new EventBus({ ...BASE_CFG, capacity: 2.5 })).toThrow(/capacity/);
  });

  it('rejects non-positive maxSubscribers', () => {
    expect(() => new EventBus({ ...BASE_CFG, maxSubscribers: 0 })).toThrow(/maxSubscribers/);
    expect(() => new EventBus({ ...BASE_CFG, maxSubscribers: -2 })).toThrow(/maxSubscribers/);
  });
});

describe('EventBus publish / subscribe for all 6 PipelineEvent kinds', () => {
  it('delivers each kind unchanged to a subscriber', () => {
    const bus = new EventBus(BASE_CFG);
    const received: PipelineEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const birth: PipelineEvent = {
      kind: 'birth',
      t: 10,
      id: 1,
      patch: [128, 76],
      footprintSnap: snap(1),
    };
    const merge: PipelineEvent = {
      kind: 'merge',
      t: 12,
      ids: [2, 3],
      into: 4,
      footprintSnap: snap(2),
    };
    const split: PipelineEvent = {
      kind: 'split',
      t: 13,
      from: 4,
      into: [5, 6],
      footprintSnaps: [snap(3), snap(4)],
    };
    const deprecate: PipelineEvent = {
      kind: 'deprecate',
      t: 14,
      id: 5,
      reason: 'traceInactive',
    };
    const reject: PipelineEvent = {
      kind: 'reject',
      t: 15,
      at: [64, 32],
      reason: 'snr_below_threshold',
    };
    const metric: PipelineEvent = {
      kind: 'metric',
      t: 16,
      name: 'residual_l2',
      value: 0.0123,
    };

    const all: PipelineEvent[] = [birth, merge, split, deprecate, reject, metric];
    for (const e of all) bus.publish(e);

    expect(received.length).toBe(all.length);
    for (let i = 0; i < all.length; i++) {
      expect(received[i]).toBe(all[i]);
    }
  });
});

describe('EventBus multi-subscriber fan-out', () => {
  it('every subscriber receives every published event', () => {
    const bus = new EventBus(BASE_CFG);
    const a: PipelineEvent[] = [];
    const b: PipelineEvent[] = [];
    const c: PipelineEvent[] = [];
    bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));
    bus.subscribe((e) => c.push(e));

    const e1: PipelineEvent = { kind: 'metric', t: 1, name: 'fps', value: 60 };
    const e2: PipelineEvent = { kind: 'metric', t: 2, name: 'fps', value: 59 };
    bus.publish(e1);
    bus.publish(e2);

    expect(a).toEqual([e1, e2]);
    expect(b).toEqual([e1, e2]);
    expect(c).toEqual([e1, e2]);
  });

  it('unsubscribe stops further delivery to that subscriber only', () => {
    const bus = new EventBus(BASE_CFG);
    const a: PipelineEvent[] = [];
    const b: PipelineEvent[] = [];
    const unsubA = bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));

    const e1: PipelineEvent = { kind: 'metric', t: 1, name: 'fps', value: 30 };
    bus.publish(e1);
    unsubA();
    const e2: PipelineEvent = { kind: 'metric', t: 2, name: 'fps', value: 30 };
    bus.publish(e2);

    expect(a).toEqual([e1]);
    expect(b).toEqual([e1, e2]);
  });

  it('throws EventBusSubscriberError past maxSubscribers', () => {
    const bus = new EventBus({ ...BASE_CFG, maxSubscribers: 2 });
    bus.subscribe(() => {});
    bus.subscribe(() => {});
    expect(() => bus.subscribe(() => {})).toThrow(EventBusSubscriberError);
  });

  it('unsubscribing frees a slot', () => {
    const bus = new EventBus({ ...BASE_CFG, maxSubscribers: 2 });
    const u1 = bus.subscribe(() => {});
    bus.subscribe(() => {});
    expect(() => bus.subscribe(() => {})).toThrow(EventBusSubscriberError);
    u1();
    expect(() => bus.subscribe(() => {})).not.toThrow();
  });

  it('calling an unsubscribe twice is a safe no-op', () => {
    const bus = new EventBus(BASE_CFG);
    const u = bus.subscribe(() => {});
    u();
    expect(() => u()).not.toThrow();
  });
});

describe('EventBus drop-oldest under pressure', () => {
  it('drops oldest events when no subscriber drains, drops counter increments', () => {
    const cfg: EventBusConfig = { capacity: 4, maxSubscribers: 4 };
    const bus = new EventBus(cfg);

    const total = cfg.capacity + 3;
    for (let i = 0; i < total; i++) {
      bus.publish({ kind: 'metric', t: i, name: 'fps', value: i });
    }
    expect(bus.stats().drops).toBe(3n);

    // Subscribing after the drops does NOT replay buffered events —
    // hot stream semantics, history isn't recoverable. We still check
    // that drops is queryable and monotonic.
    bus.subscribe(() => {});
    expect(bus.stats().drops).toBe(3n);
    bus.publish({ kind: 'metric', t: 100, name: 'fps', value: 100 });
    expect(bus.stats().drops).toBe(3n);
  });

  it('published counter increments on every publish regardless of drops', () => {
    const bus = new EventBus({ capacity: 2, maxSubscribers: 4 });
    for (let i = 0; i < 5; i++) {
      bus.publish({ kind: 'metric', t: i, name: 'fps', value: i });
    }
    expect(bus.stats().published).toBe(5n);
    expect(bus.stats().drops).toBe(3n);
  });
});

describe('EventBus close()', () => {
  it('drops all subscribers and subsequent publish is a no-op', () => {
    const bus = new EventBus(BASE_CFG);
    const received: PipelineEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.publish({ kind: 'metric', t: 1, name: 'fps', value: 60 });
    expect(received.length).toBe(1);

    bus.close();
    bus.publish({ kind: 'metric', t: 2, name: 'fps', value: 60 });
    expect(received.length).toBe(1);
  });

  it('publish after close does not count toward published or drops', () => {
    const bus = new EventBus(BASE_CFG);
    bus.publish({ kind: 'metric', t: 1, name: 'fps', value: 60 });
    const published = bus.stats().published;
    bus.close();
    bus.publish({ kind: 'metric', t: 2, name: 'fps', value: 60 });
    expect(bus.stats().published).toBe(published);
  });

  it('re-subscribing after close throws', () => {
    const bus = new EventBus(BASE_CFG);
    bus.close();
    expect(() => bus.subscribe(() => {})).toThrow(EventBusSubscriberError);
  });
});

describe('FootprintSnap byte parity', () => {
  it('pixelIndices and values arrive byte-exact at the subscriber', () => {
    const bus = new EventBus(BASE_CFG);
    const pixels = new Uint32Array([3, 11, 42, 99, 1024]);
    const values = new Float32Array([-1.5, 0.0, 0.25, 3.125, -128.5]);
    const e: PipelineEvent = {
      kind: 'birth',
      t: 5,
      id: 7,
      patch: [8, 8],
      footprintSnap: { pixelIndices: pixels, values },
    };

    let got: PipelineEvent | null = null;
    bus.subscribe((ev) => {
      got = ev;
    });
    bus.publish(e);

    expect(got).not.toBeNull();
    const ev = got as unknown as Extract<PipelineEvent, { kind: 'birth' }>;
    const gotIdx = ev.footprintSnap.pixelIndices;
    const gotVals = ev.footprintSnap.values;

    expect(gotIdx.length).toBe(pixels.length);
    for (let i = 0; i < pixels.length; i++) {
      expect(gotIdx[i]).toBe(pixels[i]);
    }
    expect(gotVals.length).toBe(values.length);
    for (let i = 0; i < values.length; i++) {
      expect(gotVals[i]).toBe(values[i]);
    }
  });
});
