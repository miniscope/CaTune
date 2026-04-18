import type { Component } from 'solid-js';
import { DashboardShell, CompactHeader } from '@calab/ui';

const App: Component = () => {
  return (
    <DashboardShell header={<CompactHeader title="CaLa" />}>
      <div style={{ padding: '24px', color: '#616161', 'font-size': '0.9rem' }}>
        <p>CaLa — streaming calcium imaging demixing.</p>
        <p style={{ 'margin-top': '8px' }}>
          Shell scaffolded in Phase 5, task 19. File drop, run control, and workers land in
          subsequent tasks.
        </p>
      </div>
    </DashboardShell>
  );
};

export default App;
