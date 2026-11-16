/**
 * Focus Sky: the ambient screen's night sky, filled by studying.
 *
 * - Each day has its own sky, laid out from the date: the same all day, never
 *   the same two days running.
 * - Few stars, spread evenly (best-candidate sampling, so no clumps and no
 *   empty halves) over the whole screen. The timer is avoided gently, never
 *   fenced off, so nothing piles up at the edges.
 * - They light in a shuffled order, so the first stars of the day land anywhere.
 * - Like a real sky: a few bright stars and many dim ones, bluish, white or warm.
 * - SKY_STARS earned stars spread across the daily bar (with an 8h bar, one
 *   every 13 minutes), and a faint dust of distant stars from the start.
 * - Past the bar no stars are added; the constellation joins the brightest lit
 *   stars instead and grows by one every BONUS_MS.
 * - The whole sky sways very slowly about a point above the screen (skySway),
 *   so no pixel holds the same light for long: it can't mark the display.
 *
 * Positions are 0–1 fractions of the screen, so they fit any size.
 */
export const SKY_STARS = 36;
export const DUST_STARS = 45;
const BONUS_MS = 15 * 60_000;
const BASE_CONSTELLATION = 7;
const MAX_CONSTELLATION = 12;

export interface SkyStar {
  x: number;
  y: number;
  /** Radius in CSS pixels. */
  size: number;
  /** 0–1 */
  brightness: number;
  /** The star's colour: bluish, white or warm. */
  tint: [number, number, number];
}

/** A box: where the timer is. Fractions of the screen. */
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

/** Mulberry32: a small, well-mixed generator, so neighbouring dates look nothing alike. */
export function skyRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TINTS: [number, number, number][] = [
  [205, 220, 255], // hot, bluish
  [246, 243, 236], // white
  [255, 229, 199], // cooler, warm
];

/** Clear of the very edge and of the top line. */
const MARGIN = { left: 0.04, right: 0.96, top: 0.09, bottom: 0.96 };

/**
 * Evenly spread points: each new one is the farthest of a few random
 * candidates from those already placed. Inside `avoid` a candidate counts as
 * closer, so the timer gets fewer stars without a hard edge.
 */
function spread(count: number, next: () => number, avoid?: SkyKeepOut, aspect = 1): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    let best = { x: 0.5, y: 0.5 };
    let bestScore = -1;
    for (let k = 0; k < 14; k++) {
      const x = MARGIN.left + next() * (MARGIN.right - MARGIN.left);
      const y = MARGIN.top + next() * (MARGIN.bottom - MARGIN.top);
      let d = Infinity;
      for (const p of points) d = Math.min(d, ((p.x - x) * aspect) ** 2 + (p.y - y) ** 2);
      if (avoid && x > avoid.left && x < avoid.right && y > avoid.top && y < avoid.bottom) d *= 0.3;
      if (d > bestScore) {
        bestScore = d;
        best = { x, y };
      }
    }
    points.push(best);
  }
  return points;
}

/**
 * Today's SKY_STARS stars, in the order they light up. `aspect` is the
 * screen's width over its height, so spacing is even on any screen.
 */
export function starMap(dateKey: string, keepOut: SkyKeepOut, aspect = 1): SkyStar[] {
  const next = skyRandom(skySeed(dateKey));
  const stars = spread(SKY_STARS, next, keepOut, aspect).map(({ x, y }) => {
    const m = next(); // magnitude: most stars dim, a few bright
    const tint = next();
    return {
      x,
      y,
      size: 0.9 + 0.95 * m ** 2,
      brightness: 0.55 + 0.45 * m ** 2,
      tint: TINTS[tint < 0.16 ? 0 : tint < 0.74 ? 1 : 2],
    };
  });
  // Spread evenly as a whole, lit in a shuffled order: the first stars land anywhere.
  for (let i = stars.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [stars[i], stars[j]] = [stars[j], stars[i]];
  }
  return stars;
}

