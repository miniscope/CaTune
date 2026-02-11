/**
 * Shared zoom state and setScale propagation for synchronized multi-panel charts.
 * Uses uPlot.sync() for cursor synchronization and a custom plugin for zoom sync.
 */

import uPlot from 'uplot';

/**
 * Create a shared sync group for cursor synchronization.
 * All charts subscribing to the same key share cursor position.
 *
 * @param key - Unique identifier for the sync group
 * @returns The uPlot sync object
 */
export function createSyncGroup(key: string): uPlot.SyncPubSub {
  return uPlot.sync(key);
}

/**
 * Plugin that propagates x-scale changes across sibling charts.
 * Uses an isSyncing boolean guard to prevent infinite setScale loops.
 * Only propagates 'x' scale changes; y auto-ranges independently.
 *
 * @param getCharts - Array of accessor functions returning sibling uPlot instances
 * @returns uPlot plugin for zoom synchronization
 */
export function createZoomSyncPlugin(
  getCharts: (() => uPlot | undefined)[],
): uPlot.Plugin {
  let isSyncing = false;

  return {
    hooks: {
      setScale(u: uPlot, scaleKey: string) {
        if (scaleKey !== 'x' || isSyncing) return;

        isSyncing = true;
        const { min, max } = u.scales.x;

        for (const getChart of getCharts) {
          const chart = getChart();
          if (chart && chart !== u) {
            chart.setScale('x', { min: min!, max: max! });
          }
        }

        isSyncing = false;
      },
    },
  };
}
