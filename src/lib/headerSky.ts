/**
 * The sky header (SkyHeader.tsx): a small landscape behind the top of every
 * tab. Its sky follows the hour, blending minute by minute between five skies;
 * the sun rises and sets in the valley between the peaks; at night today's
 * earned stars come out (the same 36 as the ambient screen's Focus Sky, lit by
 * the same rule) and, once the bar is reached, a small constellation joins the
 * brightest of them. Pure functions; drawn by SkyHeader.tsx.
 */

import { skyRandom, skySeed, starMap, type SkyStar } from './focusSky';
import { daysBetweenLocalISO } from './dates';
import { sunAltitude, type SunDay } from './sunPath';

type Rgba = [number, number, number, number];

export interface SkyColors {
  /** Four colours down the sky, top to horizon. */
  sky: string[];
  /** Four mountain ranges, far to near: [top, bottom] of each. */
  layers: [string, string][];
  /** The thin light along each ridge line. */
  rim: string;
  /** The haze at the foot of each range. */
  mist: string;
}

interface Palette {
  sky: string[];
  layers: [string, string][];
  rim: string;
  mist: string;
}

const PALETTES: Record<'night' | 'morning' | 'day' | 'evening' | 'dusk', Palette> = {
  night: { sky: ['#010209', '#050a1e', '#0c1736', '#16244a'], layers: [['#1b2747', '#141e39'], ['#121a33', '#0d1428'], ['#0b1022', '#070b18'], ['#05070f', '#020306']], rim: 'rgba(160,185,255,.35)', mist: 'rgba(120,140,200,.08)' },
  morning: { sky: ['#16244a', '#5d5a86', '#d98d7a', '#f6cf9c'], layers: [['#8a7f9e', '#6d6587'], ['#5b5578', '#433f60'], ['#36324f', '#26233a'], ['#191726', '#0c0b14']], rim: 'rgba(255,226,190,.55)', mist: 'rgba(255,236,220,.22)' },
  day: { sky: ['#1f5a92', '#3f86c2', '#8fc0e0', '#d9ebf3'], layers: [['#88a9bd', '#6f91a6'], ['#5d7f93', '#486a7e'], ['#355466', '#253f4e'], ['#142632', '#0a141b']], rim: 'rgba(255,255,255,.5)', mist: 'rgba(235,245,250,.16)' },
  evening: { sky: ['#120f28', '#3f2852', '#a64f68', '#f09a62'], layers: [['#6e3c5c', '#5a3150'], ['#4a2945', '#3a2038'], ['#2b1830', '#1e1123'], ['#120b17', '#07050a']], rim: 'rgba(255,180,140,.6)', mist: 'rgba(255,170,150,.14)' },
  dusk: { sky: ['#06061a', '#1a1534', '#3b2346', '#5a2f44'], layers: [['#33264a', '#2a1f3f'], ['#221a36', '#1a142b'], ['#14101f', '#0d0a15'], ['#08060c', '#030205']], rim: 'rgba(220,160,190,.4)', mist: 'rgba(200,150,190,.1)' },
};

/**
 * When each sky is fully itself, in clock hours, set by the day's real
 * sunrise (R) and sunset (S): dawn colours as the sun comes up, daylight a
 * few hours later, golden light just before sunset, dusk after it, then night.
 */
function skyKeys(day: SunDay): [number, keyof typeof PALETTES][] {
  const R = day.sunrise;
  const S = day.sunset;
  const mid = (R + S) / 2;
  const keys: [number, keyof typeof PALETTES][] = [
    [R - 1.3, 'night'], [R + 0.4, 'morning'], [Math.min(R + 3, mid), 'day'], [Math.max(S - 2, mid), 'day'],
    [S - 0.1, 'evening'], [S + 0.7, 'dusk'], [S + 1.6, 'night'],
  ];
  const inside = keys.filter(([h]) => h > 0 && h < 24);
  return [[0, 'night'], ...inside, [24, 'night']];
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

function parse(color: string): Rgba {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255, 1];
  }
  const m = (color.match(/[\d.]+/g) ?? []).map(Number);
  return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, m[3] ?? 1];
}

