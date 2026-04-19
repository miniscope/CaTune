/**
 * Main-thread cache of the five header-bar vitals (design §12).
 *
 * Subscribes to an `ArchiveClient` and polls each metric on a fixed
 * cadence, merging the L1 + L2 tiers into a single flat series the
 * sparkline can render without knowing about the retention scheme.
 * The store lives independently from `dashboard-store` because the
 * polling lifecycle is bound to the vitals-bar mount, not to the
 * run-state.
 */
import { createStore } from 'solid-js/store';
import type { ArchiveClient } from './archive-client.ts';
import { VITALS_METRIC_NAMES } from './vitals.ts';

// Poll cadence per metric. 500 ms feels responsive on the sparkline
// and scales to 5 req/s total across the vitals bar — well below the
// archive worker's throughput.
export const DEFAULT_VITALS_POLL_INTERVAL_MS = 500;
// Max points shown per sparkline. 120 columns at 500 ms ≈ 60 s of
// recent history, matching design §12 header-bar intent.
export const DEFAULT_VITALS_WINDOW_SAMPLES = 120;

export interface VitalsState {
  seriesByName: Record<string, Float32Array>;
  latestByName: Record<string, number>;
  lastUpdateAt: number | null;
}

function emptyState(): VitalsState {
  const series: Record<string, Float32Array> = {};
  const latest: Record<string, number> = {};
  for (const name of VITALS_METRIC_NAMES) {
    series[name] = new Float32Array(0);
    latest[name] = 0;
  }
  return { seriesByName: series, latestByName: latest, lastUpdateAt: null };
}

const [vitals, setVitals] = createStore<VitalsState>(emptyState());
export { vitals };

export interface VitalsPollerHandle {
  stop(): void;
}

/**
 * Start polling a set of metric names from an ArchiveClient into the
 * store. Returns a handle whose `stop()` cancels the interval; safe to
 * call multiple times (second call is a no-op). Caller owns the
 * client lifecycle.
 */
export function startVitalsPolling(
  client: ArchiveClient,
  options: {
    names?: readonly string[];
    intervalMs?: number;
    windowSamples?: number;
  } = {},
): VitalsPollerHandle {
  const names = options.names ?? VITALS_METRIC_NAMES;
  const interval = options.intervalMs ?? DEFAULT_VITALS_POLL_INTERVAL_MS;
  const windowSamples = options.windowSamples ?? DEFAULT_VITALS_WINDOW_SAMPLES;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function pollOnce(): Promise<void> {
    await Promise.all(
      names.map(async (name) => {
        try {
          const reply = await client.requestTimeseries(name);
          // Merge L2 (older downsampled) then L1 (recent full-res) in
          // time order — the sparkline renders oldest→newest.
          const merged = new Float32Array(reply.l2Values.length + reply.l1Values.length);
          merged.set(reply.l2Values, 0);
          merged.set(reply.l1Values, reply.l2Values.length);
          const windowed =
            merged.length > windowSamples ? merged.slice(merged.length - windowSamples) : merged;
          const latest = merged.length > 0 ? merged[merged.length - 1] : 0;
          setVitals('seriesByName', name, windowed);
          setVitals('latestByName', name, latest);
        } catch {
          // Soft fail — the sparkline keeps showing its previous data.
          // Transient archive-dump timeouts are expected during shutdown.
        }
      }),
    );
    setVitals('lastUpdateAt', Date.now());
  }

  function schedule(): void {
    if (stopped) return;
    pollOnce().finally(() => {
      if (stopped) return;
      timer = setTimeout(schedule, interval);
    });
  }
  // Fire-immediately-then-interval: the bar feels live as soon as the
  // user mounts it.
  timer = setTimeout(schedule, 0);

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/** Reset the store to empty. Call when a run ends / restarts. */
export function resetVitals(): void {
  setVitals(emptyState());
}
