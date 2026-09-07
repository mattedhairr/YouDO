import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from './storageKeys';

const native = vi.hoisted(() => ({ isNativePlatform: vi.fn(), impact: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: native.isNativePlatform } }));
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: native.impact }, ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' } }));

describe('semantic haptic cues', () => {
  const saved = new Map<string, string>();
  const vibrate = vi.fn();
  beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    saved.clear(); vibrate.mockReset(); native.impact.mockReset(); native.isNativePlatform.mockReturnValue(false);
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal('document', { visibilityState: 'visible' });
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('uses different cues for selection, start, completion and warning', async () => {
    const h = await import('./haptics');
    h.hapticTick(); expect(vibrate.mock.calls).toEqual([[8]]);
    vi.advanceTimersByTime(300); vibrate.mockClear();
    h.hapticSessionStart(); vi.advanceTimersByTime(300); expect(vibrate.mock.calls).toEqual([[8], [16]]);
    vibrate.mockClear(); h.hapticGoalComplete(); vi.advanceTimersByTime(300); expect(vibrate.mock.calls).toEqual([[16], [28], [8]]);
    vibrate.mockClear(); h.hapticWarn(); vi.advanceTimersByTime(300); expect(vibrate.mock.calls).toEqual([[16], [16]]);
  });
  it('lets completion supersede a selection and protects it from rapid ticks', async () => {
    const h = await import('./haptics');
    h.hapticTick(); h.hapticSuccess(); h.hapticTick();
    vi.advanceTimersByTime(60); h.hapticTick(); vi.advanceTimersByTime(100);
    expect(vibrate.mock.calls).toEqual([[8], [16], [8]]);
  });
  it('cancels pending steps immediately when disabled', async () => {
    const h = await import('./haptics');
    h.hapticGoalComplete(); h.setHapticsPreference(false); vi.advanceTimersByTime(300); h.hapticTick();
    expect(saved.get(STORAGE_KEYS.haptics)).toBe('false');
    expect(vibrate.mock.calls).toEqual([[16], [0]]);
  });
  it('never vibrates in the background', async () => {
    const h = await import('./haptics');
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    h.hapticWarn(); vi.advanceTimersByTime(300); expect(vibrate).not.toHaveBeenCalled();
  });
  it('uses native intensity when the plugin is available', async () => {
    native.isNativePlatform.mockReturnValue(true); native.impact.mockResolvedValue(undefined);
    const h = await import('./haptics'); h.hapticTick();
    expect(native.impact).toHaveBeenCalledWith({ style: 'LIGHT' }); expect(vibrate).not.toHaveBeenCalled();
  });
});
