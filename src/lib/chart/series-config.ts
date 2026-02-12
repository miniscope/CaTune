// Shared uPlot series configuration builders for trace panels.

import type uPlot from 'uplot';

export function createRawSeries(): uPlot.Series {
  return { label: 'Raw', stroke: '#1f77b4', width: 1 };
}

export function createFitSeries(): uPlot.Series {
  return { label: 'Fit', stroke: '#ff7f0e', width: 1.5 };
}

export function createDeconvolvedSeries(): uPlot.Series {
  return { label: 'Deconvolved', stroke: '#2ca02c', width: 1 };
}

export function createResidualSeries(): uPlot.Series {
  return { label: 'Residuals', stroke: '#d62728', width: 1 };
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
  // Convert hex to 35% opacity rgba, or handle hsl→hsla
  let hslaStroke: string;
  if (baseStroke.startsWith('#')) {
    const r = parseInt(baseStroke.slice(1, 3), 16);
    const g = parseInt(baseStroke.slice(3, 5), 16);
    const b = parseInt(baseStroke.slice(5, 7), 16);
    hslaStroke = `rgba(${r}, ${g}, ${b}, 0.35)`;
  } else {
    hslaStroke = baseStroke.replace('hsl(', 'hsla(').replace(')', ', 0.35)');
  }
  return { label, stroke: hslaStroke, width: baseWidth, dash: [4, 4] };
}
