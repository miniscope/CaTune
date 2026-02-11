// Shared uPlot series configuration builders for trace panels.

import type uPlot from 'uplot';

export function createRawSeries(): uPlot.Series {
  return { label: 'Raw', stroke: 'hsl(200, 60%, 50%)', width: 1 };
}

export function createFitSeries(): uPlot.Series {
  return { label: 'Fit', stroke: 'hsl(30, 90%, 60%)', width: 1.5 };
}

export function createDeconvolvedSeries(): uPlot.Series {
  return { label: 'Deconvolved', stroke: 'hsl(120, 70%, 50%)', width: 1 };
}

export function createResidualSeries(): uPlot.Series {
  return { label: 'Residuals', stroke: 'hsl(0, 70%, 60%)', width: 1 };
}

/**
 * Create a dimmed dashed overlay variant for pinned snapshot comparison.
 * Uses 35% opacity and a [4,4] dash pattern.
 */
export function createPinnedOverlaySeries(
  label: string,
  baseStroke: string,
  baseWidth: number,
): uPlot.Series {
  // Convert solid HSL to 35% opacity HSLA
  const hslaStroke = baseStroke.replace('hsl(', 'hsla(').replace(')', ', 0.35)');
  return { label, stroke: hslaStroke, width: baseWidth, dash: [4, 4] };
}
