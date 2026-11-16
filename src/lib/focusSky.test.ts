import { describe, expect, it } from 'vitest';
import {
  DUST_STARS,
  LANDSCAPE_KEEP_OUT,
  PORTRAIT_KEEP_OUT,
  SKY_STARS,
  SKY_SWAY_DEGREES,
  constellation,
  constellationArea,
  crossesBox,
  dustMap,
  rgbOf,
  skyProgress,
  skySeed,
  skySway,
  starMap,
  swayed,
} from './focusSky';

const PORTRAIT = 412 / 915;
const LANDSCAPE = 915 / 412;
const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);

describe('star map', () => {
  it('is the same all day and different every other day', () => {
    expect(starMap('2026-11-06', PORTRAIT_KEEP_OUT, PORTRAIT)).toEqual(starMap('2026-11-06', PORTRAIT_KEEP_OUT, PORTRAIT));
    const layouts = new Set(Array.from({ length: 120 }, (_, i) => JSON.stringify(starMap(day(i), PORTRAIT_KEEP_OUT, PORTRAIT).slice(0, 3))));
    expect(layouts.size).toBe(120);
    expect(skySeed('2026-11-06')).toBeGreaterThan(0);
  });

  it('has 36 stars, all on screen, clear of the edge and the top line, like a real sky', () => {
    const stars = starMap('2026-11-13', PORTRAIT_KEEP_OUT, PORTRAIT);
    expect(stars).toHaveLength(SKY_STARS);
    for (const s of stars) {
      expect(s.x).toBeGreaterThanOrEqual(0.04);
      expect(s.x).toBeLessThanOrEqual(0.96);
      expect(s.y).toBeGreaterThanOrEqual(0.09);
      expect(s.y).toBeLessThanOrEqual(0.96);
      expect(s.brightness).toBeGreaterThan(0.5);
      expect(s.brightness).toBeLessThanOrEqual(1);
      expect(s.tint).toHaveLength(3);
    }
    // Most are dim, a few bright.
    const bright = stars.filter((s) => s.brightness > 0.85).length;
    expect(bright).toBeGreaterThan(0);
    expect(bright).toBeLessThan(SKY_STARS / 3);
  });

  it('spreads them evenly over the whole screen, not along the edges', () => {
    for (let i = 0; i < 30; i++) {
      for (const [timer, aspect] of [[PORTRAIT_KEEP_OUT, PORTRAIT], [LANDSCAPE_KEEP_OUT, LANDSCAPE]] as const) {
        const stars = starMap(day(i), timer, aspect);
        // No two crowd each other.
        let closest = Infinity;
        for (let a = 0; a < stars.length; a++) for (let b = a + 1; b < stars.length; b++) {
          closest = Math.min(closest, Math.hypot((stars[a].x - stars[b].x) * aspect, stars[a].y - stars[b].y));
        }
        expect(closest).toBeGreaterThan(0.025);
        // Every third of the screen, across and down, has its share.
        for (let k = 0; k < 3; k++) {
          expect(stars.filter((s) => s.x >= k / 3 && s.x < (k + 1) / 3).length).toBeGreaterThanOrEqual(6);
          expect(stars.filter((s) => s.y >= k / 3 && s.y < (k + 1) / 3).length).toBeGreaterThanOrEqual(6);
        }
        // The timer gets fewer, but is not fenced off.
        const onTimer = stars.filter((s) => s.x > timer.left && s.x < timer.right && s.y > timer.top && s.y < timer.bottom).length;
        expect(onTimer).toBeLessThan(SKY_STARS * 0.4);
      }
    }
  });

  it('lights the first stars anywhere, not at the edges first', () => {
    let central = 0;
    for (let i = 0; i < 60; i++) {
      const first = starMap(day(i), PORTRAIT_KEEP_OUT, PORTRAIT).slice(0, 6);
      central += first.filter((s) => s.x > 0.2 && s.x < 0.8 && s.y > 0.2 && s.y < 0.8).length;
    }
    // Over many days, a fair share of the first stars land in the middle of the screen.
    expect(central / (60 * 6)).toBeGreaterThan(0.15);
  });

  it('adds a faint dust of distant stars', () => {
    const dust = dustMap('2026-11-13', PORTRAIT);
    expect(dust).toHaveLength(DUST_STARS);
    for (const s of dust) expect(s.brightness).toBeLessThan(0.3);
    expect(dustMap('2026-11-14', PORTRAIT)[0]).not.toEqual(dust[0]);
  });
});

describe('sky progress', () => {
  it('spreads the bar across the stars, so the sky fills at the bar whatever its length', () => {
    expect(skyProgress((2 * 60 + 43) * 60_000, 8).lit).toBe(12); // 2h 43m of 8h: one star per 13⅓ minutes
    expect(skyProgress(60 * 60_000, 4).lit).toBe(9);
    expect(skyProgress(4 * 3_600_000, 4).lit).toBe(SKY_STARS);
    expect(skyProgress(12 * 3_600_000, 12).lit).toBe(SKY_STARS);
    expect(skyProgress(20 * 60_000, 0.5).lit).toBe(24); // a 30-minute bar
    expect(skyProgress(60 * 60_000, Number.NaN).lit).toBe(9); // a broken bar counts as 4h
  });

  it('never adds stars past the bar; the constellation grows instead, to twelve', () => {
    expect(skyProgress(4 * 3_600_000 - 1, 4).constellationSize).toBe(0);
    const atBar = skyProgress(4 * 3_600_000, 4);
    expect(atBar.barReached).toBe(true);
    expect(atBar.constellationSize).toBe(7);
    expect(skyProgress(4 * 3_600_000 + 45 * 60_000, 4).constellationSize).toBe(10);
    expect(skyProgress(9 * 3_600_000, 4).constellationSize).toBe(12);
    expect(skyProgress(9 * 3_600_000, 4).lit).toBe(SKY_STARS);
  });
});

