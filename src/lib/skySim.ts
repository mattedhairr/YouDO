/**
 * The header's sky, worked out from light (v9.1; mocked and chosen by the
 * owner: docs/mocks/sky-full-day-2.png). Each pixel is the sunlight scattered
 * toward the eye by the air (molecules, ozone and a little haze) over a round
 * Earth, so the gradients, the glow round the sun, the gold low down and the
 * twilight after sunset come out by themselves. Each scene has its own air
 * (a light golden haze on the plains, thin clean air in the mountains, humid
 * air and clouds in the Ghats) for dawn, day and dusk, and a gentle lean
 * toward its accent colour. The science is a touch, not the goal: the air is
 * kept clear and the colours a little richer, so it is pleasing first.
 *
 * Sunlight's path to any point is read from a small table (heights × sun
 * angles), so a frame costs a few milliseconds. Pure; SkyHeader.tsx draws it.
 */
import { SCENES, type SceneId } from './headerScenes';
import { sunAltitude, sunSwing, type SunDay } from './sunPath';
import type { Weather } from './weather';

export type RGB = [number, number, number];
type Vec = [number, number, number];

const RE = 6360e3;
const RA = 6440e3;
const HR = 8000;
const BR: RGB = [5.8e-6, 13.5e-6, 33.1e-6]; // air molecules
const BO: RGB = [0.65e-6, 1.881e-6, 0.085e-6]; // ozone: keeps the twilight sky blue
const SUN = 20;
const DEG = Math.PI / 180;
/** The elevation at the top of the scene; the horizon line is 0°. */
const TOP_ELEVATION = 34 * DEG;
/** How much sky the header shows across. */
const FIELD = 78 * DEG;
const ozone = (h: number) => Math.max(0, 1 - Math.abs(h - 25000) / 15000);
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** A place's air: its haze (Mie scattering), how forward it scatters, its particle size, distance haze, clouds. */
export interface AirSpec {
  mie: number;
  mieH: number;
  g: number;
  albedo: number;
  /** How much far land fades into the air. */
  haze: number;
  /** Particle size: smoke scatters blue more (high), big wet droplets all colours alike (low). */
  angstrom: number;
  clouds?: { h: number; cover: number };
}

export interface SceneSky {
  /** Heights (m) of the viewer, the high ground and the low ground. */
  eye: number;
  peak: number;
  low: number;
  accent: string;
  /** How far the colours lean toward the accent, and the look's richness, brightness and warm haze. */
  lean: number;
  vib: number;
  gain: number;
  hazeLean: number;
  /** Around sunrise and sunset: how far the sky turns to the scene's own colour (whatever the sky's hue), and how much the glow's richness calms. The glow stays low by the horizon. */
  golden: { lean: number; calm: number; tint: string };
  air: { dawn: AirSpec; day: AirSpec; dusk: AirSpec };
}

