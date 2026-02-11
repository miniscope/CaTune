// Batch multi-cell solver
// Sequentially solves selected cells through the existing worker singleton
// CRITICAL: Only invoke on parameter commit (onChange), NOT slider drag (onInput),
// to prevent contention with the interactive tuning loop's solver.

import * as Comlink from 'comlink';

import type { NpyResult } from './types';
import type { SolverParams } from './solver-types';
import type { CellTraces } from './multi-cell-store';

import { extractCellTrace } from './array-utils';
import {
  setMultiCellSolving,
  setMultiCellProgress,
  setMultiCellResults,
} from './multi-cell-store';
import { createSolverWorker } from '../workers/solver-api';

/**
 * Solve deconvolution for a batch of selected cells sequentially.
 *
 * Uses the same worker singleton as the interactive tuning loop.
 * The Comlink proxy serializes calls -- if an interactive solve is
 * in-flight when a batch starts, it will wait. This is acceptable
 * because batch solves only trigger on parameter commit.
 *
 * If a cell fails, the error is logged and the batch continues.
 *
 * @param cells - Array of cell indices to solve
 * @param params - Solver parameters (tauRise, tauDecay, lambda, fs)
 * @param data - Parsed NPY result with flat typed array
 * @param shape - Effective [numCells, numTimepoints] after optional swap
 * @param isSwapped - Whether the user swapped dimensions
 * @returns Map of cell index to CellTraces results
 */
export async function solveSelectedCells(
  cells: number[],
  params: SolverParams,
  data: NpyResult,
  shape: [number, number],
  isSwapped: boolean,
): Promise<Map<number, CellTraces>> {
  const results = new Map<number, CellTraces>();

  setMultiCellSolving(true);
  setMultiCellProgress({ current: 0, total: cells.length });

  try {
    const worker = await createSolverWorker();

    for (let i = 0; i < cells.length; i++) {
      const cellIndex = cells[i];

      try {
        const raw = extractCellTrace(cellIndex, data, shape, isSwapped);

        // Create a copy for transfer (avoids detaching the source)
        const traceCopy = new Float64Array(raw);

        // Solve via worker singleton -- cold start, no intermediate callback for batch
        const result = await worker.solve(
          Comlink.transfer(traceCopy, [traceCopy.buffer]),
          { ...params },
          null,
          'cold',
          Comlink.proxy(() => {}),
        );

        // Copy results to avoid ArrayBuffer detachment issues
        const cellTraces: CellTraces = {
          cellIndex,
          raw,
          deconvolved: new Float64Array(result.solution),
          reconvolution: new Float64Array(result.reconvolution),
        };

        results.set(cellIndex, cellTraces);
      } catch (err) {
        console.error(`Multi-cell solver: failed to solve cell ${cellIndex}:`, err);
        // Continue to next cell -- don't abort the entire batch
      }

      // Update progress after each cell (success or failure)
      setMultiCellProgress({ current: i + 1, total: cells.length });
    }
  } finally {
    setMultiCellSolving(false);
    setMultiCellProgress(null);
  }

  setMultiCellResults(results);
  return results;
}
