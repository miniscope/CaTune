import { writeNpz } from '@calab/io';
import type { AllFootprintsReply, AllTracesReply } from './archive-client.ts';

/**
 * CaLa export bundle (Phase 7 task 15). Produces an `.npz` in the
 * scipy.sparse-CSC convention so `scipy.sparse.csc_matrix` can load
 * `A` directly:
 *
 *   A = csc_matrix(
 *     (npz['A_data'], npz['A_indices'], npz['A_indptr']),
 *     shape=npz['A_shape'],
 *   )
 *
 * Plus a dense K×T trace matrix aligned on a single time axis,
 * padded with `NaN` where a given neuron had no sample at that
 * timestamp.
 *
 * Deferred: events export (JSON-in-NPZ is awkward; for now the
 * structural events live in the UI feed and the archive worker's
 * in-memory log only).
 */
export interface CalaExportInputs {
  footprints: AllFootprintsReply;
  traces: AllTracesReply;
  meta: { height: number; width: number };
}

export function buildCalaExportNpz(inputs: CalaExportInputs): Uint8Array {
  const { footprints, traces, meta } = inputs;
  const pixels = meta.height * meta.width;
  const k = footprints.ids.length;

  // Build A in CSC. Column j is neuron j; `indices[indptr[j]..indptr[j+1]]`
  // are the pixel row indices, `data[...]` are the weights.
  let totalNnz = 0;
  for (let j = 0; j < k; j += 1) totalNnz += footprints.pixelIndices[j].length;
  const aData = new Float32Array(totalNnz);
  const aIndices = new Uint32Array(totalNnz);
  const aIndptr = new Uint32Array(k + 1);
  {
    let cursor = 0;
    for (let j = 0; j < k; j += 1) {
      aIndptr[j] = cursor;
      const idx = footprints.pixelIndices[j];
      const vals = footprints.values[j];
      aIndices.set(idx, cursor);
      aData.set(vals, cursor);
      cursor += idx.length;
    }
    aIndptr[k] = cursor;
  }

  // Build dense C aligned on the union of all per-id timestamps.
  // Ids in the `traces` reply are parallel to `traces.times` /
  // `traces.values` — the footprints' `ids` list can differ (e.g. a
  // neuron may have just been born and have no trace samples yet),
  // so we re-index C by the trace reply's own id order.
  const tUnionSet = new Set<number>();
  for (const ts of traces.times) {
    for (let i = 0; i < ts.length; i += 1) tUnionSet.add(ts[i]);
  }
  const tUnion = Uint32Array.from(Array.from(tUnionSet).sort((a, b) => a - b));
  const cK = traces.ids.length;
  const cT = tUnion.length;
  // Row-major K×T with NaN sentinel for "no sample at this (id, t)".
  const cFlat = new Float32Array(cK * cT);
  cFlat.fill(Number.NaN);
  // tIndex maps t → column in cFlat. Built once.
  const tIndex = new Map<number, number>();
  for (let i = 0; i < cT; i += 1) tIndex.set(tUnion[i], i);
  for (let k2 = 0; k2 < cK; k2 += 1) {
    const times = traces.times[k2];
    const values = traces.values[k2];
    for (let i = 0; i < times.length; i += 1) {
      const col = tIndex.get(times[i]);
      if (col === undefined) continue;
      cFlat[k2 * cT + col] = values[i];
    }
  }

  const aShape = Uint32Array.of(pixels, k);
  const heightArr = Uint32Array.of(meta.height);
  const widthArr = Uint32Array.of(meta.width);

  return writeNpz({
    // Footprints, sparse CSC.
    A_data: { data: aData, shape: [aData.length] },
    A_indices: { data: aIndices, shape: [aIndices.length] },
    A_indptr: { data: aIndptr, shape: [aIndptr.length] },
    A_shape: { data: aShape, shape: [aShape.length] },
    // Footprint id list (parallel to A's columns).
    footprint_ids: { data: footprints.ids, shape: [footprints.ids.length] },
    // Traces, dense K×T with NaN gaps.
    C: { data: cFlat, shape: [cK, cT] },
    C_times: { data: tUnion, shape: [cT] },
    C_ids: { data: traces.ids, shape: [cK] },
    // Frame geometry.
    height: { data: heightArr, shape: [1] },
    width: { data: widthArr, shape: [1] },
  });
}

export function triggerDownload(npz: Uint8Array, filename: string): void {
  const blob = new Blob([npz as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
