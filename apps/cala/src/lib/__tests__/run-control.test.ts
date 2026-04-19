import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  WorkerFactory,
  WorkerInbound,
  WorkerLike,
  WorkerOutbound,
  WorkerRole,
} from '@calab/cala-runtime';
import type { FrameSourceMeta } from '@calab/io';
import { state, setFile, __resetStoreForTests } from '../data-store.ts';
import {
  startRun,
  stopRun,
  __hasActiveRuntimeForTests,
  type WorkerFactories,
} from '../run-control.ts';

const WORKER_ROLES: readonly WorkerRole[] = ['decodePreprocess', 'fit', 'extend', 'archive'];

class FakeWorker implements WorkerLike {
  public readonly posted: WorkerInbound[] = [];
  public terminated = false;
  private readonly listeners = new Set<(ev: { data: WorkerOutbound }) => void>();
  constructor(public readonly role: WorkerRole) {}
  postMessage(message: WorkerInbound): void {
    this.posted.push(message);
  }
  addEventListener(_type: 'message', listener: (ev: { data: WorkerOutbound }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (ev: { data: WorkerOutbound }) => void): void {
    this.listeners.delete(listener);
  }
  terminate(): void {
    this.terminated = true;
    this.listeners.clear();
  }
  push(msg: WorkerOutbound): void {
    for (const l of [...this.listeners]) l({ data: msg });
  }
}

class Harness {
  readonly workers = new Map<WorkerRole, FakeWorker>();
  factories(): WorkerFactories {
    const make =
      (role: WorkerRole): WorkerFactory =>
      () => {
        const w = new FakeWorker(role);
        this.workers.set(role, w);
        return w;
      };
    return {
      decodePreprocess: make('decodePreprocess'),
      fit: make('fit'),
      extend: make('extend'),
      archive: make('archive'),
    };
  }
  get(role: WorkerRole): FakeWorker {
    const w = this.workers.get(role);
    if (!w) throw new Error(`worker ${role} not spawned`);
    return w;
  }
  pushReadyAll(): void {
    for (const [role, w] of this.workers) w.push({ kind: 'ready', role });
  }
  pushDoneAll(): void {
    for (const [role, w] of this.workers) w.push({ kind: 'done', role });
  }
}

function makeMeta(overrides: Partial<FrameSourceMeta> = {}): FrameSourceMeta {
  return {
    width: 64,
    height: 64,
    frameCount: 10,
    fps: 30,
    channels: 1,
    bitDepth: 8,
    ...overrides,
  };
}

function seedFile(meta: FrameSourceMeta = makeMeta()): void {
  setFile(new File([new Uint8Array(4)], 'fake.avi'), meta);
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('cala run-control', () => {
  beforeEach(() => {
    __resetStoreForTests();
  });

  afterEach(async () => {
    if (__hasActiveRuntimeForTests()) {
      try {
        await stopRun();
      } catch {
        // test cleanup — ignore
      }
    }
  });

  it('startRun rejects when no file is loaded', async () => {
    await expect(startRun()).rejects.toThrow(/no file/);
    expect(state.runState).toBe('idle');
  });

  it('drives idle → starting → running → stopping → stopped across the lifecycle', async () => {
    seedFile();
    const harness = new Harness();

    const runP = startRun({ factories: harness.factories() });
    await flush();
    expect(state.runState).toBe('starting');

    harness.pushReadyAll();
    await flush();
    expect(state.runState).toBe('running');

    const stopP = stopRun();
    await flush();
    expect(state.runState).toBe('stopping');

    harness.pushDoneAll();
    await Promise.all([stopP, runP]);
    expect(state.runState).toBe('stopped');
    expect(__hasActiveRuntimeForTests()).toBe(false);
  });

  it('posts init to all four workers on start', async () => {
    seedFile();
    const harness = new Harness();
    const runP = startRun({ factories: harness.factories() });
    await flush();
    for (const role of WORKER_ROLES) {
      const w = harness.get(role);
      expect(w.posted.length).toBeGreaterThanOrEqual(1);
      expect(w.posted[0].kind).toBe('init');
    }
    harness.pushReadyAll();
    await flush();
    harness.pushDoneAll();
    await stopRun();
    await runP.catch(() => {});
  });

  it('surfaces worker errors to the store and transitions to error', async () => {
    seedFile();
    const harness = new Harness();
    const runP = startRun({ factories: harness.factories() });
    await flush();

    harness.pushReadyAll();
    await flush();
    expect(state.runState).toBe('running');

    harness.get('fit').push({ kind: 'error', role: 'fit', message: 'boom' });
    await expect(runP).rejects.toThrow();
    expect(state.runState).toBe('error');
    expect(state.errorMsg).toContain('boom');
    expect(__hasActiveRuntimeForTests()).toBe(false);
  });

  it('stopRun is a no-op when no run is active', async () => {
    await expect(stopRun()).resolves.toBeUndefined();
    expect(state.runState).toBe('idle');
  });
});
