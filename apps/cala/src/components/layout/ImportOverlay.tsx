import { createSignal, Show, type JSX } from 'solid-js';
import { openAviUncompressed } from '@calab/io';
import { state, setFile } from '../../lib/data-store.ts';
import { startRun } from '../../lib/run-control.ts';

const ACCEPT_EXT = '.avi';

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function ImportOverlay(): JSX.Element {
  const [isDragging, setIsDragging] = createSignal(false);
  const [localError, setLocalError] = createSignal<string | null>(null);
  let inputRef: HTMLInputElement | undefined;

  const handleFile = async (file: File): Promise<void> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'avi') {
      setLocalError(`Unsupported file format: .${ext ?? 'unknown'}. Please use .avi files.`);
      return;
    }
    setLocalError(null);
    try {
      const source = await openAviUncompressed(file);
      const meta = source.meta();
      source.close();
      setFile(file, meta);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unknown error opening AVI');
    }
  };

  const handleDrop = (e: DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files[0];
    if (file) void handleFile(file);
  };

  const handleDragOver = (e: DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleClick = (): void => inputRef?.click();

  const handleInputChange = (e: Event): void => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void handleFile(file);
  };

  const handleStart = (): void => {
    setLocalError(null);
    startRun().catch((err) => {
      setLocalError(err instanceof Error ? err.message : String(err));
    });
  };

  const canStart = (): boolean => state.file !== null && state.runState === 'idle';

  return (
    <main class="import-container">
      <header class="app-header">
        <h1 class="app-header__title">CaLa</h1>
        <span class="app-header__version">CaLab {import.meta.env.VITE_APP_VERSION || 'dev'}</span>
        <p class="app-header__subtitle">Streaming calcium-imaging demixing</p>
      </header>

      <div class="drop-zone-wrapper">
        <div
          class={`drop-zone ${isDragging() ? 'drop-zone--active' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
        >
          <div class="drop-zone__icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p class="drop-zone__text">
            Drop an <strong>.avi</strong> recording here
          </p>
          <p class="drop-zone__subtext">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_EXT}
            style="display:none"
            onChange={handleInputChange}
          />
        </div>

        <Show when={state.file}>
          {(file) => (
            <p class="file-info">
              Loaded <strong>{file().name}</strong> ({formatBytes(file().size)})
            </p>
          )}
        </Show>
      </div>

      <Show when={state.meta}>
        {(meta) => (
          <div
            class="info-summary"
            style={{ 'text-align': 'center', 'margin-bottom': 'var(--space-md)' }}
          >
            <span>
              {meta().width} &times; {meta().height}
            </span>
            <span class="info-summary__sep">&middot;</span>
            <span>{meta().frameCount.toLocaleString()} frames</span>
            <Show when={meta().fps > 0}>
              <span class="info-summary__sep">&middot;</span>
              <span>{meta().fps} fps</span>
            </Show>
          </div>
        )}
      </Show>

      <Show when={localError() ?? state.errorMsg}>
        {(msg) => (
          <div class="error-card">
            <span class="error-card__icon">!</span>
            <span>{msg()}</span>
          </div>
        )}
      </Show>

      <Show when={state.file}>
        <div
          style={{ display: 'flex', 'justify-content': 'center', 'margin-top': 'var(--space-md)' }}
        >
          <button class="btn-primary" disabled={!canStart()} onClick={handleStart}>
            Start run
          </button>
        </div>
      </Show>
    </main>
  );
}