export const SCENE_SKIES: Record<SceneId, SceneSky> = {
  plains: {
    eye: 200, peak: 150, low: 200, accent: '#C9A46E', lean: 0.14, vib: 1.5, gain: 1.2, hazeLean: 0.5, golden: { lean: 0.3, calm: 0.3, tint: '#D4AE78' },
    air: {
      dawn: { mie: 6e-5, mieH: 700, g: 0.76, albedo: 0.98, haze: 0.4, angstrom: 1.0 },
      day: { mie: 1.8e-5, mieH: 1200, g: 0.7, albedo: 0.98, haze: 0.18, angstrom: 1.2 },
      dusk: { mie: 4e-5, mieH: 1300, g: 0.74, albedo: 0.97, haze: 0.32, angstrom: 1.2 },
    },
  },
  himalaya: {
    eye: 2500, peak: 6200, low: 2200, accent: '#8DA6C9', lean: 0.12, vib: 1.2, gain: 1.0, hazeLean: 0.12, golden: { lean: 0.45, calm: 0.3, tint: '#8DA6C9' },
    air: {
      dawn: { mie: 2.2e-5, mieH: 1000, g: 0.76, albedo: 0.96, haze: 0.3, angstrom: 1.0 },
      day: { mie: 3.5e-5, mieH: 1200, g: 0.76, albedo: 0.96, haze: 0.3, angstrom: 1.0 },
      dusk: { mie: 4e-5, mieH: 1200, g: 0.76, albedo: 0.95, haze: 0.35, angstrom: 1.0 },
    },
  },
  ghats: {
    eye: 700, peak: 1300, low: 400, accent: '#8FB394', lean: 0.1, vib: 1.25, gain: 1.05, hazeLean: 0.15, golden: { lean: 0.44, calm: 0.32, tint: '#8CBBA4' },
    air: {
      dawn: { mie: 8e-5, mieH: 900, g: 0.82, albedo: 0.98, haze: 0.7, angstrom: 0.6, clouds: { h: 4200, cover: 0.48 } },
      day: { mie: 2.5e-5, mieH: 1200, g: 0.8, albedo: 0.98, haze: 0.35, angstrom: 0.9, clouds: { h: 2200, cover: 0.42 } },
      dusk: { mie: 9e-5, mieH: 1300, g: 0.82, albedo: 0.98, haze: 0.6, angstrom: 0.6, clouds: { h: 5200, cover: 0.52 } },
    },
  },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mixAir(a: AirSpec, b: AirSpec, t: number): AirSpec {
  const k = Math.round(t * 16) / 16; // a few steps, so the tables below are reused
  const clouds = a.clouds && b.clouds ? { h: lerp(a.clouds.h, b.clouds.h, k), cover: lerp(a.clouds.cover, b.clouds.cover, k) } : (k < 0.5 ? a.clouds : b.clouds);
  return {
    mie: lerp(a.mie, b.mie, k), mieH: lerp(a.mieH, b.mieH, k), g: lerp(a.g, b.g, k), albedo: lerp(a.albedo, b.albedo, k),
    haze: lerp(a.haze, b.haze, k), angstrom: lerp(a.angstrom, b.angstrom, k), clouds,
  };
}

/** The scene's air at `hour`: morning air into the day's by noon, the day's into evening air before sunset. */
export function airAt(id: SceneId, hour: number, day: SunDay): AirSpec {
  const { dawn, day: noon, dusk } = SCENE_SKIES[id].air;
  if (hour < day.noon) return mixAir(dawn, noon, smooth(clamp((hour - (day.sunrise + 1)) / Math.max(0.5, day.noon - 1 - (day.sunrise + 1)))));
  return mixAir(noon, dusk, smooth(clamp((hour - (day.sunset - 2.5)) / 2)));
}

// ── The air: a table of sunlight's path, then the sky along each view ──────

const LUT_H = 40;
const LUT_M = 80;
const TOP = RA - RE;

interface Air {
  spec: AirSpec;
  bm: RGB;
  ext: RGB;
  /** Optical depth to the sun (molecules, haze, ozone) from each height at each sun angle. */
  lut: Float32Array;
}

const horizonMu = (h: number) => -Math.sqrt(Math.max(0, 1 - (RE / (RE + h)) ** 2));

function hitSphere(o: Vec, d: Vec, r: number): number {
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t0 = -b - s;
  const t1 = -b + s;
  return t0 > 0 ? t0 : t1 > 0 ? t1 : -1;
}

const airs = new Map<string, Air>();

function airFor(spec: AirSpec): Air {
  const key = JSON.stringify(spec);
  const cached = airs.get(key);
  if (cached) return cached;
  const bm = [680, 550, 440].map((l) => spec.mie * Math.pow(l / 550, -spec.angstrom)) as RGB;
  const ext = bm.map((v) => v / spec.albedo) as RGB;
  const lut = new Float32Array(LUT_H * LUT_M * 3);
  for (let i = 0; i < LUT_H; i++) {
    const h = TOP * (i / (LUT_H - 1)) ** 2;
    const muH = horizonMu(h);
    for (let j = 0; j < LUT_M; j++) {
      const mu = muH + (1 - muH) * (j / (LUT_M - 1)) ** 2;
      const o: Vec = [0, RE + h, 0];
      const d: Vec = [Math.sqrt(Math.max(0, 1 - mu * mu)), mu, 0];
      const t = Math.max(0, hitSphere(o, d, RA));
      const steps = 36;
      const dt = t / steps;
      let r = 0;
      let m = 0;
      let z = 0;
      for (let s = 0; s < steps; s++) {
        const at = (s + 0.5) * dt;
        const x = o[0] + d[0] * at;
        const y = o[1] + d[1] * at;
        const hh = Math.max(0, Math.sqrt(x * x + y * y) - RE);
        r += Math.exp(-hh / HR) * dt;
        m += Math.exp(-hh / spec.mieH) * dt;
        z += ozone(hh) * dt;
      }
      const k = (i * LUT_M + j) * 3;
      lut[k] = r;
      lut[k + 1] = m;
      lut[k + 2] = z;
    }
  }
  const air = { spec, bm, ext, lut };
  if (airs.size > 24) airs.delete(airs.keys().next().value as string);
  airs.set(key, air);
  return air;
}

/** Optical depth from height h toward a sun at cosine mu (to the local vertical); false in the Earth's shadow. */
function towardSun(air: Air, h: number, mu: number, out: Vec): boolean {
  const muH = horizonMu(h);
  if (mu < muH) return false;
  const fi = Math.sqrt(clamp(h / TOP)) * (LUT_H - 1);
  const fj = Math.sqrt(clamp((mu - muH) / (1 - muH))) * (LUT_M - 1);
  const i0 = Math.min(LUT_H - 2, Math.floor(fi));
  const j0 = Math.min(LUT_M - 2, Math.floor(fj));
  const a = fi - i0;
  const b = fj - j0;
  const lut = air.lut;
  for (let c = 0; c < 3; c++) {
    const p00 = lut[(i0 * LUT_M + j0) * 3 + c];
    const p01 = lut[(i0 * LUT_M + j0 + 1) * 3 + c];
    const p10 = lut[((i0 + 1) * LUT_M + j0) * 3 + c];
    const p11 = lut[((i0 + 1) * LUT_M + j0 + 1) * 3 + c];
    out[c] = (p00 * (1 - b) + p01 * b) * (1 - a) + (p10 * (1 - b) + p11 * b) * a;
  }
  return true;
}

const VIEW_STEPS = 20;
const WEIGHTS = (() => {
  const w = Array.from({ length: VIEW_STEPS }, (_, i) => Math.pow(1.18, i));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);
})();

