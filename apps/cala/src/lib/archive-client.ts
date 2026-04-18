import type { PipelineEvent, WorkerLike, WorkerOutbound, Unsubscribe } from '@calab/cala-runtime';

// Polling cadence for the dashboard's periodic dump (design §10). One
// pull per second is fast enough that the UI feels live and slow
// enough that the worker spends >99% of its time in the event bus.
export const DEFAULT_POLL_INTERVAL_MS = 1000;

// Maximum wait for a single archive-dump reply. Sized well above the
// polling cadence so transient worker-side stalls don't spuriously
// time out in normal operation.
export const DEFAULT_DUMP_TIMEOUT_MS = 5000;

export interface ArchiveDump {
  events: PipelineEvent[];
  metrics: Record<string, number>;
}

export interface ArchiveClient {
  requestDump(): Promise<ArchiveDump>;
  startPolling(cb: (dump: ArchiveDump) => void): void;
  stopPolling(): void;
  onEvent(cb: (e: PipelineEvent) => void): Unsubscribe;
  dispose(): void;
}

export interface ArchiveClientOptions {
  pollIntervalMs?: number;
  dumpTimeoutMs?: number;
}

class DumpAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DumpAbortError';
  }
}

class DumpTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DumpTimeoutError';
  }
}

interface PendingDump {
  resolve: (dump: ArchiveDump) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createArchiveClient(
  worker: WorkerLike,
  options: ArchiveClientOptions = {},
): ArchiveClient {
  const pollInterval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const dumpTimeout = options.dumpTimeoutMs ?? DEFAULT_DUMP_TIMEOUT_MS;

  const pending = new Map<number, PendingDump>();
  const eventListeners = new Set<(e: PipelineEvent) => void>();
  let nextRequestId = 1;
  let disposed = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollCallback: ((dump: ArchiveDump) => void) | null = null;

  const handleMessage = (ev: { data: WorkerOutbound }): void => {
    const msg = ev.data;
    if (msg.kind === 'archive-dump') {
      const entry = pending.get(msg.requestId);
      // Unknown-id replies (e.g. from a disposed-and-recreated client
      // sharing the worker) must not spuriously resolve a waiter.
      if (!entry) return;
      pending.delete(msg.requestId);
      clearTimeout(entry.timer);
      entry.resolve({ events: msg.events, metrics: msg.metrics });
      return;
    }
    if (msg.kind === 'event') {
      for (const cb of eventListeners) cb(msg.event);
      return;
    }
  };

  worker.addEventListener('message', handleMessage);

  function requestDump(): Promise<ArchiveDump> {
    if (disposed) {
      return Promise.reject(new DumpAbortError('archive client disposed'));
    }
    const requestId = nextRequestId;
    nextRequestId += 1;
    return new Promise<ArchiveDump>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(
          new DumpTimeoutError(
            `archive dump (requestId=${requestId}) timed out after ${dumpTimeout}ms`,
          ),
        );
      }, dumpTimeout);
      pending.set(requestId, { resolve, reject, timer });
      worker.postMessage({ kind: 'request-archive-dump', requestId });
    });
  }

  function startPolling(cb: (dump: ArchiveDump) => void): void {
    if (disposed) return;
    pollCallback = cb;
    const tick = (): void => {
      if (disposed || pollCallback === null) return;
      requestDump()
        .then((dump) => {
          if (!disposed && pollCallback !== null) pollCallback(dump);
        })
        .catch(() => {
          // Polling soft-fails per design §10 — dashboard is cosmetic.
          // A miss at one tick is recovered by the next.
        })
        .finally(() => {
          if (disposed || pollCallback === null) return;
          pollTimer = setTimeout(tick, pollInterval);
        });
    };
    // Fire-immediately-then-interval: the dashboard feels live from
    // the moment the run starts rather than waiting one full period.
    pollTimer = setTimeout(tick, 0);
  }

  function stopPolling(): void {
    pollCallback = null;
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function onEvent(cb: (e: PipelineEvent) => void): Unsubscribe {
    eventListeners.add(cb);
    return () => {
      eventListeners.delete(cb);
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    stopPolling();
    worker.removeEventListener('message', handleMessage);
    eventListeners.clear();
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new DumpAbortError('archive client disposed'));
    }
    pending.clear();
  }

  return { requestDump, startPolling, stopPolling, onEvent, dispose };
}
