// Parameter history and range configuration for interactive tuning.
// Provides undo/redo stack for parameter snapshots and log-scale
// conversion helpers for the lambda sparsity slider.

/** A snapshot of the three tuning parameters at a point in time. */
export interface ParamSnapshot {
  tauRise: number;
  tauDecay: number;
  lambda: number;
}

/**
 * Scientifically reasonable parameter ranges for calcium imaging deconvolution.
 * Based on GCaMP6f/6s typical values from calcium imaging literature.
 */
export const PARAM_RANGES = {
  tauRise: {
    min: 0.001,    // 1ms -- fastest possible calcium indicator rise
    max: 0.5,      // 500ms -- very slow indicators (GCaMP6s-like)
    default: 0.02, // 20ms -- typical for GCaMP6f
    step: 0.001,   // 1ms resolution
    unit: 's',
  },
  tauDecay: {
    min: 0.05,     // 50ms -- fastest decay
    max: 3.0,      // 3s -- very slow indicators
    default: 0.4,  // 400ms -- typical for GCaMP6f
    step: 0.01,    // 10ms resolution
    unit: 's',
  },
  lambda: {
    min: 0.0001,   // Very low sparsity (detect almost everything)
    max: 10.0,     // Very high sparsity (only largest events)
    default: 0.01, // Moderate sparsity
    logScale: true, // Use logarithmic slider mapping
  },
} as const;

// --- Log-scale conversion for lambda slider ---

const LOG_LAMBDA_MIN = Math.log10(PARAM_RANGES.lambda.min); // -4
const LOG_LAMBDA_MAX = Math.log10(PARAM_RANGES.lambda.max); // 1

/**
 * Convert a linear slider position [0, 1] to a logarithmic lambda value.
 * Maps uniformly across orders of magnitude: 0 -> 0.0001, 0.5 -> ~0.01, 1 -> 10.
 */
export function sliderToLambda(position: number): number {
  return Math.pow(10, LOG_LAMBDA_MIN + position * (LOG_LAMBDA_MAX - LOG_LAMBDA_MIN));
}

/**
 * Convert a lambda value to a linear slider position [0, 1].
 * Inverse of sliderToLambda.
 */
export function lambdaToSlider(lambda: number): number {
  return (Math.log10(lambda) - LOG_LAMBDA_MIN) / (LOG_LAMBDA_MAX - LOG_LAMBDA_MIN);
}

/**
 * Snapshot-based undo/redo stack for parameter tuples.
 *
 * Stores { tauRise, tauDecay, lambda } snapshots. Always returns
 * spread copies from undo/redo/current to prevent external mutation.
 *
 * Usage:
 * - push() on slider commit (onChange, not onInput)
 * - undo()/redo() on Ctrl+Z / Ctrl+Y
 */
export class ParamHistory {
  private stack: ParamSnapshot[] = [];
  private pointer: number = -1;
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /** Push a new snapshot. Truncates any redo history beyond current pointer. */
  push(snapshot: ParamSnapshot): void {
    // Truncate redo history
    this.stack = this.stack.slice(0, this.pointer + 1);
    // Append a copy
    this.stack.push({ ...snapshot });

    // Trim oldest if over max size
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
      // pointer stays at the end (stack shrunk from front)
    } else {
      this.pointer++;
    }
  }

  /** Move back one step. Returns the previous snapshot or null if at beginning. */
  undo(): ParamSnapshot | null {
    if (this.pointer <= 0) return null;
    this.pointer--;
    return { ...this.stack[this.pointer] };
  }

  /** Move forward one step. Returns the next snapshot or null if at end. */
  redo(): ParamSnapshot | null {
    if (this.pointer >= this.stack.length - 1) return null;
    this.pointer++;
    return { ...this.stack[this.pointer] };
  }

  /** Whether there is a previous snapshot to undo to. */
  get canUndo(): boolean {
    return this.pointer > 0;
  }

  /** Whether there is a next snapshot to redo to. */
  get canRedo(): boolean {
    return this.pointer < this.stack.length - 1;
  }

  /** The current snapshot (copy), or null if stack is empty. */
  get current(): ParamSnapshot | null {
    return this.pointer >= 0 ? { ...this.stack[this.pointer] } : null;
  }
}
