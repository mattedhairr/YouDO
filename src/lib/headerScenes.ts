/**
 * The header's Indian landscapes, one for each accent, so the sky and the
 * app's colour always belong together: the harvest fields of the plains (sand),
 * the Himalaya (slate) and the Western Ghats (sage). Each has its own five skies
 * (night, dawn, day, golden evening, dusk) and its own vector land; the sun,
 * its glare, the stars, the weather and the time-lapse are the sky header's own
 * and work the same over every scene.
 * Pure geometry and colours; drawn by SkyHeader.tsx (scene coordinates).
 */
import { skyRandom } from './focusSky';

export type SceneId = 'plains' | 'himalaya' | 'ghats';
export type Pt = [number, number];
export type SkyTime = 'night' | 'morning' | 'day' | 'evening' | 'dusk';

export interface ScenePalette {
  /** Four colours down the sky, top to horizon. */
  sky: string[];
  /** Four layers of land, far to near: [top, bottom] of each. */
  layers: [string, string][];
  /** The thin light along each ridge line. */
  rim: string;
  /** The haze at the foot of each layer. */
  mist: string;
  /** Snow (Himalaya). */
  snow?: string;
}

/**
 * What a scene adds on its layers, drawn over that layer's fill:
 * - face-l / face-r: a face turned left or right, shaded when the sun is on
 *   the other side and gently lit when it is on its side (x: where it faces from);
 * - snow, haze (a band of mist at `y`), foam and shine (light lines),
 *   edge (a soft dark outline), dark (a silhouette: trees, birds), land (in its
 *   layer's own colour) and wheat (golden, catching the light).
 */
export interface SceneMark {
  layer: number;
  paint: 'face-l' | 'face-r' | 'snow' | 'haze' | 'foam' | 'shine' | 'edge' | 'dark' | 'land' | 'wheat';
  d: string;
  x?: number;
  /** Drawn as a line of this width instead of filled. */
  stroke?: number;
  opacity?: number;
  /** Shown only around sunset and dusk (birds heading home). */
  dusk?: boolean;
  /** Kept inside its layer's land. */
  clip?: boolean;
  /** haze: where its band sits and how tall it is. */
  y?: number;
  h?: number;
}

export interface SceneShape {
  /** Four layers of land, far to near (the sun hides behind them). */
  ranges: Pt[][];
  marks: SceneMark[];
  /** The sun's valley (fraction of the width), its lowest line and how far it climbs. */
  sun: { valley: number; base: number; span: number };
}

export interface SceneInfo {
  id: SceneId;
  name: string;
  place: string;
  palettes: Record<SkyTime, ScenePalette>;
}

// ── Colours: each scene's five skies ────────────────────────────────────────

const NIGHT_SKY = ['#010209', '#050a1e', '#0c1736', '#16244a'];

