import type { Component } from 'solid-js';
import { importStep } from './lib/data-store';

const App: Component = () => {
  return (
    <main class="import-container">
      <h1>CaTune</h1>
      <p class="text-secondary">
        Calcium Deconvolution Parameter Tuning
      </p>
      <p>Current step: {importStep()}</p>
    </main>
  );
};

export default App;
