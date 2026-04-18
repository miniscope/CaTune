import { createStore } from 'solid-js/store';
import type { FrameSourceMeta } from '@calab/io';
import type { RuntimeState } from '@calab/cala-runtime';

export interface CaLaStoreState {
  file: File | null;
  meta: FrameSourceMeta | null;
  runState: RuntimeState;
  errorMsg: string | null;
}

const INITIAL_STATE: CaLaStoreState = {
  file: null,
  meta: null,
  runState: 'idle',
  errorMsg: null,
};

const [state, setState] = createStore<CaLaStoreState>({ ...INITIAL_STATE });

export { state };

export function setFile(file: File, meta: FrameSourceMeta): void {
  setState({ file, meta, errorMsg: null });
}

export function clearFile(): void {
  setState({ ...INITIAL_STATE });
}

export function setRunState(runState: RuntimeState): void {
  setState('runState', runState);
}

export function setErrorMsg(errorMsg: string | null): void {
  setState('errorMsg', errorMsg);
}

// Test-only reset so tests don't bleed state across cases. The module-
// level store is a singleton by design (the UI reads from it), so tests
// call this in beforeEach.
export function __resetStoreForTests(): void {
  setState({ ...INITIAL_STATE });
}