/** Today's faint, distant stars: there from the start, barely visible. */
export function dustMap(dateKey: string, aspect = 1): SkyStar[] {
  const next = skyRandom(skySeed(dateKey) ^ 0x9e3779b9);
  return spread(DUST_STARS, next, undefined, aspect).map(({ x, y }) => ({
    x,
    y,
    size: 0.45 + 0.2 * next(),
    brightness: 0.12 + 0.14 * next(),
    tint: TINTS[1],
  }));
}

export interface SkyProgress {
  /** How many stars are lit. */
  lit: number;
  /** 0–1: today's focus against the bar. */
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

/**
 * The sky's slow sway, in radians, at `now`: up to 1.5° either way over three
 * hours, about a point above the screen (SKY_POLE). Every star moves a little,
 * all the time, too slowly to notice.
 */
export const SKY_SWAY_DEGREES = 1.5;
const SKY_SWAY_PERIOD_MS = 3 * 3_600_000;
export const SKY_POLE = { x: 0.5, y: -0.6 };

export function skySway(now: number): number {
  return ((SKY_SWAY_DEGREES * Math.PI) / 180) * Math.sin((2 * Math.PI * now) / SKY_SWAY_PERIOD_MS);
}

/** Where a star is drawn, in pixels, with the sky turned by `angle`. */
export function swayed(star: { x: number; y: number }, angle: number, w: number, h: number): [number, number] {
  const ox = SKY_POLE.x * w;
  const oy = SKY_POLE.y * h;
  const dx = star.x * w - ox;
  const dy = star.y * h - oy;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [ox + dx * c - dy * s, oy + dx * s + dy * c];
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
 * Where the constellation may be drawn: clear of the timer, of the top line
 * and of what the controls show (the pause log and buttons). In landscape
 * those sit in the timer's column, so only the sides are used; in portrait
 * they sit at the bottom.
 */
export function constellationArea(star: { x: number; y: number }, timer: SkyKeepOut, aspect: number): boolean {
  const margin = 0.015;
  if (star.y < 0.1) return false;
  if (aspect >= 1) return star.y < 0.8 && (star.x < timer.left - margin || star.x > timer.right + margin);
  const onTimer = star.x > timer.left - margin && star.x < timer.right + margin && star.y > timer.top - margin && star.y < timer.bottom + margin;
  return !onTimer && star.y < 0.8;
}

/**
 * The constellation: the brightest lit stars in the free area, joined to
 * their nearest neighbours (a minimum spanning tree), like a star chart.
 * Returns indexes into `stars` and the lines between them. Long links, and
 * any that would cross the timer, are left out.
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
  const chosen = stars
    .slice(0, lit)
    .map((star, index) => ({ star, index }))
    .filter(({ star }) => constellationArea(star, timer, aspect))
    .sort((a, b) => b.star.brightness - a.star.brightness)
    .slice(0, size);
  if (chosen.length < 2) return { points, lines };
  points.push(...chosen.map((c) => c.index));
  // Distances in screen proportions: x is stretched by the aspect ratio.
  const distance = (a: SkyStar, b: SkyStar) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const maxLink = 0.24 * Math.max(1, aspect);
  const tree = [chosen[0]];
  const rest = chosen.slice(1);
  while (rest.length) {
    let best = { a: tree[0], b: rest[0], d: Infinity };
    for (const a of tree) for (const b of rest) {
      if (crossesBox(a.star, b.star, box)) continue;
      const d = distance(a.star, b.star);
      if (d < best.d) best = { a, b, d };
    }
    if (best.d === Infinity) {
      // The rest lies across the timer: start a second group there, with its brightest star.
      tree.push(rest.shift()!);
      continue;
    }
    if (best.d <= maxLink) lines.push({ from: best.a.index, to: best.b.index });
    tree.push(best.b);
    rest.splice(rest.indexOf(best.b), 1);
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
