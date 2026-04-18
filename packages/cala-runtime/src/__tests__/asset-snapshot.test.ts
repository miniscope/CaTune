import { describe, it, expect } from 'vitest';
import {
  SnapshotProtocol,
  SnapshotTimeoutError,
  SnapshotCapacityError,
  type SnapshotAck,
  type SnapshotProtocolConfig,
} from '../asset-snapshot.ts';

const BASE_CFG: SnapshotProtocolConfig = {
  ackTimeoutMs: 50,
  pendingCapacity: 1,
  pollIntervalMs: 1,
};

function fulfil(p: SnapshotProtocol, epoch: bigint, numComponents: number, pixels: number): void {
  const req = p.pollRequest();
  expect(req).not.toBeNull();
  p.publishAck({
    requestId: req!.requestId,
    epoch,
    numComponents,
    pixels,
  });
}

describe('SnapshotProtocol config validation', () => {
  it('rejects non-positive ackTimeoutMs', () => {
    expect(() => new SnapshotProtocol({ ...BASE_CFG, ackTimeoutMs: 0 })).toThrow(/ackTimeoutMs/);
    expect(() => new SnapshotProtocol({ ...BASE_CFG, ackTimeoutMs: -1 })).toThrow(/ackTimeoutMs/);
  });

  it('rejects non-positive pendingCapacity', () => {
    expect(() => new SnapshotProtocol({ ...BASE_CFG, pendingCapacity: 0 })).toThrow(
      /pendingCapacity/,
    );
    expect(() => new SnapshotProtocol({ ...BASE_CFG, pendingCapacity: -2 })).toThrow(
      /pendingCapacity/,
    );
  });

  it('rejects non-integer pendingCapacity', () => {
    expect(() => new SnapshotProtocol({ ...BASE_CFG, pendingCapacity: 1.5 })).toThrow(
      /pendingCapacity/,
    );
  });

  it('rejects non-positive pollIntervalMs', () => {
    expect(() => new SnapshotProtocol({ ...BASE_CFG, pollIntervalMs: 0 })).toThrow(
      /pollIntervalMs/,
    );
  });
});

describe('SnapshotProtocol request / ack round-trip', () => {
  it('extend sees fit-published ack with matching correlation id', async () => {
    const p = new SnapshotProtocol(BASE_CFG);
    const pending = p.requestSnapshot();

    const req = p.pollRequest();
    expect(req).not.toBeNull();
    const ack: SnapshotAck = {
      requestId: req!.requestId,
      epoch: 7n,
      numComponents: 3,
      pixels: 64,
    };
    p.publishAck(ack);

    const got = await pending;
    expect(got.requestId).toBe(req!.requestId);
    expect(got.epoch).toBe(7n);
    expect(got.numComponents).toBe(3);
    expect(got.pixels).toBe(64);
  });

  it('correlation id is unique per request and preserved through the round-trip', async () => {
    const p = new SnapshotProtocol({ ...BASE_CFG, pendingCapacity: 4 });
    const a = p.requestSnapshot();
    const b = p.requestSnapshot();
    const c = p.requestSnapshot();

    const reqs = [p.pollRequest()!, p.pollRequest()!, p.pollRequest()!];
    const ids = reqs.map((r) => r.requestId);
    // Correlation ids are unique.
    expect(new Set(ids).size).toBe(ids.length);

    // Fit services them in a non-FIFO order to prove correlation-id binding.
    p.publishAck({ requestId: reqs[1].requestId, epoch: 11n, numComponents: 1, pixels: 8 });
    p.publishAck({ requestId: reqs[0].requestId, epoch: 10n, numComponents: 1, pixels: 8 });
    p.publishAck({ requestId: reqs[2].requestId, epoch: 12n, numComponents: 1, pixels: 8 });

    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(ra.requestId).toBe(reqs[0].requestId);
    expect(ra.epoch).toBe(10n);
    expect(rb.requestId).toBe(reqs[1].requestId);
    expect(rb.epoch).toBe(11n);
    expect(rc.requestId).toBe(reqs[2].requestId);
    expect(rc.epoch).toBe(12n);
  });
});

