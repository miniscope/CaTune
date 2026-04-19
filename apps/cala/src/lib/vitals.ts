/**
 * Shared vitals vocabulary (design §12).
 *
 * The fit worker publishes five per-frame scalar metrics; the header
 * vitals bar subscribes to the same names. Keeping the strings in one
 * place prevents drift between the emitter and the UI.
 */
export const METRIC_CELL_COUNT = 'cell_count';
export const METRIC_FPS = 'fps';
export const METRIC_MEMORY_BYTES = 'memory_bytes';
export const METRIC_RESIDUAL_L2 = 'residual_l2';
export const METRIC_EXTEND_QUEUE_DEPTH = 'extend_queue_depth';

export const VITALS_METRIC_NAMES = [
  METRIC_CELL_COUNT,
  METRIC_FPS,
  METRIC_MEMORY_BYTES,
  METRIC_RESIDUAL_L2,
  METRIC_EXTEND_QUEUE_DEPTH,
] as const;

export type VitalsMetricName = (typeof VITALS_METRIC_NAMES)[number];
