/**
 * The Summit header (Settings → Appearance → Header background): the sky
 * header's real sky over one mountain that stands for your nearest goal. A
 * flag on the peak is its deadline; a trail climbs from the day the goal was
 * made, walked in gold up to today. Pure geometry and dates; drawn by
 * SkyHeader.tsx. Coordinates are the header's scene coordinates.
 */
import { daysBetweenLocalISO, localISODate } from './dates';
import { skyRandom } from './focusSky';

export type Pt = [number, number];

export interface SummitScene {
  /** Four ranges, far to near; the far one carries the peak. */
  ranges: [Pt[], Pt[], Pt[], Pt[]];
  peak: Pt;
  /** The snow on the peak, as a closed outline. */
  snow: Pt[];
  /** The trail from its foot to the summit, finely sampled. */
  trail: Pt[];
  /** Where the sun travels: its valley (fraction of the width) and how high it climbs. */
  sun: { valley: number; base: number; span: number };
}

const STEP = 2;

/** A range: gentle seeded waves around `base`, with optional peaks (bumps) pushed up. */
function range(width: number, base: number, amp: number, seed: number, bumps: { x: number; h: number; s: number }[] = []): Pt[] {
  const next = skyRandom(seed);
  const ph = [next() * 6.3, next() * 6.3, next() * 6.3];
  const fr = [1.2 + next(), 2.8 + next() * 1.6, 6 + next() * 4];
  const pts: Pt[] = [];
  for (let x = 0; x <= width + STEP / 2; x += STEP) {
    const u = x / width;
    let y = base - amp * (0.55 * Math.sin(u * fr[0] * Math.PI + ph[0]) + 0.3 * Math.sin(u * fr[1] * Math.PI + ph[1]) + 0.15 * Math.sin(u * fr[2] * Math.PI + ph[2]));
    for (const b of bumps) {
      const t = Math.max(0, 1 - Math.abs(x - b.x) / (b.s * 2.4));
      // A little rock texture along the slopes.
      y -= b.h * Math.pow(t, 1.7) * (1 + 0.03 * Math.sin(x * 0.9));
    }
    pts.push([x, y]);
  }
  return pts;
}

/** A range's height at x. */
export function heightAt(pts: Pt[], x: number): number {
  const i = Math.max(0, Math.min(pts.length - 2, Math.floor(x / STEP)));
  const [x0, y0] = pts[i];
  const [x1, y1] = pts[i + 1];
  return y0 + ((y1 - y0) * Math.max(0, Math.min(1, (x - x0) / Math.max(1e-6, x1 - x0))));
}

/** A smooth curve through `pts` (Catmull-Rom), sampled into many points. */
function smoothThrough(pts: Pt[], perSegment = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([at(p0[0], p1[0], p2[0], p3[0]), at(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * The landscape for a header `width` wide and `height` tall (scene
 * coordinates). On Today the peak stands left of the countdown, clear of
 * the words; on the other tabs it sits right of the title.
 */
export function summitScene(width: number, height: number, today: boolean): SummitScene {
  const peakX = today ? width - 150 : Math.round(width * 0.62);
  const g = today
    ? { far: height - 96, peakH: 54, mid: height - 72, near: height - 46, front: height - 24, amp: 7 }
    : { far: height - 52, peakH: 34, mid: height - 38, near: height - 24, front: height - 10, amp: 5 };
  const far = range(width, g.far, g.amp, 11, [
    { x: peakX, h: g.peakH, s: today ? 34 : 26 },
    { x: peakX + 78, h: g.peakH * 0.3, s: 22 },
    { x: peakX - 140, h: g.peakH * 0.18, s: 30 },
  ]);
  const mid = range(width, g.mid, g.amp * 1.3, 23);
  const near = range(width, g.near, g.amp, 41);
  const front = range(width, g.front, g.amp * 0.7, 57);
  // The highest point near the peak's centre.
  let peak: Pt = [peakX, heightAt(far, peakX)];
  for (const p of far) if (Math.abs(p[0] - peakX) < 10 && p[1] < peak[1]) peak = p;
  const [px, py] = peak;

  // Snow: down from the ridge to a ragged line a little below the summit.
  const cap = far.filter(([x, y]) => Math.abs(x - px) < 40 && y < py + 22);
  const jitter = skyRandom(5);
  const under = cap
    .slice()
    .reverse()
    .map(([x]): Pt => [x, Math.max(heightAt(far, x), py + 16 + (jitter() - 0.5) * 8 + Math.abs(x - px) * 0.05)]);
  const snow = [...cap, ...under];

  // The trail: from the foot of the hills on the left, up the near slope in switchbacks.
  const s = width / 380;
  const trail = smoothThrough([
    [22 * s, heightAt(near, 22 * s) + 6],
    [104 * s, heightAt(mid, 104 * s) + 10],
    [px - 64, py + (today ? 56 : 38)],
    [px - 14, py + (today ? 40 : 27)],
    [px - 38, py + (today ? 24 : 17)],
    [px - 8, py + (today ? 11 : 8)],
    [px, py + 1],
  ]);

  return {
    ranges: [far, mid, near, front],
    peak,
    snow,
    trail,
    // The sun rises left of the peak, crosses high over the open sky, and sets just past it.
    sun: { valley: 0.5, base: g.far, span: today ? 100 : 56 },
  };
}

/** Before YouDO existed: a creation time older than this is missing or broken, not real. */
const EARLIEST = Date.UTC(2020, 0, 1);

/** The day a goal began: its start date, or else the day it was made (null when neither is believable). */
export function goalStart(goal: { startDate?: string; createdAt?: number }): string | null {
  if (goal.startDate && /^\d{4}-\d{2}-\d{2}/.test(goal.startDate) && goal.startDate.slice(0, 4) >= '2020') return goal.startDate.slice(0, 10);
  if (typeof goal.createdAt === 'number' && Number.isFinite(goal.createdAt) && goal.createdAt >= EARLIEST) return localISODate(new Date(goal.createdAt));
  return null;
}

/** How far along the trail today is (0 at the start, 1 on the deadline). */
export function trailFraction(start: string | null, end: string, today: string): number {
  if (!start) return 0;
  const total = daysBetweenLocalISO(start, end);
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, daysBetweenLocalISO(start, today) / total));
}

/** The walked part of a trail up to `fraction` of its length, and the point there. */
export function walkTrail(trail: Pt[], fraction: number): { walked: Pt[]; at: Pt } {
  if (trail.length < 2) return { walked: trail.slice(), at: trail[0] ?? [0, 0] };
  const lengths = [0];
  for (let i = 1; i < trail.length; i++) lengths.push(lengths[i - 1] + Math.hypot(trail[i][0] - trail[i - 1][0], trail[i][1] - trail[i - 1][1]));
  const goal = lengths[lengths.length - 1] * Math.max(0, Math.min(1, fraction));
  const walked: Pt[] = [trail[0]];
  for (let i = 1; i < trail.length; i++) {
    if (lengths[i] >= goal) {
      const k = (goal - lengths[i - 1]) / Math.max(1e-6, lengths[i] - lengths[i - 1]);
      const at: Pt = [trail[i - 1][0] + (trail[i][0] - trail[i - 1][0]) * k, trail[i - 1][1] + (trail[i][1] - trail[i - 1][1]) * k];
      walked.push(at);
      return { walked, at };
    }
    walked.push(trail[i]);
  }
  return { walked, at: trail[trail.length - 1] };
}
