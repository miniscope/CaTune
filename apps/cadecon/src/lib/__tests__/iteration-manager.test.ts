/**
 * Tests for iteration-manager state transitions and dispatch sequencing.
 *
 * The module holds internal state (worker pool, pause resolver, job counter)
 * across calls, so each test calls `resetRun()` in afterEach to leave the
 * module clean for the next test. Stores are also module singletons; we reset
 * the iteration store explicitly and only touch data-store / subset-store in
 * the mocked-pool integration tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the worker-pool factory before importing iteration-manager so the
// module picks up the fake pool on its first reference.
vi.mock('../cadecon-pool.ts', () => {
  return { createCaDeconWorkerPool: () => createFakePool() };
});

import type { CaDeconPoolJob } from '../cadecon-pool.ts';
import type { KernelResult } from '../../workers/cadecon-types.ts';
import { pauseRun, resumeRun, stopRun, resetRun, startRun } from '../iteration-manager.ts';
import {
  runState,
  setRunState,
  runPhase,
  setRunPhase,
  currentIteration,
  setCurrentIteration,
  convergenceHistory,
  convergedAtIteration,
  currentTauRise,
  currentTauDecay,
  resetIterationState,
} from '../iteration-store.ts';
import {
  setParsedData,
  setDimensionsConfirmed,
  setSamplingRate,
  setSwapped,
  resetImport,
} from '../data-store.ts';
import { setNumSubsets } from '../subset-store.ts';
import { setMaxIterations, setConvergenceTol } from '../algorithm-store.ts';

// ── Fake pool ──────────────────────────────────────────────────────────────

type DispatchedJob = CaDeconPoolJob;

interface FakePool {
  dispatch(job: DispatchedJob): void;
  cancelAll(): void;
  dispose(): void;
  jobs: DispatchedJob[];
  cancelCount: number;
  disposeCount: number;
}

let fakePool: FakePool | null = null;

/**
 * Per-call override for the fake pool's kernel results, so a test can hand
 * individual subsets a chosen `fitMode` / tau. Receives the 0-based index of
 * the kernel job across the whole run: the first `numSubsets` calls are the
 * seed phase, and each iteration consumes `numSubsets` more.
 */
let kernelResultOverride: ((callIndex: number) => Partial<KernelResult>) | null = null;
let kernelCallCount = 0;

function createFakePool(): FakePool {
  const pool: FakePool = {
    jobs: [],
    cancelCount: 0,
    disposeCount: 0,
    dispatch(job) {
      pool.jobs.push(job);
      // Resolve on a microtask so the iteration manager can continue its async
      // loop naturally (no synchronous re-entry from inside dispatch).
      queueMicrotask(() => completeJob(job));
    },
    cancelAll() {
      pool.cancelCount++;
    },
    dispose() {
      pool.disposeCount++;
    },
  };
  fakePool = pool;
  return pool;
}

