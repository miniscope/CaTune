import { Show, type Component } from 'solid-js';
import { DashboardShell } from '@calab/ui';
import { CaLaHeader } from './components/layout/CaLaHeader.tsx';
import { ImportOverlay } from './components/layout/ImportOverlay.tsx';
import { state } from './lib/data-store.ts';

const App: Component = () => {
  return (
    <DashboardShell header={<CaLaHeader />}>
      <Show when={state.file !== null} fallback={<ImportOverlay />}>
        <div style={{ padding: '24px', color: 'var(--text-secondary)', 'font-size': '0.9rem' }}>
          <p>Run control wired in task 20. Frame viewer lands in task 24.</p>
        </div>
      </Show>
    </DashboardShell>
  );
};

export default App;