/** The light reaching an eye at `o` from direction `d`; `sd` the sun, `sp` where its glow is drawn. */
function skyRadiance(air: Air, o: Vec, d: Vec, sd: Vec, sp: Vec, out: RGB): RGB {
  let tMax = hitSphere(o, d, RA);
  const tg = hitSphere(o, d, RE);
  if (tg > 0) tMax = tg;
  const mu = d[0] * sp[0] + d[1] * sp[1] + d[2] * sp[2];
  const g = air.spec.g;
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const pM = ((3 / (8 * Math.PI)) * ((1 - g * g) * (1 + mu * mu))) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  const hm = air.spec.mieH;
  let vr = 0;
  let vm = 0;
  let vo = 0;
  let sr0 = 0;
  let sr1 = 0;
  let sr2 = 0;
  let sm0 = 0;
  let sm1 = 0;
  let sm2 = 0;
  const od: Vec = [0, 0, 0];
  let t = 0;
  for (let i = 0; i < VIEW_STEPS; i++) {
    const dt = tMax * WEIGHTS[i];
    const tm = t + dt / 2;
    t += dt;
    const px = o[0] + d[0] * tm;
    const py = o[1] + d[1] * tm;
    const pz = o[2] + d[2] * tm;
    const r = Math.sqrt(px * px + py * py + pz * pz);
    const h = Math.max(0, r - RE);
    const dr = Math.exp(-h / HR) * dt;
    const dm = Math.exp(-h / hm) * dt;
    const dz = ozone(h) * dt;
    vr += dr / 2;
    vm += dm / 2;
    vo += dz / 2;
    const muS = (px * sd[0] + py * sd[1] + pz * sd[2]) / r;
    if (towardSun(air, h, muS, od)) {
      const rr = vr + od[0];
      const mm = vm + od[1];
      const zz = vo + od[2];
      const t0 = Math.exp(-(BR[0] * rr + air.ext[0] * mm + BO[0] * zz));
      const t1 = Math.exp(-(BR[1] * rr + air.ext[1] * mm + BO[1] * zz));
      const t2 = Math.exp(-(BR[2] * rr + air.ext[2] * mm + BO[2] * zz));
      sr0 += t0 * dr; sr1 += t1 * dr; sr2 += t2 * dr;
      sm0 += t0 * dm; sm1 += t1 * dm; sm2 += t2 * dm;
    }
    vr += dr / 2;
    vm += dm / 2;
    vo += dz / 2;
  }
  out[0] = SUN * (sr0 * BR[0] * pR + sm0 * air.bm[0] * pM);
  out[1] = SUN * (sr1 * BR[1] * pR + sm1 * air.bm[1] * pM);
  out[2] = SUN * (sr2 * BR[2] * pR + sm2 * air.bm[2] * pM);
  return out;
}

/** Sunlight reaching a point (position vector), or nothing in the Earth's shadow. */
function sunlightAt(air: Air, p: Vec, sd: Vec): RGB {
  const r = Math.hypot(p[0], p[1], p[2]);
  const h = Math.max(0, r - RE);
  const od: Vec = [0, 0, 0];
  if (!towardSun(air, h, (p[0] * sd[0] + p[1] * sd[1] + p[2] * sd[2]) / r, od)) return [0, 0, 0];
  return [0, 1, 2].map((k) => SUN * Math.exp(-(BR[k] * od[0] + air.ext[k] * od[1] + BO[k] * od[2]))) as RGB;
}

