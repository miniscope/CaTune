/**
 * `FrameSource` is the extension point the CaLa decoder worker reads
 * from (design §10). Phase 5 ships one concrete implementation —
 * uncompressed AVI (`avi-uncompressed.ts`). Post-v1 formats (TIFF,
 * compressed AVI via WebCodecs, MP4/HEVC) plug in here without the
 * pipeline caring which parser produced a frame.
 */

export type GrayscaleMethod = 'Green' | 'Luminance';

/** Structural properties of a recording that don't vary per frame. */
export interface FrameSourceMeta {
  /** Frame width in pixels. */
  width: number;
  /** Frame height in pixels. */
  height: number;
  /** Total number of frames in the source. */
  frameCount: number;
  /** Frames per second declared by the container, or `0` if unknown. */
  fps: number;
  /** Channel count per pixel (1 for grayscale, 3 for BGR, etc). */
  channels: number;
  /** Container-reported bit depth (8 or 24 for Phase 1 AVI). */
  bitDepth: number;
}

/**
 * Provides random-access reads of grayscale frames. Implementations
 * own the underlying buffer / handle and free it on `close()`. Callers
 * must treat the returned `Float32Array` as read-only and not alias
 * its storage across reads — some implementations reuse scratch
 * memory and will overwrite on the next call.
 */
export interface FrameSource {
  meta(): FrameSourceMeta;
  /**
   * Decode frame `n` to an `f32` grayscale buffer of length
   * `width·height`. `method` picks the 24-bit→grayscale reduction
   * (ignored for 8-bit streams). Defaults to `'Green'` — the
   * pragmatic choice for miniscope recorders where the real signal
   * lives on the green channel.
   */
  readFrame(n: number, method?: GrayscaleMethod): Promise<Float32Array>;
  /** Release any underlying resources (WASM handles, file buffers). */
  close(): void;
}

/** Surfaced when a frame index is outside `[0, frameCount)`. */
export class FrameOutOfRangeError extends Error {
  constructor(
    public readonly index: number,
    public readonly frameCount: number,
  ) {
    super(`frame index ${index} out of range [0, ${frameCount})`);
    this.name = 'FrameOutOfRangeError';
  }
}

/** Surfaced when the source could not be parsed or opened. */
export class FrameSourceParseError extends Error {
  constructor(
    public readonly format: string,
    message: string,
  ) {
    super(`${format}: ${message}`);
    this.name = 'FrameSourceParseError';
  }
}
