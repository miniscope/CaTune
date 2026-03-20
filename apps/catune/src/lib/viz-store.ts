// Reactive visualization store for trace display.
// Signals are wired to the solver via tuning-orchestrator.
// Parameter changes trigger solver dispatch; results flow back here.

import { createSignal, createMemo } from 'solid-js';
import { trackEvent } from '@calab/community';
import { shapeToTau } from '@calab/compute';
import { pinMultiCellResults, unpinMultiCellResults } from './multi-cell-store.ts';

// --- Cell selection ---

const [selectedCell, setSelectedCell] = createSignal<number>(0);

// --- Kernel shape parameters (user-facing: tPeak / FWHM) ---

const [tPeak, setTPeak] = createSignal<number>(0.008); // default from tauToShape(0.001, 3.0)
const [fwhm, setFwhm] = createSignal<number>(2.08);

// --- Derived tau values (single conversion from tPeak/FWHM) ---

const DEFAULT_TAU_RISE = 0.1;
const DEFAULT_TAU_DECAY = 0.6;

const currentTau = createMemo(() => {
  const tau = shapeToTau(tPeak(), fwhm());
  return {
    tauRise: tau?.tauRise ?? DEFAULT_TAU_RISE,
    tauDecay: tau?.tauDecay ?? DEFAULT_TAU_DECAY,
  };
});

// --- Lambda (sparsity penalty) ---

const [lambda, setLambda] = createSignal<number>(0); // start at minimum sparsity

// --- Filter toggle ---

const [filterEnabled, setFilterEnabled] = createSignal<boolean>(false);

// --- Trace visibility toggles (legend click-to-hide) ---

const [showRaw, setShowRaw] = createSignal<boolean>(true);
const [showFiltered, setShowFiltered] = createSignal<boolean>(true);
const [showFit, setShowFit] = createSignal<boolean>(true);
const [showDeconv, setShowDeconv] = createSignal<boolean>(true);
const [showResid, setShowResid] = createSignal<boolean>(true);
const [showGTCalcium, setShowGTCalcium] = createSignal<boolean>(true);
const [showGTSpikes, setShowGTSpikes] = createSignal<boolean>(true);

// --- Card height (shared across all cell cards) ---

const [cardHeight, setCardHeight] = createSignal<number>(280);

// --- Pinned snapshot for before/after comparison ---

const [pinnedParams, setPinnedParams] = createSignal<{
  tPeak: number;
  fwhm: number;
  lambda: number;
} | null>(null);

/** Pin the current solver results as a dimmed overlay for before/after comparison. */
function pinCurrentSnapshot(): void {
  setPinnedParams({
    tPeak: tPeak(),
    fwhm: fwhm(),
    lambda: lambda(),
  });

  // Also snapshot all multi-cell results for card grid overlays
  pinMultiCellResults();
  void trackEvent('snapshot_pinned');
}

/** Clear pinned snapshot data. */
function unpinSnapshot(): void {
  setPinnedParams(null);
  unpinMultiCellResults();
}

// --- Exports ---

export {
  // Cell selection
  selectedCell,
  setSelectedCell,
  // Kernel shape parameters
  tPeak,
  setTPeak,
  fwhm,
  setFwhm,
  currentTau,
  // Lambda (sparsity)
  lambda,
  setLambda,
  // Filter toggle
  filterEnabled,
  setFilterEnabled,
  // Trace visibility toggles
  showRaw,
  setShowRaw,
  showFiltered,
  setShowFiltered,
  showFit,
  setShowFit,
  showDeconv,
  setShowDeconv,
  showResid,
  setShowResid,
  showGTCalcium,
  setShowGTCalcium,
  showGTSpikes,
  setShowGTSpikes,
  // Card height
  cardHeight,
  setCardHeight,
  // Pinned snapshot
  pinnedParams,
  pinCurrentSnapshot,
  unpinSnapshot,
};