// ── From light to colour ──────────────────────────────────────────────────

const srgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const hexRgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Brightness to screen colour: compressed, hue kept, the brightest parts going a little white as the eye sees them. */
export function tone(c: readonly number[], exposure: number): RGB {
  const Y = lum(c) * exposure;
  if (Y <= 0) return [0, 0, 0];
  const Ld = (Y * (1 + Y / 9)) / (1 + Y);
  const k = Ld / Y;
  let r = [c[0] * exposure * k, c[1] * exposure * k, c[2] * exposure * k];
  const white = clamp((Ld - 0.85) / 0.5) * 0.4;
  r = r.map((v) => v * (1 - white) + Ld * white);
  const mx = Math.max(r[0], r[1], r[2]);
  if (mx > 1) r = r.map((v) => v / mx);
  return [srgb(Math.max(0, r[0])), srgb(Math.max(0, r[1])), srgb(Math.max(0, r[2]))];
}

/**
 * The scene's look: a lean toward its accent only where the colour is near it
 * already (warm glow, haze, mist; never into a blue sky of the opposite hue),
 * then a little more colour.
 */
export function grade(c: RGB, accent: string, lean: number, vib: number): RGB {
  const a = hexRgb(accent);
  const la = lum(a);
  const lc = lum(c);
  const ca = [a[0] - la, a[1] - la, a[2] - la];
  const cc = [c[0] - lc, c[1] - lc, c[2] - lc];
  const na = Math.hypot(ca[0], ca[1], ca[2]);
  const nc = Math.hypot(cc[0], cc[1], cc[2]);
  const sim = nc < 0.02 ? 0.4 : (ca[0] * cc[0] + ca[1] * cc[1] + ca[2] * cc[2]) / (na * nc);
  const l = lean * Math.max(0, 0.2 + 0.8 * sim);
  const r = [0, 1, 2].map((k) => c[k] * (1 - l) + Math.min(1, a[k] * (lc / la)) * l);
  const l2 = lum(r);
  return r.map((v) => clamp(l2 + (v - l2) * vib)) as RGB;
}

/** `c` moved `amount` of the way to a colour at the same brightness, whatever its hue. */
function toward(c: RGB, color: string, amount: number): RGB {
  if (amount <= 0) return c;
  const a = hexRgb(color);
  const k = lum(c) / lum(a);
  return c.map((v, i) => clamp(lerp(v, a[i] * k, amount))) as RGB;
}

/** Cloudy and rainy days: greyer and dimmer, as the palette skies were (weather.ts). */
function weatherTint(c: RGB, weather: Weather, night: number, forLand: boolean): RGB {
  if (weather === 'clear') return c;
  const rainy = weather === 'rainy';
  const grey = hexRgb(forLand ? (night > 0.5 ? '#2a3140' : '#b9c0c8') : night > 0.5 ? '#1a1f2b' : '#7d8794');
  const amount = forLand ? (rainy ? 0.42 : 0.2) : rainy ? 0.62 : 0.22;
  const dim = forLand ? (rainy ? 0.14 : 0.04) : rainy ? 0.28 : 0.06;
  const black = hexRgb('#05070b');
  // In rain the sky (and the haze on far land) loses the sun's warmth; the land keeps its own colours.
  const l = lum(c);
  const base = rainy && !forLand ? c.map((v) => lerp(v, l, 0.85)) : c;
  return base.map((v, k) => lerp(lerp(v, grey[k], amount), black[k], dim)) as RGB;
}

// Value noise for the Ghats' clouds.
function hash(x: number, y: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number) {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < 5; i++) {
    s += a * vnoise(x, y);
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return s;
}

const dayKeys = new Map<string, number>();
/** The eye's daytime level in this air (an ordinary part of a mid-morning sky). */
function dayKey(air: Air, eye: number): number {
  const key = `${eye}|${JSON.stringify(air.spec)}`;
  const known = dayKeys.get(key);
  if (known !== undefined) return known;
  const o: Vec = [0, RE + eye, 0];
  const sd: Vec = [0, Math.sin(30 * DEG), Math.cos(30 * DEG)];
  const ys: number[] = [];
  const out: RGB = [0, 0, 0];
  for (let el = 1; el <= 33; el += 4) {
    for (let az = -40; az <= 40; az += 10) {
      const d: Vec = [Math.cos(el * DEG) * Math.sin(az * DEG), Math.sin(el * DEG), Math.cos(el * DEG) * Math.cos(az * DEG)];
      ys.push(lum(skyRadiance(air, o, d, sd, sd, out)));
    }
  }
  ys.sort((a, b) => a - b);
  const k = ys[Math.floor(ys.length * 0.35)];
  dayKeys.set(key, k);
  return k;
}