export const SCENES: Record<SceneId, SceneInfo> = {
  plains: {
    id: 'plains',
    name: 'Harvest fields',
    place: 'Wheat on the plains of Punjab',
    palettes: {
      night: { sky: ['#020209', '#090a20', '#161937', '#262746'], layers: [['#24233a', '#1d1c31'], ['#1d1b2a', '#171521'], ['#15131d', '#0f0d15'], ['#09080c', '#040306']], rim: 'rgba(214,196,255,.28)', mist: 'rgba(150,130,190,.08)' },
      morning: { sky: ['#1f2350', '#6a5d8c', '#e19883', '#fbd6a6'], layers: [['#8f8299', '#7d718a'], ['#caa271', '#b88e5f'], ['#ab7e4b', '#93683b'], ['#5c3f24', '#3c2816']], rim: 'rgba(255,230,192,.6)', mist: 'rgba(255,224,200,.24)' },
      day: { sky: ['#3a74aa', '#6ba2cd', '#b5d0de', '#efe4c8'], layers: [['#9aa79a', '#8a988b'], ['#e4c47f', '#d7b16a'], ['#d6aa5d', '#c3944b'], ['#8e6b2d', '#6b4f1f']], rim: 'rgba(255,249,232,.6)', mist: 'rgba(250,238,214,.22)' },
      evening: { sky: ['#1a1231', '#55305b', '#c9666a', '#f8b25f'], layers: [['#7e5468', '#6b475a'], ['#dc9e61', '#c88750'], ['#bb7741', '#9f6034'], ['#3b2111', '#25140a']], rim: 'rgba(255,206,140,.74)', mist: 'rgba(255,184,140,.18)' },
      dusk: { sky: ['#07061a', '#1d1535', '#46264a', '#6b3546'], layers: [['#3a2943', '#302239'], ['#4f3341', '#412a37'], ['#34222d', '#291b23'], ['#0d080b', '#060405']], rim: 'rgba(232,172,190,.42)', mist: 'rgba(206,150,180,.12)' },
    },
  },
  himalaya: {
    id: 'himalaya',
    name: 'Himalaya',
    place: 'Snow peaks of Ladakh',
    palettes: {
      night: { sky: NIGHT_SKY, layers: [['#1e2b4b', '#16203c'], ['#121a33', '#0d1428'], ['#0a1020', '#070b17'], ['#04060d', '#020305']], rim: 'rgba(170,195,255,.38)', mist: 'rgba(120,140,200,.08)', snow: '#8a9fc6' },
      morning: { sky: ['#1a2550', '#5a5f92', '#d4949a', '#f5d2b0'], layers: [['#9b93b5', '#7d769a'], ['#5e5b81', '#464365'], ['#2f3150', '#21233b'], ['#14151f', '#0a0b12']], rim: 'rgba(255,226,200,.58)', mist: 'rgba(255,236,226,.2)', snow: '#ffd8cc' },
      day: { sky: ['#0f4c8a', '#2f7fc6', '#7fb8e4', '#d2e8f6'], layers: [['#a9c0db', '#8fa9c8'], ['#6c8bb0', '#55739a'], ['#2e4f6e', '#223d57'], ['#12273a', '#0a1825']], rim: 'rgba(255,255,255,.55)', mist: 'rgba(225,238,248,.12)', snow: '#ffffff' },
      evening: { sky: ['#151232', '#432b5e', '#b0587a', '#f2a070'], layers: [['#7b4b73', '#653d63'], ['#4c2b4c', '#3b213d'], ['#2a1830', '#1d1124'], ['#110a16', '#070509']], rim: 'rgba(255,190,160,.62)', mist: 'rgba(255,170,160,.14)', snow: '#ffb6a6' },
      dusk: { sky: ['#06061a', '#1a1534', '#3b2346', '#5a2f44'], layers: [['#33264a', '#2a1f3f'], ['#221a36', '#1a142b'], ['#14101f', '#0d0a15'], ['#08060c', '#030205']], rim: 'rgba(220,160,190,.4)', mist: 'rgba(200,150,190,.1)', snow: '#a993c4' },
    },
  },
  ghats: {
    id: 'ghats',
    name: 'Western Ghats',
    place: 'Misty hills of the monsoon',
    palettes: {
      night: { sky: ['#010409', '#051017', '#0b1d28', '#152d38'], layers: [['#1c2e34', '#16262b'], ['#122125', '#0d1a1d'], ['#0a1315', '#070e10'], ['#040808', '#020404']], rim: 'rgba(170,222,210,.3)', mist: 'rgba(140,180,180,.12)' },
      morning: { sky: ['#1c2a4a', '#5a6a8a', '#d8a090', '#f2dcb8'], layers: [['#8e959a', '#7b8488'], ['#6f847b', '#5a716a'], ['#3e5b4b', '#2f4b3b'], ['#1a2e22', '#0e1c14']], rim: 'rgba(255,236,210,.5)', mist: 'rgba(250,240,230,.34)' },
      day: { sky: ['#2c6788', '#5b94b2', '#a1c4cd', '#dde9e2'], layers: [['#84a493', '#6f8f7f'], ['#709b81', '#5a876c'], ['#3d6e4e', '#2d5b3d'], ['#1d4129', '#112c1a']], rim: 'rgba(240,255,245,.48)', mist: 'rgba(236,246,240,.32)' },
      evening: { sky: ['#17152e', '#463559', '#a8687c', '#eaa484'], layers: [['#7a5d6f', '#674e60'], ['#5b4b5d', '#493d4d'], ['#33303a', '#26232c'], ['#14141a', '#0a0a0e']], rim: 'rgba(255,200,170,.58)', mist: 'rgba(240,190,190,.26)' },
      dusk: { sky: ['#06081a', '#181a34', '#352a48', '#4f3748'], layers: [['#302a42', '#28233a'], ['#1f1d2e', '#181725'], ['#121219', '#0c0c12'], ['#060609', '#030304']], rim: 'rgba(210,170,200,.38)', mist: 'rgba(190,160,190,.14)' },
    },
  },
};

