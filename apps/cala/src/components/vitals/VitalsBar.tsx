import { createEffect, createSignal, For, onCleanup, Show, type JSX } from 'solid-js';
import { createArchiveClient, type ArchiveClient } from '../../lib/archive-client.ts';
import { currentArchiveWorkerForClient } from '../../lib/run-control.ts';
import { state } from '../../lib/data-store.ts';
import {
  METRIC_CELL_COUNT,
  METRIC_EXTEND_QUEUE_DEPTH,
  METRIC_FPS,
  METRIC_MEMORY_BYTES,
  METRIC_RESIDUAL_L2,
  type VitalsMetricName,
} from '../../lib/vitals.ts';
import {
  resetVitals,
  startVitalsPolling,
  vitals,
  type VitalsPollerHandle,
} from '../../lib/vitals-store.ts';
import { SparkLine } from './SparkLine.tsx';

// MB divisor for memory_bytes formatting.
const BYTES_PER_MIB = 1024 * 1024;

interface VitalDisplay {
  name: VitalsMetricName;
  label: string;
  format: (v: number) => string;
}

const VITALS: VitalDisplay[] = [
  { name: METRIC_CELL_COUNT, label: 'cells', format: (v) => String(Math.round(v)) },
  { name: METRIC_FPS, label: 'fps', format: (v) => v.toFixed(1) },
  {
    name: METRIC_MEMORY_BYTES,
    label: 'mem',
    format: (v) => `${(v / BYTES_PER_MIB).toFixed(0)} MiB`,
  },
  { name: METRIC_RESIDUAL_L2, label: 'res', format: (v) => v.toFixed(3) },
  {
    name: METRIC_EXTEND_QUEUE_DEPTH,
    label: 'queue',
    format: (v) => String(Math.round(v)),
  },
];

export function VitalsBar(): JSX.Element {
  const [client, setClient] = createSignal<ArchiveClient | null>(null);
  let poller: VitalsPollerHandle | null = null;

  // Rebuild the archive client whenever the run state becomes running —
  // we need the current archive worker, which is only available once
  // the orchestrator spins up. When the run ends we tear it down.
  createEffect(() => {
    const rs = state.runState;
    if (rs === 'running') {
      const worker = currentArchiveWorkerForClient();
      if (!worker) return;
      const c = createArchiveClient(worker);
      setClient(c);
      poller = startVitalsPolling(c);
    } else {
      poller?.stop();
      poller = null;
      const c = client();
      c?.dispose();
      setClient(null);
      if (rs === 'idle' || rs === 'stopped' || rs === 'error') resetVitals();
    }
  });

  onCleanup(() => {
    poller?.stop();
    client()?.dispose();
  });

  return (
    <div class="vitals-bar" role="group" aria-label="Pipeline vitals">
      <For each={VITALS}>
        {(v) => (
          <div class="vitals-bar__cell" title={v.name}>
            <div class="vitals-bar__label">{v.label}</div>
            <div class="vitals-bar__value">{v.format(vitals.latestByName[v.name] ?? 0)}</div>
            <Show when={vitals.seriesByName[v.name]?.length > 1}>
              <SparkLine values={vitals.seriesByName[v.name]} title={v.name} />
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