/** `a` blended toward `b` by `t`, as an rgba() string. */
export function mixColor(a: string, b: string, t: number): string {
  const x = parse(a);
  const y = parse(b);
  const c = x.map((v, i) => (i < 3 ? Math.round(lerp(v, y[i], t)) : +lerp(v, y[i], t).toFixed(3)));
  return `rgba(${c.join(',')})`;
}

/** The hour as a number: 19.5 is 7:30 pm. */
export function hourOf(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/** The sky's colours at `hour` (0–24) on `day`, blended smoothly between the five skies. */
export function skyColors(hour: number, day: SunDay): SkyColors {
  const h = ((hour % 24) + 24) % 24;
  const keys = skyKeys(day);
  let i = 0;
  while (i < keys.length - 2 && h >= keys[i + 1][0]) i++;
  const [h0, a] = keys[i];
  const [h1, b] = keys[i + 1];
  const t = smooth(clamp((h - h0) / (h1 - h0)));
  const A = PALETTES[a];
  const B = PALETTES[b];
  return {
    sky: A.sky.map((c, k) => mixColor(c, B.sky[k], t)),
    layers: A.layers.map(([top, bottom], k) => [mixColor(top, B.layers[k][0], t), mixColor(bottom, B.layers[k][1], t)]),
    rim: mixColor(A.rim, B.rim, t),
    mist: mixColor(A.mist, B.mist, t),
  };
}

/** 0 by day, 1 at night, easing through dusk and dawn: how much the stars show. */
export function nightness(hour: number, day: SunDay): number {
  const h = ((hour % 24) + 24) % 24;
  const R = day.sunrise;
  const S = day.sunset;
  if (h >= S + 1.6 || h < R - 1.3) return 1;
  if (h >= S - 0.1) return smooth((h - (S - 0.1)) / 1.7);
  if (h < R + 0.1) return 1 - smooth((h - (R - 1.3)) / 1.4);
  return 0;
}

export interface SunState {
  visible: boolean;
  /** Offset from the valley, as a fraction of the sky's width (−0.16 … 0.16). */
  dx: number;
  /** Height above the base line, in pixels at full size (0 at rising and setting). */
  rise: number;
  /** 0 on the horizon, 1 when high (45° and up): warm and low, or white and high. */
  elevation: number;
}

/**
 * Where the sun is at `hour` on `day`: it rises on the valley's left at the
 * real sunrise, crosses at solar noon and sets on the right at sunset; its
 * height follows its real altitude (a low winter noon, a high summer one).
 * Near the horizon the mountains hide it, as real ones would.
 */
export function sunState(hour: number, day: SunDay): SunState {
  const altitude = sunAltitude(day, hour);
  if (altitude < -1.5 || hour < day.sunrise - 0.3 || hour > day.sunset + 0.3) return { visible: false, dx: 0, rise: 0, elevation: 0 };
  const s = (hour - day.sunrise) / (day.sunset - day.sunrise);
  return {
    visible: true,
    dx: (s - 0.5) * 0.32,
    rise: 100 * clamp(altitude / 70, -0.03, 1),
    elevation: clamp(altitude / 45),
  };
}

export function greeting(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 12) return 'Good morning,';
  if (h >= 12 && h < 17) return 'Good afternoon,';
  if (h >= 17 && h < 21) return 'Good evening,';
  return 'Still at it,';
}

/**
 * A mountain line across `width` (midpoint displacement, seeded so it never
 * changes): low in the valley at `valleyX`, higher toward both sides.
 */
export function ridgeLine(seed: number, width: number, base: number, amp: number, valleyX: number, rough = 0.55): [number, number][] {
  const next = skyRandom(seed);
  const n = 64;
  const y = new Array<number>(n + 1).fill(0);
  y[0] = (next() - 0.5) * 0.3;
  y[n] = (next() - 0.5) * 0.3;
  for (let step = n; step > 1; step /= 2) {
    const k = Math.pow(rough, Math.log2(n / step) + 1);
    for (let i = step / 2; i < n; i += step) y[i] = (y[i - step / 2] + y[i + step / 2]) / 2 + (next() - 0.5) * 2 * k;
  }
  return y.map((v, i) => {
    const x = (i * width) / n;
    const lift = 0.35 + 0.65 * Math.min(1, Math.pow(Math.abs(x - valleyX) / 180, 1.2));
    return [x, base - amp * lift * (0.6 + v)];
  });
}