/** Each preset accent's landscape; a colour from the user's photo shows the harvest fields. */
export const SCENE_OF_ACCENT: Record<string, SceneId> = { sand: 'plains', slate: 'himalaya', sage: 'ghats' };

export function sceneForAccent(accent: string | undefined): SceneId {
  return (accent && SCENE_OF_ACCENT[accent]) || 'plains';
}

// ── Geometry ────────────────────────────────────────────────────────────────

const N = 160;
const f1 = (v: number) => v.toFixed(1);
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smoothstep = (t: number) => {
  const c = clamp(t);
  return c * c * (3 - 2 * c);
};

function sample(width: number, f: (x: number) => number): Pt[] {
  return Array.from({ length: N + 1 }, (_, i) => {
    const x = (i * width) / N;
    return [x, f(x)];
  });
}

const line = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(' L');
const shape = (pts: Pt[]) => line(pts) + ' Z';

/** Seeded smooth noise across the width: a few sine waves with random phases. */
function waves(seed: number, freqs: number[], weights: number[]): (u: number) => number {
  const next = skyRandom(seed);
  const phases = freqs.map(() => next() * Math.PI * 2);
  return (u) => freqs.reduce((sum, f, i) => sum + weights[i] * Math.sin(u * f * Math.PI + phases[i]), 0);
}

/** Midpoint-displacement roughness in −0.5 … 0.5 (seeded): jagged rock. */
function roughness(seed: number, rough: number): (u: number) => number {
  const next = skyRandom(seed);
  const n = 128;
  const y = new Array<number>(n + 1).fill(0);
  y[0] = next() - 0.5;
  y[n] = next() - 0.5;
  for (let step = n; step > 1; step /= 2) {
    const k = Math.pow(rough, Math.log2(n / step) + 1);
    for (let i = step / 2; i < n; i += step) y[i] = (y[i - step / 2] + y[i + step / 2]) / 2 + (next() - 0.5) * 2 * k;
  }
  return (u) => {
    const p = clamp(u) * n;
    const i = Math.min(n - 1, Math.floor(p));
    return y[i] + (y[i + 1] - y[i]) * (p - i);
  };
}

/** Lower toward the sun's valley, higher toward both sides, as the sky's ranges are. */
const valleyLift = (x: number, valleyX: number, reach = 180) => 0.35 + 0.65 * Math.min(1, Math.pow(Math.abs(x - valleyX) / reach, 1.2));

/** Peaks (local tops) and the valleys either side of each, on a sampled line. */
function peaksOf(pts: Pt[], minDrop: number): { peak: number; left: number; right: number }[] {
  const tops: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) if (pts[i][1] < pts[i - 1][1] && pts[i][1] <= pts[i + 1][1]) tops.push(i);
  const lowBetween = (a: number, b: number) => {
    let best = a;
    for (let i = a; i <= b; i++) if (pts[i][1] > pts[best][1]) best = i;
    return best;
  };
  const out: { peak: number; left: number; right: number }[] = [];
  tops.forEach((p, k) => {
    const left = lowBetween(k ? tops[k - 1] : 0, p);
    const right = lowBetween(p, k < tops.length - 1 ? tops[k + 1] : pts.length - 1);
    const drop = Math.min(pts[left][1], pts[right][1]) - pts[p][1];
    if (drop >= minDrop) out.push({ peak: p, left, right });
  });
  return out;
}

/** The shaded faces of a mountain line: a wedge hanging under each slope, like a low-poly illustration. */
function faces(pts: Pt[], layer: number, minDrop: number, depth = 0.9): SceneMark[] {
  const marks: SceneMark[] = [];
  for (const { peak, left, right } of peaksOf(pts, minDrop)) {
    const [px, py] = pts[peak];
    const [rx, ry] = pts[right];
    const [lx, ly] = pts[left];
    const rightFoot: Pt = [px + (rx - px) * 0.38, ry + (ry - py) * depth];
    const leftFoot: Pt = [px - (px - lx) * 0.38, ly + (ly - py) * depth];
    marks.push({ layer, paint: 'face-r', x: px, d: shape([...pts.slice(peak, right + 1), rightFoot]) });
    marks.push({ layer, paint: 'face-l', x: px, d: shape([...pts.slice(left, peak + 1), leftFoot]) });
  }
  return marks;
}

