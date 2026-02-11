// Reactive visualization store for trace display.
// DECOUPLED from the solver -- accepts trace data as typed arrays.
// Phase 4 will wire solver output to these signals.

import { createSignal, createMemo } from 'solid-js';
import type { NpyResult } from './types';
import { generateMockTraces } from './chart/mock-traces';
import { samplingRate } from './data-store';

// --- Cell selection ---

const [selectedCell, setSelectedCell] = createSignal<number>(0);

// --- Trace signals ---

const [rawTrace, setRawTrace] = createSignal<Float64Array | null>(null);
const [deconvolvedTrace, setDeconvolvedTrace] =
  createSignal<Float64Array | null>(null);
const [reconvolutionTrace, setReconvolutionTrace] =
  createSignal<Float64Array | null>(null);

// --- Tau parameters (kernel shape) ---

const [tauRise, setTauRise] = createSignal<number>(0.02); // 20ms default
const [tauDecay, setTauDecay] = createSignal<number>(0.4); // 400ms default

// --- Derived: residual trace ---

const residualTrace = createMemo<Float64Array | null>(() => {
  const raw = rawTrace();
  const reconv = reconvolutionTrace();
  if (!raw || !reconv || raw.length !== reconv.length) return null;

  const residual = new Float64Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    residual[i] = raw[i] - reconv[i];
  }
  return residual;
});

// --- Load cell traces ---

/**
 * Extract the raw fluorescence trace for a given cell index from the flat
 * typed array, then generate mock deconvolved/reconvolution data for
 * development visualization. Phase 4 replaces mock data with real solver output.
 *
 * @param cellIndex - Which cell to extract (row index)
 * @param data - The parsed NpyResult with flat typed array
 * @param shape - Effective [cells, timepoints] after optional swap
 * @param isSwapped - Whether dimensions were swapped by user
 */
function loadCellTraces(
  cellIndex: number,
  data: NpyResult,
  shape: [number, number],
  isSwapped: boolean,
): void {
  const [numCells, numTimepoints] = shape;

  // Guard invalid index
  if (cellIndex < 0 || cellIndex >= numCells) return;

  // Extract raw trace from flat typed array
  const raw = new Float64Array(numTimepoints);

  if (isSwapped) {
    // Original layout was [timepoints, cells], data is row-major
    // After swap: cell i = column i in original = every row's column i
    const origRows = numTimepoints; // original row count = numTimepoints after swap
    for (let t = 0; t < numTimepoints; t++) {
      raw[t] = Number(data.data[t * numCells + cellIndex]);
    }
  } else {
    // Normal layout [cells, timepoints], row-major: cell i = row i
    const offset = cellIndex * numTimepoints;
    for (let t = 0; t < numTimepoints; t++) {
      raw[t] = Number(data.data[offset + t]);
    }
  }

  setRawTrace(raw);
  setSelectedCell(cellIndex);

  // Generate mock deconvolved + reconvolution for development display
  const fs = samplingRate() ?? 30;
  const mock = generateMockTraces(raw, tauRise(), tauDecay(), fs);
  setDeconvolvedTrace(mock.deconvolved);
  setReconvolutionTrace(mock.reconvolution);
}

// --- Exports ---

export {
  // Cell selection
  selectedCell,
  setSelectedCell,
  // Trace signals
  rawTrace,
  setRawTrace,
  deconvolvedTrace,
  setDeconvolvedTrace,
  reconvolutionTrace,
  setReconvolutionTrace,
  // Derived
  residualTrace,
  // Tau parameters
  tauRise,
  setTauRise,
  tauDecay,
  setTauDecay,
  // Actions
  loadCellTraces,
};
