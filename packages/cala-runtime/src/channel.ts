import type { ChannelConfig, ChannelSlot, ChannelStats } from './types.ts';

const HEADER_I32_COUNT = 4;
const HEADER_WRITE_IDX = 0;
const HEADER_READ_IDX = 1;
const HEADER_FRAMES_WRITTEN = 2;
const HEADER_FRAMES_READ = 3;

const SLOT_HEADER_I32_COUNT = 3;
const SLOT_EPOCH_LO = 0;
const SLOT_EPOCH_HI = 1;
const SLOT_LENGTH = 2;

const BYTES_PER_I32 = 4;
const HEADER_BYTES = HEADER_I32_COUNT * BYTES_PER_I32;
const SLOT_HEADER_BYTES = SLOT_HEADER_I32_COUNT * BYTES_PER_I32;

const U32_MASK = 0xffffffff;
const EPOCH_LO_MASK = 0xffffffffn;
const EPOCH_HI_SHIFT = 32n;

export class ChannelTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChannelTimeoutError';
  }
}

function validateConfig(cfg: ChannelConfig): void {
  if (!Number.isInteger(cfg.slotBytes) || cfg.slotBytes <= 0) {
    throw new Error(`ChannelConfig.slotBytes must be a positive integer (got ${cfg.slotBytes})`);
  }
  if (!Number.isInteger(cfg.slotCount) || cfg.slotCount <= 0) {
    throw new Error(`ChannelConfig.slotCount must be a positive integer (got ${cfg.slotCount})`);
  }
  if (!Number.isFinite(cfg.waitTimeoutMs) || cfg.waitTimeoutMs < 0) {
    throw new Error(
      `ChannelConfig.waitTimeoutMs must be a non-negative number (got ${cfg.waitTimeoutMs})`,
    );
  }
  if (!Number.isFinite(cfg.pollIntervalMs) || cfg.pollIntervalMs <= 0) {
    throw new Error(
      `ChannelConfig.pollIntervalMs must be a positive number (got ${cfg.pollIntervalMs})`,
    );
  }
}

function computeByteLength(cfg: ChannelConfig): number {
  const slotStride = SLOT_HEADER_BYTES + cfg.slotBytes;
  return HEADER_BYTES + slotStride * cfg.slotCount;
}