/** Snow above `line` on a mountain line, its lower edge running down the gullies in drips. */
function snowline(pts: Pt[], layer: number, line: number, seed = 47): SceneMark[] {
  const gully = roughness(seed, 0.8);
  const width = pts[pts.length - 1][0] || 1;
  const marks: SceneMark[] = [];
  let run: Pt[] = [];
  const flush = () => {
    if (run.length > 6) {
      const under = run.map(([x, y], k) => {
        const end = Math.min(1, k / 3, (run.length - 1 - k) / 3);
        // Snow reaches further down the gullies, irregularly.
        const drip = 3 + 16 * Math.max(0, gully(x / width) + 0.05);
        return [x, Math.min(line + 6, y + drip * end + 0.8)] as Pt;
      }).reverse();
      marks.push({ layer, paint: 'snow', d: shape([...run, ...under]) });
    }
    run = [];
  };
  for (const p of pts) {
    if (p[1] < line) run.push(p);
    else flush();
  }
  flush();
  return marks;
}

/** A tree silhouette: a thin trunk and a flat, spreading crown (khejri, babul). */
function umbrellaTree(x: number, ground: number, h: number, w: number): string {
  const top = ground - h;
  return `M${f1(x - 0.6)} ${f1(ground)} L${f1(x - 0.4)} ${f1(top + h * 0.28)} L${f1(x - w * 0.18)} ${f1(top + h * 0.2)} L${f1(x - 0.1)} ${f1(top + h * 0.25)} L${f1(x + 0.2)} ${f1(top + h * 0.18)} L${f1(x + w * 0.16)} ${f1(top + h * 0.12)} L${f1(x + 0.5)} ${f1(top + h * 0.24)} L${f1(x + 0.7)} ${f1(ground)} Z `
    + `M${f1(x - w / 2)} ${f1(top + h * 0.2)} C${f1(x - w * 0.42)} ${f1(top - h * 0.08)} ${f1(x + w * 0.38)} ${f1(top - h * 0.14)} ${f1(x + w / 2)} ${f1(top + h * 0.14)} C${f1(x + w * 0.2)} ${f1(top + h * 0.26)} ${f1(x - w * 0.2)} ${f1(top + h * 0.3)} ${f1(x - w / 2)} ${f1(top + h * 0.2)} Z`;
}

/** A conifer (deodar): a narrow spire of tiers. */
function conifer(x: number, ground: number, h: number): string {
  const w = h * 0.36;
  return `M${f1(x)} ${f1(ground - h)} L${f1(x + w * 0.35)} ${f1(ground - h * 0.6)} L${f1(x + w * 0.2)} ${f1(ground - h * 0.6)} L${f1(x + w * 0.5)} ${f1(ground - h * 0.25)} L${f1(x + w * 0.3)} ${f1(ground - h * 0.25)} L${f1(x + w * 0.55)} ${f1(ground)} L${f1(x - w * 0.55)} ${f1(ground)} L${f1(x - w * 0.3)} ${f1(ground - h * 0.25)} L${f1(x - w * 0.5)} ${f1(ground - h * 0.25)} L${f1(x - w * 0.2)} ${f1(ground - h * 0.6)} L${f1(x - w * 0.35)} ${f1(ground - h * 0.6)} Z`;
}

/**
 * A scene's land for a header `width` wide (scene coordinates); `lift`
 * raises it on the tabs (shorter headers) as the sky's ranges are raised.
 */
