import { openAviUncompressed } from '@calab/io';
import type { FrameSource, FrameSourceMeta } from '@calab/io';
import {
  createRuntime,
  type RuntimeConfig,
  type RuntimeController,
  type RuntimeState,
  type WorkerFactory,
  type WorkerLike,
  type WorkerRole,
} from '@calab/cala-runtime';
import { state, setRunState, setErrorMsg } from './data-store.ts';

// Ring / queue sizing defaults (design §7.1, §7.3, §13).
// Kept in one place so future tuning passes have a single knob per
// parameter. Values err conservative: depths large enough that a brief
// scheduler hiccup on any single worker doesn't instantly overflow.
const DEFAULT_FRAME_CHANNEL_SLOTS = 4;
const DEFAULT_RESIDUAL_CHANNEL_SLOTS = 4;
const DEFAULT_CHANNEL_WAIT_TIMEOUT_MS = 50;
const DEFAULT_CHANNEL_POLL_INTERVAL_MS = 1;
const DEFAULT_MUTATION_QUEUE_CAPACITY = 32;
const DEFAULT_SNAPSHOT_ACK_TIMEOUT_MS = 1000;
const DEFAULT_SNAPSHOT_PENDING_CAPACITY = 2;
const DEFAULT_SNAPSHOT_POLL_INTERVAL_MS = 5;
const DEFAULT_EVENT_BUS_CAPACITY = 1024;
const DEFAULT_EVENT_BUS_MAX_SUBSCRIBERS = 8;
const DEFAULT_STARTUP_TIMEOUT_MS = 5000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;
// f32 grayscale → 4 bytes per pixel.
const BYTES_PER_F32_PIXEL = 4;

export type WorkerFactories = Record<WorkerRole, WorkerFactory>;

function noopWorker(): WorkerLike {
  // Stub worker for tests and for wiring in the UI before the real
  // workers land (tasks 21-23). Never signals ready, never signals
  // done — the real factories override this at call-site.
  return {
    postMessage: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    terminate: () => {},
  };
}

function defaultWorkerFactories(): WorkerFactories {
  return {
    decodePreprocess: noopWorker,
    fit: noopWorker,
    extend: noopWorker,
    archive: noopWorker,
  };
}

function buildConfig(meta: FrameSourceMeta, factories: WorkerFactories): RuntimeConfig {
  const frameBytes = meta.width * meta.height * BYTES_PER_F32_PIXEL;
  return {
    workerFactories: factories,
    frameChannel: {
      slotBytes: frameBytes,
      slotCount: DEFAULT_FRAME_CHANNEL_SLOTS,
      waitTimeoutMs: DEFAULT_CHANNEL_WAIT_TIMEOUT_MS,
      pollIntervalMs: DEFAULT_CHANNEL_POLL_INTERVAL_MS,
    },
    residualChannel: {
      slotBytes: frameBytes,
      slotCount: DEFAULT_RESIDUAL_CHANNEL_SLOTS,
      waitTimeoutMs: DEFAULT_CHANNEL_WAIT_TIMEOUT_MS,
      pollIntervalMs: DEFAULT_CHANNEL_POLL_INTERVAL_MS,
    },
    mutationQueue: { capacity: DEFAULT_MUTATION_QUEUE_CAPACITY },
    snapshotProtocol: {
      ackTimeoutMs: DEFAULT_SNAPSHOT_ACK_TIMEOUT_MS,
      pendingCapacity: DEFAULT_SNAPSHOT_PENDING_CAPACITY,
      pollIntervalMs: DEFAULT_SNAPSHOT_POLL_INTERVAL_MS,
    },
    eventBus: {
      capacity: DEFAULT_EVENT_BUS_CAPACITY,
      maxSubscribers: DEFAULT_EVENT_BUS_MAX_SUBSCRIBERS,
    },
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    shutdownTimeoutMs: DEFAULT_SHUTDOWN_TIMEOUT_MS,
  };
}

// Opaque thunk the runtime passes to the decoder worker (design §7).
// `RuntimeConfig.sources.frameSourceFactory` is typed `unknown`, so we
// build it here as a plain function that returns a `FrameSource` and
// cast to `unknown` at the `RuntimeSource` boundary.
type FrameSourceFactory = (file: File) => Promise<FrameSource>;
const frameSourceFactory: FrameSourceFactory = openAviUncompressed;

let currentRuntime: RuntimeController | null = null;
let currentUnsubscribe: (() => void) | null = null;

export interface StartOptions {
  factories?: WorkerFactories;
}

export async function startRun(opts: StartOptions = {}): Promise<void> {
  if (currentRuntime !== null) {
    throw new Error('run already in progress');
  }
  const file = state.file;
  const meta = state.meta;
  if (file === null || meta === null) {
    throw new Error('no file loaded');
  }

  setErrorMsg(null);
  setRunState('starting');

  const factories = opts.factories ?? defaultWorkerFactories();
  const cfg = buildConfig(meta, factories);
  const rt = createRuntime(cfg);
  currentRuntime = rt;
  currentUnsubscribe = rt.onStatus((status) => {
    setRunState(status.state);
    if (status.error !== undefined) setErrorMsg(status.error);
  });

  const source = {
    kind: 'file' as const,
    file,
    frameSourceFactory: frameSourceFactory as unknown,
  };

  try {
    await rt.run(source);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setErrorMsg(msg);
    setRunState('error');
    throw err;
  } finally {
    currentUnsubscribe?.();
    currentUnsubscribe = null;
    currentRuntime = null;
  }
}

export async function stopRun(): Promise<void> {
  const rt = currentRuntime;
  if (rt === null) return;
  await rt.stop();
}

export function currentRunState(): RuntimeState {
  return state.runState;
}

// Test-only hook so the lifecycle test can inspect whether the
// runtime handle has been released.
export function __hasActiveRuntimeForTests(): boolean {
  return currentRuntime !== null;
}
