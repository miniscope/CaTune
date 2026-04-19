// Pure helpers shared between W1 (post side) and SingleFrameViewer
// (render side). Kept in lib/ so both the worker and the component can
// import it without either depending on the other.

const U8_MAX = 255;
const U8_MID = 128;

/**
 * Linear autoscale of a grayscale f32 frame into u8. The dashboard
 * preview is cosmetic (design §12 frame panel) and a fixed scale would
 * clip the preprocessed frame which carries both DC-subtracted baseline
 * and residual high-frequency content.
 */
export function quantizeToU8(frame: Float32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(frame.length);
  if (frame.length === 0) return out;
  let min = frame[0];
  let max = frame[0];
  for (let k = 1; k < frame.length; k += 1) {
    const v = frame[k];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  if (span <= 0) {
    // Flat frame — render mid-gray so the user still sees something.
    out.fill(U8_MID);
    return out;
  }
  const scale = U8_MAX / span;
  for (let k = 0; k < frame.length; k += 1) {
    out[k] = (frame[k] - min) * scale;
  }
  return out;
}

/**
 * Copy a u8 grayscale plane into the RGBA byte layout expected by
 * `ImageData`. `imageData` must already be sized `width × height`; the
 * alpha channel is set to opaque.
 */
export function writeGrayscaleToImageData(pixels: Uint8ClampedArray, imageData: ImageData): void {
  const rgba = imageData.data;
  // 4 bytes per pixel (RGBA). The loop is the tight hot path of the
  // viewer — branch-free, typed-array-only.
  for (let i = 0; i < pixels.length; i += 1) {
    const g = pixels[i];
    const off = i << 2;
    rgba[off] = g;
    rgba[off + 1] = g;
    rgba[off + 2] = g;
    rgba[off + 3] = U8_MAX;
  }
}
