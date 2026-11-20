import { describe, expect, it } from 'vitest';
import { formatClock, SKY_PLACES, sunDayForPlace } from './skyPlaces';

describe('sky places', () => {
  it('lists all 28 states and 8 union territories, once each, inside India', () => {
    expect(SKY_PLACES).toHaveLength(36);
    expect(new Set(SKY_PLACES.map((p) => p.id)).size).toBe(36);
    for (const p of SKY_PLACES) {
      expect(p.lat).toBeGreaterThan(6);
      expect(p.lat).toBeLessThan(37);
      expect(p.lon).toBeGreaterThan(68);
      expect(p.lon).toBeLessThan(98);
    }
    const names = SKY_PLACES.map((p) => p.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });

  it('gives each place its own sunrise: the east well ahead of the west', () => {
    const arunachal = sunDayForPlace('ar', '2026-11-20', 5.5);
    const gujarat = sunDayForPlace('gj', '2026-11-20', 5.5);
    expect(gujarat.sunrise - arunachal.sunrise).toBeGreaterThan(1.2);
  });

  it('goes by the clock for "auto" and for anything unknown', () => {
    const auto = sunDayForPlace('auto', '2026-11-20', 5.5);
    expect(sunDayForPlace('nowhere', '2026-11-20', 5.5)).toEqual(auto);
    // IST's middle meridian (82.5°E): noon close to 12:00.
    expect(Math.abs(auto.noon - 12)).toBeLessThan(0.3);
  });

  it('formats a preview time', () => {
    expect(formatClock(6.78)).toBe('6:47 am');
    expect(formatClock(17.42)).toBe('5:25 pm');
    expect(formatClock(12)).toBe('12:00 pm');
    expect(formatClock(0.5)).toBe('12:30 am');
  });
});
