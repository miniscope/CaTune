/**
 * Pure presentation helpers for the event feed (design §12).
 *
 * Extracted from the `EventFeed` SolidJS component so these can be
 * unit-tested without a DOM — the component only chooses layout, the
 * actual string mapping lives here.
 */
import type { PipelineEvent } from '@calab/cala-runtime';

export function describeEvent(e: PipelineEvent): string {
  switch (e.kind) {
    case 'birth':
      return `born @(${e.patch[0]},${e.patch[1]})`;
    case 'merge':
      return `${e.ids.join('+')} → ${e.into}`;
    case 'split':
      return `${e.from} → [${e.into.join(',')}]`;
    case 'deprecate':
      return `${e.reason}`;
    case 'reject':
      return `@(${e.at[0]},${e.at[1]}): ${e.reason}`;
    case 'metric':
      return `${e.name}=${e.value.toFixed(3)}`;
    case 'footprint-snapshot':
      return `id=${e.neuronId} (${e.footprint.pixelIndices.length}px)`;
    case 'trace-sample':
      return `${e.ids.length} traces @ t=${e.t}`;
  }
}

export function idForEvent(e: PipelineEvent): string {
  switch (e.kind) {
    case 'birth':
    case 'deprecate':
      return `#${e.id}`;
    case 'merge':
      return `→ #${e.into}`;
    case 'split':
      return `#${e.from} →`;
    case 'footprint-snapshot':
      return `#${e.neuronId}`;
    case 'reject':
    case 'metric':
    case 'trace-sample':
      return '';
  }
}
