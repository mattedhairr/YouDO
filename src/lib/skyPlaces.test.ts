import { describe, expect, it } from 'vitest';
import { automaticPlace, formatClock, isIndiaTimeZone, SKY_PLACES, sunDayForPlace } from './skyPlaces';

const between = (h: number, from: number, to: number) => {
  expect(h).toBeGreaterThanOrEqual(from);
  expect(h).toBeLessThanOrEqual(to);
};

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
    const arunachal = sunDayForPlace('ar', '2026-11-20', 5.5, 'Asia/Kolkata');
    const gujarat = sunDayForPlace('gj', '2026-11-20', 5.5, 'Asia/Kolkata');
    expect(gujarat.sunrise - arunachal.sunrise).toBeGreaterThan(1.2);
  });

  it('formats a preview time', () => {
    expect(formatClock(6.78)).toBe('6:47 am');
    expect(formatClock(17.42)).toBe('5:25 pm');
    expect(formatClock(12)).toBe('12:00 pm');
    expect(formatClock(0.5)).toBe('12:30 am');
  });
});

describe('automatic, from the time zone', () => {
  it('in India means central India until a state is chosen, under either zone name', () => {
    expect(isIndiaTimeZone('Asia/Kolkata')).toBe(true);
    expect(isIndiaTimeZone('Asia/Calcutta')).toBe(true);
    expect(isIndiaTimeZone('Europe/London')).toBe(false);
    const auto = sunDayForPlace('auto', '2026-11-20', 5.5, 'Asia/Kolkata');
    expect(sunDayForPlace('auto', '2026-11-20', 5.5, 'Asia/Calcutta')).toEqual(auto);
    expect(Math.abs(auto.noon - 12)).toBeLessThan(0.3); // IST's middle meridian
  });

  it('elsewhere uses the zone’s main city: a short November day in London', () => {
    expect(automaticPlace('Europe/London', 0).city).toBe('London');
    const london = sunDayForPlace('auto', '2026-11-20', 0, 'Europe/London');
    between(london.sunrise, 7.25, 7.7); // about 7:27
    between(london.sunset, 15.85, 16.25); // about 16:03
  });

  it('keeps the noon sun right under summer time', () => {
    // New York in July: clocks on summer time (UTC-4), solar noon close to 1 pm.
    const ny = sunDayForPlace('auto', '2026-07-01', -4, 'America/New_York');
    between(ny.noon, 12.8, 13.2);
  });

  it('knows old zone names, and falls back for unknown ones', () => {
    expect(automaticPlace('Asia/Saigon', 7).city).toBe('Ho Chi Minh');
    const unknown = automaticPlace('Mars/Olympus', 3);
    expect(unknown.city).toBeNull();
    expect(unknown.lon).toBe(45);
  });

  it('goes by the zone for an unknown place id', () => {
    expect(sunDayForPlace('nowhere', '2026-11-20', 0, 'Europe/London')).toEqual(sunDayForPlace('auto', '2026-11-20', 0, 'Europe/London'));
  });
});