export interface DeadlineGoal {
  id: string;
  title: string;
  days: number;
}

/** Top-level goals with an end date today or later, nearest first. */
export function upcomingDeadlines(goals: { id: string; title: string; endDate?: string; completed?: boolean }[], today: string): DeadlineGoal[] {
  return goals
    .filter((g) => g.endDate && !g.completed)
    .map((g) => ({ id: g.id, title: g.title, days: daysBetweenLocalISO(today, g.endDate as string) }))
    .filter((g) => g.days >= 0)
    .sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));
}

/** Where the header's sky band is: the stars stay in it, above the mountains. */
export const STAR_BAND = { top: 20, height: 90 };

export interface HeaderStar {
  x: number;
  y: number;
  /** Radius, px. */
  r: number;
  /** 0–1 */
  opacity: number;
  tint: [number, number, number];
  /** One of the stars the constellation joins. */
  member?: boolean;
}

/**
 * Today's earned stars for a header `width` wide: the ambient sky's star map
 * for the date (same count, order, brightness and colours), laid out across
 * the header's band. `lit` comes from skyProgress(). Stars behind the words
 * (`nearText`) are kept faint.
 */
export function headerStars(dateKey: string, width: number, lit: number, nearText: (x: number, y: number) => boolean): HeaderStar[] {
  const aspect = width / STAR_BAND.height;
  const never = { left: 2, top: 2, right: 3, bottom: 3 };
  return starMap(dateKey, never, aspect)
    .slice(0, Math.max(0, lit))
    .map((star: SkyStar) => {
      const x = 6 + star.x * (width - 12);
      const y = STAR_BAND.top + star.y * STAR_BAND.height;
      // Mostly faint pinpoints, a few brighter: the ambient sky's brightness, squared down for a small band.
      const b = Math.pow((star.brightness - 0.55) / 0.45, 1.6);
      const quiet = nearText(x, y);
      const level = quiet ? Math.min(b, 0.4) : b;
      return { x, y, r: 0.4 + level * 0.85, opacity: 0.38 + level * 0.62, tint: star.tint };
    });
}

/**
 * The constellation once the bar is reached: a compact figure of `size` lit
 * stars (7, growing to 12 past the bar) around the brightest free one,
 * joined nearest first, like a star chart. Its stars always show. Returns the
 * lines; marks the stars it uses.
 */
export function headerConstellation(stars: HeaderStar[], size: number, free: (s: HeaderStar) => boolean, maxLink = 74): [HeaderStar, HeaderStar][] {
  if (size < 2) return [];
  const candidates = stars.filter(free);
  if (candidates.length < 2) return [];
  const anchor = candidates.reduce((best, s) => (s.opacity > best.opacity ? s : best), candidates[0]);
  const dist = (a: HeaderStar, b: HeaderStar) => Math.hypot(a.x - b.x, a.y - b.y);
  const points = candidates.slice().sort((a, b) => dist(a, anchor) - dist(b, anchor)).slice(0, size);
  const tree = [points[0]];
  const rest = points.slice(1);
  const lines: [HeaderStar, HeaderStar][] = [];
  while (rest.length) {
    let best = { a: tree[0], b: rest[0], d: Infinity };
    for (const a of tree) for (const b of rest) {
      const d = dist(a, b);
      if (d < best.d) best = { a, b, d };
    }
    if (best.d <= maxLink) lines.push([best.a, best.b]);
    tree.push(best.b);
    rest.splice(rest.indexOf(best.b), 1);
  }
  for (const p of points) {
    p.member = true;
    p.r = Math.max(p.r, 0.93);
    p.opacity = Math.max(p.opacity, 0.76);
  }
  return lines;
}

/** The faint stars every night has, earned or not. */
export function dustStars(dateKey: string, width: number, count = 110): { x: number; y: number; opacity: number }[] {
  const next = skyRandom(skySeed(dateKey) ^ 0x51ed27);
  return Array.from({ length: count }, () => ({ x: next() * width, y: 18 + next() * 124, opacity: 0.08 + Math.pow(next(), 2) * 0.22 }));
}
