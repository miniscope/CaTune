// Tuning orchestrator: the central nervous system of the interactive loop.
// Reactive effects watch parameter signals and rawTrace, dispatching solver
// jobs through the SolverJobScheduler. Solver results flow back into viz-store.

import { createEffect, on } from 'solid-js';
import { SolverJobScheduler } from './job-scheduler';
import {
  tauRise, tauDecay, lambda, rawTrace,
  setDeconvolvedTrace, setReconvolutionTrace,
  setSolverStatus,
} from './viz-store';
import { samplingRate } from './data-store';
import { notifyTutorialAction } from './tutorial/tutorial-engine';
import { isTutorialActive } from './tutorial/tutorial-store';

// --- Module-level state ---

const scheduler = new SolverJobScheduler(30); // 30ms debounce

// --- Public API ---

/**
 * Initialize the reactive tuning loop. Call once after data is loaded.
 *
 * Creates a reactive effect that dispatches solver jobs when parameters
 * or rawTrace change.
 */
export function startTuningLoop(): void {
  // Reactive effect: dispatch solver when any tracked signal changes
  createEffect(
    on(
      [tauRise, tauDecay, lambda, rawTrace],
      ([tr, td, lam, trace]) => {
        // No data loaded yet -- skip
        if (!trace) return;

        // Notify tutorial engine of parameter changes for interactive step auto-advancement
        if (isTutorialActive()) {
          notifyTutorialAction();
        }

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
}
