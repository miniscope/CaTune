// .npz writer — inverse of npz-parser.ts.
//
// An .npz file is a ZIP archive where each entry is a .npy file. We
// use fflate's `zipSync` for synchronous zipping (matches the
// parser's `unzipSync`) so callers get a single `Uint8Array` back
// without worrying about async plumbing.

import { zipSync } from 'fflate';
import { writeNpy } from './npy-writer.ts';

export type NpzWritableArray = Float32Array | Uint32Array | Int32Array;

/**
 * Write a dict of named typed arrays as a .npz archive.
 *
 * @param arrays - Map from array name (without .npy extension) to
 *   `{ data, shape }`. Each array gets serialized to .npy via
 *   `writeNpy` and added to the zip under `<name>.npy`.
 * @returns Uint8Array containing the complete .npz archive.
 */
export function writeNpz(
  arrays: Record<string, { data: NpzWritableArray; shape: number[] }>,
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, { data, shape }] of Object.entries(arrays)) {
    const npy = writeNpy(data, shape);
    entries[`${name}.npy`] = new Uint8Array(npy);
  }
  return zipSync(entries);
}
