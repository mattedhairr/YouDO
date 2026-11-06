/**
 * Focus Sky: the ambient screen's night sky, filled by studying.
 *
 * - Each day has its own star map, laid out from the date, so it stays the
 *   same all day and differs every day.
 * - The sky holds SKY_STARS stars, spread across the daily bar: with a 4h bar
 *   each star is a minute, with an 8h bar two minutes. It always looks equally
 *   full at the bar, however long the bar is.
 * - Past the bar no new stars appear; every BONUS_MS one more lit star joins
 *   the constellation instead.
 * - The constellation joins the brightest lit stars on each side of the timer
 *   to their nearest neighbours (a minimum spanning tree), like a star chart.
 *
 * Positions are 0–1 fractions of the screen, so they fit any size.
 */
export const SKY_STARS = 240;
const BONUS_MS = 15 * 60_000;
const BASE_CONSTELLATION = 10;
const MAX_CONSTELLATION = 30;

export interface SkyStar {
  x: number;
  y: number;
  /** Radius in CSS pixels. */
  size: number;
  /** 0–1 */
  brightness: number;
}

/** A box the stars keep out of (mostly): where the timer is. Fractions of the screen. */
export interface SkyKeepOut {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const LANDSCAPE_KEEP_OUT: SkyKeepOut = { left: 0.28, top: 0.16, right: 0.72, bottom: 0.78 };
export const PORTRAIT_KEEP_OUT: SkyKeepOut = { left: 0.12, top: 0.2, right: 0.88, bottom: 0.72 };

/** FNV-1a: a day's key ("2026-11-06") to a seed. */
export function skySeed(dateKey: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 2147483646) + 1;
}

function random(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Today's star map: SKY_STARS places, in the order they light up. They stay
 * clear of the top line and the bottom edge, and almost never land on the timer.
 */
export function starMap(dateKey: string, keepOut: SkyKeepOut, count = SKY_STARS): SkyStar[] {
  const next = random(skySeed(dateKey));
  const stars: SkyStar[] = [];
  let guard = 0;
  while (stars.length < count && guard++ < count * 50) {
    const x = 0.02 + next() * 0.96;
    const y = 0.07 + next() * 0.86;
    const size = 0.7 + next() * 1.0;
    const brightness = 0.5 + next() * 0.45;
    const inside = x > keepOut.left && x < keepOut.right && y > keepOut.top && y < keepOut.bottom;
    if (inside && next() < 0.9) continue;
    stars.push({ x, y, size, brightness });
  }
  return stars;
}

export interface SkyProgress {
  /** How many stars are lit. */
  lit: number;
  /** 0–1: today's focus against the bar (the aurora's height). */
  progress: number;
  barReached: boolean;
  /** How many stars the constellation joins (grows past the bar). */
  constellationSize: number;
}

export function skyProgress(focusMs: number, barHours: number): SkyProgress {
  // A missing or broken bar falls back to 4h; a real one can be as short as 30 minutes.
  const barMs = (Number.isFinite(barHours) && barHours > 0 ? barHours : 4) * 3_600_000;
  const focus = Math.max(0, focusMs);
  const perStar = barMs / SKY_STARS;
  const lit = Math.min(SKY_STARS, Math.floor(focus / perStar));
  const barReached = focus >= barMs;
  const bonus = barReached ? Math.floor((focus - barMs) / BONUS_MS) : 0;
  return {
    lit,
    progress: Math.min(1, focus / barMs),
    barReached,
    constellationSize: barReached ? Math.min(MAX_CONSTELLATION, BASE_CONSTELLATION + bonus) : 0,
  };
}

export interface SkyLine {
  from: number;
  to: number;
}

/** Whether the segment a→b passes through the box (Liang–Barsky clipping). */
export function crossesBox(a: { x: number; y: number }, b: { x: number; y: number }, box: SkyKeepOut): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [[-dx, a.x - box.left], [dx, box.right - a.x], [-dy, a.y - box.top], [dy, box.bottom - a.y]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * The constellation: the brightest lit stars beside the timer (never in its
 * column, where the pause log, task and buttons are, nor by the top line), in
 * two groups, left and right, each
 * joined to nearest neighbours. Returns indexes into `stars` and the lines
 * between them. Long links, and any that would cross the timer, are left out.
 */
export function constellation(
  stars: SkyStar[],
  lit: number,
  size: number,
  aspect: number,
  timer: SkyKeepOut = LANDSCAPE_KEEP_OUT,
): { points: number[]; lines: SkyLine[] } {
  const points: number[] = [];
  const lines: SkyLine[] = [];
  if (size <= 0) return { points, lines };
  const margin = 0.015;
  const box = { left: timer.left - margin, top: timer.top - margin, right: timer.right + margin, bottom: timer.bottom + margin };
  const usable = stars
    .slice(0, lit)
    .map((star, index) => ({ star, index }))
    .filter(({ star }) => star.y > 0.13 && star.y < 0.78 && !(star.x > box.left && star.x < box.right));
  const sides = [usable.filter(({ star }) => star.x < 0.5), usable.filter(({ star }) => star.x >= 0.5)];
  const perSide = Math.ceil(size / 2);
  // Distances in screen proportions: x is stretched by the aspect ratio.
  const distance = (a: SkyStar, b: SkyStar) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const maxLink = 0.2 * Math.max(1, aspect);
  for (const side of sides) {
    const chosen = [...side].sort((a, b) => b.star.brightness - a.star.brightness).slice(0, perSide);
    if (chosen.length < 2) continue;
    points.push(...chosen.map((c) => c.index));
    const tree = [chosen[0]];
    const rest = chosen.slice(1);
    while (rest.length) {
      let best = { a: tree[0], b: rest[0], d: Infinity };
      for (const a of tree) for (const b of rest) {
        const d = distance(a.star, b.star);
        if (d < best.d) best = { a, b, d };
      }
      if (best.d <= maxLink && !crossesBox(best.a.star, best.b.star, box)) lines.push({ from: best.a.index, to: best.b.index });
      tree.push(best.b);
      rest.splice(rest.indexOf(best.b), 1);
    }
  }
  return { points, lines };
}

/**
 * The accent as the screen shows it: "rgb(201, 164, 110)", or "color(srgb 0.79
 * 0.64 0.43)" where the theme mixes it, to [201, 164, 110].
 */
export function rgbOf(color: string): [number, number, number] {
  const m = color.match(/-?\d*\.?\d+/g);
  if (!m || m.length < 3) return [201, 164, 110];
  const unit = color.trim().startsWith('color(') ? 255 : 1;
  return [0, 1, 2].map((i) => Math.round(Math.min(255, Math.max(0, Number(m[i]) * unit)))) as [number, number, number];
}

/**
 * The Milky Way: a faint, uneven river of light across the sky, with darker
 * dust lanes and brighter knots. Its angle, width, curve and texture come from
 * the date, so each day has its own and it stays the same all day.
 */
export interface MilkyWay {
  /** Radians from horizontal: tilted one way or the other, never flat or steep. */
  angle: number;
  /** Half-width of the band, in screen heights. */
  width: number;
  /** How much it bends. */
  curve: number;
  /** How far the band sits from the centre, in screen heights. */
  offset: number;
  seed: number;
}

export function milkyWay(dateKey: string): MilkyWay {
  const next = random(skySeed(`milky-${dateKey}`));
  return {
    angle: (next() < 0.5 ? -1 : 1) * (0.25 + next() * 0.45),
    width: 0.13 + next() * 0.07,
    curve: (next() - 0.5) * 0.5,
    offset: (next() - 0.5) * 0.35,
    seed: Math.floor(next() * 100000),
  };
}

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth value noise, 0–1. */
function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fractal noise: detail on several scales, as in clouds and nebulae. About 0–1. */
export function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * noise(x * freq, y * freq, seed + i * 17);
    freq *= 2.03;
    amp *= 0.5;
  }
  return value;
}

