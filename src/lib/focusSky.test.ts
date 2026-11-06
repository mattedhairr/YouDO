import { describe, expect, it } from 'vitest';
import { LANDSCAPE_KEEP_OUT, PORTRAIT_KEEP_OUT, SKY_STARS, constellation, crossesBox, fbm, milkyWay, milkyWayGlow, milkyWayLevel, rgbOf, skyProgress, skySeed, starMap } from './focusSky';

describe('star map', () => {
  it('is the same all day and different on another day', () => {
    expect(starMap('2026-11-06', LANDSCAPE_KEEP_OUT)).toEqual(starMap('2026-11-06', LANDSCAPE_KEEP_OUT));
    expect(starMap('2026-11-07', LANDSCAPE_KEEP_OUT)[0]).not.toEqual(starMap('2026-11-06', LANDSCAPE_KEEP_OUT)[0]);
    expect(skySeed('2026-11-06')).toBeGreaterThan(0);
  });

  it('has every star on screen, clear of the top line, and few on the timer', () => {
    const stars = starMap('2026-11-06', LANDSCAPE_KEEP_OUT);
    expect(stars).toHaveLength(SKY_STARS);
    for (const s of stars) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(1);
      expect(s.y).toBeGreaterThan(0.06);
      expect(s.y).toBeLessThan(0.94);
      expect(s.brightness).toBeGreaterThan(0);
      expect(s.brightness).toBeLessThanOrEqual(1);
    }
    const k = LANDSCAPE_KEEP_OUT;
    const onTimer = stars.filter((s) => s.x > k.left && s.x < k.right && s.y > k.top && s.y < k.bottom);
    expect(onTimer.length).toBeLessThan(SKY_STARS * 0.08);
  });
});

describe('sky progress', () => {
  it('spreads the bar across the stars, so the sky fills at the bar whatever its length', () => {
    expect(skyProgress(60 * 60_000, 4).lit).toBe(60); // 4h bar: a star a minute
    expect(skyProgress(60 * 60_000, 8).lit).toBe(30); // 8h bar: a star every 2 minutes
    expect(skyProgress(4 * 3_600_000, 4).lit).toBe(SKY_STARS);
    expect(skyProgress(12 * 3_600_000, 12).lit).toBe(SKY_STARS);
  });

  it('never adds stars past the bar; the constellation grows instead', () => {
    const atBar = skyProgress(4 * 3_600_000, 4);
    const later = skyProgress(5 * 3_600_000, 4);
    expect(later.lit).toBe(SKY_STARS);
    expect(atBar.barReached).toBe(true);
    expect(atBar.constellationSize).toBe(10);
    expect(later.constellationSize).toBe(14); // one more star every 15 minutes
    expect(skyProgress(20 * 3_600_000, 4).constellationSize).toBe(30);
  });

  it('works with a short bar, and falls back to 4h for a broken one', () => {
    expect(skyProgress(30 * 60_000, 0.5)).toMatchObject({ lit: SKY_STARS, barReached: true, constellationSize: 10 });
    expect(skyProgress(60 * 60_000, Number.NaN).lit).toBe(60);
    expect(skyProgress(60 * 60_000, 0).lit).toBe(60);
  });

  it('has no constellation before the bar, and no stars for no focus', () => {
    expect(skyProgress(3 * 3_600_000, 4)).toMatchObject({ barReached: false, constellationSize: 0, progress: 0.75 });
    expect(skyProgress(0, 4)).toMatchObject({ lit: 0, progress: 0 });
    expect(skyProgress(-5, 4).lit).toBe(0);
  });
});

