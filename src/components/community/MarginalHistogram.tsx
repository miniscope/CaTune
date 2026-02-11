/**
 * Marginal distribution histogram for scatter plot axes.
 * Computes histogram bins from values and renders as a bar chart using uPlot.
 * Supports horizontal (above scatter) and vertical (right of scatter) orientations.
 */

import { createEffect, createMemo, onCleanup } from 'solid-js';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import '../../lib/chart/chart-theme.css';

export interface MarginalHistogramProps {
  values: number[];
  orientation: 'horizontal' | 'vertical';
  label: string;
  bins?: number;
  /** Optional range to align with parent scatter axis [min, max]. */
  range?: [number, number];
}

/** Compute histogram bin counts from an array of values. */
function computeBins(
  values: number[],
  numBins: number,
): { centers: number[]; counts: number[]; binWidth: number } {
  if (values.length === 0) {
    return { centers: [], counts: [], binWidth: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // Handle case where all values are the same
  if (range === 0) {
    return {
      centers: [min],
      counts: [values.length],
      binWidth: 1,
    };
  }

  const binWidth = range / numBins;
  const centers: number[] = [];
  const counts: number[] = new Array(numBins).fill(0);

  for (let i = 0; i < numBins; i++) {
    centers.push(min + (i + 0.5) * binWidth);
  }

  for (const v of values) {
    let idx = Math.floor((v - min) / binWidth);
    // Clamp the last value into the last bin
    if (idx >= numBins) idx = numBins - 1;
    counts[idx]++;
  }

  return { centers, counts, binWidth };
}

export function MarginalHistogram(props: MarginalHistogramProps) {
  let containerRef: HTMLDivElement | undefined;
  let uplotInstance: uPlot | undefined;

  // Auto-scale bins: fewer bins for sparse data, more for dense
  const numBins = () => props.bins ?? Math.max(3, Math.min(20, Math.ceil(Math.sqrt(props.values.length))));

  const histogram = createMemo(() =>
    computeBins(props.values, numBins()),
  );

  createEffect(() => {
    const hist = histogram();
    const vals = props.values;

    // Destroy previous instance
    if (uplotInstance) {
      uplotInstance.destroy();
      uplotInstance = undefined;
    }

    if (!containerRef || vals.length === 0 || hist.centers.length === 0) return;

    const isVertical = props.orientation === 'vertical';

    // For vertical histogram, swap axes: counts on x, values on y
    const chartWidth = isVertical ? 80 : (containerRef.clientWidth || 400);
    const chartHeight = isVertical ? 340 : 60;

    const xRange = props.range ?? undefined;

    const opts: uPlot.Options = {
      width: chartWidth,
      height: chartHeight,
      scales: {
        x: { time: false, range: xRange ? (_u: uPlot, _min: number, _max: number) => xRange : undefined },
        y: {},
      },
      series: [
        {},
        {
          label: props.label,
          stroke: 'hsla(200, 60%, 50%, 0.8)',
          fill: 'hsla(200, 60%, 50%, 0.4)',
          width: 1,
          paths: barPathsFactory(hist.binWidth),
        },
      ],
      axes: [
        {
          show: false,
          size: 0,
        },
        {
          show: false,
          size: 0,
        },
      ],
      legend: { show: false },
      cursor: { show: false },
      padding: [0, 0, 0, 0],
    };

    // For vertical orientation: swap data (counts on x-like, values on y-like)
    // We use a CSS rotation approach for simplicity
    const data: uPlot.AlignedData = [hist.centers, hist.counts];

    uplotInstance = new uPlot(opts, data, containerRef);
  });

  onCleanup(() => {
    if (uplotInstance) {
      uplotInstance.destroy();
      uplotInstance = undefined;
    }
  });

  if (props.values.length === 0) return null;

  const isVert = () => props.orientation === 'vertical';

  return (
    <div
      class={`marginal-histogram marginal-histogram--${props.orientation}`}
      style={{
        width: isVert() ? '80px' : '100%',
        height: isVert() ? '340px' : '60px',
        transform: isVert() ? 'rotate(-90deg) scaleY(-1)' : undefined,
        'transform-origin': isVert() ? 'top left' : undefined,
        position: isVert() ? 'relative' : undefined,
        left: isVert() ? '80px' : undefined,
      }}
    >
      <div ref={containerRef} />
    </div>
  );
}

/**
 * Custom bar paths factory for uPlot.
 * Draws bars centered on each data point with a given width.
 */
function barPathsFactory(binWidth: number) {
  return (
    u: uPlot,
    seriesIdx: number,
    _idx0: number,
    _idx1: number,
  ): uPlot.Series.Paths | null => {
    const xData = u.data[0] as number[];
    const yData = u.data[seriesIdx] as number[];
    if (!xData || !yData) return null;

    const fillPath = new Path2D();
    const strokePath = new Path2D();

    const xScale = u.scales.x;
    const yScale = u.scales.y;
    if (!xScale || !yScale) return null;

    const xDim = u.bbox.width / devicePixelRatio;
    const yDim = u.bbox.height / devicePixelRatio;
    const xOff = u.bbox.left / devicePixelRatio;
    const yOff = u.bbox.top / devicePixelRatio;

    const halfBin = binWidth / 2;

    for (let i = 0; i < xData.length; i++) {
      const xVal = xData[i];
      const yVal = yData[i];
      if (xVal == null || yVal == null || yVal === 0) continue;

      const x0 = u.valToPos(xVal - halfBin, 'x', false);
      const x1 = u.valToPos(xVal + halfBin, 'x', false);
      const y0 = u.valToPos(0, 'y', false);
      const y1 = u.valToPos(yVal, 'y', false);

      const barX = Math.min(x0, x1);
      const barW = Math.abs(x1 - x0);
      const barY = Math.min(y0, y1);
      const barH = Math.abs(y1 - y0);

      fillPath.rect(barX, barY, barW, barH);
      strokePath.rect(barX, barY, barW, barH);
    }

    return {
      stroke: strokePath,
      fill: fillPath,
    };
  };
}
