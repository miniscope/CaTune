// Parameter control panel grouping sliders (tPeak, FWHM, lambda)
// with a convergence indicator. Consumed by the App/tuning view.
// Lambda and solver status signals live in viz-store (centralized).

import {
  tPeak,
  fwhm,
  setTPeak,
  setFwhm,
  lambda,
  setLambda,
  filterEnabled,
  setFilterEnabled,
} from '../../lib/viz-store.ts';
import { tauToShape } from '@calab/compute';
import { notifyTutorialAction } from '@calab/tutorials';
import { isDemo, demoPreset, groundTruthVisible } from '../../lib/data-store.ts';
import { PARAM_RANGES } from '@calab/core';
import { ParameterSlider } from './ParameterSlider.tsx';
import { DualRangeSlider } from './DualRangeSlider.tsx';
import '../../styles/controls.css';

export function ParameterPanel() {
  // Enforce fwhm > tPeak so the kernel shape stays valid.
  const minGap = PARAM_RANGES.fwhm.step;
  const clampedSetTPeak = (v: number) => {
    setTPeak(v);
    if (fwhm() < v + minGap) setFwhm(v + minGap);
  };
  const clampedSetFwhm = (v: number) => {
    setFwhm(v);
    if (tPeak() > v - minGap) setTPeak(v - minGap);
  };

  const truePeak = () => {
    if (!groundTruthVisible() || !isDemo() || !demoPreset()) return undefined;
    const preset = demoPreset()!;
    const shape = tauToShape(preset.params.tauRise, preset.params.tauDecay);
    return shape?.tPeak;
  };

  const trueFwhm = () => {
    if (!groundTruthVisible() || !isDemo() || !demoPreset()) return undefined;
    const preset = demoPreset()!;
    const shape = tauToShape(preset.params.tauRise, preset.params.tauDecay);
    return shape?.fwhm;
  };

  return (
    <div class="param-panel" data-tutorial="param-panel">
      <div class="param-panel__sliders">
        <DualRangeSlider
          label="Kernel Shape"
          lowLabel="Peak"
          highLabel="FWHM"
          lowValue={tPeak}
          highValue={fwhm}
          setLowValue={clampedSetTPeak}
          setHighValue={clampedSetFwhm}
          min={PARAM_RANGES.tPeak.min}
          max={PARAM_RANGES.fwhm.max}
          lowMin={PARAM_RANGES.tPeak.min}
          lowMax={PARAM_RANGES.tPeak.max}
          highMin={PARAM_RANGES.fwhm.min}
          highMax={PARAM_RANGES.fwhm.max}
          format={(v) => (v * 1000).toFixed(1)}
          unit="ms"
          data-tutorial-low="slider-peak"
          data-tutorial-high="slider-fwhm"
          lowTrueValue={truePeak()}
          highTrueValue={trueFwhm()}
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