describe('constellation', () => {
  const stars = starMap('2026-11-06', LANDSCAPE_KEEP_OUT);

  for (const [name, timer, aspect] of [
    ['landscape', LANDSCAPE_KEEP_OUT, 844 / 390],
    ['portrait', PORTRAIT_KEEP_OUT, 390 / 844],
    ['a wide timer', { left: 0.15, top: 0.18, right: 0.85, bottom: 0.8 }, 915 / 412],
  ] as const) {
    it(`stays off the timer in ${name}: no star on it, no line across it`, () => {
      const map = starMap('2026-11-06', timer);
      const { points, lines } = constellation(map, SKY_STARS, 12, aspect, timer);
      expect(points.length).toBeGreaterThanOrEqual(4);
      for (const i of points) {
        const s = map[i];
        expect(i).toBeLessThan(SKY_STARS);
        expect(s.x > timer.left && s.x < timer.right).toBe(false); // beside the timer, not above or below it
        expect(s.y).toBeGreaterThan(0.13);
        expect(s.y).toBeLessThan(0.78);
      }
      for (const { from, to } of lines) {
        expect(points).toContain(from);
        expect(points).toContain(to);
        expect(crossesBox(map[from], map[to], timer)).toBe(false);
      }
      expect(lines.length).toBeLessThan(points.length); // trees, not loops
    });
  }

  it('knows when a line crosses a box', () => {
    const box = { left: 0.4, top: 0.4, right: 0.6, bottom: 0.6 };
    expect(crossesBox({ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, box)).toBe(true);
    expect(crossesBox({ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.9 }, box)).toBe(false);
    expect(crossesBox({ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, box)).toBe(false);
  });

  it('uses only stars that are lit, and nothing before the bar', () => {
    expect(constellation(stars, SKY_STARS, 0, 2)).toEqual({ points: [], lines: [] });
    const { points } = constellation(stars, 60, 10, 2);
    for (const i of points) expect(i).toBeLessThan(60);
  });

  it('draws a different shape on different days', () => {
    const a = constellation(starMap('2026-11-05', LANDSCAPE_KEEP_OUT), SKY_STARS, 10, 2);
    const b = constellation(starMap('2026-11-06', LANDSCAPE_KEEP_OUT), SKY_STARS, 10, 2);
    expect(a).not.toEqual(b);
  });
});

describe('accent colour', () => {
  it('reads rgb() and color(srgb …) the way browsers report them', () => {
    expect(rgbOf('rgb(201, 164, 110)')).toEqual([201, 164, 110]);
    expect(rgbOf('color(srgb 0.5 0.25 1)')).toEqual([128, 64, 255]);
    expect(rgbOf('')).toEqual([201, 164, 110]);
  });
});

describe('Milky Way', () => {
  it('has its own shape each day, the same all day, within calm limits', () => {
    expect(milkyWay('2026-11-06')).toEqual(milkyWay('2026-11-06'));
    expect(milkyWay('2026-11-07')).not.toEqual(milkyWay('2026-11-06'));
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-12-25', '2027-01-01']) {
      const way = milkyWay(day);
      expect(Math.abs(way.angle)).toBeGreaterThanOrEqual(0.25);
      expect(Math.abs(way.angle)).toBeLessThanOrEqual(0.7);
      expect(way.width).toBeGreaterThanOrEqual(0.13);
      expect(way.width).toBeLessThanOrEqual(0.2);
    }
  });

  it('lights a band and leaves the rest of the screen black', () => {
    const way = { angle: 0.4, width: 0.2, curve: 0, offset: 0, seed: 7 };
    const on = milkyWayLevel(way, 0, 0);
    expect(on).toBeGreaterThan(0.05);
    expect(on).toBeLessThanOrEqual(1);
    // Far across the band: nothing at all.
    expect(milkyWayLevel(way, -Math.sin(0.4) * 0.9, Math.cos(0.4) * 0.9)).toBe(0);
    // Over half a phone screen stays fully off: below 1/255 once drawn at its ~10% peak.
    for (const day of ['2026-11-04', '2026-11-06', '2026-12-01', '2027-03-15']) {
      let off = 0;
      let total = 0;
      for (let x = -1.1; x <= 1.1; x += 0.02) for (let y = -0.5; y <= 0.5; y += 0.02) {
        total++;
        if (milkyWayLevel(milkyWay(day), x, y) * 0.095 * 255 < 1) off++;
      }
      expect(off / total).toBeGreaterThan(0.5);
    }
  });

  it('has texture: knots and lanes, not a smooth stripe', () => {
    const way = { angle: 0, width: 0.25, curve: 0, offset: 0, seed: 3 };
    const along = Array.from({ length: 40 }, (_, i) => milkyWayLevel(way, -1 + i * 0.05, 0));
    expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(0.15);
    expect(milkyWayLevel(way, 0.3, 0, 1)).not.toBe(milkyWayLevel(way, 0.3, 0, 0));
  });

  it('glows quietly, brighter with the day and the music, nearly gone when paused', () => {
    const quiet = milkyWayGlow({ progress: 0, music: 0, paused: false });
    expect(milkyWayGlow({ progress: 1, music: 0, paused: false })).toBeGreaterThan(quiet);
    expect(milkyWayGlow({ progress: 0, music: 1, paused: false })).toBeGreaterThan(quiet);
    expect(milkyWayGlow({ progress: 1, music: 1, paused: false })).toBeLessThanOrEqual(1);
    expect(milkyWayGlow({ progress: 1, music: 1, paused: true })).toBeLessThan(quiet);
  });

  it('noise stays in range', () => {
    for (let i = 0; i < 200; i++) {
      const v = fbm(i * 0.37, i * 0.11, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
