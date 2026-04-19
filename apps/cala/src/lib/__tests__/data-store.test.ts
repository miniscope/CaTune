import { describe, it, expect, beforeEach } from 'vitest';
import type { FrameSourceMeta } from '@calab/io';
import {
  state,
  setFile,
  clearFile,
  setRunState,
  setErrorMsg,
  __resetStoreForTests,
} from '../data-store.ts';

function makeMeta(overrides: Partial<FrameSourceMeta> = {}): FrameSourceMeta {
  return {
    width: 256,
    height: 256,
    frameCount: 1000,
    fps: 30,
    channels: 1,
    bitDepth: 8,
    ...overrides,
  };
}

function makeFile(name = 'test.avi'): File {
  return new File([new Uint8Array(4)], name);
}

describe('cala data-store', () => {
  beforeEach(() => {
    __resetStoreForTests();
  });

  it('initial state has no file, no meta, idle run, no error', () => {
    expect(state.file).toBeNull();
    expect(state.meta).toBeNull();
    expect(state.runState).toBe('idle');
    expect(state.errorMsg).toBeNull();
  });

  it('setFile stores file and meta and clears any error', () => {
    setErrorMsg('prior');
    const f = makeFile('rec.avi');
    const m = makeMeta({ width: 640, height: 480 });
    setFile(f, m);
    expect(state.file).toBe(f);
    expect(state.meta).toEqual(m);
    expect(state.errorMsg).toBeNull();
  });

  it('clearFile resets all fields to initial state', () => {
    setFile(makeFile(), makeMeta());
    setRunState('running');
    setErrorMsg('boom');
    clearFile();
    expect(state.file).toBeNull();
    expect(state.meta).toBeNull();
    expect(state.runState).toBe('idle');
    expect(state.errorMsg).toBeNull();
  });

  it('setRunState drives all runtime state transitions', () => {
    const ordered = ['idle', 'starting', 'running', 'stopping', 'stopped'] as const;
    for (const s of ordered) {
      setRunState(s);
      expect(state.runState).toBe(s);
    }
    setRunState('error');
    expect(state.runState).toBe('error');
  });

  it('setErrorMsg stores the message and can be cleared with null', () => {
    setErrorMsg('decode failed');
    expect(state.errorMsg).toBe('decode failed');
    setErrorMsg(null);
    expect(state.errorMsg).toBeNull();
  });
});
