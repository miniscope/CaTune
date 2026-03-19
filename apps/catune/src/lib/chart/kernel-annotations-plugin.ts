/**
 * uPlot plugin that draws peak time and half-decay time annotations
 * on the kernel chart as dashed vertical lines with labels.
 */

import type uPlot from 'uplot';

export interface KernelAnnotations {
  peakTime: number;
  halfDecayTime: number;
  halfRiseTime: number;
  fwhm: number;
}

const PEAK_COLOR = '#ff9800';
const HALF_DECAY_COLOR = '#ab47bc';
const LABEL_PAD = 4;

/**
 * Create a uPlot plugin that draws kernel annotation markers.
 *
 * @param getAnnotations - Accessor returning current annotation values (reactive)
 */
export function kernelAnnotationsPlugin(
  getAnnotations: () => KernelAnnotations | null,
): uPlot.Plugin {
  return {
    hooks: {
      draw(u: uPlot) {
        const ann = getAnnotations();
        if (!ann) return;

        const ctx = u.ctx;
        const { top, height } = u.bbox;
        const dpr = devicePixelRatio;

        // Convert time values to canvas pixel positions
        const peakPx = u.valToPos(ann.peakTime, 'x', true);
        const halfRisePx = u.valToPos(ann.halfRiseTime, 'x', true);
        const halfDecayPx = u.valToPos(ann.halfDecayTime, 'x', true);
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

        // Peak label — centered above the vertical line
        const peakMs = (ann.peakTime * 1000).toFixed(0);
        ctx.setLineDash([]);
        ctx.fillStyle = PEAK_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`Peak: ${peakMs}ms`, peakPx, topPx - LABEL_PAD * dpr);

        // --- FWHM horizontal line at y=0.5 from halfRiseTime to halfDecayTime ---
        ctx.strokeStyle = HALF_DECAY_COLOR;
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([]);

        // Horizontal line
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

        // FWHM label — centered on the horizontal line
        const fwhmMs = (ann.fwhm * 1000).toFixed(0);
        const fwhmCenterPx = (halfRisePx + halfDecayPx) / 2;
        ctx.fillStyle = HALF_DECAY_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`FWHM: ${fwhmMs}ms`, fwhmCenterPx, halfYPx - LABEL_PAD * dpr);

        ctx.restore();
      },
    },
  };
}