function completeJob(job: DispatchedJob): void {
  if (job.kind === 'trace') {
    const n = job.trace.length;
    // Emit a plausible but simple result: small sparse spike, alpha=1
    const sCounts = new Float32Array(n);
    sCounts[Math.floor(n / 2)] = 1;
    job.onComplete({
      sCounts,
      filteredTrace: new Float32Array(job.trace),
      alpha: 1,
      baseline: 0,
      threshold: 0.1,
      pve: 0.9,
      iterations: 10,
      converged: true,
    });
  } else if (job.kind === 'kernel') {
    const hFree = new Float32Array(job.kernelLength);
    hFree[1] = 1;
    const override = kernelResultOverride?.(kernelCallCount++) ?? {};
    job.onComplete({
      hFree,
      tauRise: 0.05,
      tauDecay: 0.4,
      beta: 1,
      residual: 0.01,
      tauRiseFast: 0.05,
      tauDecayFast: 0.4,
      betaFast: 1,
      fitMode: 'TwoComponent',
      ...override,
    });
  } else {
    // seed-trace
    const n = job.trace.length;
    const sCounts = new Float32Array(n);
    sCounts[1] = 1;
    job.onComplete({ sCounts, alpha: 1, baseline: 0 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function seedMinimalRun(opts?: { numCells?: number; numTimepoints?: number; fs?: number }): void {
  const numCells = opts?.numCells ?? 2;
  const numTimepoints = opts?.numTimepoints ?? 60;
  const fs = opts?.fs ?? 30;
  const data = new Float64Array(numCells * numTimepoints);
  // Simple bump pattern so the fake pool sees non-trivial input
  for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.1);
  setParsedData({ data, shape: [numCells, numTimepoints], dtype: '<f8', fortranOrder: false });
  setDimensionsConfirmed(true);
  setSwapped(false);
  setSamplingRate(fs);
  setNumSubsets(1);
  setMaxIterations(2);
  setConvergenceTol(0.01);
}

// ── State transition tests (no pool) ───────────────────────────────────────

describe('iteration-manager: state transitions', () => {
  beforeEach(() => {
    resetIterationState();
  });

  afterEach(() => {
    resetRun();
  });

  describe('pauseRun', () => {
    it('transitions running → paused', () => {
      setRunState('running');
      pauseRun();
      expect(runState()).toBe('paused');
    });

    it.each(['idle', 'paused', 'stopping', 'complete'] as const)('is a no-op from %s', (state) => {
      setRunState(state);
      pauseRun();
      expect(runState()).toBe(state);
    });
  });

  describe('resumeRun', () => {
    it('transitions paused → running', () => {
      setRunState('paused');
      resumeRun();
      expect(runState()).toBe('running');
    });

    it.each(['idle', 'running', 'stopping', 'complete'] as const)('is a no-op from %s', (state) => {
      setRunState(state);
      resumeRun();
      expect(runState()).toBe(state);
    });
  });

  describe('stopRun', () => {
    it('sets runState to stopping and runPhase to idle', () => {
      setRunState('running');
      setRunPhase('inference');
      stopRun();
      expect(runState()).toBe('stopping');
      expect(runPhase()).toBe('idle');
    });

    it('is safe when no pool has been created', () => {
      setRunState('idle');
      expect(() => stopRun()).not.toThrow();
      expect(runState()).toBe('stopping');
    });
  });

  describe('resetRun', () => {
    it('clears iteration state back to defaults', () => {
      setRunState('complete');
      setRunPhase('finalization');
      setCurrentIteration(5);
      resetRun();
      expect(runState()).toBe('idle');
      expect(runPhase()).toBe('idle');
      expect(currentIteration()).toBe(0);
      expect(convergenceHistory()).toEqual([]);
      expect(convergedAtIteration()).toBeNull();
    });
  });
});

// ── startRun early exits ───────────────────────────────────────────────────

describe('iteration-manager: startRun prerequisites', () => {
  beforeEach(() => {
    resetIterationState();
    resetImport();
  });

  afterEach(() => {
    resetRun();
    resetImport();
  });

  it('exits immediately when no data is loaded', async () => {
    await startRun();
    expect(runState()).toBe('idle');
    expect(fakePool).toBeNull(); // pool was never created
  });
});

// ── startRun integration with mocked pool ──────────────────────────────────

describe('iteration-manager: startRun dispatch sequence', () => {
  beforeEach(() => {
    resetIterationState();
    resetImport();
  });

  afterEach(() => {
    resetRun();
    resetImport();
    fakePool = null;
    kernelResultOverride = null;
    kernelCallCount = 0;
  });

  it('runs through seed → iterate → finalize and reaches complete', async () => {
    seedMinimalRun();
    await startRun();

    expect(runState()).toBe('complete');
    expect(runPhase()).toBe('idle');
    expect(fakePool).not.toBeNull();
    // Jobs were dispatched: seed-trace + kernel seed + at least one iteration
    // of trace/kernel jobs + finalization trace jobs.
    const kinds = fakePool!.jobs.map((j) => j.kind);
    expect(kinds).toContain('seed-trace');
    expect(kinds).toContain('kernel');
    expect(kinds).toContain('trace');
    // Convergence history records iteration 0 + at least one iteration
    expect(convergenceHistory().length).toBeGreaterThanOrEqual(2);

    // Snapshots carry the shape coordinate; the constant-kernel fake pool
    // resolves to a well-defined (non-degenerate) shape and is not rise-clamped.
    const last = convergenceHistory().at(-1)!;
    expect(last.tPeak).not.toBeNull();
    expect(last.fwhm).not.toBeNull();
    expect(last.riseUnresolved).toBe(false);

    // Asymptote signals populate: R² = 1 - residual(0.01)/||h||²(1) = 0.99,
    // median PVE = 0.9 (fake pool), and stability is defined by iteration 2.
    expect(last.kernelFitR2!).toBeCloseTo(0.99, 2);
    expect(last.medianPve!).toBeCloseTo(0.9, 5);
    expect(last.traceStability).not.toBeNull();
    expect(last.traceStability!).toBeCloseTo(0, 5);

    // Final kernel comes from the median-of-tail shape selection; the fake pool
    // reports tauRise=0.05, tauDecay=0.4, so the round-tripped selection lands near it.
    expect(currentTauRise()!).toBeGreaterThan(0.045);
    expect(currentTauRise()!).toBeLessThan(0.055);
    expect(currentTauDecay()!).toBeGreaterThan(0.38);
    expect(currentTauDecay()!).toBeLessThan(0.42);
  });

  it('converges early when the kernel shape stabilises (patience streak)', async () => {
    // The fake pool always returns the same tauRise/tauDecay, so every
    // iteration's kernel is identical → kernelRmse ~ 0 < convTol. After
    // `patience` consecutive stable iterations (past minIters) the loop stops and
    // records the FIRST iteration of the confirming window.
    seedMinimalRun();
    setMaxIterations(10);
    setConvergenceTol(0.1);
    await startRun();
    expect(convergedAtIteration()).not.toBeNull();
    // Default minIters=2, patience=3 → first stable iteration is 2.
    expect(convergedAtIteration()!).toBeLessThanOrEqual(3);
  });

  it('stopRun mid-run transitions through stopping into complete', async () => {
    seedMinimalRun();
    setMaxIterations(50);
    const runPromise = startRun();
    // Give the microtask queue a chance to dispatch the seed jobs
    await Promise.resolve();
    stopRun();
    await runPromise;
    expect(runState()).toBe('complete');
    expect(fakePool!.cancelCount).toBeGreaterThan(0);
  });

  it('resetRun after completion disposes the pool', async () => {
    seedMinimalRun();
    await startRun();
    const pool = fakePool!;
    resetRun();
    expect(pool.disposeCount).toBe(1);
    expect(runState()).toBe('idle');
  });
});

// ── Fit provenance ─────────────────────────────────────────────────────────

describe('iteration-manager: only fits that resolved something get a vote', () => {
  beforeEach(() => {
    resetIterationState();
    resetImport();
  });

  afterEach(() => {
    resetRun();
    resetImport();
    fakePool = null;
    kernelResultOverride = null;
    kernelCallCount = 0;
  });

  /**
   * Half the subsets report a `Degenerate` fit with a wildly different
   * tau_decay. A plain median over four values, two of which are 3.0, lands at
   * 1.7 — a number no subset measured and no kernel has. Excluding the
   * degenerate pair leaves the 0.4 the real fits agree on.
   */
  it('keeps a degenerate subset out of the reported tau', async () => {
    const subsets = 4;
    seedMinimalRun({ numCells: 8, numTimepoints: 120 });
    setNumSubsets(subsets);
    setMaxIterations(2);

    kernelResultOverride = (i) => {
      if (i < subsets) return {}; // seed phase: all healthy
      return (i - subsets) % subsets < 2
        ? {}
        : { tauDecay: 3.0, tauRise: 0.3, beta: -1, fitMode: 'Degenerate' as const };
    };

    await startRun();
    expect(runState()).toBe('complete');

    const last = convergenceHistory().at(-1)!;
    expect(last.tauDecay).toBeCloseTo(0.4, 3);
    expect(last.tauDecay).toBeLessThan(1.0);

    // The count is still reported over every subset — filtering the vote must
    // not hide the fact that half the subsets failed.
    expect(last.degenerateSubsets).toBe(2);
    expect(last.totalSubsetFits).toBe(subsets);
  });

  /**
   * `Empty` carries an infinite residual, which reaches both the residual
   * median and `1 - residual/||h||²`.
   *
   * Two of four, not one: a median over four values absorbs a single
   * infinity, so a one-bad-subset fixture passes with or without the fix and
   * proves nothing. At two the median is the mean of the middle pair, one of
   * which is infinite, and both signals go to Infinity / -Infinity — which is
   * what the asymptote charts were then asked to plot.
   */
  it('keeps empty fits out of the residual median and the kernel-fit R²', async () => {
    const subsets = 4;
    seedMinimalRun({ numCells: 8, numTimepoints: 120 });
    setNumSubsets(subsets);
    setMaxIterations(2);

    kernelResultOverride = (i) => {
      if (i < subsets) return {};
      return (i - subsets) % subsets < 2
        ? { residual: Number.POSITIVE_INFINITY, beta: 0, fitMode: 'Empty' as const }
        : {};
    };

    await startRun();

    const last = convergenceHistory().at(-1)!;
    expect(last.kernelFitR2).not.toBeNull();
    expect(Number.isFinite(last.kernelFitR2!)).toBe(true);
    // The two healthy subsets: 1 - 0.01/1 = 0.99.
    expect(last.kernelFitR2!).toBeCloseTo(0.99, 2);
    expect(Number.isFinite(last.residual)).toBe(true);
    expect(last.residual).toBeCloseTo(0.01, 5);
  });

  /**
   * When nothing is trustworthy there is no honest kernel to report, but the
   * run still has to finish and record what happened. The snapshot says so by
   * having every subset counted as degenerate.
   */
  it('still completes, and says so, when no subset resolved a fit', async () => {
    const subsets = 2;
    seedMinimalRun({ numCells: 4, numTimepoints: 120 });
    setNumSubsets(subsets);
    setMaxIterations(2);

    kernelResultOverride = (i) => (i < subsets ? {} : { beta: -1, fitMode: 'Degenerate' as const });

    await startRun();
    expect(runState()).toBe('complete');

    const last = convergenceHistory().at(-1)!;
    expect(last.degenerateSubsets).toBe(last.totalSubsetFits);
    expect(last.totalSubsetFits).toBeGreaterThan(0);
    // The fallback has to produce a real number: filtering every subset out
    // and then taking a median of nothing would yield NaN and poison the
    // convergence metric from here on.
    expect(Number.isFinite(last.tauDecay)).toBe(true);
    expect(last.tauDecay).toBeGreaterThan(0);
    expect(last.tauRise).toBeLessThan(last.tauDecay);
  });
});
