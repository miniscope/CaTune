/**
 * Singleton community store using SolidJS reactive primitives (createSignal).
 * Designed for SPA usage — signals are created at module scope on first import.
 */

// Shared reactive auth and community data signals.
// Uses shared auth helpers from @calab/community and pipes into SolidJS signals.
// Consumed by all CaLab apps (CaTune, CaDecon, etc.)

import { createSignal } from 'solid-js';
import { subscribeAuth } from './auth.ts';
import { fetchFieldOptions } from './field-options-service.ts';
import { supabaseEnabled } from './supabase.ts';
import {
  INDICATOR_OPTIONS,
  SPECIES_OPTIONS,
  BRAIN_REGION_OPTIONS,
  MICROSCOPE_TYPE_OPTIONS,
  CELL_TYPE_OPTIONS,
} from './field-options.ts';
import type { User } from './auth.ts';
import type { FieldOptions } from './types.ts';

// --- Auth signals ---

const [user, setUser] = createSignal<User | null>(null);
const [authLoading, setAuthLoading] = createSignal<boolean>(true);

// Subscribe to auth state changes using the shared helper
subscribeAuth((state) => {
  setUser(state.user);
  setAuthLoading(state.loading);
});

// --- Field options signals ---

const [fieldOptions, setFieldOptions] = createSignal<FieldOptions>({
  indicators: INDICATOR_OPTIONS,
  species: SPECIES_OPTIONS,
  brainRegions: BRAIN_REGION_OPTIONS,
  microscopeTypes: MICROSCOPE_TYPE_OPTIONS,
  cellTypes: CELL_TYPE_OPTIONS,
});
const [fieldOptionsLoading, setFieldOptionsLoading] = createSignal(false);
// Cached in-flight fetch. Collapsing the "already loading" and "already
// loaded" gates into a single promise avoids a race where two concurrent
// callers both see the boolean flags as false and issue duplicate
// requests. Subsequent calls re-await the cached promise.
let fieldOptionsPromise: Promise<void> | null = null;

/**
 * Load canonical field options from Supabase.
 * Idempotent — concurrent / repeated callers share a single fetch.
 * Falls back to hardcoded arrays on failure.
 */
async function loadFieldOptions(): Promise<void> {
  if (!supabaseEnabled) return; // Keep fallback arrays
  if (fieldOptionsPromise) return fieldOptionsPromise;

  setFieldOptionsLoading(true);
  fieldOptionsPromise = (async () => {
    try {
      const opts = await fetchFieldOptions();
      setFieldOptions(opts);
    } catch (err) {
      console.warn('Failed to load field options from DB, using fallback:', err);
      // On failure, drop the cached promise so a later call can retry.
      fieldOptionsPromise = null;
    } finally {
      setFieldOptionsLoading(false);
    }
  })();
  return fieldOptionsPromise;
}

// --- Exports ---

export {
  // Auth signals (getters)
  user,
  authLoading,
  // Field options
  fieldOptions,
  fieldOptionsLoading,
  loadFieldOptions,
};
