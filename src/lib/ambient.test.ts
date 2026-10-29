import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIFT_RANGE, ambientAutoOpenEnabled, ambientClockDriftRange, phoneIsSideways, ambientDigits, ambientDrift, formatAmbientTimer, ambientTipSeen, markAmbientTipSeen, setAmbientAutoOpen } from './ambient';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
});
beforeEach(() => store.clear());

describe('ambient clock', () => {
  it('shows minutes and seconds as two digits, hours apart', () => {
    expect(ambientDigits(2398)).toEqual({ hours: 0, minutes: '39', seconds: '58' });
    expect(ambientDigits(298)).toEqual({ hours: 0, minutes: '04', seconds: '58' });
    expect(ambientDigits(5998)).toEqual({ hours: 1, minutes: '39', seconds: '58' });
  });

  it('reads the timer as 00:00, with hours only past an hour', () => {
    expect([0, 598, 2398, 5998, 36000].map(formatAmbientTimer)).toEqual(['00:00', '09:58', '39:58', '1:39:58', '10:00:00']);
  });

  it('drifts within a few pixels and keeps moving', () => {
    const points = Array.from({ length: 60 }, (_, i) => ambientDrift(i + 1));
    for (const p of points) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(DRIFT_RANGE + 1);
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBeGreaterThan(20);
  });

  it('opens when sideways by default, and remembers the switch', () => {
    expect(ambientAutoOpenEnabled()).toBe(true);
    setAmbientAutoOpen(false);
    expect(ambientAutoOpenEnabled()).toBe(false);
  });

  it('shows the tip once', () => {
    expect(ambientTipSeen()).toBe(false);
    markAmbientTipSeen();
    expect(ambientTipSeen()).toBe(true);
  });
});

describe('ambientClockDriftRange', () => {
  it('moves the big digits about a stroke width, never less than the face drift', () => {
    // A phone held sideways (412 px tall): digits ~231 px, strokes ~25 px.
    expect(ambientClockDriftRange(915, 412)).toBe(28);
    expect(ambientClockDriftRange(915, 412)).toBeGreaterThan(DRIFT_RANGE * 3);
    expect(ambientClockDriftRange(100, 100)).toBe(DRIFT_RANGE);
  });

  it('keeps a wider drift inside its range', () => {
    for (let i = 1; i <= 60; i++) expect(Math.hypot(ambientDrift(i, 28).x, ambientDrift(i, 28).y)).toBeLessThanOrEqual(29);
  });
});

describe('phoneIsSideways', () => {
  it('uses the real rotation, so the keyboard shortening the screen never counts', () => {
    // Upright phone with the keyboard open: the screen itself is still portrait.
    expect(phoneIsSideways({ width: 412, height: 915, orientation: { type: 'portrait-primary' } }, true)).toBe(false);
    expect(phoneIsSideways({ width: 915, height: 412, orientation: { type: 'landscape-primary' } }, true)).toBe(true);
  });

  it('falls back to the screen size without the orientation API, and ignores laptops', () => {
    expect(phoneIsSideways({ width: 915, height: 412 }, true)).toBe(true);
    expect(phoneIsSideways({ width: 412, height: 915 }, true)).toBe(false);
    expect(phoneIsSideways({ width: 1920, height: 1080, orientation: { type: 'landscape-primary' } }, false)).toBe(false);
  });
});
