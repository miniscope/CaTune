import { describe, it, expect } from 'vitest';
import { SabRingChannel, ChannelTimeoutError } from '../channel.ts';
import type { ChannelConfig } from '../types.ts';

const BASE_CFG: ChannelConfig = {
  slotBytes: 64,
  slotCount: 4,
  waitTimeoutMs: 50,
  pollIntervalMs: 1,
};

function makePayload(size: number, seed: number): Uint8Array {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    buf[i] = (seed + i) & 0xff;
  }
  return buf;
}

describe('SabRingChannel config validation', () => {
  it('rejects non-positive slotBytes', () => {
    expect(() => new SabRingChannel({ ...BASE_CFG, slotBytes: 0 })).toThrow(/slotBytes/);
    expect(() => new SabRingChannel({ ...BASE_CFG, slotBytes: -8 })).toThrow(/slotBytes/);
  });

  it('rejects non-positive slotCount', () => {
    expect(() => new SabRingChannel({ ...BASE_CFG, slotCount: 0 })).toThrow(/slotCount/);
    expect(() => new SabRingChannel({ ...BASE_CFG, slotCount: -1 })).toThrow(/slotCount/);
  });

  it('rejects non-integer sizes', () => {
    expect(() => new SabRingChannel({ ...BASE_CFG, slotBytes: 3.5 })).toThrow(/slotBytes/);
    expect(() => new SabRingChannel({ ...BASE_CFG, slotCount: 2.2 })).toThrow(/slotCount/);
  });

  it('rejects negative waitTimeoutMs', () => {
    expect(() => new SabRingChannel({ ...BASE_CFG, waitTimeoutMs: -1 })).toThrow(/waitTimeoutMs/);
  });

  it('rejects non-positive pollIntervalMs', () => {
    expect(() => new SabRingChannel({ ...BASE_CFG, pollIntervalMs: 0 })).toThrow(/pollIntervalMs/);
  });
});

describe('SabRingChannel writeSlot + readSlot FIFO', () => {
  it('reads frames back in write order with matching epochs', () => {
    const ch = new SabRingChannel(BASE_CFG);
    const frames = [
      { data: makePayload(16, 1), epoch: 10n },
      { data: makePayload(24, 50), epoch: 11n },
      { data: makePayload(8, 100), epoch: 12n },
    ];
    for (const f of frames) ch.writeSlot(f.data, f.epoch);

    for (const expected of frames) {
      const got = ch.readSlot();
      expect(got).not.toBeNull();
      expect(got!.epoch).toBe(expected.epoch);
      expect(got!.data.length).toBe(expected.data.length);
      expect(Array.from(got!.data)).toEqual(Array.from(expected.data));
    }
    expect(ch.readSlot()).toBeNull();
  });

  it('rejects payloads larger than slotBytes', () => {
    const ch = new SabRingChannel({ ...BASE_CFG, slotBytes: 32 });
    expect(() => ch.writeSlot(makePayload(33, 0), 1n)).toThrow(/exceeds slotBytes/);
  });

  it('supports Float32Array payloads with byte-level parity', () => {
    const ch = new SabRingChannel({ ...BASE_CFG, slotBytes: 64 });
    const f32 = new Float32Array([1.5, -2.25, 3.125, 0.5]);
    ch.writeSlot(f32, 42n);

    const got = ch.readSlot();
    expect(got).not.toBeNull();
    expect(got!.epoch).toBe(42n);
    const roundTrip = new Float32Array(
      got!.data.buffer,
      got!.data.byteOffset,
      got!.data.byteLength / 4,
    );
    expect(Array.from(roundTrip)).toEqual(Array.from(f32));
  });
});

describe('SabRingChannel ring wrap', () => {
  it('wraps correctly past slotCount boundary', () => {
    const cfg: ChannelConfig = { ...BASE_CFG, slotCount: 3, slotBytes: 16 };
    const ch = new SabRingChannel(cfg);

    // Write + read enough to cross the ring boundary multiple times.
    const totalFrames = cfg.slotCount * 4 + 1;
    for (let i = 0; i < totalFrames; i++) {
      ch.writeSlot(makePayload(16, i), BigInt(i));
      const got = ch.readSlot();
      expect(got).not.toBeNull();
      expect(got!.epoch).toBe(BigInt(i));
      expect(Array.from(got!.data)).toEqual(Array.from(makePayload(16, i)));
    }
    expect(ch.readSlot()).toBeNull();
  });

  it('preserves FIFO order across a full-fill wrap', () => {
    const cfg: ChannelConfig = { ...BASE_CFG, slotCount: 3, slotBytes: 8 };
    const ch = new SabRingChannel(cfg);

    // Fill, drain, refill — exercises indices crossing slotCount.
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < cfg.slotCount; i++) {
        const seed = round * 100 + i;
        ch.writeSlot(makePayload(8, seed), BigInt(seed));
      }
      for (let i = 0; i < cfg.slotCount; i++) {
        const seed = round * 100 + i;
        const got = ch.readSlot();
        expect(got!.epoch).toBe(BigInt(seed));
        expect(Array.from(got!.data)).toEqual(Array.from(makePayload(8, seed)));
      }
    }
  });
});

