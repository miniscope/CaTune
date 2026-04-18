import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FrameOutOfRangeError, FrameSourceParseError } from '../frame-source.ts';

// We mock `@calab/cala-core` so the test suite runs in Node without
// needing the WASM artifact loaded. The contract we're exercising is
// the TS wrapper: error shapes, meta forwarding, argument forwarding,
// and close() lifecycle. The real WASM execution is covered in the
// Phase 5 exit browser E2E (task 25).

interface StubAviReaderState {
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  channels: number;
  bitDepth: number;
  freed: boolean;
  readCalls: Array<{ n: number; method: string }>;
  /** If set, `new AviReader(...)` throws this. */
  constructorThrow?: unknown;
  /** If set, `readFrameGrayscaleF32` throws this. */
  readThrow?: unknown;
}

const state: StubAviReaderState = {
  width: 4,
  height: 3,
  frameCount: 5,
  fps: 30,
  channels: 1,
  bitDepth: 8,
  freed: false,
  readCalls: [],
};

class StubAviReader {
  constructor(_bytes: Uint8Array) {
    if (state.constructorThrow !== undefined) {
      throw state.constructorThrow;
    }
  }
  width() {
    return state.width;
  }
  height() {
    return state.height;
  }
  frameCount() {
    return state.frameCount;
  }
  fps() {
    return state.fps;
  }
  channels() {
    return state.channels;
  }
  bitDepth() {
    return state.bitDepth;
  }
  readFrameGrayscaleF32(n: number, method: string): Float32Array {
    state.readCalls.push({ n, method });
    if (state.readThrow !== undefined) {
      throw state.readThrow;
    }
    const out = new Float32Array(state.width * state.height);
    // Deterministic payload so tests can assert the call delegated.
    for (let i = 0; i < out.length; i++) {
      out[i] = n * 100 + i;
    }
    return out;
  }
  free() {
    state.freed = true;
  }
}

const initSpy = vi.fn(async () => undefined);

vi.mock('@calab/cala-core', () => ({
  AviReader: StubAviReader,
  initCalaCore: initSpy,
}));

// Import after the mock is registered.
const { openAviUncompressed, openAviUncompressedFromBytes } =
  await import('../avi-uncompressed.ts');

function resetState() {
  state.width = 4;
  state.height = 3;
  state.frameCount = 5;
  state.fps = 30;
  state.channels = 1;
  state.bitDepth = 8;
  state.freed = false;
  state.readCalls = [];
  state.constructorThrow = undefined;
  state.readThrow = undefined;
  initSpy.mockClear();
}

describe('openAviUncompressedFromBytes', () => {
  beforeEach(resetState);

  it('forwards metadata from the WASM reader', () => {
    state.width = 256;
    state.height = 128;
    state.frameCount = 300;
    state.fps = 20;
    state.channels = 3;
    state.bitDepth = 24;
    const source = openAviUncompressedFromBytes(new Uint8Array([1, 2, 3]));
    expect(source.meta()).toEqual({
      width: 256,
      height: 128,
      frameCount: 300,
      fps: 20,
      channels: 3,
      bitDepth: 24,
    });
  });

  it('delegates readFrame to the WASM reader with the requested method', async () => {
    const source = openAviUncompressedFromBytes(new Uint8Array([1]));
    const frame0 = await source.readFrame(0);
    const frame2 = await source.readFrame(2, 'Luminance');
    expect(state.readCalls).toEqual([
      { n: 0, method: 'Green' },
      { n: 2, method: 'Luminance' },
    ]);
    expect(frame0.length).toBe(state.width * state.height);
    expect(frame2[0]).toBe(200); // n=2, i=0 → 2*100+0
  });

  it('throws FrameOutOfRangeError for negative or too-large indices', async () => {
    const source = openAviUncompressedFromBytes(new Uint8Array([1]));
    await expect(source.readFrame(-1)).rejects.toBeInstanceOf(FrameOutOfRangeError);
    await expect(source.readFrame(state.frameCount)).rejects.toBeInstanceOf(FrameOutOfRangeError);
    await expect(source.readFrame(1.5)).rejects.toBeInstanceOf(FrameOutOfRangeError);
  });

  it('throws FrameSourceParseError when the WASM reader refuses the buffer', () => {
    state.constructorThrow = 'cala-core avi: {Truncated("top-level chunk")}';
    expect(() => openAviUncompressedFromBytes(new Uint8Array([0]))).toThrow(FrameSourceParseError);
  });

  it('wraps read-side WASM errors as FrameSourceParseError', async () => {
    const source = openAviUncompressedFromBytes(new Uint8Array([1]));
    state.readThrow = new Error('decode blew up');
    await expect(source.readFrame(0)).rejects.toBeInstanceOf(FrameSourceParseError);
  });

  it('close() frees the underlying WASM handle and blocks further reads', async () => {
    const source = openAviUncompressedFromBytes(new Uint8Array([1]));
    source.close();
    expect(state.freed).toBe(true);
    await expect(source.readFrame(0)).rejects.toThrow(/closed/);
  });

  it('close() is idempotent — second call is a no-op', () => {
    const source = openAviUncompressedFromBytes(new Uint8Array([1]));
    source.close();
    state.freed = false; // Reset flag; second close must not set it again.
    source.close();
    expect(state.freed).toBe(false);
  });
});

describe('openAviUncompressed', () => {
  beforeEach(resetState);

  it('awaits initCalaCore before constructing the reader', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'test.avi');
    const source = await openAviUncompressed(file);
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(source.meta().width).toBe(state.width);
    source.close();
  });

  it('reads the full file contents through File.arrayBuffer()', async () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50]);
    const file = new File([bytes], 'test.avi');
    const source = await openAviUncompressed(file);
    expect(source.meta()).toBeDefined();
    source.close();
  });
});
