// NpzArraySelector - Shown when .npz has multiple 2D arrays
// Lets user select which array to use for traces

import { For, Show, createMemo } from 'solid-js';
import type { NpyResult } from '../lib/types.ts';
import {
  npzArrays,
  setParsedData,
  setSelectedNpzArray,
  setImportError,
} from '../lib/data-store.ts';
import { transposeFortranToC } from '../lib/array-utils.ts';

function processNpyResult(result: NpyResult): NpyResult {
  if (result.fortranOrder && result.shape.length === 2) {
    const [rows, cols] = result.shape;
    const transposed = transposeFortranToC(result.data, rows, cols);
    return { ...result, data: transposed, fortranOrder: false };
  }
  return result;
}

export function NpzArraySelector() {
  const twoDArrays = createMemo(() => {
    const npz = npzArrays();
    if (!npz) return [];
    return npz.arrayNames
      .filter(name => npz.arrays[name].shape.length === 2)
      .map(name => ({
        name,
        shape: npz.arrays[name].shape,
        dtype: npz.arrays[name].dtype,
      }));
  });

  const handleSelect = (name: string) => {
    const npz = npzArrays();
    if (!npz) return;
    try {
      const processed = processNpyResult(npz.arrays[name]);
      setParsedData(processed);
      setSelectedNpzArray(name);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Error loading array');
    }
  };

  return (
    <Show when={twoDArrays().length > 0}>
      <div class="card">
        <h3 class="card__title">Select Array</h3>
        <p class="text-secondary">
          This .npz file contains {twoDArrays().length} arrays with 2D data. Select the one containing your calcium traces:
        </p>
        <div class="npz-array-list">
          <For each={twoDArrays()}>
            {(arr) => (
              <button
                class="npz-array-item"
                onClick={() => handleSelect(arr.name)}
              >
                <span class="npz-array-item__name">{arr.name}</span>
                <span class="npz-array-item__meta">
                  {arr.shape[0]} x {arr.shape[1]} &middot; {arr.dtype}
                </span>
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
