import { createEffect, onCleanup, type JSX } from 'solid-js';

// Visual defaults. Keep in one place so the vitals bar has a single
// knob to retune density; no in-component magic numbers.
const DEFAULT_WIDTH_PX = 120;
const DEFAULT_HEIGHT_PX = 32;
const DEFAULT_LINE_WIDTH_PX = 1.5;
const DEFAULT_PADDING_PX = 2;

export interface SparkLineProps {
  /** Input series; any length, rendered oldest→newest left→right. */
  values: Float32Array | number[];
  /** Optional stroke override (defaults to `var(--accent)` via CSS). */
  color?: string;
  width?: number;
  height?: number;
  title?: string;
}

/**
 * Tiny Canvas-based sparkline. Redraws whenever `values` changes.
 * Auto-scales each draw so a series that spans 0..1000 renders at the
 * same visual amplitude as one that spans 0..0.1 — callers who want
 * absolute comparison should normalize upstream.
 */
export function SparkLine(props: SparkLineProps): JSX.Element {
  let canvas: HTMLCanvasElement | undefined;

  createEffect(() => {
    const el = canvas;
    if (!el) return;
    const w = props.width ?? DEFAULT_WIDTH_PX;
    const h = props.height ?? DEFAULT_HEIGHT_PX;
    if (el.width !== w) el.width = w;
    if (el.height !== h) el.height = h;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const values = props.values;
    const n = values.length;
    if (n < 2) return;

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const v = values[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    const range = max - min || 1;

    const pad = DEFAULT_PADDING_PX;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const x = pad + (i / (n - 1)) * plotW;
      const y = pad + plotH - ((values[i] - min) / range) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = DEFAULT_LINE_WIDTH_PX;
    ctx.strokeStyle = props.color ?? 'currentColor';
    ctx.stroke();
  });

  onCleanup(() => {
    // Let the GC reclaim the canvas; no external subscriptions.
  });

  return (
    <canvas
      ref={canvas}
      class="sparkline"
      width={DEFAULT_WIDTH_PX}
      height={DEFAULT_HEIGHT_PX}
      aria-label={props.title ?? 'sparkline'}
      role="img"
    />
  );
}
