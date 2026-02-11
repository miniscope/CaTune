// App.tsx - Import flow orchestration using data store signals
// Conditionally renders components based on importStep

import type { Component } from 'solid-js';
import type { ParamSnapshot } from './lib/param-history.ts';
import { Show, createMemo, createEffect, on } from 'solid-js';
import { FileDropZone } from './components/FileDropZone.tsx';
import { NpzArraySelector } from './components/NpzArraySelector.tsx';
import { DimensionConfirmation } from './components/DimensionConfirmation.tsx';
import { SamplingRateInput } from './components/SamplingRateInput.tsx';
import { DataValidationReport } from './components/DataValidationReport.tsx';
import { TracePreview } from './components/TracePreview.tsx';
import { TracePanelStack } from './components/traces/TracePanelStack.tsx';
import { KernelDisplay } from './components/traces/KernelDisplay.tsx';
import { ParameterPanel } from './components/controls/ParameterPanel.tsx';
import { MultiTraceView } from './components/traces/MultiTraceView.tsx';
import { CellSelector } from './components/controls/CellSelector.tsx';
import { ExportPanel } from './components/controls/ExportPanel.tsx';
import { startTuningLoop, commitToHistory } from './lib/tuning-orchestrator.ts';
import {
  importStep,
  rawFile,
  parsedData,
  effectiveShape,
  swapped,
  samplingRate,
  durationSeconds,
  validationResult,
  npzArrays,
  resetImport,
  loadDemoData,
} from './lib/data-store.ts';
import {
  loadCellTraces,
  selectedCell,
  tauRise,
  tauDecay,
  lambda,
  pinnedParams,
  pinCurrentSnapshot,
  unpinSnapshot,
} from './lib/viz-store.ts';
import {
  computeAndCacheRanking,
  updateCellSelection,
  selectedCells,
} from './lib/multi-cell-store.ts';
import { solveSelectedCells } from './lib/multi-cell-solver.ts';
import './styles/multi-trace.css';

const STEP_LABELS: Record<string, { num: number; label: string }> = {
  'drop':          { num: 1, label: 'Load Data' },
  'confirm-dims':  { num: 2, label: 'Confirm Dimensions' },
  'sampling-rate': { num: 3, label: 'Set Sampling Rate' },
  'validation':    { num: 4, label: 'Validate Data' },
  'ready':         { num: 4, label: 'Ready' },
};

const TOTAL_STEPS = 4;