/**
 * How bright the band is at a point, 0–1. x and y are in screen heights,
 * measured from the centre. `layer` gives a second, fainter layer its own
 * texture, so two layers drifting apart blend into slowly changing shapes.
 */
export function milkyWayLevel(way: MilkyWay, x: number, y: number, layer = 0): number {
  const cos = Math.cos(way.angle);
  const sin = Math.sin(way.angle);
  const u = x * cos + y * sin;
  const v = -x * sin + y * cos;
  const centre = way.offset + way.curve * u * u;
  const dist = (v - centre) / way.width;
  const band = Math.exp(-dist * dist * 2.2);
  if (band < 0.01) return 0;
  const seed = way.seed + layer * 1013;
  const body = fbm(u * 3 + 10, v * 3 + 4, seed);
  const knots = Math.pow(fbm(u * 7 + 3, v * 7 + 9, seed + 5), 3) * 1.8;
  const lane = Math.max(0, 1 - Math.abs(fbm(u * 2.2 + 7, v * 5 + 1, seed + 9) - 0.5) * 7) * Math.exp(-dist * dist * 4);
  return Math.max(0, Math.min(1, band * (0.35 + 0.85 * body + knots) * (1 - 0.75 * lane)));
}

/**
 * The Milky Way's brightness on screen, 0–1 (the layer itself peaks under 10%).
 * Quieter with no sound, a little brighter as the day nears the bar, breathing
 * with the music's loudness, and nearly gone during a pause.
 */
export function milkyWayGlow({ progress, music, paused }: { progress: number; music: number; paused: boolean }): number {
  const day = 0.55 + 0.2 * Math.min(1, Math.max(0, progress));
  const glow = Math.min(1, day + 0.25 * Math.min(1, Math.max(0, music)));
  return paused ? glow * 0.3 : glow;
}
