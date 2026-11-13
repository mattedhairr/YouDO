import { describe, expect, it } from 'vitest';
import { GRAHAS, firstFact, grahaOf, grahaPosition, moonPhase, weekdayOf } from './graha';

describe('graha of the day', () => {
  it('follows the weekday names: Sunday the Sun … Saturday Saturn', () => {
    expect(GRAHAS.map((g) => g.planet)).toEqual(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']);
    expect(weekdayOf('2026-11-13')).toBe(5); // a Friday
    expect(grahaOf('2026-11-13').name).toBe('Śukra');
    expect(grahaOf('2026-11-15').name).toBe('Sūrya');
    expect(grahaOf('2026-11-16').name).toBe('Chandra');
    for (const g of GRAHAS) expect(g.vara).toMatch(/day$/);
  });

  it('has several sourced facts for every graha', () => {
    for (const g of GRAHAS) {
      expect(g.facts.length).toBeGreaterThanOrEqual(4);
      for (const f of g.facts) {
        expect(f.text.length).toBeGreaterThan(40);
        expect(f.text.length).toBeLessThan(330); // fits the card
        expect(f.source.trim().length).toBeGreaterThan(3);
      }
      // A mix: tradition and astronomy.
      expect(g.facts.some((f) => f.source === 'Astronomy')).toBe(true);
      expect(g.facts.some((f) => f.source !== 'Astronomy')).toBe(true);
    }
  });

  it('opens each week with a different fact, the same all day', () => {
    const n = GRAHAS[5].facts.length;
    expect(firstFact('2026-11-13', n)).toBe(firstFact('2026-11-13', n));
    const fridays = ['2026-11-13', '2026-11-20', '2026-11-27', '2026-12-04'].map((d) => firstFact(d, n));
    expect(new Set(fridays).size).toBe(4);
    for (const i of fridays) expect(i).toBeLessThan(n);
    expect(firstFact('2026-11-13', 0)).toBe(0);
  });

  it('knows the Moon’s phase well enough to draw it', () => {
    // Full moon 25 Jan 2024 (17:54 UTC), new moon 11 Jan 2024 (11:57 UTC).
    expect(Math.abs(moonPhase('2024-01-25') - 0.5)).toBeLessThan(0.05);
    const nearNew = moonPhase('2024-01-11');
    expect(Math.min(nearNew, 1 - nearNew)).toBeLessThan(0.05);
  });

  it('moves slowly through the day, clear of the top line and the timer', () => {
    for (const portrait of [true, false]) {
      let last = grahaPosition(0, portrait);
      for (let m = 0; m <= 24 * 60; m += 30) {
        const p = grahaPosition(m, portrait);
        expect(p.x).toBeGreaterThan(0.6);
        expect(p.x).toBeLessThan(0.95);
        expect(p.y).toBeGreaterThan(portrait ? 0.1 : 0.15);
        expect(p.y).toBeLessThan(portrait ? 0.17 : 0.75);
        // Never a jump: at most a few percent of the screen in half an hour.
        expect(Math.hypot(p.x - last.x, p.y - last.y)).toBeLessThan(0.03);
        last = p;
      }
      // But it does move over the day.
      const morning = grahaPosition(8 * 60, portrait);
      const evening = grahaPosition(20 * 60, portrait);
      expect(Math.hypot(morning.x - evening.x, morning.y - evening.y)).toBeGreaterThan(0.08);
    }
  });
});
