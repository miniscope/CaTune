import type { JSX } from 'solid-js';
import { CompactHeader } from '@calab/ui';
import { state } from '../../lib/data-store.ts';
import type { RuntimeState } from '@calab/cala-runtime';

const STATE_COLORS: Record<RuntimeState, string> = {
  idle: 'var(--text-tertiary)',
  starting: 'var(--warning)',
  running: 'var(--success)',
  stopping: 'var(--warning)',
  stopped: 'var(--text-tertiary)',
  error: 'var(--error)',
};

const STATE_LABELS: Record<RuntimeState, string> = {
  idle: 'Idle',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  stopped: 'Stopped',
  error: 'Error',
};

export function CaLaHeader(): JSX.Element {
  const version = `CaLab ${import.meta.env.VITE_APP_VERSION || 'dev'}`;

  const indicator = (): JSX.Element => {
    const rs = state.runState;
    return (
      <span
        class="cala-run-pill"
        title={state.errorMsg ?? STATE_LABELS[rs]}
        style={{
          display: 'inline-flex',
          'align-items': 'center',
          gap: 'var(--space-xs)',
          padding: 'var(--space-xs) var(--space-sm)',
          'border-radius': 'var(--radius-sm)',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-subtle)',
          'font-family': 'var(--font-mono)',
          'font-size': '0.8rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            'border-radius': '50%',
            background: STATE_COLORS[rs],
            'flex-shrink': '0',
          }}
        />
        <span>{STATE_LABELS[rs]}</span>
      </span>
    );
  };

  return <CompactHeader title="CaLa" version={version} actions={indicator()} />;
}
