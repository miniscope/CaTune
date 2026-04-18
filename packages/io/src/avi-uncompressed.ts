/**
 * Uncompressed AVI `FrameSource` (Phase 1 input path per design §11).
 *
 * Thin JS veneer over `@calab/cala-core`'s `AviReader` — the RIFF
 * container parse, frame index, and grayscale decode all live in
 * Rust/WASM. The TS side just owns the byte buffer's lifetime and
 * bridges the `FrameSource` contract.
 *
 * Phase 5 reads the entire file into memory up-front (miniscope
 * recordings are typically in the low-hundreds-of-MB range; this
 * fits browser memory budgets). Streaming via `File.slice()` for
 * bigger files is a post-Phase-5 optimization; when it lands it
 * lives in a new `avi-uncompressed-streaming.ts` module and reuses
 * the same `FrameSource` contract so the decoder worker doesn't
 * need to change.
 */

import { AviReader, initCalaCore } from '@calab/cala-core';
import {
  FrameOutOfRangeError,
  FrameSourceParseError,
  type FrameSource,
  type FrameSourceMeta,
  type GrayscaleMethod,
} from './frame-source.ts';

/**
 * Open an uncompressed AVI as a `FrameSource`. Parses the RIFF
 * container once on construction; random-access reads are O(1)
 * thereafter.
 */
export async function openAviUncompressed(file: File): Promise<FrameSource> {
  await initCalaCore();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return openAviUncompressedFromBytes(bytes);
}

/**
 * Variant that takes the byte buffer directly. Useful for tests and
 * for the decoder worker when it reads from a handle that is not a
 * `File` (e.g. `fetch` result or a preloaded buffer).
 */
export function openAviUncompressedFromBytes(bytes: Uint8Array): FrameSource {
  let reader: AviReader | null;
  try {
    reader = new AviReader(bytes);
  } catch (e) {
    throw new FrameSourceParseError('avi-uncompressed', stringifyError(e));
  }
  const meta: FrameSourceMeta = {
    width: reader.width(),
    height: reader.height(),
    frameCount: reader.frameCount(),
    fps: reader.fps(),
    channels: reader.channels(),
    bitDepth: reader.bitDepth(),
  };

  const source: FrameSource = {
    meta: () => meta,
    async readFrame(n: number, method: GrayscaleMethod = 'Green') {
      if (reader === null) {
        throw new Error('FrameSource has been closed');
      }
      if (!Number.isInteger(n) || n < 0 || n >= meta.frameCount) {
        throw new FrameOutOfRangeError(n, meta.frameCount);
      }
      try {
        return reader.readFrameGrayscaleF32(n, method);
      } catch (e) {
        throw new FrameSourceParseError('avi-uncompressed', stringifyError(e));
      }
    },
    close() {
      if (reader !== null) {
        reader.free();
        reader = null;
      }
    },
  };
  return source;
}

function stringifyError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
