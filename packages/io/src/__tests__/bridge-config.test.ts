import { describe, it, expect } from 'vitest';
import { BRIDGE_CONFIG_KEYS } from '../bridge.ts';
import fixture from '../__fixtures__/decon-config-full.json';

describe('BridgeConfig schema consistency', () => {
  it('fixture keys match BRIDGE_CONFIG_KEYS', () => {
    const fixtureKeys = new Set(Object.keys(fixture));
    const interfaceKeys = new Set(BRIDGE_CONFIG_KEYS);
    expect(fixtureKeys).toEqual(interfaceKeys);
  });

  it('no extra keys in fixture beyond BridgeConfig', () => {
    for (const key of Object.keys(fixture)) {
      expect(BRIDGE_CONFIG_KEYS).toContain(key);
    }
  });

  it('no missing keys in fixture vs BridgeConfig', () => {
    for (const key of BRIDGE_CONFIG_KEYS) {
      expect(fixture).toHaveProperty(key);
    }
  });
});
