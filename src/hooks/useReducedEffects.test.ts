import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../lib/storageKeys';

describe('reduced effects preference', () => {
  const saved = new Map<string, string>();
  const changed = vi.fn();
  beforeEach(() => {
    vi.resetModules(); saved.clear(); changed.mockReset();
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }), dispatchEvent: changed });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('respects the system default until the user chooses', async () => {
    const effects = await import('./useReducedEffects');
    expect(effects.reducedEffectsSnapshot()).toBe(true);
    effects.setReducedEffects(false);
    expect(effects.reducedEffectsSnapshot()).toBe(false);
    expect(saved.get(STORAGE_KEYS.reducedEffects)).toBe('false');
    expect(changed).toHaveBeenCalledOnce();
  });
  it('still changes the current tab when persistent storage is blocked', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    const effects = await import('./useReducedEffects'); effects.setReducedEffects(false);
    expect(effects.reducedEffectsSnapshot()).toBe(false);
  });
});