export interface SkyFrameInput {
  scene: SceneId;
  hour: number;
  day: SunDay;
  weather: Weather;
  /** Pixels to work out (the canvas is scaled up smoothly). */
  cols: number;
  rows: number;
  /** The scene's size, and where its sky meets the far land (scene coordinates). */
  width: number;
  height: number;
  horizonY: number;
  /** Where the sun is drawn; null when it is down (its glow then sits where it rose or set). */
  sun: { x: number; y: number } | null;
  /** The valley's middle (fraction of the width): a sun below the horizon glows to its left at dawn, right at dusk. */
  valley: number;
}

export interface SkyFrame {
  cols: number;
  rows: number;
  /** RGBA, rows × cols. */
  pixels: Uint8ClampedArray<ArrayBuffer>;
  /** The light on the land, 0–1 per channel: on high ground (peaks, far ridges) and low ground. */
  landHigh: RGB;
  landLow: RGB;
  /** The colour far land fades into, and how much at the far edge (0–1). */
  haze: RGB;
  hazeAmount: number;
  /** The sun's disc: its colour and how much of it shows through the air. */
  sunColor: RGB;
  sunAlpha: number;
  /** The sky's colour at the top, for the header's own background. */
  top: RGB;
  /** 0 by day, 1 at full night: the sky's own night (stars come from headerSky.ts). */
  night: number;
}

