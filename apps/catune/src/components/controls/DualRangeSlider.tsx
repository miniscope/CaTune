// Dual-thumb range slider for rise/decay time constants on a shared log-scale track.
// Both thumbs share one time axis so their positions are directly comparable.

import { Show } from 'solid-js';
import type { JSX, Accessor } from 'solid-js';
import { notifyTutorialAction, isTutorialActive } from '@calab/tutorials';

interface DualRangeSliderProps {
  label: string;
  lowLabel: string;
  highLabel: string;
  lowValue: Accessor<number>;
  highValue: Accessor<number>;
  setLowValue: (v: number) => void;
  setHighValue: (v: number) => void;
  /** Overall track range (min of the shared log axis). */
  min: number;
  /** Overall track range (max of the shared log axis). */
  max: number;
  /** Clamp bounds for the low thumb. */
  lowMin: number;
  lowMax: number;
  /** Clamp bounds for the high thumb. */
  highMin: number;
  highMax: number;
  format?: (v: number) => string;
  unit?: string;
  lowTrueValue?: number;
  highTrueValue?: number;
  'data-tutorial-low'?: string;
  'data-tutorial-high'?: string;
  onCommit?: () => void;
}

const toLog = (v: number): number => Math.log(v);
const fromLog = (p: number): number => Math.exp(p);

function parseInput(e: Event): number | null {
  const raw = parseFloat((e.target as HTMLInputElement).value);
  return isNaN(raw) ? null : raw;
}

export function DualRangeSlider(props: DualRangeSliderProps): JSX.Element {
  const fmt = (v: number) => (props.format ? props.format(v) : v.toString());

  const sliderMin = () => toLog(props.min);
  const sliderMax = () => toLog(props.max);
  const sliderRange = () => sliderMax() - sliderMin();

  const toPct = (v: number) => ((toLog(v) - sliderMin()) / sliderRange()) * 100;

  const lowPct = () => toPct(props.lowValue());
  const highPct = () => toPct(props.highValue());

  // --- Range input handlers (log-space) ---

  function handleLowRange(e: Event): void {
    const logVal = parseInput(e);
    if (logVal === null) return;
    const val = fromLog(logVal);
    const clamped = Math.max(props.lowMin, Math.min(props.lowMax, val));
    props.setLowValue(clamped);
  }

  function handleHighRange(e: Event): void {
    const logVal = parseInput(e);
    if (logVal === null) return;
    const val = fromLog(logVal);
    const clamped = Math.max(props.highMin, Math.min(props.highMax, val));
    props.setHighValue(clamped);
  }

  function handleCommit(): void {
    props.onCommit?.();
    if (isTutorialActive()) notifyTutorialAction();
  }

  // --- Numeric input handlers (display-space, ms) ---

  function handleLowNumeric(e: Event): void {
    const raw = parseInput(e);
    if (raw === null) return;
    // Numeric input shows ms, convert back to seconds
    const seconds = raw / 1000;
    const clamped = Math.max(props.lowMin, Math.min(props.lowMax, seconds));
    props.setLowValue(clamped);
  }

  function handleHighNumeric(e: Event): void {
    const raw = parseInput(e);
    if (raw === null) return;
    const seconds = raw / 1000;
    const clamped = Math.max(props.highMin, Math.min(props.highMax, seconds));
    props.setHighValue(clamped);
  }

  const STEP_LOG = 0.01;

  return (
    <div class="dual-range">
      <div class="dual-range__header">
        <span class="param-slider__label">{props.label}</span>
      </div>
      <div class="dual-range__values">
        <div data-tutorial={props['data-tutorial-low']}>
          <label class="dual-range__field">
            <span class="dual-range__field-label">{props.lowLabel}</span>
            <input
              type="number"
              class="param-slider__number"
              value={fmt(props.lowValue())}
              min={props.format ? props.format(props.lowMin) : props.lowMin}
              max={props.format ? props.format(props.lowMax) : props.lowMax}
              step={1}
              onInput={handleLowNumeric}
              onChange={handleCommit}
            />
            <span class="param-slider__unit">{props.unit ?? ''}</span>
          </label>
        </div>
        <div data-tutorial={props['data-tutorial-high']}>
          <label class="dual-range__field">
            <span class="dual-range__field-label">{props.highLabel}</span>
            <input
              type="number"
              class="param-slider__number"
              value={fmt(props.highValue())}
              min={props.format ? props.format(props.highMin) : props.highMin}
              max={props.format ? props.format(props.highMax) : props.highMax}
              step={1}
              onInput={handleHighNumeric}
              onChange={handleCommit}
            />
            <span class="param-slider__unit">{props.unit ?? ''}</span>
          </label>
        </div>
      </div>
      <div class="dual-range__track">
        <div
          class="dual-range__fill"
          style={{ left: `${lowPct()}%`, width: `${highPct() - lowPct()}%` }}
        />
        <input
          type="range"
          class="dual-range__input dual-range__input--low"
          min={sliderMin()}
          max={sliderMax()}
          step={STEP_LOG}
          value={toLog(props.lowValue())}
          onInput={handleLowRange}
          onChange={handleCommit}
        />
        <input
          type="range"
          class="dual-range__input dual-range__input--high"
          min={sliderMin()}
          max={sliderMax()}
          step={STEP_LOG}
          value={toLog(props.highValue())}
          onInput={handleHighRange}
          onChange={handleCommit}
        />
        <Show when={props.lowTrueValue !== undefined}>
          <div
            class="param-slider__true-marker"
            style={{ left: `${toPct(props.lowTrueValue!)}%` }}
            title={`True rise: ${fmt(props.lowTrueValue!)} ${props.unit ?? ''}`}
          />
        </Show>
        <Show when={props.highTrueValue !== undefined}>
          <div
            class="param-slider__true-marker"
            style={{ left: `${toPct(props.highTrueValue!)}%` }}
            title={`True decay: ${fmt(props.highTrueValue!)} ${props.unit ?? ''}`}
          />
        </Show>
      </div>
    </div>
  );
}
