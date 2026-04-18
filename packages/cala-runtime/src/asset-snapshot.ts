/**
 * Asset snapshot protocol (design §7.2, Phase 5 Task 17).
 *
 * Extend requests a consistent view of `(Ã, W, M, epoch)`; fit
 * publishes it at the next frame boundary with the captured epoch
 * stamped into the ack. Each request carries a correlation id so fit
 * can service requests out-of-order (useful when a later request
 * happens to coincide with a frame boundary sooner than an earlier
 * one).
 *
 * This module is the TS control-layer plumbing only. The real
 * SAB-backed request / ack transport lands with the orchestrator in
 * Task 18 — the public API here is stable across that swap.
 */

// TODO(task 18): swap in SAB-backed transport. The public shape
// (`requestSnapshot` / `pollRequest` / `publishAck` / `stats`) stays
// identical; internals become two Atomics-backed control slots.

/** Payload the extend side receives when fit acks a snapshot request. */
export interface SnapshotAck {
  requestId: number;
  epoch: bigint;
  numComponents: number;
  pixels: number;
}

/** Metadata the fit side reads off a pending snapshot request. */
export interface SnapshotRequest {
  requestId: number;
}

/** Running counters surfaced to dashboard metrics. */
export interface SnapshotProtocolStats {
  issued: bigint;
  fulfilled: bigint;
  timedOut: bigint;
}

export interface SnapshotProtocolConfig {
  /** How long extend waits for fit's ack before giving up. */
  ackTimeoutMs: number;
  /**
   * How many in-flight snapshot requests are allowed at once. Design
   * §7.2 says extend proceeds one snapshot at a time, so the typical
   * value is 1; keep it configurable per project convention so tests
   * and two-pass mode can raise it.
   */
  pendingCapacity: number;
  /** Internal timeout-sweep granularity. Must be ≤ ackTimeoutMs. */
  pollIntervalMs: number;
}

export class SnapshotTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotTimeoutError';
  }
}

export class SnapshotCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotCapacityError';
  }
}

interface PendingEntry {
  requestId: number;
  issuedAtMs: number;
  resolve: (ack: SnapshotAck) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function validateConfig(cfg: SnapshotProtocolConfig): void {
  if (!Number.isFinite(cfg.ackTimeoutMs) || cfg.ackTimeoutMs <= 0) {
    throw new Error(
      `SnapshotProtocolConfig.ackTimeoutMs must be a positive number (got ${cfg.ackTimeoutMs})`,
    );
  }
  if (!Number.isInteger(cfg.pendingCapacity) || cfg.pendingCapacity < 1) {
    throw new Error(
      `SnapshotProtocolConfig.pendingCapacity must be an integer ≥ 1 (got ${cfg.pendingCapacity})`,
    );
  }
  if (!Number.isFinite(cfg.pollIntervalMs) || cfg.pollIntervalMs <= 0) {
    throw new Error(
      `SnapshotProtocolConfig.pollIntervalMs must be a positive number (got ${cfg.pollIntervalMs})`,
    );
  }
}

export class SnapshotProtocol {
  private readonly cfg: SnapshotProtocolConfig;
  private readonly pending = new Map<number, PendingEntry>();
  private readonly queue: SnapshotRequest[] = [];
  private nextId = 1;
  private issuedCount = 0n;
  private fulfilledCount = 0n;
  private timedOutCount = 0n;

  constructor(cfg: SnapshotProtocolConfig) {
    validateConfig(cfg);
    this.cfg = cfg;
  }

  /**
   * Extend side. Resolves with a {@link SnapshotAck} once fit has
   * published one; rejects with {@link SnapshotTimeoutError} if no ack
   * arrives within `ackTimeoutMs`; rejects with
   * {@link SnapshotCapacityError} if `pendingCapacity` would be
   * exceeded.
   */
  requestSnapshot(): Promise<SnapshotAck> {
    if (this.pending.size >= this.cfg.pendingCapacity) {
      return Promise.reject(
        new SnapshotCapacityError(
          `pendingCapacity ${this.cfg.pendingCapacity} exceeded (${this.pending.size} in flight)`,
        ),
      );
    }

    const requestId = this.nextId++;
    this.issuedCount += 1n;

    return new Promise<SnapshotAck>((resolve, reject) => {
      const timer = setTimeout(() => {
        const entry = this.pending.get(requestId);
        if (!entry) return;
        this.pending.delete(requestId);
        this.timedOutCount += 1n;
        entry.reject(
          new SnapshotTimeoutError(
            `snapshot request ${requestId} timed out after ${this.cfg.ackTimeoutMs}ms`,
          ),
        );
      }, this.cfg.ackTimeoutMs);

      this.pending.set(requestId, {
        requestId,
        issuedAtMs: Date.now(),
        resolve,
        reject,
        timer,
      });
      this.queue.push({ requestId });
    });
  }

  /** Fit side. Returns the oldest pending request, or `null` if none. */
  pollRequest(): SnapshotRequest | null {
    return this.queue.shift() ?? null;
  }

  /**
   * Fit side. Publishes the result of a snapshot capture. A late ack
   * for a request that has already timed out is silently dropped —
   * matches the real SAB transport where fit has no way to observe
   * extend's timeout.
   */
  publishAck(ack: SnapshotAck): void {
    const entry = this.pending.get(ack.requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(ack.requestId);
    this.fulfilledCount += 1n;
    entry.resolve(ack);
  }

  stats(): SnapshotProtocolStats {
    return {
      issued: this.issuedCount,
      fulfilled: this.fulfilledCount,
      timedOut: this.timedOutCount,
    };
  }
}