export function sceneShape(id: SceneId, width: number, lift: number): SceneShape {
  const b = [132, 148, 166, 182].map((v) => v - lift);
  const valley = width * 0.54;
  const sun = { valley: 0.54, base: 134, span: 70 };
  const marks: SceneMark[] = [];

  if (id === 'himalaya') {
    const g = (u: number, c: number, w: number) => Math.exp(-(((u - c) / w) ** 2));
    // Two great massifs either side of the sun's valley, lower toward the edges (and the words).
    const lifts = [
      (u: number) => 0.55 + 0.45 * Math.max(g(u, 0.24, 0.17), g(u, 0.8, 0.15)),
      (u: number) => 0.34 + 0.66 * Math.max(g(u, 0.38, 0.09), g(u, 0.67, 0.1), 0.55 * g(u, 0.04, 0.1), 0.5 * g(u, 0.98, 0.08)),
      (u: number) => valleyLift(u * width, valley),
      (u: number) => valleyLift(u * width, valley),
    ];
    const ranges = [
      { seed: 5, base: b[0] + 4, amp: 44, rough: 0.66 },
      { seed: 17, base: b[1], amp: 34, rough: 0.55 },
      { seed: 26, base: b[2], amp: 34, rough: 0.5 },
      { seed: 33, base: b[3], amp: 16, rough: 0.45 },
    ].map(({ seed, base, amp, rough }, i) => {
      const r = roughness(seed, rough);
      // The far range carries a few sharp summits.
      const summits = i === 0 ? [[0.15, 6], [0.33, 7], [0.66, 5], [0.77, 7], [0.93, 5]] : [];
      return sample(width, (x) => {
        const u = x / width;
        const spikes = summits.reduce((sum, [c, h]) => sum + h * Math.exp(-Math.abs(u - c) / 0.022), 0);
        return base - amp * lifts[i](u) * (0.72 + 0.56 * r(u)) - spikes;
      });
    });
    marks.push(...faces(ranges[0], 0, 4), ...snowline(ranges[0], 0, b[0] + 4 - 44 * 0.4));
    marks.push(...faces(ranges[1], 1, 5));
    // Deodars along the near ridges, in clumps.
    const next = skyRandom(77);
    const clump = waves(78, [5.5, 11], [0.6, 0.4]);
    const trees: string[] = [];
    for (let x = 3; x < width; x += 3.2 + next() * 3.5) {
      if (Math.abs(x - valley) < 26 || clump(x / width) < 0.05) continue;
      const ground = ranges[3][Math.round((x / width) * N)][1];
      trees.push(conifer(x, ground + 2.5, 6 + next() * 9 * (0.6 + clump(x / width))));
    }
    marks.push({ layer: 3, paint: 'dark', d: trees.join(' '), opacity: 0.92 });
    return { ranges, marks, sun };
  }

  if (id === 'plains') {
    // The horizon is low and flat: the sky gets the room, and the sun sets on the land.
    const horizon = b[0] + 14;
    const vp: Pt = [valley, horizon];
    // Far: a line of village trees in clumps, open where the sun goes down.
    const next = skyRandom(101);
    const crowns: { x: number; rx: number; ry: number; lift: number }[] = [];
    const grove = waves(102, [4.2, 9.5], [0.6, 0.4]);
    for (let x = 2; x < width; x += 2.5 + next() * 4.5) {
      if (Math.abs(x - valley) < width * 0.06 || grove(x / width) < -0.15) continue;
      const poplar = next() < 0.22;
      const rx = poplar ? 1.5 + next() * 0.8 : 2.8 + next() * 3.4;
      const ry = poplar ? 5 + next() * 3.5 : rx * (0.7 + next() * 0.25);
      crowns.push({ x, rx, ry, lift: poplar ? 1 : 0.8 + next() * 1.6 });
    }
    // The trees are drawn as shapes on the far land (an outline would be too coarse for them).
    const treeline = sample(width, () => horizon);
    const trees = crowns.map((c) => {
      const cy = horizon - c.lift - c.ry;
      const trunk = `M${f1(c.x - 0.5)} ${f1(horizon)} L${f1(c.x - 0.4)} ${f1(cy)} L${f1(c.x + 0.4)} ${f1(cy)} L${f1(c.x + 0.5)} ${f1(horizon)} Z`;
      const crown = `M${f1(c.x - c.rx)} ${f1(cy)} A${f1(c.rx)} ${f1(c.ry)} 0 1 0 ${f1(c.x + c.rx)} ${f1(cy)} A${f1(c.rx)} ${f1(c.ry)} 0 1 0 ${f1(c.x - c.rx)} ${f1(cy)} Z`;
      return `${trunk} ${crown}`;
    });
    marks.push({ layer: 0, paint: 'land', d: trees.join(' ') });
    // The fields: flat to the horizon, a nearer field a touch lighter, then wheat in front.
    const swell = waves(103, [1.4, 3.1], [0.6, 0.4]);
    const fields = sample(width, () => horizon + 1.5);
    const near = sample(width, (x) => b[2] + 8 + 2 * swell(x / width));
    const front = sample(width, (x) => b[3] + 14 + 2.5 * swell(x / width + 0.4));
    const ranges = [treeline, fields, near, front];
    // Rows of wheat running to the vanishing point, alternately lit and shaded.
    const rows: string[] = [];
    const furrows: string[] = [];
    for (let k = -26; k <= 26; k++) {
      const bx = valley + k * 26;
      const d = `M${f1(vp[0])} ${f1(vp[1])} L${f1(bx)} ${f1(b[3] + 60)}`;
      (k % 2 ? rows : furrows).push(d);
    }
    marks.push({ layer: 1, paint: 'shine', stroke: 0.9, opacity: 0.22, clip: true, d: rows.join(' ') });
    marks.push({ layer: 1, paint: 'edge', stroke: 0.9, opacity: 0.16, clip: true, d: furrows.join(' ') });
    // A dusty track from the front edge to the horizon.
    const track = `M${f1(vp[0] - 0.6)} ${f1(vp[1] + 0.5)} C${f1(valley - 6)} ${f1(horizon + 14)} ${f1(valley + 30)} ${f1(b[3])} ${f1(valley + 4)} ${f1(b[3] + 60)} L${f1(valley + 52)} ${f1(b[3] + 60)} C${f1(valley + 52)} ${f1(b[3])} ${f1(valley + 2)} ${f1(horizon + 14)} ${f1(vp[0] + 0.6)} ${f1(vp[1] + 0.5)} Z`;
    marks.push({ layer: 1, paint: 'foam', opacity: 0.22, clip: true, d: track });
    // The nearer field carries the same rows and track, a little stronger.
    marks.push({ layer: 2, paint: 'shine', stroke: 1.1, opacity: 0.26, clip: true, d: rows.join(' ') });
    marks.push({ layer: 2, paint: 'edge', stroke: 1.1, opacity: 0.2, clip: true, d: furrows.join(' ') });
    marks.push({ layer: 2, paint: 'foam', opacity: 0.26, clip: true, d: track });
    // Haystacks out in the fields, and a lone kikar.
    const stacks = [[0.17, 11], [0.235, 8], [0.71, 9]].map(([u, h]) => {
      const x = width * u;
      const y = horizon + 3 + h * 0.55;
      const w = h * 0.95;
      return { x, y, d: `M${f1(x - w)} ${f1(y)} C${f1(x - w)} ${f1(y - h * 0.8)} ${f1(x - w * 0.3)} ${f1(y - h * 1.05)} ${f1(x)} ${f1(y - h * 1.12)} C${f1(x + w * 0.3)} ${f1(y - h * 1.05)} ${f1(x + w)} ${f1(y - h * 0.8)} ${f1(x + w)} ${f1(y)} Z`, h };
    });
    marks.push(...stacks.map((st) => ({ layer: 2, paint: 'land' as const, d: st.d })));
    marks.push(...stacks.map((st) => ({ layer: 2, paint: 'shine' as const, stroke: 0.6, d: st.d, opacity: 0.5 })));
    marks.push(...stacks.map((st) => ({ layer: 2, paint: 'face-r' as const, opacity: 1.4, x: st.x, d: `M${f1(st.x)} ${f1(st.y - st.h * 1.12)} C${f1(st.x + st.h * 0.3)} ${f1(st.y - st.h * 1.05)} ${f1(st.x + st.h * 0.95)} ${f1(st.y - st.h * 0.8)} ${f1(st.x + st.h * 0.95)} ${f1(st.y)} L${f1(st.x)} ${f1(st.y)} Z` })));
    marks.push({ layer: 1, paint: 'dark', opacity: 0.88, d: umbrellaTree(width * 0.86, horizon + 7, 27, 36) });
    // Birds heading home at dusk.
    const flock = [[0.6, 62], [0.625, 58], [0.648, 64], [0.672, 57], [0.69, 66], [0.714, 61], [0.735, 68]].map(([u, y], k) => {
      const x = width * u;
      const s = 2.6 + (k % 3) * 0.5;
      return `M${f1(x - s)} ${f1(y - s * 0.45)} Q${f1(x - s * 0.45)} ${f1(y - s * 0.6)} ${f1(x)} ${f1(y)} Q${f1(x + s * 0.45)} ${f1(y - s * 0.6)} ${f1(x + s)} ${f1(y - s * 0.45)}`;
    }).join(' ');
    marks.push({ layer: 0, paint: 'dark', stroke: 0.9, dusk: true, opacity: 0.8, d: flock });
    // Wheat in front, in two rows: each stalk a thin stem bending under its head; the
    // head is grains set alternately along the top with fine bristles (awns) and a few
    // long leaf blades low down. Thick at the sides, open in the middle for the track.
    const field = (seed: number, step: number, tall: number, rise: number) => {
      const rnd = skyRandom(seed);
      const stems: string[] = [];
      const grains: string[] = [];
      const awns: string[] = [];
      for (let x = rnd() * step; x < width; x += step * (0.6 + rnd() * 0.8)) {
        const u = x / width;
        const side = Math.min(1, Math.abs(u - 0.6) / 0.24);
        if (rnd() > 0.2 + 0.8 * side) continue;
        const ground = front[Math.round(Math.min(1, u) * N)][1] + rise;
        // A tall clump frames the bottom-right corner, clear of the quote.
        const corner = smoothstep((u - 0.74) / 0.2);
        const h = tall * (0.7 + rnd() * 0.45) * (0.55 + 0.45 * side) * (1 + 1.9 * corner);
        const lean = (rnd() - 0.4) * h * 0.35;
        // The stem, as a curve; its head droops a little past the top.
        const p = (t: number): Pt => [x + lean * t * t, ground - h * t + h * 0.08 * t * t * t];
        const top = p(1);
        stems.push(`M${f1(x)} ${f1(ground)} Q${f1(x + lean * 0.3)} ${f1(ground - h * 0.55)} ${f1(top[0])} ${f1(top[1])}`);
        if (rnd() < 0.35) {
          const dir = rnd() < 0.5 ? -1 : 1;
          const by = ground - h * (0.2 + rnd() * 0.2);
          stems.push(`M${f1(x + lean * 0.05)} ${f1(by)} Q${f1(x + dir * h * 0.22)} ${f1(by - h * 0.2)} ${f1(x + dir * h * 0.34)} ${f1(by - h * 0.05)}`);
        }
        // The head: along the last part of the stem and a little beyond.
        const dx = top[0] - p(0.92)[0];
        const dy = top[1] - p(0.92)[1];
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const head = 3.2 + h * 0.14;
        const count = 6;
        for (let k = 0; k < count; k++) {
          const t = k / (count - 1);
          const cx = top[0] - ux * head * (1 - t) + ux * 0.6;
          const cy = top[1] - uy * head * (1 - t) + uy * 0.6;
          const side2 = k % 2 ? 1 : -1;
          const nx = -uy * side2;
          const ny = ux * side2;
          const g = (1.05 - 0.35 * t) * (0.75 + h / 28);
          // A grain: a small leaf shape set at an angle off the stem.
          const gx = cx + nx * g * 0.6;
          const gy = cy + ny * g * 0.6;
          const tipx = gx + (ux * 1.4 + nx * 0.6) * g * 1.4;
          const tipy = gy + (uy * 1.4 + ny * 0.6) * g * 1.4;
          grains.push(`M${f1(gx)} ${f1(gy)} Q${f1(gx + nx * g)} ${f1(gy + ny * g)} ${f1(tipx)} ${f1(tipy)} Q${f1(gx - nx * g * 0.2)} ${f1(gy - ny * g * 0.2)} ${f1(gx)} ${f1(gy)} Z`);
          // Its awn: a fine bristle reaching up and out.
          const al = 2.6 + h * 0.18;
          awns.push(`M${f1(tipx)} ${f1(tipy)} L${f1(tipx + (ux * 0.9 + nx * 0.45) * al)} ${f1(tipy + (uy * 0.9 + ny * 0.45) * al)}`);
        }
      }
      return { stems: stems.join(' '), grains: grains.join(' '), awns: awns.join(' ') };
    };
    const back = field(109, 3.2, 13, -3);
    const fore = field(107, 4.2, 20, 3);
    marks.push({ layer: 3, paint: 'wheat', stroke: 0.55, opacity: 0.45, d: back.stems });
    marks.push({ layer: 3, paint: 'wheat', opacity: 0.5, d: back.grains });
    marks.push({ layer: 3, paint: 'wheat', stroke: 0.3, opacity: 0.35, d: back.awns });
    // A soft dark edge under the near row, so its gold reads against the gold field.
    marks.push({ layer: 3, paint: 'dark', stroke: 1.9, opacity: 0.45, d: fore.stems });
    marks.push({ layer: 3, paint: 'dark', stroke: 1.2, opacity: 0.5, d: fore.grains });
    marks.push({ layer: 3, paint: 'dark', stroke: 0.9, opacity: 0.35, d: fore.awns });
    marks.push({ layer: 3, paint: 'wheat', stroke: 0.75, opacity: 0.9, d: fore.stems });
    marks.push({ layer: 3, paint: 'wheat', d: fore.grains });
    marks.push({ layer: 3, paint: 'wheat', stroke: 0.35, opacity: 0.7, d: fore.awns });
    return { ranges, marks, sun: { valley: 0.54, base: horizon + 4, span: 70 } };
  }

  // The Western Ghats.
  // Far: the Sahyadri's flat-topped basalt tablelands with sheer cliffs, and a pinnacle.
  const rock = roughness(9, 0.45);
  const table = (u: number, a: number, c: number, h: number, edge = 0.022) => h * smoothstep((u - a) / edge) * smoothstep((c - u) / edge);
  const far = sample(width, (x) => {
    const u = x / width;
    const land = Math.max(table(u, 0.04, 0.27, 30), table(u, 0.76, 1.08, 34), 22 * Math.exp(-(((u - 0.34) / 0.018) ** 2)), 12 * smoothstep(1 - Math.abs(u - 0.5) / 0.3));
    return b[0] + 6 - land - 2.2 * rock(u);
  });
  // Nearer: rounded hills under forest, the nearest with tea rows.
  const hills = [
    { seed: 12, base: b[1], amp: 46 },
    { seed: 19, base: b[2], amp: 34 },
    { seed: 27, base: b[3], amp: 22 },
  ].map(({ seed, base, amp }, i) => {
    const w = waves(seed, [1.3, 2.4, 4.1], [0.55, 0.3, 0.15]);
    const leaves = waves(seed + 1, [46, 73], [0.5, 0.5]);
    return sample(width, (x) => {
      const u = x / width;
      return base - amp * valleyLift(x, valley, 200) * (0.75 + 0.45 * w(u)) - (2.4 - i * 0.5) * Math.abs(leaves(u));
    });
  });
  const ranges = [far, ...hills];
  // The cliffs' faces, and a waterfall leaping off the big tableland's edge.
  marks.push(...faces(far, 0, 10, 0.4).map((m) => ({ ...m, opacity: 0.8 })));
  let lip = Math.round(0.76 * N);
  while (lip < N && far[lip + 1][1] < far[lip][1] - 0.2) lip++;
  const [fx, fy] = far[lip];
  const fall: Pt[] = Array.from({ length: 14 }, (_, k) => [fx - 1.5 + Math.sin(k * 1.1) * 0.5 - k * 0.12, fy + 1 + k * 3]);
  marks.push({ layer: 0, paint: 'foam', stroke: 1.8, opacity: 0.85, clip: true, d: line(fall) });
  marks.push({ layer: 0, paint: 'foam', stroke: 0.6, opacity: 0.45, clip: true, d: line(fall.map(([x, y]) => [x + 1.8, y + 2] as Pt)) });
  // Monsoon mist between the hills.
  marks.push({ layer: 0, paint: 'haze', d: '', y: b[0] - 8, h: 30, opacity: 0.7 });
  marks.push({ layer: 1, paint: 'haze', d: '', y: b[1] - 16, h: 32, opacity: 0.9 });
  marks.push({ layer: 2, paint: 'haze', d: '', y: b[2] - 12, h: 26, opacity: 0.6 });
  // Tea rows on the nearest hill.
  for (const k of [5, 9, 13, 17, 21]) {
    marks.push({ layer: 3, paint: 'shine', stroke: 1.1, opacity: 0.2, clip: true, d: line(hills[2].map(([x, y]) => [x, y + k + Math.sin(x * 0.03 + k) * 2] as Pt)) });
  }
  return { ranges, marks, sun };
}
