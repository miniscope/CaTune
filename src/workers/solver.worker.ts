import * as Comlink from 'comlink';
import init, { Solver } from '../../wasm/catune-solver/pkg/catune_solver';
import type {
  SolverParams,
  SolveResult,
  IntermediateResult,
  WarmStartStrategy,
} from '../lib/solver-types';

let solver: Solver | null = null;

const api = {
  /** Initialize the WASM module and create a Solver instance. */
  async initialize(): Promise<void> {
    await init();
    solver = new Solver();
  },

  /**
   * Run the solver to convergence. Posts intermediate results via callback
   * at ~100ms intervals for live visualization.
   */
  solve(
    trace: Float64Array,
    params: SolverParams,
    warmStartState: Uint8Array | null,
    warmStartStrategy: WarmStartStrategy,
    onIntermediate: (result: IntermediateResult) => void,
  ): SolveResult {
    if (!solver) {
      throw new Error('Solver not initialized. Call initialize() first.');
    }

    // Configure solver parameters
    solver.set_params(params.tauRise, params.tauDecay, params.lambda, params.fs);

    // Load trace data (resets iteration state)
    solver.set_trace(trace);

    // Handle warm-start strategy
    if (warmStartStrategy === 'warm' && warmStartState) {
      solver.load_state(warmStartState);
    } else if (warmStartStrategy === 'warm-no-momentum' && warmStartState) {
      solver.load_state(warmStartState);
      solver.reset_momentum();
    }
    // 'cold' strategy: set_trace already zeroed the solution

    // Iteration loop
    let lastIntermediateTime = performance.now();
    const INTERMEDIATE_INTERVAL_MS = 100;
    const BATCH_SIZE = 10;

    while (!solver.converged()) {
      solver.step_batch(BATCH_SIZE);

      // Post intermediate result at ~100ms intervals
      const now = performance.now();
      if (now - lastIntermediateTime >= INTERMEDIATE_INTERVAL_MS) {
        const sol = solver.get_solution();
        const reconv = solver.get_reconvolution();
        onIntermediate(
          Comlink.transfer(
            {
              solution: sol,
              reconvolution: reconv,
              iteration: solver.iteration_count(),
            },
            [sol.buffer, reconv.buffer],
          ),
        );
        lastIntermediateTime = now;
      }
    }

    // Final result
    const solution = solver.get_solution();
    const reconvolution = solver.get_reconvolution();
    const state = solver.export_state();
    const iterations = solver.iteration_count();

    return Comlink.transfer(
      {
        solution,
        reconvolution,
        state,
        iterations,
        converged: true,
      },
      [solution.buffer, reconvolution.buffer, state.buffer],
    );
  },
};

Comlink.expose(api);
