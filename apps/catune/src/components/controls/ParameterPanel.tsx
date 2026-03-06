// Parameter control panel grouping three sliders (tau_rise, tau_decay, lambda)
// with a convergence indicator. Consumed by the App/tuning view.
// Lambda and solver status signals live in viz-store (centralized).

import {
  tauRise,
  tauDecay,
  setTauRise,
  setTauDecay,
  lambda,
  setLambda,
  filterEnabled,
  setFilterEnabled,
} from '../../lib/viz-store.ts';
import { notifyTutorialAction } from '@calab/tutorials';
import { isDemo, demoPreset, groundTruthVisible } from '../../lib/data-store.ts';
import { PARAM_RANGES } from '@calab/core';
import { ParameterSlider } from './ParameterSlider.tsx';
import { DualRangeSlider } from './DualRangeSlider.tsx';
import '../../styles/controls.css';

export function ParameterPanel() {
  // Enforce tau_decay > tau_rise so the kernel never goes negative or zero.
  const minGap = PARAM_RANGES.tauDecay.step;
  const clampedSetTauRise = (v: number) => {
    setTauRise(v);
    if (tauDecay() < v + minGap) setTauDecay(v + minGap);
  };
  const clampedSetTauDecay = (v: number) => {
    setTauDecay(v);
    if (tauRise() > v - minGap) setTauRise(v - minGap);
  };

  const trueRise = () => {
    if (!groundTruthVisible() || !isDemo() || !demoPreset()) return undefined;
    return demoPreset()!.params.tauRise;
  };

  const trueDecay = () => {
    if (!groundTruthVisible() || !isDemo() || !demoPreset()) return undefined;
    return demoPreset()!.params.tauDecay;
  };

  return (
    <div class="param-panel" data-tutorial="param-panel">
      <div class="param-panel__sliders">
        <DualRangeSlider
          label="Time Constants"
          lowLabel="Rise"
          highLabel="Decay"
          lowValue={tauRise}
          highValue={tauDecay}
          setLowValue={clampedSetTauRise}
          setHighValue={clampedSetTauDecay}
          min={PARAM_RANGES.tauRise.min}
          max={PARAM_RANGES.tauDecay.max}
          lowMin={PARAM_RANGES.tauRise.min}
          lowMax={PARAM_RANGES.tauRise.max}
          highMin={PARAM_RANGES.tauDecay.min}
          highMax={PARAM_RANGES.tauDecay.max}
          format={(v) => (v * 1000).toFixed(1)}
          unit="ms"
          data-tutorial-low="slider-rise"
          data-tutorial-high="slider-decay"
          lowTrueValue={trueRise()}
          highTrueValue={trueDecay()}
        />
        <ParameterSlider
          label="Sparsity"
          value={lambda}
          setValue={setLambda}
          min={PARAM_RANGES.lambda.min}
          max={PARAM_RANGES.lambda.max}
          step={0.01}
          format={(v) => v.toFixed(2)}
          data-tutorial="slider-lambda"
        />
      </div>
      <div class="param-panel__toggle-group" data-tutorial="noise-filter">
        <label class="param-panel__toggle">
          <input
            type="checkbox"
            checked={filterEnabled()}
            onChange={(e) => {
              setFilterEnabled(e.currentTarget.checked);
              notifyTutorialAction();
            }}
          />
          <span class="param-panel__toggle-label">Noise Filter</span>
        </label>
        <span class="param-panel__toggle-desc">Bandpass filter derived from kernel</span>
      </div>
    </div>
  );
}
