import { createSignal, type JSX } from 'solid-js';
import { createArchiveClient } from '../../lib/archive-client.ts';
import { currentArchiveWorkerForClient } from '../../lib/run-control.ts';
import { state } from '../../lib/data-store.ts';
import { buildCalaExportNpz, triggerDownload } from '../../lib/export.ts';

function exportFilename(baseFileName: string | undefined): string {
  const stem = baseFileName?.replace(/\.[^.]+$/, '') ?? 'cala-run';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/T/, '_').replace(/Z$/, '');
  return `${stem}_${stamp}.npz`;
}

/**
 * Export flow (design §8 "Export flow", Phase 7 task 15). Pulls the
 * latest footprints + traces from the archive worker, packs them
 * into a scipy.sparse-CSC-shaped .npz, and triggers a browser
 * download. Enabled whenever the archive worker is reachable (while
 * the run is active OR after natural completion — see run-control's
 * archive-worker retention policy).
 */
export function ExportButton(): JSX.Element {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const canExport = (): boolean => {
    if (busy()) return false;
    if (currentArchiveWorkerForClient() === null) return false;
    return state.runState === 'running' || state.runState === 'stopped';
  };

  const handleExport = async (): Promise<void> => {
    if (busy()) return;
    const worker = currentArchiveWorkerForClient();
    if (!worker) {
      setError('no active archive worker');
      return;
    }
    const meta = state.meta;
    if (!meta) {
      setError('no recording metadata');
      return;
    }
    setBusy(true);
    setError(null);
    const client = createArchiveClient(worker);
    try {
      const [footprints, traces] = await Promise.all([
        client.requestAllFootprints(),
        client.requestAllTraces(),
      ]);
      const npz = buildCalaExportNpz({
        footprints,
        traces,
        meta: { height: meta.height, width: meta.width },
      });
      triggerDownload(npz, exportFilename(state.file?.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      client.dispose();
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      class="export-button"
      disabled={!canExport()}
      onClick={() => {
        void handleExport();
      }}
      title={
        error() ??
        (busy()
          ? 'Building export…'
          : canExport()
            ? 'Download footprints + traces as NPZ'
            : 'Start a run to enable export')
      }
    >
      {busy() ? 'Exporting…' : 'Export NPZ'}
    </button>
  );
}
