/**
 * Shared simulation configuration component for CaTune and CaDecon.
 *
 * Renders an indicator dropdown + segmented button groups for each
 * simulation pipeline step (spike activity, noise, drift, etc.).
 * All level definitions live in @calab/compute/simulation-quality-presets.
 */

import { For } from 'solid-js';
import type { QualitativeSimConfig } from '@calab/compute';
import {
  INDICATOR_OPTIONS,
  SPIKE_ACTIVITY_LEVELS,
  NOISE_LEVELS,
  DRIFT_LEVELS,
  PHOTOBLEACHING_LEVELS,
  SATURATION_LEVELS,
  CELL_VARIATION_LEVELS,
} from '@calab/compute';
import './styles/simulation-configurator.css';

export interface SimulationConfiguratorProps {
  config: QualitativeSimConfig;
  onChange: (config: QualitativeSimConfig) => void;
}

function SegmentedRow<T extends string>(props: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div class="sim-configurator__row">
      <label class="sim-configurator__label">{props.label}</label>
      <div class="segmented-control">
        <For each={props.options as { id: T; label: string }[]}>
          {(opt) => (
            <button
              class={`segmented-control__btn${opt.id === props.value ? ' segmented-control__btn--active' : ''}`}
              onClick={() => props.onChange(opt.id)}
            >
              {opt.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

export function SimulationConfigurator(props: SimulationConfiguratorProps) {
  const update = <K extends keyof QualitativeSimConfig>(key: K, value: QualitativeSimConfig[K]) => {
    props.onChange({ ...props.config, [key]: value });
  };

  return (
    <div class="sim-configurator">
      <div class="sim-configurator__row">
        <label class="sim-configurator__label">Indicator</label>
        <select
          class="sim-configurator__select"
          value={props.config.indicator}
          onChange={(e) =>
            update('indicator', e.currentTarget.value as QualitativeSimConfig['indicator'])
          }
        >
          <For
            each={
              INDICATOR_OPTIONS as unknown as { id: string; label: string; description: string }[]
            }
          >
            {(opt) => <option value={opt.id}>{opt.label}</option>}
          </For>
        </select>
      </div>

      <SegmentedRow
        label="Spikes"
        options={SPIKE_ACTIVITY_LEVELS}
        value={props.config.spikeActivity}
        onChange={(v) => update('spikeActivity', v)}
      />
      <SegmentedRow
        label="Noise"
        options={NOISE_LEVELS}
        value={props.config.noise}
        onChange={(v) => update('noise', v)}
      />
      <SegmentedRow
        label="Drift"
        options={DRIFT_LEVELS}
        value={props.config.drift}
        onChange={(v) => update('drift', v)}
      />
      <SegmentedRow
        label="Bleaching"
        options={PHOTOBLEACHING_LEVELS}
        value={props.config.photobleaching}
        onChange={(v) => update('photobleaching', v)}
      />
      <SegmentedRow
        label="Saturation"
        options={SATURATION_LEVELS}
        value={props.config.saturation}
        onChange={(v) => update('saturation', v)}
      />
      <SegmentedRow
        label="Cell Var."
        options={CELL_VARIATION_LEVELS}
        value={props.config.cellVariation}
        onChange={(v) => update('cellVariation', v)}
      />
    </div>
  );
}