describe('SabRingChannel tryWrite backpressure', () => {
  it('returns false when ring is full and does NOT increment dropCount', () => {
    const cfg: ChannelConfig = { ...BASE_CFG, slotCount: 2, slotBytes: 16 };
    const ch = new SabRingChannel(cfg);

    expect(ch.tryWrite(makePayload(8, 1), 1n)).toBe(true);
    expect(ch.tryWrite(makePayload(8, 2), 2n)).toBe(true);
    // Ring is full — third write must fail.
    expect(ch.tryWrite(makePayload(8, 3), 3n)).toBe(false);

    const stats = ch.stats();
    expect(stats.framesWritten).toBe(2);
    // The channel does NOT drop frames on backpressure — mutation queue does.
    expect(stats.dropCount).toBe(0);
    expect(stats.inFlight).toBe(2);
    expect(stats.capacity).toBe(cfg.slotCount);
  });

  it('allows writes again after consumer drains', () => {
    const cfg: ChannelConfig = { ...BASE_CFG, slotCount: 2, slotBytes: 16 };
    const ch = new SabRingChannel(cfg);

    ch.writeSlot(makePayload(8, 1), 1n);
    ch.writeSlot(makePayload(8, 2), 2n);
    expect(ch.tryWrite(makePayload(8, 3), 3n)).toBe(false);

    ch.readSlot();
    expect(ch.tryWrite(makePayload(8, 3), 3n)).toBe(true);
  });
});

describe('SabRingChannel writeSlot blocking semantics', () => {
  it('throws ChannelTimeoutError when ring stays full past waitTimeoutMs', () => {
    const cfg: ChannelConfig = {
      ...BASE_CFG,
      slotCount: 2,
      slotBytes: 16,
      waitTimeoutMs: 10,
      pollIntervalMs: 1,
    };
    const ch = new SabRingChannel(cfg);

    ch.writeSlot(makePayload(8, 1), 1n);
    ch.writeSlot(makePayload(8, 2), 2n);

    const start = Date.now();
    expect(() => ch.writeSlot(makePayload(8, 3), 3n)).toThrow(ChannelTimeoutError);
    const elapsed = Date.now() - start;
    // Should have waited at least the configured timeout.
    expect(elapsed).toBeGreaterThanOrEqual(cfg.waitTimeoutMs - 2);
  });

  it('waitRead throws ChannelTimeoutError when ring stays empty', () => {
    const cfg: ChannelConfig = { ...BASE_CFG, waitTimeoutMs: 10, pollIntervalMs: 1 };
    const ch = new SabRingChannel(cfg);

    const start = Date.now();
    expect(() => ch.waitRead()).toThrow(ChannelTimeoutError);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(cfg.waitTimeoutMs - 2);
  });

  it('waitRead returns immediately when a slot is available', () => {
    const ch = new SabRingChannel(BASE_CFG);
    ch.writeSlot(makePayload(16, 7), 77n);
    const got = ch.waitRead();
    expect(got.epoch).toBe(77n);
    expect(Array.from(got.data)).toEqual(Array.from(makePayload(16, 7)));
  });
});

describe('SabRingChannel byte-level payload parity', () => {
  it('written payload bytes are byte-identical to read bytes for every slot in a full fill', () => {
    const cfg: ChannelConfig = { ...BASE_CFG, slotCount: 8, slotBytes: 256 };
    const ch = new SabRingChannel(cfg);

    const payloads: Uint8Array[] = [];
    for (let i = 0; i < cfg.slotCount; i++) {
      const p = new Uint8Array(cfg.slotBytes);
      for (let j = 0; j < cfg.slotBytes; j++) {
        p[j] = (i * 31 + j * 7) & 0xff;
      }
      payloads.push(p);
      ch.writeSlot(p, BigInt(i));
    }

    for (let i = 0; i < cfg.slotCount; i++) {
      const got = ch.readSlot();
      expect(got).not.toBeNull();
      expect(got!.data.byteLength).toBe(cfg.slotBytes);
      // Byte-exact comparison — no serialization allowed.
      for (let j = 0; j < cfg.slotBytes; j++) {
        expect(got!.data[j]).toBe(payloads[i][j]);
      }
    }
  });
});

describe('SabRingChannel stats reporting', () => {
  it('reports running counters correctly', () => {
    const ch = new SabRingChannel(BASE_CFG);
    expect(ch.stats().framesWritten).toBe(0);
    expect(ch.stats().framesRead).toBe(0);
    expect(ch.stats().inFlight).toBe(0);
    expect(ch.stats().capacity).toBe(BASE_CFG.slotCount);

    ch.writeSlot(makePayload(8, 0), 0n);
    ch.writeSlot(makePayload(8, 0), 1n);
    expect(ch.stats().framesWritten).toBe(2);
    expect(ch.stats().inFlight).toBe(2);

    ch.readSlot();
    expect(ch.stats().framesRead).toBe(1);
    expect(ch.stats().inFlight).toBe(1);
  });
});

// TODO(task 18): real cross-worker backpressure test lands with the
// orchestrator. The timeout-based blocking tests above validate the
// semantic in a single-threaded harness; they cannot prove that an
// Atomics.wake from a sibling worker correctly unblocks the producer.
