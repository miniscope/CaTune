import { createSignal, type Accessor } from 'solid-js';
import type { LatestFramePreview } from './run-control.ts';

/**
 * Main-thread running-max projection of the motion-corrected preview
 * stream (design §8 footprints panel, Phase 7 task 10). We accumulate
 * here instead of inside the archive worker because W1 already posts
 * the motion-corrected frame to the main thread as a `frame-preview`
 * message — routing it through archive would add a redundant copy
 * across an extra worker boundary.
 *
 * Shape: same `Uint8ClampedArray` layout as the preview (u8 gray,
 * height·width). The footprints panel blits it into an `ImageData`
 * and overlays footprint boundaries on top.
 */
interface MaxProjection {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  frameCount: number;
}

const [maxProjectionSignal, setMaxProjectionSignal] = createSignal<MaxProjection | null>(null);

export const maxProjection: Accessor<MaxProjection | null> = maxProjectionSignal;

/**
 * Fold a new motion-stage preview into the running max. Called by
 * `run-control`'s W1 frame-preview listener whenever a `motion`
 * stage frame arrives. Dimension changes (new recording) reset the
 * buffer; same dims accumulate element-wise max.
 */
export function updateMaxProjection(frame: LatestFramePreview): void {
  const cur = maxProjectionSignal();
  if (!cur || cur.width !== frame.width || cur.height !== frame.height) {
    setMaxProjectionSignal({
      width: frame.width,
      height: frame.height,
      pixels: new Uint8ClampedArray(frame.pixels),
      frameCount: 1,
    });
    return;
  }
  const next = new Uint8ClampedArray(cur.pixels);
  for (let i = 0; i < next.length; i += 1) {
    if (frame.pixels[i] > next[i]) next[i] = frame.pixels[i];
  }
  setMaxProjectionSignal({
    width: cur.width,
    height: cur.height,
    pixels: next,
    frameCount: cur.frameCount + 1,
  });
}

export function resetMaxProjection(): void {
  setMaxProjectionSignal(null);
}