describe('the sky sways, so it never marks the screen', () => {
  it('turns at most 1.5° either way, and keeps moving', () => {
    const limit = (SKY_SWAY_DEGREES * Math.PI) / 180;
    const angles = Array.from({ length: 200 }, (_, i) => skySway(i * 5 * 60_000));
    for (const a of angles) expect(Math.abs(a)).toBeLessThanOrEqual(limit + 1e-12);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(limit);
    // Over an hour, the sky moves on.
    expect(skySway(30 * 60_000)).not.toBeCloseTo(skySway(90 * 60_000), 3);
  });

  it('moves every star a little, and none far: a few dozen pixels at most', () => {
    const limit = (SKY_SWAY_DEGREES * Math.PI) / 180;
    for (const star of [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.95 }, { x: 0.5, y: 0.5 }]) {
      const [x0, y0] = swayed(star, 0, 412, 915);
      const [x1, y1] = swayed(star, limit, 412, 915);
      const moved = Math.hypot(x1 - x0, y1 - y0);
      expect(moved).toBeGreaterThan(8);
      expect(moved).toBeLessThan(45);
    }
    expect(swayed({ x: 0.3, y: 0.4 }, 0, 412, 915)).toEqual([0.3 * 412, 0.4 * 915]);
  });
});

describe('constellation', () => {
  for (const [name, timer, aspect] of [
    ['landscape', LANDSCAPE_KEEP_OUT, LANDSCAPE],
    ['portrait', PORTRAIT_KEEP_OUT, PORTRAIT],
    ['portrait, measured digits', { left: 0.18, top: 0.22, right: 0.82, bottom: 0.76 }, PORTRAIT],
    ['a wide timer', { left: 0.15, top: 0.18, right: 0.85, bottom: 0.8 }, LANDSCAPE],
  ] as const) {
    it(`stays clear of the timer, the top line and the controls in ${name}`, () => {
      for (let i = 0; i < 20; i++) {
        const map = starMap(day(i), timer, aspect);
        const { points, lines } = constellation(map, SKY_STARS, 7, aspect, timer);
        expect(points.length).toBeGreaterThanOrEqual(4);
        expect(points.length).toBeLessThanOrEqual(7);
        for (const p of points) {
          expect(constellationArea(map[p], timer, aspect)).toBe(true);
          expect(map[p].y).toBeGreaterThanOrEqual(0.1);
          expect(map[p].y).toBeLessThan(0.8);
        }
        for (const { from, to } of lines) {
          expect(points).toContain(from);
          expect(points).toContain(to);
          expect(crossesBox(map[from], map[to], timer)).toBe(false);
        }
        expect(lines.length).toBeLessThan(points.length); // trees, not loops
        expect(lines.length).toBeGreaterThan(0);
      }
    });
  }

  it('uses both sides of the timer in landscape', () => {
    let both = 0;
    for (let i = 0; i < 20; i++) {
      const map = starMap(day(i), LANDSCAPE_KEEP_OUT, LANDSCAPE);
      const { points, lines } = constellation(map, SKY_STARS, 12, LANDSCAPE, LANDSCAPE_KEEP_OUT);
      const left = points.filter((p) => map[p].x < 0.5);
      const right = points.filter((p) => map[p].x >= 0.5);
      if (left.length && right.length) both++;
      // Each line stays on its own side.
      for (const { from, to } of lines) expect(map[from].x < 0.5).toBe(map[to].x < 0.5);
    }
    expect(both).toBeGreaterThan(15);
  });

  it('knows when a line crosses a box', () => {
    const box = { left: 0.4, top: 0.4, right: 0.6, bottom: 0.6 };
    expect(crossesBox({ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, box)).toBe(true);
    expect(crossesBox({ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.9 }, box)).toBe(false);
    expect(crossesBox({ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, box)).toBe(false);
  });

  it('uses only stars that are lit, and nothing before the bar', () => {
    const stars = starMap('2026-11-06', LANDSCAPE_KEEP_OUT, LANDSCAPE);
    expect(constellation(stars, SKY_STARS, 0, LANDSCAPE)).toEqual({ points: [], lines: [] });
    const { points } = constellation(stars, 20, 7, LANDSCAPE);
    for (const i of points) expect(i).toBeLessThan(20);
  });

  it('draws a different shape on different days', () => {
    const a = constellation(starMap('2026-11-05', LANDSCAPE_KEEP_OUT, LANDSCAPE), SKY_STARS, 7, LANDSCAPE);
    const b = constellation(starMap('2026-11-06', LANDSCAPE_KEEP_OUT, LANDSCAPE), SKY_STARS, 7, LANDSCAPE);
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