function coerceToUint8(data: Uint8Array | Float32Array | ArrayBufferView): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export class SabRingChannel {
  private readonly cfg: ChannelConfig;
  private readonly buffer: SharedArrayBuffer | ArrayBuffer;
  private readonly header: Int32Array;
  private readonly slotStrideBytes: number;
  private readonly payloadView: Uint8Array;
  private readonly canAtomicWait: boolean;

  constructor(cfg: ChannelConfig) {
    validateConfig(cfg);
    this.cfg = cfg;
    this.slotStrideBytes = SLOT_HEADER_BYTES + cfg.slotBytes;

    const required = computeByteLength(cfg);
    if (cfg.sharedBuffer) {
      if (cfg.sharedBuffer.byteLength < required) {
        throw new Error(
          `ChannelConfig.sharedBuffer byteLength ${cfg.sharedBuffer.byteLength} < required ${required}`,
        );
      }
      this.buffer = cfg.sharedBuffer;
    } else {
      this.buffer =
        typeof SharedArrayBuffer !== 'undefined'
          ? new SharedArrayBuffer(required)
          : new ArrayBuffer(required);
    }

    this.header = new Int32Array(this.buffer, 0, HEADER_I32_COUNT);
    this.payloadView = new Uint8Array(this.buffer, HEADER_BYTES, required - HEADER_BYTES);
    this.canAtomicWait = this.buffer instanceof SharedArrayBuffer;
  }

  get sharedBuffer(): SharedArrayBuffer | ArrayBuffer {
    return this.buffer;
  }

  tryWrite(data: Uint8Array | Float32Array, epoch: bigint): boolean {
    const payload = coerceToUint8(data);
    if (payload.byteLength > this.cfg.slotBytes) {
      throw new Error(
        `payload byteLength ${payload.byteLength} exceeds slotBytes ${this.cfg.slotBytes}`,
      );
    }

    const writeIdx = Atomics.load(this.header, HEADER_WRITE_IDX) >>> 0;
    const readIdx = Atomics.load(this.header, HEADER_READ_IDX) >>> 0;
    if (((writeIdx - readIdx) & U32_MASK) >= this.cfg.slotCount) {
      return false;
    }

    this.writeIntoSlot(writeIdx, payload, epoch);
    const nextWrite = (writeIdx + 1) & U32_MASK;
    Atomics.store(this.header, HEADER_WRITE_IDX, nextWrite | 0);
    const nextFramesWritten = (Atomics.load(this.header, HEADER_FRAMES_WRITTEN) + 1) | 0;
    Atomics.store(this.header, HEADER_FRAMES_WRITTEN, nextFramesWritten);
    if (this.canAtomicWait) {
      Atomics.notify(this.header, HEADER_WRITE_IDX);
    }
    return true;
  }

  writeSlot(data: Uint8Array | Float32Array, epoch: bigint): void {
    if (this.tryWrite(data, epoch)) return;

    const deadline = Date.now() + this.cfg.waitTimeoutMs;
    while (Date.now() < deadline) {
      const readIdx = Atomics.load(this.header, HEADER_READ_IDX) >>> 0;
      const writeIdx = Atomics.load(this.header, HEADER_WRITE_IDX) >>> 0;
      if (((writeIdx - readIdx) & U32_MASK) < this.cfg.slotCount) {
        if (this.tryWrite(data, epoch)) return;
        continue;
      }
      if (this.canAtomicWait) {
        const remaining = Math.max(0, deadline - Date.now());
        const timeout = Math.min(remaining, this.cfg.pollIntervalMs);
        Atomics.wait(this.header, HEADER_READ_IDX, readIdx | 0, timeout);
      } else {
        this.busyWaitMs(this.cfg.pollIntervalMs);
      }
    }

    throw new ChannelTimeoutError(
      `SabRingChannel.writeSlot: ring full for ${this.cfg.waitTimeoutMs}ms`,
    );
  }

  readSlot(): ChannelSlot | null {
    const writeIdx = Atomics.load(this.header, HEADER_WRITE_IDX) >>> 0;
    const readIdx = Atomics.load(this.header, HEADER_READ_IDX) >>> 0;
    if (writeIdx === readIdx) return null;

    const slot = this.readFromSlot(readIdx);
    const nextRead = (readIdx + 1) & U32_MASK;
    Atomics.store(this.header, HEADER_READ_IDX, nextRead | 0);
    const nextFramesRead = (Atomics.load(this.header, HEADER_FRAMES_READ) + 1) | 0;
    Atomics.store(this.header, HEADER_FRAMES_READ, nextFramesRead);
    if (this.canAtomicWait) {
      Atomics.notify(this.header, HEADER_READ_IDX);
    }
    return slot;
  }

  waitRead(): ChannelSlot {
    const immediate = this.readSlot();
    if (immediate !== null) return immediate;

    const deadline = Date.now() + this.cfg.waitTimeoutMs;
    while (Date.now() < deadline) {
      const writeIdx = Atomics.load(this.header, HEADER_WRITE_IDX) >>> 0;
      const readIdx = Atomics.load(this.header, HEADER_READ_IDX) >>> 0;
      if (writeIdx !== readIdx) {
        const slot = this.readSlot();
        if (slot !== null) return slot;
        continue;
      }
      if (this.canAtomicWait) {
        const remaining = Math.max(0, deadline - Date.now());
        const timeout = Math.min(remaining, this.cfg.pollIntervalMs);
        Atomics.wait(this.header, HEADER_WRITE_IDX, writeIdx | 0, timeout);
      } else {
        this.busyWaitMs(this.cfg.pollIntervalMs);
      }
    }

    throw new ChannelTimeoutError(
      `SabRingChannel.waitRead: ring empty for ${this.cfg.waitTimeoutMs}ms`,
    );
  }

  stats(): ChannelStats {
    const framesWritten = Atomics.load(this.header, HEADER_FRAMES_WRITTEN) >>> 0;
    const framesRead = Atomics.load(this.header, HEADER_FRAMES_READ) >>> 0;
    const writeIdx = Atomics.load(this.header, HEADER_WRITE_IDX) >>> 0;
    const readIdx = Atomics.load(this.header, HEADER_READ_IDX) >>> 0;
    return {
      framesWritten,
      framesRead,
      dropCount: 0,
      capacity: this.cfg.slotCount,
      inFlight: (writeIdx - readIdx) & U32_MASK,
    };
  }

  private writeIntoSlot(writeIdx: number, payload: Uint8Array, epoch: bigint): void {
    const slotIndex = writeIdx % this.cfg.slotCount;
    const slotOffset = slotIndex * this.slotStrideBytes;
    const slotHeader = new Int32Array(
      this.buffer,
      HEADER_BYTES + slotOffset,
      SLOT_HEADER_I32_COUNT,
    );
    const epochLo = Number(epoch & EPOCH_LO_MASK) | 0;
    const epochHi = Number((epoch >> EPOCH_HI_SHIFT) & EPOCH_LO_MASK) | 0;
    slotHeader[SLOT_EPOCH_LO] = epochLo;
    slotHeader[SLOT_EPOCH_HI] = epochHi;
    slotHeader[SLOT_LENGTH] = payload.byteLength | 0;

    const payloadStart = slotOffset + SLOT_HEADER_BYTES;
    this.payloadView.set(payload, payloadStart);
  }

  private readFromSlot(readIdx: number): ChannelSlot {
    const slotIndex = readIdx % this.cfg.slotCount;
    const slotOffset = slotIndex * this.slotStrideBytes;
    const slotHeader = new Int32Array(
      this.buffer,
      HEADER_BYTES + slotOffset,
      SLOT_HEADER_I32_COUNT,
    );
    const epochLo = BigInt(slotHeader[SLOT_EPOCH_LO] >>> 0);
    const epochHi = BigInt(slotHeader[SLOT_EPOCH_HI] >>> 0);
    const epoch = (epochHi << EPOCH_HI_SHIFT) | epochLo;
    const length = slotHeader[SLOT_LENGTH] >>> 0;

    const payloadStart = HEADER_BYTES + slotOffset + SLOT_HEADER_BYTES;
    const copy = new Uint8Array(length);
    copy.set(new Uint8Array(this.buffer, payloadStart, length));
    return { data: copy, epoch };
  }

  private busyWaitMs(ms: number): void {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      // spin — only reached when SAB is unavailable (non-worker env fallback)
    }
  }
}
