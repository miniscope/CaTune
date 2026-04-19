import { createStore } from 'solid-js/store';
import type { PipelineEvent } from '@calab/cala-runtime';

// Rolling window for the dashboard event log (design §9.2, §10). Kept
// much smaller than the archive worker's ring — the dashboard only
// shows a recent tail, full history stays in W4.
export const DEFAULT_EVENT_WINDOW = 500;

export interface DashboardState {
  events: PipelineEvent[];
  metrics: Record<string, number>;
  lastDumpAt: number | null;
  currentFrameIndex: number | null;
  currentEpoch: bigint | null;
}

export interface ArchiveDump {
  events: PipelineEvent[];
  metrics: Record<string, number>;
}

function emptyState(): DashboardState {
  return {
    events: [],
    metrics: {},
    lastDumpAt: null,
    currentFrameIndex: null,
    currentEpoch: null,
  };
}

const [dashboard, setDashboard] = createStore<DashboardState>(emptyState());

export { dashboard };

export function applyDump(dump: ArchiveDump, nowMs?: number): void {
  // Keep only the tail when an oversized dump arrives — the dashboard
  // view only ever renders the most recent slice, and holding the full
  // archive ring on the main thread would defeat the purpose of W4.
  const trimmed =
    dump.events.length > DEFAULT_EVENT_WINDOW
      ? dump.events.slice(dump.events.length - DEFAULT_EVENT_WINDOW)
      : dump.events.slice();
  setDashboard({
    events: trimmed,
    metrics: { ...dump.metrics },
    lastDumpAt: nowMs ?? Date.now(),
  });
}

export function recordFrameProcessed(index: number, epoch: bigint): void {
  setDashboard({ currentFrameIndex: index, currentEpoch: epoch });
}

export function resetDashboard(): void {
  setDashboard(emptyState());
}
