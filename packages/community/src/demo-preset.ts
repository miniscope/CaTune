/**
 * The `demo_preset` entry in a submission's `extra_metadata`: the id of the
 * simulated indicator a demo dataset was generated from.
 *
 * Both directions live here on purpose. `extra_metadata` is an untyped
 * `Record<string, unknown>`, so a writer and a reader that each spell the key
 * themselves can drift silently — which is exactly how this filter broke once
 * before: a refactor removed the write side, the read side kept compiling, and
 * every preset selection quietly matched nothing.
 */

const DEMO_PRESET_KEY = 'demo_preset';

/** Build the `extra_metadata` recording which simulated indicator produced a demo dataset. */
export function demoPresetMetadata(indicatorId: string): Record<string, unknown> {
  return { [DEMO_PRESET_KEY]: indicatorId };
}

/** Read back the recorded indicator id, or undefined when a row predates the write side. */
export function readDemoPreset(
  extraMetadata: Record<string, unknown> | undefined,
): string | undefined {
  const value = extraMetadata?.[DEMO_PRESET_KEY];
  return typeof value === 'string' ? value : undefined;
}
