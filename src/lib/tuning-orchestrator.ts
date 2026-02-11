// Tuning orchestrator: the central nervous system of the interactive loop.
// Reactive effects watch parameter signals and rawTrace, dispatching solver
// jobs through the SolverJobScheduler. Solver results flow back into viz-store.
// Undo/redo navigates parameter history with guard flag to prevent loops.

import { createEffect, on } from 'solid-js';
import { SolverJobScheduler } from './job-scheduler';
import {
  tauRise, tauDecay, lambda, rawTrace,
  setTauRise, setTauDecay, setLambda,
  setDeconvolvedTrace, setReconvolutionTrace,
  setSolverStatus,
} from './viz-store';
import { samplingRate } from './data-store';
import { ParamHistory } from './param-history';
import type { ParamSnapshot } from './param-history';

// --- Module-level state ---

const scheduler = new SolverJobScheduler(30); // 30ms debounce
const history = new ParamHistory(100); // 100-entry undo stack
let isUndoRedoInProgress = false; // guard flag to prevent undo from pushing to history

// --- Public API ---

/**
 * Initialize the reactive tuning loop. Call once after data is loaded.
 *
 * Creates:
 * 1. A reactive effect that dispatches solver jobs when parameters or rawTrace change
 * 2. Keyboard shortcuts for undo (Ctrl/Cmd+Z) and redo (Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z)
 */
export function startTuningLoop(): void {
  // Push initial parameter snapshot to history
  history.push({
    tauRise: tauRise(),
    tauDecay: tauDecay(),
    lambda: lambda(),
  });

  // Reactive effect: dispatch solver when any tracked signal changes
  createEffect(
    on(
      [tauRise, tauDecay, lambda, rawTrace],
      ([tr, td, lam, trace]) => {
        // No data loaded yet -- skip
        if (!trace) return;

        const fs = samplingRate() ?? 30;

        const params = { tauRise: tr, tauDecay: td, lambda: lam, fs };

        setSolverStatus('solving');

        // Solve full trace
        const visibleStart = 0;
        const visibleEnd = trace.length;

        scheduler.dispatch(
          trace,
          params,
          visibleStart,
          visibleEnd,
          // onIntermediate: copy Float64Arrays to avoid ArrayBuffer detachment
          (solution, reconvolution, _iteration) => {
            setDeconvolvedTrace(new Float64Array(solution));
            setReconvolutionTrace(new Float64Array(reconvolution));
          },
          // onComplete: copy and update status
          (solution, reconvolution, converged, _iterations) => {
            setDeconvolvedTrace(new Float64Array(solution));
            setReconvolutionTrace(new Float64Array(reconvolution));
            setSolverStatus(converged ? 'converged' : 'solving');
          },
          // onError
          (error) => {
            console.error('Solver error:', error);
            setSolverStatus('error');
          },
        );
      },
    ),
  );

  // Register keyboard shortcuts for undo/redo
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Don't capture shortcuts when typing in inputs
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    if (e.key === 'z' && !e.shiftKey) {
      // Ctrl/Cmd + Z = undo
      e.preventDefault();
      performUndo();
    } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = redo
      e.preventDefault();
      performRedo();
    }
  });
}

/**
 * Commit a parameter snapshot to the undo history.
 * Called by ParameterPanel's onCommit prop (fires on slider onChange, not onInput).
 * Guarded: does nothing if an undo/redo operation is in progress.
 */
export function commitToHistory(snapshot: ParamSnapshot): void {
  if (isUndoRedoInProgress) return;
  history.push(snapshot);
}

/**
 * Undo to the previous parameter state.
 * Sets the guard flag to prevent the signal changes from pushing to history.
 * The reactive effect will detect the signal changes and dispatch a new solve.
 */
export function performUndo(): void {
  const prev = history.undo();
  if (!prev) return;

  isUndoRedoInProgress = true;
  setTauRise(prev.tauRise);
  setTauDecay(prev.tauDecay);
  setLambda(prev.lambda);
  isUndoRedoInProgress = false;
}

/**
 * Redo to the next parameter state.
 * Same guard-flag pattern as performUndo.
 */
export function performRedo(): void {
  const next = history.redo();
  if (!next) return;

  isUndoRedoInProgress = true;
  setTauRise(next.tauRise);
  setTauDecay(next.tauDecay);
  setLambda(next.lambda);
  isUndoRedoInProgress = false;
}