const App: Component = () => {
  const step = () => importStep();
  const stepInfo = () => STEP_LABELS[step()] ?? { num: 1, label: 'Load Data' };
  const hasFile = () => !!rawFile();

  const durationDisplay = createMemo(() => {
    const d = durationSeconds();
    if (d === null) return null;
    const minutes = d / 60;
    if (minutes >= 1) {
      return `${d.toFixed(1)}s (${minutes.toFixed(1)} min)`;
    }
    return `${d.toFixed(1)}s`;
  });

  // Trigger batch re-solve for selected cells with current parameters
  const triggerBatchSolve = () => {
    const data = parsedData();
    const shape = effectiveShape();
    const cells = selectedCells();
    if (!data || !shape || cells.length === 0) return;
    solveSelectedCells(
      cells,
      { tauRise: tauRise(), tauDecay: tauDecay(), lambda: lambda(), fs: samplingRate() ?? 30 },
      data,
      shape,
      swapped(),
    );
  };

  // Wrap commitToHistory to also trigger batch re-solve on parameter commit
  const handleCommit = (snapshot: ParamSnapshot) => {
    commitToHistory(snapshot);
    triggerBatchSolve();
  };

  // Handle mini-panel click to switch primary cell
  const handleCellClick = (cellIndex: number) => {
    const data = parsedData();
    const shape = effectiveShape();
    if (data && shape) {
      loadCellTraces(cellIndex, data, shape, swapped());
    }
  };

  // Load first cell's traces and start tuning loop when import reaches 'ready'
  createEffect(
    on(importStep, (currentStep) => {
      if (currentStep === 'ready') {
        const data = parsedData();
        const shape = effectiveShape();
        if (data && shape) {
          loadCellTraces(0, data, shape, swapped());
          startTuningLoop();
          // Initialize multi-cell ranking and selection
          computeAndCacheRanking();
          updateCellSelection();
          // Trigger initial batch solve after a short delay to let the primary cell solve first
          setTimeout(triggerBatchSolve, 100);
        }
      }
    }),
  );

  return (
    <>
    <main class="import-container">
      {/* Header */}
      <header class="app-header" data-tutorial="app-header">
        <h1 class="app-header__title">CaTune</h1>
        <p class="app-header__subtitle">
          Calcium Deconvolution Parameter Tuning
        </p>
      </header>

      {/* Step indicator */}
      <div class="step-indicator">
        <div class="step-indicator__bar">
          {[1, 2, 3, 4].map((n) => (
            <div class={`step-dot ${n <= stepInfo().num ? 'step-dot--active' : ''} ${n === stepInfo().num ? 'step-dot--current' : ''}`}>
              {n}
            </div>
          ))}
        </div>
        <p class="step-indicator__label">
          Step {stepInfo().num} of {TOTAL_STEPS}: {stepInfo().label}
        </p>
      </div>

      {/* Start Over button */}
      <Show when={hasFile()}>
        <div class="start-over-row">
          <button class="btn-secondary btn-small" onClick={resetImport}>
            Start Over
          </button>
        </div>
      </Show>

      {/* Step 1: File Drop */}
      <Show when={step() === 'drop'}>
        <FileDropZone />
        <Show when={npzArrays()}>
          <NpzArraySelector />
        </Show>
        <div class="demo-data-row">
          <span class="demo-data-row__divider">or</span>
          <button class="btn-secondary" onClick={loadDemoData}>
            Load Demo Data
          </button>
          <p class="demo-data-row__hint">
            20 synthetic cells, 5 min at 30 Hz
          </p>
        </div>
      </Show>

      {/* Step 2: Confirm Dimensions */}
      <Show when={step() === 'confirm-dims'}>
        <div class="file-info-dimmed">
          <FileDropZone />
        </div>
        <DimensionConfirmation />
      </Show>

      {/* Step 3: Sampling Rate */}
      <Show when={step() === 'sampling-rate'}>
        <Show when={effectiveShape()}>
          <div class="info-summary">
            <span>{effectiveShape()![0].toLocaleString()} cells</span>
            <span class="info-summary__sep">&middot;</span>
            <span>{effectiveShape()![1].toLocaleString()} timepoints</span>
          </div>
        </Show>
        <SamplingRateInput />
      </Show>

      {/* Step 4: Validation */}
      <Show when={step() === 'validation'}>
        <Show when={effectiveShape()}>
          <div class="info-summary">
            <span>{effectiveShape()![0].toLocaleString()} cells</span>
            <span class="info-summary__sep">&middot;</span>
            <span>{effectiveShape()![1].toLocaleString()} timepoints</span>
            <span class="info-summary__sep">&middot;</span>
            <span>{samplingRate()} Hz</span>
          </div>
        </Show>
        <DataValidationReport />
      </Show>

      {/* Ready: Show trace preview + summary */}
      <Show when={step() === 'ready'}>
        <div class="info-summary">
          <Show when={rawFile()}>
            <span>{rawFile()!.name}</span>
            <span class="info-summary__sep">&middot;</span>
          </Show>
          <Show when={effectiveShape()}>
            <span>{effectiveShape()![0].toLocaleString()} cells</span>
            <span class="info-summary__sep">&middot;</span>
            <span>{effectiveShape()![1].toLocaleString()} timepoints</span>
            <span class="info-summary__sep">&middot;</span>
          </Show>
          <span>{samplingRate()} Hz</span>
          <Show when={durationDisplay()}>
            <span class="info-summary__sep">&middot;</span>
            <span>{durationDisplay()}</span>
          </Show>
        </div>

        <Show when={validationResult()}>
          <Show when={validationResult()!.warnings.length > 0}>
            <p class="text-warning" style="text-align: center; margin-bottom: 12px;">
              {validationResult()!.warnings.length} warning{validationResult()!.warnings.length > 1 ? 's' : ''}
            </p>
          </Show>
        </Show>

        <TracePreview />

        <div class="card ready-card">
          <p class="text-success" style="font-weight: 600; text-align: center;">
            Data loaded and validated. Ready for parameter tuning.
          </p>
        </div>
      </Show>
    </main>

    {/* Visualization section -- full width, outside import-container */}
    <Show when={step() === 'ready'}>
      <section class="viz-container" data-tutorial="viz-container">
        <div class="viz-header">
          <h2 class="viz-header__title">Trace Visualization</h2>
          <Show when={effectiveShape()}>
            <p class="viz-header__subtitle">
              Cell {selectedCell() + 1} of {effectiveShape()![0].toLocaleString()}
            </p>
          </Show>
        </div>

        <ParameterPanel onCommit={handleCommit} />

        <div class="viz-toolbar">
          <button
            class={`btn-secondary btn-small ${pinnedParams() ? 'btn-active' : ''}`}
            onClick={() => pinnedParams() ? unpinSnapshot() : pinCurrentSnapshot()}
            data-tutorial="pin-snapshot"
          >
            {pinnedParams() ? 'Unpin Snapshot' : 'Pin for Comparison'}
          </button>
          <Show when={pinnedParams()}>
            <span class="viz-toolbar__pin-info">
              Pinned: rise={((pinnedParams()!.tauRise) * 1000).toFixed(1)}ms,
              decay={((pinnedParams()!.tauDecay) * 1000).toFixed(1)}ms,
              lambda={pinnedParams()!.lambda.toExponential(2)}
            </span>
          </Show>
          <ExportPanel />
        </div>

        <TracePanelStack />

        <CellSelector onSelectionChange={triggerBatchSolve} />
        <MultiTraceView onCellClick={handleCellClick} />
        <KernelDisplay />
      </section>
    </Show>
    </>
  );
};

export default App;
