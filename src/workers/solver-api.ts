import * as Comlink from 'comlink';
import type {
  SolverParams,
  SolveResult,
  IntermediateResult,
  WarmStartStrategy,
} from '../lib/solver-types';

/** RPC interface exposed by the solver Web Worker via Comlink. */
export interface SolverWorkerApi {
  initialize(): Promise<void>;
  solve(
    trace: Float64Array,
    params: SolverParams,
    warmStartState: Uint8Array | null,
    warmStartStrategy: WarmStartStrategy,
    onIntermediate: (result: IntermediateResult) => void,
  ): Promise<SolveResult>;
}

let workerInstance: Worker | null = null;
let apiProxy: Comlink.Remote<SolverWorkerApi> | null = null;

/**
 * Create (or return existing) solver worker with Comlink proxy.
 * The worker is created once and never terminated to preserve
 * the WASM instance and enable warm-start across solves.
 */
export async function createSolverWorker(): Promise<Comlink.Remote<SolverWorkerApi>> {
  if (apiProxy) return apiProxy;

  workerInstance = new Worker(
    new URL('./solver.worker.ts', import.meta.url),
    { type: 'module' },
  );
  apiProxy = Comlink.wrap<SolverWorkerApi>(workerInstance);
  await apiProxy.initialize();
  return apiProxy;
}

/** Get the existing solver worker proxy, or null if not yet created. */
export function getSolverWorker(): Comlink.Remote<SolverWorkerApi> | null {
  return apiProxy;
}