describe('SnapshotProtocol FIFO polling', () => {
  it('pollRequest returns requests in the order they were issued', async () => {
    const p = new SnapshotProtocol({ ...BASE_CFG, pendingCapacity: 3 });
    const promises = [p.requestSnapshot(), p.requestSnapshot(), p.requestSnapshot()];

    const r1 = p.pollRequest()!;
    const r2 = p.pollRequest()!;
    const r3 = p.pollRequest()!;
    expect(r1.requestId < r2.requestId).toBe(true);
    expect(r2.requestId < r3.requestId).toBe(true);
    expect(p.pollRequest()).toBeNull();

    p.publishAck({ requestId: r1.requestId, epoch: 1n, numComponents: 0, pixels: 0 });
    p.publishAck({ requestId: r2.requestId, epoch: 2n, numComponents: 0, pixels: 0 });
    p.publishAck({ requestId: r3.requestId, epoch: 3n, numComponents: 0, pixels: 0 });
    await Promise.all(promises);
  });
});

describe('SnapshotProtocol ack timeout', () => {
  it('rejects with SnapshotTimeoutError after ackTimeoutMs elapses with no ack', async () => {
    const p = new SnapshotProtocol({ ...BASE_CFG, ackTimeoutMs: 15 });
    const start = Date.now();
    await expect(p.requestSnapshot()).rejects.toBeInstanceOf(SnapshotTimeoutError);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(10);
    expect(p.stats().timedOut).toBe(1n);
  });

  it('late ack after timeout does not resolve the original request', async () => {
    const p = new SnapshotProtocol({ ...BASE_CFG, ackTimeoutMs: 10 });
    const pending = p.requestSnapshot();
    const req = p.pollRequest()!;

    await expect(pending).rejects.toBeInstanceOf(SnapshotTimeoutError);

    // Publishing late must be a safe no-op (no crash, no spurious fulfillment).
    expect(() =>
      p.publishAck({
        requestId: req.requestId,
        epoch: 99n,
        numComponents: 0,
        pixels: 0,
      }),
    ).not.toThrow();

    expect(p.stats().timedOut).toBe(1n);
    expect(p.stats().fulfilled).toBe(0n);
  });
});

describe('SnapshotProtocol pendingCapacity', () => {
  it('rejects requestSnapshot with SnapshotCapacityError past pendingCapacity', async () => {
    const p = new SnapshotProtocol({ ...BASE_CFG, pendingCapacity: 2, ackTimeoutMs: 1000 });
    const a = p.requestSnapshot();
    const b = p.requestSnapshot();
    await expect(p.requestSnapshot()).rejects.toBeInstanceOf(SnapshotCapacityError);

    // Drain to avoid hanging timeouts.
    fulfil(p, 1n, 0, 0);
    fulfil(p, 2n, 0, 0);
    await Promise.all([a, b]);
  });

  it('allows a new request once an in-flight one is acked', async () => {
    const p = new SnapshotProtocol({ ...BASE_CFG, pendingCapacity: 1, ackTimeoutMs: 1000 });
    const a = p.requestSnapshot();
    fulfil(p, 5n, 2, 10);
    await a;

    const b = p.requestSnapshot();
    fulfil(p, 6n, 2, 10);
    const rb = await b;
    expect(rb.epoch).toBe(6n);
  });
});

describe('SnapshotProtocol stats', () => {
  it('issued / fulfilled / timedOut counters increase monotonically', async () => {
    const p = new SnapshotProtocol({ ...BASE_CFG, pendingCapacity: 2, ackTimeoutMs: 1000 });
    expect(p.stats()).toEqual({ issued: 0n, fulfilled: 0n, timedOut: 0n });

    const a = p.requestSnapshot();
    expect(p.stats().issued).toBe(1n);
    fulfil(p, 1n, 0, 0);
    await a;
    expect(p.stats().fulfilled).toBe(1n);
    expect(p.stats().timedOut).toBe(0n);

    const b = p.requestSnapshot();
    expect(p.stats().issued).toBe(2n);
    fulfil(p, 2n, 0, 0);
    await b;
    expect(p.stats().fulfilled).toBe(2n);

    const tp = new SnapshotProtocol({ ...BASE_CFG, ackTimeoutMs: 5 });
    await expect(tp.requestSnapshot()).rejects.toBeInstanceOf(SnapshotTimeoutError);
    expect(tp.stats()).toEqual({ issued: 1n, fulfilled: 0n, timedOut: 1n });
  });
});