/** The scene's sky at `hour`: its pixels, the light on its land and the sun's disc. */
export function skyFrame(input: SkyFrameInput): SkyFrame {
  const { scene, hour, day, weather, cols, rows, width, height, horizonY } = input;
  const look = SCENE_SKIES[scene];
  const spec = airAt(scene, hour, day);
  const air = airFor(spec);
  const e = sunAltitude(day, hour);
  const elevAt = (y: number) => (TOP_ELEVATION * (horizonY - y)) / horizonY;
  const sd: Vec = [0, Math.sin(e * DEG), Math.cos(e * DEG)];
  // The glow sits round the sun as drawn; below the horizon, where it rose or will set.
  const morning = hour < day.noon;
  const sunX = input.sun ? input.sun.x : width * (input.valley + (morning ? -1 : 1) * sunSwing(day));
  const shown = input.sun ? elevAt(input.sun.y) / DEG : e;
  const sp: Vec = [0, Math.sin(shown * DEG), Math.cos(shown * DEG)];
  const o: Vec = [0, RE + look.eye, 0];
  const night = clamp((-e - 6) / 7) ** 1.5;
  const dirAt = (x: number, el: number): Vec => {
    const az = ((x - sunX) / width) * FIELD;
    return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
  };
  const tmp: RGB = [0, 0, 0];
  const zen = skyRadiance(air, o, [0, 1, 0], sd, sp, [0, 0, 0]);
  // Light scattered more than once: from the whole sky (away from the sun's own glow), more in haze.
  const around = [dirAt(sunX - 0.9 * width, 12 * DEG), dirAt(sunX + 0.9 * width, 12 * DEG), dirAt(sunX - 1.6 * width, 25 * DEG)]
    .map((d) => skyRadiance(air, o, d, sd, sp, [0, 0, 0]));
  const mean = [0, 1, 2].map((k) => (zen[k] + around.reduce((a, c) => a + c[k], 0)) / 4);
  const ms = mean.map((v) => v * (0.05 + spec.mie * spec.mieH * 0.3));

  // The sky is smooth: it is worked out on a coarse grid and blended between (clouds keep full detail).
  const gc = Math.max(8, Math.round(cols / 3));
  const gr = Math.max(6, Math.round(rows / 3));
  const grid = new Float32Array(gc * gr * 3);
  // Sunlight on the clouds (the Ghats) changes slowly across the sky too: on the same grid.
  const clouds = spec.clouds;
  const litGrid = clouds ? new Float32Array(gc * gr * 3) : null;
  for (let j = 0; j < gr; j++) {
    const el = Math.max(elevAt(((j + 0.5) / gr) * height), 0.6 * DEG);
    for (let i = 0; i < gc; i++) {
      const d = dirAt(((i + 0.5) / gc) * width, el);
      skyRadiance(air, o, d, sd, sp, tmp);
      grid.set(tmp, (j * gc + i) * 3);
      if (litGrid && clouds) {
        const dist = (clouds.h - look.eye) / Math.sin(Math.max(el, 1.8 * DEG));
        litGrid.set(sunlightAt(air, [o[0] + d[0] * dist, o[1] + d[1] * dist, o[2] + d[2] * dist], sd), (j * gc + i) * 3);
      }
    }
  }
  const sampleOf = (data: Float32Array) => (fx: number, fy: number, out: RGB) => {
    const x = clamp(fx * gc - 0.5, 0, gc - 1);
    const y = clamp(fy * gr - 0.5, 0, gr - 1);
    const x0 = Math.min(gc - 2, Math.floor(x));
    const y0 = Math.min(gr - 2, Math.floor(y));
    const a = x - x0;
    const b = y - y0;
    for (let k = 0; k < 3; k++) {
      const p00 = data[(y0 * gc + x0) * 3 + k];
      const p10 = data[(y0 * gc + x0 + 1) * 3 + k];
      const p01 = data[((y0 + 1) * gc + x0) * 3 + k];
      const p11 = data[((y0 + 1) * gc + x0 + 1) * 3 + k];
      out[k] = (p00 * (1 - a) + p10 * a) * (1 - b) + (p01 * (1 - a) + p11 * a) * b;
    }
  };
  const sample = sampleOf(grid);
  const sampleLit = litGrid ? sampleOf(litGrid) : null;
  const lit: RGB = [0, 0, 0];
  const buf = new Float32Array(cols * rows * 3);
  const lums = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const y = ((j + 0.5) / rows) * height;
    const el = Math.max(elevAt(y), 0.6 * DEG);
    for (let i = 0; i < cols; i++) {
      sample((i + 0.5) / cols, (j + 0.5) / rows, tmp);
      let c0 = tmp[0] + ms[0];
      let c1 = tmp[1] + ms[1];
      let c2 = tmp[2] + ms[2];
      if (clouds && sampleLit && el > 1.8 * DEG) {
        const d = dirAt(((i + 0.5) / cols) * width, el);
        const dist = (clouds.h - look.eye) / Math.sin(el);
        const dens = clamp((fbm(d[0] * dist / 8000 + 3.1, d[2] * dist / 2400 + 7.7) - (1 - clouds.cover)) * 3.4);
        if (dens > 0.001) {
          sampleLit((i + 0.5) / cols, (j + 0.5) / rows, lit);
          const mu = d[0] * sp[0] + d[1] * sp[1] + d[2] * sp[2];
          const fwd = 0.6 + 2.2 * Math.pow(Math.max(0, mu), 6);
          const a = dens * 0.9 * Math.exp(-dist / 70000) * Math.min(1, (el / DEG - 1.8) / 3);
          c0 = c0 * (1 - a) + (lit[0] * 0.07 * fwd + zen[0] * 1.6 + ms[0]) * a;
          c1 = c1 * (1 - a) + (lit[1] * 0.07 * fwd + zen[1] * 1.6 + ms[1]) * a;
          c2 = c2 * (1 - a) + (lit[2] * 0.07 * fwd + zen[2] * 1.6 + ms[2]) * a;
        }
      }
      const p = j * cols + i;
      buf[p * 3] = c0;
      buf[p * 3 + 1] = c1;
      buf[p * 3 + 2] = c2;
      lums[p] = 0.2126 * c0 + 0.7152 * c1 + 0.0722 * c2;
    }
  }
  // Exposure: the eye adapts to the ordinary sky (not the sun's glow), only partly, so dawn and dusk stay darker
  // than day; by day a little brighter, as a sunny sky looks.
  const sorted = Float32Array.from(lums).sort();
  // Deep in twilight the ordinary sky is all but black: the eye stops adapting there, so the last glow
  // fades into the night instead of being boosted into a hard band (a floor at a small share of daylight).
  const key = Math.max(sorted[Math.floor(sorted.length * 0.35)], dayKey(air, look.eye) * 3e-6);
  const lift = smooth(clamp((e - 2) / 13));
  const exposure = (look.gain * (0.17 + 0.27 * lift)) / (Math.pow(key, 0.68) * Math.pow(dayKey(air, look.eye), 0.32));

  // The night: the scene's own night sky (headerScenes.ts) fading in after dusk.
  const palette = SCENES[scene].palettes.night;
  const nightStops = palette.sky.map(hexRgb);
  const nightAt = (y: number): RGB => {
    const t = clamp(y / (horizonY + 12));
    const at = [0, 0.4, 0.75, 1];
    let k = 0;
    while (k < 2 && t > at[k + 1]) k++;
    const f = clamp((t - at[k]) / (at[k + 1] - at[k]));
    return [0, 1, 2].map((c) => lerp(nightStops[k][c], nightStops[k + 1][c], f)) as RGB;
  };
  // Near sunrise and sunset the scene's own colour holds the sky, so the glow never floods it.
  const golden = smooth(clamp((12 - e) / 9)) * smooth(clamp((e + 8) / 5)) * (1 - night);
  const vib = (1 + (look.vib - 1) * (1 - night * 0.7)) * (1 - look.golden.calm * golden);
  const lean = look.lean * (1 - night * 0.6);
  // Per row: full in the upper sky, easing off toward the horizon so a low band of glow stays.
  const goldenAt = (y: number) => look.golden.lean * golden * (1 - 0.65 * smooth(clamp((y / horizonY - 0.5) / 0.45)));
  // Each pixel to its screen colour: tone(), grade() and the weather, in plain arithmetic (it runs for every pixel).
  const acc = hexRgb(look.accent);
  const accL = lum(acc);
  const ca0 = acc[0] - accL;
  const ca1 = acc[1] - accL;
  const ca2 = acc[2] - accL;
  const caN = Math.hypot(ca0, ca1, ca2);
  const tint = hexRgb(look.golden.tint);
  const tintL = lum(tint);
  const wet = weather === 'clear' ? 0 : weather === 'rainy' ? 0.62 : 0.22;
  const dim = weather === 'rainy' ? 0.28 : 0.06;
  const grey = hexRgb(night > 0.5 ? '#1a1f2b' : '#7d8794');
  const black = hexRgb('#05070b');
  const out: RGB = [0, 0, 0];
  const shade = (r: number, g: number, b: number, n: RGB | null, gl = 0) => {
    let x0 = 0;
    let x1 = 0;
    let x2 = 0;
    const Y = (0.2126 * r + 0.7152 * g + 0.0722 * b) * exposure;
    if (Y > 0) {
      const Ld = (Y * (1 + Y / 9)) / (1 + Y);
      const k = (Ld / Y) * exposure;
      const white = clamp((Ld - 0.85) / 0.5) * 0.4;
      x0 = r * k * (1 - white) + Ld * white;
      x1 = g * k * (1 - white) + Ld * white;
      x2 = b * k * (1 - white) + Ld * white;
      const mx = Math.max(x0, x1, x2);
      if (mx > 1) { x0 /= mx; x1 /= mx; x2 /= mx; }
      x0 = srgb(Math.max(0, x0));
      x1 = srgb(Math.max(0, x1));
      x2 = srgb(Math.max(0, x2));
    }
    const lc = 0.2126 * x0 + 0.7152 * x1 + 0.0722 * x2;
    const d0 = x0 - lc;
    const d1 = x1 - lc;
    const d2 = x2 - lc;
    const dn = Math.hypot(d0, d1, d2);
    const sim = dn < 0.02 ? 0.4 : (ca0 * d0 + ca1 * d1 + ca2 * d2) / (caN * dn);
    const l = lean * Math.max(0, 0.2 + 0.8 * sim);
    const toAcc = lc / accL;
    let y0 = x0 * (1 - l) + Math.min(1, acc[0] * toAcc) * l;
    let y1 = x1 * (1 - l) + Math.min(1, acc[1] * toAcc) * l;
    let y2 = x2 * (1 - l) + Math.min(1, acc[2] * toAcc) * l;
    if (gl > 0) {
      const toTint = lc / tintL;
      y0 = lerp(y0, Math.min(1, tint[0] * toTint), gl);
      y1 = lerp(y1, Math.min(1, tint[1] * toTint), gl);
      y2 = lerp(y2, Math.min(1, tint[2] * toTint), gl);
    }
    const l2 = 0.2126 * y0 + 0.7152 * y1 + 0.0722 * y2;
    y0 = clamp(l2 + (y0 - l2) * vib);
    y1 = clamp(l2 + (y1 - l2) * vib);
    y2 = clamp(l2 + (y2 - l2) * vib);
    if (n) { y0 = lerp(y0, n[0], night); y1 = lerp(y1, n[1], night); y2 = lerp(y2, n[2], night); }
    if (wet) {
      // Rain hides the sun: its warm glow fades out, leaving the clouds' cool grey (cloudy days keep a little).
      if (weather === 'rainy') {
        const l3 = 0.2126 * y0 + 0.7152 * y1 + 0.0722 * y2;
        y0 = lerp(y0, l3, 0.85);
        y1 = lerp(y1, l3, 0.85);
        y2 = lerp(y2, l3, 0.85);
      }
      y0 = lerp(lerp(y0, grey[0], wet), black[0], dim);
      y1 = lerp(lerp(y1, grey[1], wet), black[1], dim);
      y2 = lerp(lerp(y2, grey[2], wet), black[2], dim);
    }
    out[0] = y0; out[1] = y1; out[2] = y2;
    return out;
  };
  const pixels = new Uint8ClampedArray(cols * rows * 4);
  const top: RGB = [0, 0, 0];
  for (let j = 0; j < rows; j++) {
    const n = night > 0 ? nightAt(((j + 0.5) / rows) * height) : null;
    const gl = golden > 0 ? goldenAt(((j + 0.5) / rows) * height) : 0;
    for (let i = 0; i < cols; i++) {
      const p = j * cols + i;
      const c = shade(buf[p * 3], buf[p * 3 + 1], buf[p * 3 + 2], n, gl);
      // A tiny fixed dither, so gradients never band.
      const dither = (hash(i, j) - 0.5) * 1.6;
      pixels[p * 4] = c[0] * 255 + dither;
      pixels[p * 4 + 1] = c[1] * 255 + dither;
      pixels[p * 4 + 2] = c[2] * 255 + dither;
      pixels[p * 4 + 3] = 255;
      if (j === 0) for (let k = 0; k < 3; k++) top[k] += c[k] / cols;
    }
  }

  // The land: sunlight at its height (high ground keeps the sun longest and gets it first) plus the sky's light.
  const lightAt = (hgt: number, sun: Vec, exposed: number): RGB => {
    const p: Vec = [0, RE + hgt, 0];
    const s = sunlightAt(air, p, sun);
    const dip = Math.sqrt((2 * Math.max(hgt - look.eye, 0)) / RE);
    const facing = clamp((exposed * DEG + dip + 0.7 * DEG) / (2.5 * DEG)) * (0.3 + 0.7 * Math.sin(Math.min(Math.max(exposed, 0), 30) * DEG + 0.3));
    const sky = skyRadiance(air, p, [0, 1, 0], sun, sun, [0, 0, 0]);
    const side = skyRadiance(air, p, [0, Math.sin(15 * DEG), Math.cos(15 * DEG)], sun, sun, [0, 0, 0]);
    return [0, 1, 2].map((k) => s[k] * facing * 0.05 + (sky[k] + side[k]) * 0.9) as RGB;
  };
  // Calibrated so that a mid-morning sun in this air shows the picture as drawn.
  const ref = lightAt(look.eye, [0, Math.sin(30 * DEG), Math.cos(30 * DEG)], 30);
  const refT = tone(ref, 0.2 / dayKey(air, look.eye)).map((v) => Math.max(v, 1e-4));
  const floor = [0.13, 0.14, 0.19];
  const nightLand = hexRgb(palette.land);
  const landLight = (hgt: number): RGB => {
    const t = tone(lightAt(hgt, sd, e), exposure).map((v, k) => clamp(Math.max(floor[k], v / refT[k]), 0, 1.04)) as RGB;
    const g = toward(grade(t, look.accent, look.lean * 0.55, 1.08), look.golden.tint, look.golden.lean * golden * 0.75);
    return weatherTint(g.map((v, k) => lerp(v, nightLand[k], night)) as RGB, weather, night, true);
  };

  // Far land fades into the air near the horizon, warmed toward the accent.
  const nh = nightStops[3];
  const hz = grade(tone(skyRadiance(air, o, dirAt(sunX - 0.25 * width, 1.5 * DEG), sd, sp, [0, 0, 0]).map((v, k) => v + ms[k]), exposure), look.accent, look.hazeLean, look.vib);
  const haze = weatherTint(toward(hz, look.golden.tint, look.golden.lean * golden * 0.6).map((v, k) => lerp(v, nh[k], night)) as RGB, weather, night, false);

  // The sun's disc: whatever survives the air (bright gold in clean air, dim and red in haze).
  const t = sunlightAt(air, o, sd).map((v) => v / SUN);
  const sunColor = tone(t.map((v) => v * 40), 1);
  const sunAlpha = e > -0.9 ? clamp(Math.max(t[0], t[1], t[2]) * 2.5) : 0;

  return {
    cols, rows, pixels, night,
    landHigh: landLight(look.peak),
    landLow: landLight(look.low),
    haze,
    hazeAmount: Math.min(0.85, 0.6 * spec.haze),
    sunColor,
    sunAlpha,
    top,
  };
}

/** An RGB triple (0–1) as a CSS colour. */
export const cssColor = (c: readonly number[]) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
