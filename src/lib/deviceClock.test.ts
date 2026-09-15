import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabaseUrl: 'https://clock.example.test' }));
import { checkDeviceClock, clearClockIncident, clockIncidentBoundary, emitClockJump, guardWallClock, hasClockIncident, markClockIncident, resetClockSample } from './deviceClock';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal('window', { setTimeout, clearTimeout, dispatchEvent: vi.fn() });
  clearClockIncident();
  resetClockSample();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const response = (offset: number, age = '0') => new Response('', { headers: { Date: new Date(Date.now() + offset).toUTCString(), Age: age } });

describe('clock suspicion and server confirmation', () => {
  it('keeps the pre-jump boundary despite heartbeats while confirmation is in flight', () => {
    const before = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(before);
    resetClockSample();
    vi.spyOn(Date, 'now').mockReturnValue(before + 600_000);
    guardWallClock();
    markClockIncident();
    expect(clockIncidentBoundary(before + 600_000)).toBe(before);
    clearClockIncident();
    expect(clockIncidentBoundary(before + 600_000)).toBe(before + 600_000);
  });
  it('does not persist a local suspicion before the server confirms it', () => {
    emitClockJump();
    expect(hasClockIncident()).toBe(false);
  });
  it('does not permanently block controls after a suspension-like sample', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 40 * 60_000);
    expect(guardWallClock()).toBe(true);
    expect(hasClockIncident()).toBe(false);
  });
  it('does not block on one skewed response followed by a correct one', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(-600_000)).mockResolvedValueOnce(response(0));
    vi.stubGlobal('fetch', fetch);
    expect(await checkDeviceClock()).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).not.toBe(fetch.mock.calls[1][0]);
    expect(fetch.mock.calls[0][1].cache).toBe('no-store');
  });
  it('confirms two consistent skewed readings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response(-600_000)));
    expect(await checkDeviceClock()).toBe('skewed');
  });
  it('rejects two readings that disagree about the direction of the mismatch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(-600_000)).mockResolvedValueOnce(response(600_000)));
    expect(await checkDeviceClock()).toBe('unknown');
  });
  it('clears a stored warning after a fresh correct reading', async () => {
    markClockIncident();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response(0)));
    expect(await checkDeviceClock()).toBe('ok');
    expect(hasClockIncident()).toBe(false);
  });
  it('does not clear a confirmed warning merely because the network is offline', async () => {
    markClockIncident();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await checkDeviceClock()).toBe('unknown');
    expect(hasClockIncident()).toBe(true);
    clearClockIncident();
    expect(hasClockIncident()).toBe(false);
  });
});
