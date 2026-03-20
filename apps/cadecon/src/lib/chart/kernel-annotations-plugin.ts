/**
 * uPlot plugin that draws peak time and FWHM annotations
 * on the kernel chart. Values are in ms (matching CaDecon's X-axis).
 */

import type uPlot from 'uplot';

export interface KernelAnnotationsMs {
  peakTimeMs: number;
  halfRiseTimeMs: number;
  halfDecayTimeMs: number;
  fwhmMs: number;
}

const PEAK_COLOR = '#ff9800';
const FWHM_COLOR = '#ab47bc';
const LABEL_PAD = 4;

/**
 * Create a uPlot plugin that draws kernel annotation markers.
 *
 * @param getAnnotations - Accessor returning current annotation values (reactive)
 */
export function kernelAnnotationsPlugin(
  getAnnotations: () => KernelAnnotationsMs | null,
): uPlot.Plugin {
  return {
    hooks: {
      draw(u: uPlot) {
        const ann = getAnnotations();
        if (!ann) return;

        const ctx = u.ctx;
        const { top, height } = u.bbox;
        const dpr = devicePixelRatio;

        // Convert ms values to canvas pixel positions
        const peakPx = u.valToPos(ann.peakTimeMs, 'x', true);
        const halfRisePx = u.valToPos(ann.halfRiseTimeMs, 'x', true);
        const halfDecayPx = u.valToPos(ann.halfDecayTimeMs, 'x', true);
        const halfYPx = u.valToPos(0.5, 'y', true);
        const topPx = top;
        const bottomPx = top + height;
        const capHeight = 6 * dpr;

        ctx.save();

        const fontSize = 10 * dpr;
        ctx.font = `${fontSize}px sans-serif`;

        // --- Dashed vertical line at peak time (orange) ---
        ctx.strokeStyle = PEAK_COLOR;
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([4 * dpr, 3 * dpr]);
        ctx.beginPath();
        ctx.moveTo(peakPx, topPx);
        ctx.lineTo(peakPx, bottomPx);
        ctx.stroke();

        // Peak label
        ctx.setLineDash([]);
        ctx.fillStyle = PEAK_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`Peak: ${ann.peakTimeMs.toFixed(0)}ms`, peakPx, topPx - LABEL_PAD * dpr);

        // --- FWHM horizontal line at y=0.5 (purple) ---
        ctx.strokeStyle = FWHM_COLOR;
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([]);

        // Horizontal bar
        ctx.beginPath();
        ctx.moveTo(halfRisePx, halfYPx);
        ctx.lineTo(halfDecayPx, halfYPx);
        ctx.stroke();

        // Left end-cap
        ctx.beginPath();
        ctx.moveTo(halfRisePx, halfYPx - capHeight);
        ctx.lineTo(halfRisePx, halfYPx + capHeight);
        ctx.stroke();

        // Right end-cap
        ctx.beginPath();
        ctx.moveTo(halfDecayPx, halfYPx - capHeight);
        ctx.lineTo(halfDecayPx, halfYPx + capHeight);
        ctx.stroke();

        // FWHM label
        const fwhmCenterPx = (halfRisePx + halfDecayPx) / 2;
        ctx.fillStyle = FWHM_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`FWHM: ${ann.fwhmMs.toFixed(0)}ms`, fwhmCenterPx, halfYPx - LABEL_PAD * dpr);

        ctx.restore();
      },
    },
  };
}
