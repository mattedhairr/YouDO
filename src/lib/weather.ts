/**
 * The header's weather (SkyWeather.tsx): clear, cloudy or rainy, chosen by
 * the user for the day from a small button in the header. Pure parts: the
 * cloud field (fractal noise, seamless left to right so it can drift) and how
 * the weather mutes the sky's colours.
 */
import { mixColor, type SkyColors } from './headerSky';
import { STORAGE_KEYS } from './storageKeys';

export type Weather = 'clear' | 'cloudy' | 'rainy';
export const WEATHERS: Weather[] = ['clear', 'cloudy', 'rainy'];

/** The next weather in the button's cycle. */
export function nextWeather(w: Weather): Weather {
  return WEATHERS[(WEATHERS.indexOf(w) + 1) % WEATHERS.length];
}

// ── The cloud field ─────────────────────────────────────────────────────────

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Value noise, repeating every `period` cells along x (so the strip tiles seamlessly). */
function noise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const wrap = (v: number) => ((v % period) + period) % period;
  const a = hash(wrap(x0), y0, seed);
  const b = hash(wrap(x0 + 1), y0, seed);
  const c = hash(wrap(x0), y0 + 1, seed);
  const d = hash(wrap(x0 + 1), y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Fractal noise (5 octaves), 0–1, still seamless along x for a strip `cells` wide. */
function fbm(x: number, y: number, cells: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 5; o++) {
    sum += amp * noise(x * freq, y * freq, cells * freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export interface CloudField {
  width: number;
  height: number;
  /** 0–1 cloud density per pixel, row by row. */
  density: Float32Array;
}

/**
 * A strip of cloud `width` × `height` px that tiles left to right. `cover`
 * is how much of the sky is cloud (0–1); `scale` the size of the cloud
 * masses in px; the field thins out toward the bottom (the mountains).
 */
/** How soft a cloud's edge is, in noise units either side of its outline. */
const CLOUD_EDGE = 0.13;

export function cloudField(width: number, height: number, cover: number, scale: number, seed: number): CloudField {
  const density = new Float32Array(width * height);
  const cells = Math.max(1, Math.round(width / scale));
  const threshold = 1 - cover;
  for (let y = 0; y < height; y++) {
    const fadeOut = Math.min(1, Math.max(0, (height - 1 - y) / (height * 0.45)));
    for (let x = 0; x < width; x++) {
      const u = (x / width) * cells;
      const v = y / scale;
      // A light warp makes the shapes billow instead of looking like blotches.
      const warp = fbm(u + 3.1, v + 7.7, cells, seed + 101) - 0.5;
      const n = fbm(u + warp * 0.9, v + warp * 0.6, cells, seed);
      // A wide, eased edge: each cloud thickens gradually from clear sky, never with a crisp rim.
      const t = Math.min(1, Math.max(0, (n - threshold + CLOUD_EDGE) / (2 * CLOUD_EDGE)));
      density[y * width + x] = t * t * (3 - 2 * t) * fadeOut;
    }
  }
  return { width, height, density };
}

// ── Each day's own clouds and rain ──────────────────────────────────────────

export interface CloudLayerLook {
  cover: number;
  /** Size of the cloud masses, px. */
  scale: number;
  seed: number;
  alpha: number;
  /** Seconds for the layer to drift one screen width. */
  seconds: number;
  offsetY: number;
}

export interface WeatherLook {
  /** Far layer first. */
  layers: CloudLayerLook[];
  /** 1: the wind blows to the left; -1: to the right. Clouds and rain agree. */
  direction: 1 | -1;
  rain: { drops: number; wind: number; speed: number; seed: number };
  /** A rainbow on about one rainy day in three: where its middle stands (fraction of the width) and its size (fraction of the width). */
  rainbow: { centre: number; radius: number } | null;
}

/** A date string → a 32-bit seed. */
function dateSeed(dateKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateKey.length; i++) h = Math.imul(h ^ dateKey.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * How the clouds and rain look on `dateKey`: new cloud shapes every day, and
 * a little more or less cloud, size, wind and rain, so no two cloudy or rainy
 * days look alike. The same all day, so the sky doesn't change between visits.
 */
export function weatherLook(dateKey: string, weather: Weather): WeatherLook {
  let s = dateSeed(dateKey + weather) || 1;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
  const rainy = weather === 'rainy';
  const direction: 1 | -1 = rand() < 0.7 ? 1 : -1;
  const pace = between(0.8, 1.25); // a calmer or a windier day: both layers together
  const layers: CloudLayerLook[] = [
    {
      cover: rainy ? between(0.78, 0.88) : between(0.44, 0.58),
      scale: between(76, 108),
      seed: Math.floor(rand() * 100000),
      alpha: rainy ? 0.9 : 0.7,
      seconds: Math.round((rainy ? 460 : 660) * pace),
      offsetY: 0,
    },
    {
      cover: rainy ? between(0.66, 0.78) : between(0.36, 0.5),
      scale: between(48, 70),
      seed: Math.floor(rand() * 100000),
      alpha: rainy ? 0.95 : 0.85,
      seconds: Math.round((rainy ? 250 : 380) * pace),
      offsetY: Math.round(between(8, 20)),
    },
  ];
  const heavy = rand(); // 0 drizzle … 1 steady shower
  const rain = {
    drops: Math.round(90 + heavy * 100),
    wind: between(0.07, 0.24),
    speed: between(0.88, 1.12),
    seed: Math.floor(rand() * 2147483646) + 1,
  };
  // Drawn after everything else, so adding the rainbow changed no day's clouds or rain.
  const rainbow = rainy && rand() < 1 / 3 ? { centre: between(0.3, 0.52), radius: between(0.3, 0.36) } : null;
  return { layers, direction, rain, rainbow };
}

/**
 * How much of a rainbow shows (0–1): only while the sun is up and low, as a
 * real one needs (under about 40° high, behind the viewer): mornings and late
 * afternoons, never at noon or at night. It eases in and out with the sun.
 */
export function rainbowStrength(sunUp: boolean, altitude: number, night: number): number {
  if (!sunUp || night > 0.4) return 0;
  const rise = Math.min(1, Math.max(0, (altitude - 3) / 7));
  const high = Math.min(1, Math.max(0, (38 - altitude) / 8));
  return rise * high * (1 - night / 0.4);
}

// ── How the weather changes the sky ─────────────────────────────────────────

/** The sky's colours under cloud or rain: greyer and dimmer, more so in rain. */
export function weatherColors(colors: SkyColors, weather: Weather, night: number): SkyColors {
  if (weather === 'clear') return colors;
  const grey = night > 0.5 ? '#1a1f2b' : '#7d8794';
  const amount = weather === 'rainy' ? 0.62 : 0.4;
  const dim = weather === 'rainy' ? 0.28 : 0.12;
  const toGrey = (c: string) => mixColor(mixColor(c, grey, amount), '#05070b', dim);
  return {
    sky: colors.sky.map(toGrey),
    // Under cloud the land loses its sunlight: a little greyer and dimmer, more in rain.
    land: mixColor(mixColor(colors.land, night > 0.5 ? '#2a3140' : '#b9c0c8', weather === 'rainy' ? 0.42 : 0.26), '#05070b', weather === 'rainy' ? 0.14 : 0.05),
  };
}

/** How the clouds are lit: bright tops and dark bases, warm low sun, cool night. */
export function cloudTones(weather: Weather, night: number, sunLow: number): { light: string; dark: string } {
  const day = { light: '#f3f5f8', dark: '#8f99a6' };
  const warm = { light: '#f7cfae', dark: '#6d5566' };
  const dark = { light: '#56627d', dark: '#161c29' };
  let light = mixColor(day.light, warm.light, sunLow);
  let shade = mixColor(day.dark, warm.dark, sunLow);
  light = mixColor(light, dark.light, night);
  shade = mixColor(shade, dark.dark, night);
  if (weather === 'rainy') {
    light = mixColor(light, '#59626f', night > 0.5 ? 0.3 : 0.55);
    shade = mixColor(shade, '#262c36', 0.6);
  }
  return { light, dark: shade };
}

// ── The day's choice, and the setting ───────────────────────────────────────


/** A change, so an open header follows at once. */
export const SKY_WEATHER_EVENT = 'youdo-sky-weather';

/** The weather chosen for `dateKey`; until the button is tapped that day, the scene's own (`start`). */
export function loadDayWeather(dateKey: string, start: Weather = 'clear'): Weather {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.skyWeather);
    const saved = raw ? (JSON.parse(raw) as { date?: unknown; weather?: unknown }) : null;
    return saved && saved.date === dateKey && WEATHERS.includes(saved.weather as Weather) ? (saved.weather as Weather) : start;
  } catch {
    return start;
  }
}

export function saveDayWeather(dateKey: string, weather: Weather): void {
  try {
    localStorage.setItem(STORAGE_KEYS.skyWeather, JSON.stringify({ date: dateKey, weather }));
  } catch {
    /* Restricted storage: the header still shows it for this visit. */
  }
  window.dispatchEvent(new CustomEvent(SKY_WEATHER_EVENT));
}

/** Settings → Appearance: the header's weather button (on by default). */
export function weatherButtonEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.skyWeatherButton) !== 'false';
  } catch {
    return true;
  }
}

export function setWeatherButton(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.skyWeatherButton, String(enabled));
  } catch {
    /* Restricted storage: the default (on) stays. */
  }
  window.dispatchEvent(new CustomEvent(SKY_WEATHER_EVENT));
}
