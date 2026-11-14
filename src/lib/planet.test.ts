import { describe, expect, it } from 'vitest';
import { PLANETS, moonLayout, moonPhase, phaseName, planetPosition, planetSubtitle, weekdayOf } from './planet';

const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);

describe('planet of the day', () => {
  it('follows the weekday names: Sunday the Sun … Saturday Saturn', () => {
    expect(PLANETS.map((p) => p.name)).toEqual(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']);
    expect(weekdayOf('2026-11-13')).toBe(5); // a Friday
    expect(PLANETS[weekdayOf('2026-11-13')].name).toBe('Venus');
    expect(PLANETS[weekdayOf('2026-11-15')].name).toBe('Sun');
  });

  it('says what each one is: the Sun is a star, the Moon shows its phase', () => {
    expect(planetSubtitle(0, '2026-11-15')).toBe('Sunday’s star');
    expect(planetSubtitle(5, '2026-11-13')).toBe('Friday’s planet');
    expect(planetSubtitle(1, '2024-01-25')).toBe('Monday · Full moon');
    expect(phaseName(0)).toBe('New moon');
    expect(phaseName(0.99)).toBe('New moon');
    expect(phaseName(0.25)).toBe('First quarter');
  });

  it('knows the Moon’s phase well enough to draw and name it', () => {
    // Full moon 25 Jan 2024 (17:54 UTC), new moon 11 Jan 2024 (11:57 UTC).
    expect(Math.abs(moonPhase('2024-01-25') - 0.5)).toBeLessThan(0.05);
    const nearNew = moonPhase('2024-01-11');
    expect(Math.min(nearNew, 1 - nearNew)).toBeLessThan(0.05);
  });

  it('shows the real moons it has, placed differently each day', () => {
    expect(moonLayout(4, '2026-11-19')).toHaveLength(4); // Jupiter: Io, Europa, Ganymede, Callisto
    expect(moonLayout(6, '2026-11-21')).toHaveLength(1); // Saturn: Titan
    expect(moonLayout(2, '2026-11-17')).toHaveLength(2); // Mars: Phobos, Deimos
    for (const i of [0, 1, 3, 5]) expect(moonLayout(i, '2026-11-15')).toEqual([]);
    expect(moonLayout(4, '2026-11-19')).toEqual(moonLayout(4, '2026-11-19'));
    expect(moonLayout(4, '2026-11-26')).not.toEqual(moonLayout(4, '2026-11-19'));
    for (const m of moonLayout(4, '2026-11-19')) {
      expect(Math.abs(m.dx)).toBeGreaterThan(0.9); // outside the planet
      expect(Math.abs(m.dx)).toBeLessThan(4); // and close to it
    }
  });

  for (const portrait of [true, false]) {
    it(`crosses the sky once a day, left to right, above the timer (${portrait ? 'portrait' : 'landscape'})`, () => {
      for (let i = 0; i < 14; i++) {
        let last = planetPosition(day(i), 0, portrait);
        let jumps = 0;
        for (let m = 1; m <= 1440; m++) {
          const p = planetPosition(day(i), m, portrait);
          expect(p.x).toBeGreaterThanOrEqual(0.1);
          expect(p.x).toBeLessThanOrEqual(0.9);
          // Above the timer and below the top line.
          expect(p.y).toBeGreaterThan(portrait ? 0.13 : 0.13);
          expect(p.y).toBeLessThanOrEqual(portrait ? 0.19 : 0.25);
          if (p.x < last.x) {
            jumps++;
            // It only jumps back while faded out: setting on the right, rising on the left.
            expect(Math.max(p.opacity, last.opacity)).toBeLessThan(0.05);
          } else {
            expect(p.x - last.x).toBeLessThan(0.001); // a slow, steady glide
          }
          last = p;
        }
        expect(jumps).toBeLessThanOrEqual(1);
      }
    });
  }

  it('is somewhere else at the same hour on different days', () => {
    const at8pm = Array.from({ length: 10 }, (_, i) => planetPosition(day(i), 20 * 60, true).x.toFixed(2));
    expect(new Set(at8pm).size).toBeGreaterThan(6);
    expect(planetPosition('2026-11-14', 600, true)).toEqual(planetPosition('2026-11-14', 600, true));
  });
});
