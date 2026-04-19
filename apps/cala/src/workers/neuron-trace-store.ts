/**
 * Per-neuron rolling trace buffer (Phase 7 task 8).
 *
 * Fit emits a `trace-sample` event at vitals cadence carrying the
 * current `(ids, values)` vector. This store keeps a bounded ring
 * per id so the traces panel (task 9) can read the last N samples
 * for each live neuron without re-serializing the whole history.
 *
 * Why a new store rather than reusing `TimeseriesStore`: the named-
 * timeseries store is designed for a handful of `O(1)` metric names
 * (cell_count, fps, …) with tiered L1/L2 retention. Traces are
 * per-neuron and live-only — we don't need block-averaged history —
 * so the shape is a plain drop-oldest ring keyed by neuron id.
 */

export interface NeuronTraceStoreConfig {
  /** Ring size per neuron. Samples past this drop oldest-first. */
  capacity: number;
  /** Hard cap on distinct neuron ids (drop-oldest-inserted on overflow). */
  maxNeurons: number;
}

interface PerNeuron {
  times: Float32Array;
  values: Float32Array;
  head: number;
  count: number;
}

export interface NeuronTraceQuery {
  ids: number[];
  /** Per-id arrays in chronological order. Aligned by index to `ids`. */
  times: Float32Array[];
  values: Float32Array[];
}

function validateConfig(cfg: NeuronTraceStoreConfig): void {
  const check = (name: keyof NeuronTraceStoreConfig, v: number): void => {
    if (!Number.isInteger(v) || v < 1) {
      throw new Error(`NeuronTraceStoreConfig.${name} must be an integer ≥ 1 (got ${v})`);
    }
  };
  check('capacity', cfg.capacity);
  check('maxNeurons', cfg.maxNeurons);
}

export class NeuronTraceStore {
  private readonly cfg: NeuronTraceStoreConfig;
  private readonly byId = new Map<number, PerNeuron>();

  constructor(cfg: NeuronTraceStoreConfig) {
    validateConfig(cfg);
    this.cfg = cfg;
  }

  /** Number of ids currently tracked. */
  get size(): number {
    return this.byId.size;
  }

  /**
   * Append one sample per id from a `trace-sample` event. `ids[i]`
   * owns `values[i]`. Ids not present in this call are left untouched
   * — callers who need deprecation semantics use the neuron-event
   * index, not this store.
   */
  append(t: number, ids: ArrayLike<number>, values: ArrayLike<number>): void {
    const n = Math.min(ids.length, values.length);
    for (let i = 0; i < n; i += 1) {
      const id = ids[i];
      let entry = this.byId.get(id);
      if (!entry) {
        if (this.byId.size >= this.cfg.maxNeurons) {
          const oldest = this.byId.keys().next().value;
          if (oldest !== undefined) this.byId.delete(oldest);
        }
        entry = {
          times: new Float32Array(this.cfg.capacity),
          values: new Float32Array(this.cfg.capacity),
          head: 0,
          count: 0,
        };
        this.byId.set(id, entry);
      }
      const writeIdx = (entry.head + entry.count) % this.cfg.capacity;
      entry.times[writeIdx] = t;
      entry.values[writeIdx] = values[i];
      if (entry.count === this.cfg.capacity) {
        entry.head = (entry.head + 1) % this.cfg.capacity;
      } else {
        entry.count += 1;
      }
    }
  }

  /**
   * Snapshot the most recent samples for each currently-tracked id
   * (or the explicit `ids` filter, if passed). Both arrays in each
   * per-id entry are chronological oldest → newest.
   */
  queryAll(idFilter?: readonly number[]): NeuronTraceQuery {
    const outIds: number[] = [];
    const outTimes: Float32Array[] = [];
    const outValues: Float32Array[] = [];
    const targetIds = idFilter ?? Array.from(this.byId.keys());
    for (const id of targetIds) {
      const entry = this.byId.get(id);
      if (!entry || entry.count === 0) continue;
      outIds.push(id);
      outTimes.push(flattenRing(entry.times, entry.head, entry.count, this.cfg.capacity));
      outValues.push(flattenRing(entry.values, entry.head, entry.count, this.cfg.capacity));
    }
    return { ids: outIds, times: outTimes, values: outValues };
  }
}

function flattenRing(buf: Float32Array, head: number, count: number, cap: number): Float32Array {
  const out = new Float32Array(count);
  if (count === 0) return out;
  const tail = (head + count) % cap;
  if (tail > head) {
    out.set(buf.subarray(head, tail));
  } else {
    const firstChunk = buf.subarray(head, cap);
    out.set(firstChunk, 0);
    out.set(buf.subarray(0, tail), firstChunk.length);
  }
  return out;
}
