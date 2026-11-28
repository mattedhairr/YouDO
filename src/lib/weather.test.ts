import { afterEach, describe, expect, it, vi } from 'vitest';
import { skyColors } from './headerSky';
import { SCENES } from './headerScenes';
import { sunDay } from './sunPath';
import { cloudField, cloudLight, cloudTones, loadDayWeather, nextWeather, saveDayWeather, weatherColors, weatherLook } from './weather';

const DAY = sunDay('2026-11-20', 28.61, 77.21, 5.5);
const brightness = (c: string) => {
  const [r, g, b] = (c.match(/[\d.]+/g) ?? []).map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
const saturation = (c: string) => {
  const [r, g, b] = (c.match(/[\d.]+/g) ?? []).map(Number);
  return Math.max(r, g, b) - Math.min(r, g, b);
};

describe('the weather button', () => {
  it('cycles clear, cloudy, rainy, clear', () => {
    expect(nextWeather('clear')).toBe('cloudy');
    expect(nextWeather('cloudy')).toBe('rainy');
    expect(nextWeather('rainy')).toBe('clear');
  });
});

describe('the cloud field', () => {
  it('is fixed for a seed, and differs between seeds', () => {
    const a = cloudField(64, 24, 0.5, 20, 7);
    expect(cloudField(64, 24, 0.5, 20, 7).density).toEqual(a.density);
    expect(cloudField(64, 24, 0.5, 20, 8).density).not.toEqual(a.density);
  });

  it('tiles left to right, so it can drift without a seam', () => {
    const f = cloudField(96, 20, 0.6, 24, 3);
    for (let y = 0; y < 14; y++) {
      const left = f.density[y * 96];
      const right = f.density[y * 96 + 95];
      expect(Math.abs(left - right)).toBeLessThan(0.15);
    }
  });

  it('covers more of the sky when asked, and thins out toward the mountains', () => {
    const mean = (f: { density: Float32Array }) => f.density.reduce((s, v) => s + v, 0) / f.density.length;
    const light = cloudField(80, 40, 0.3, 24, 5);
    const heavy = cloudField(80, 40, 0.8, 24, 5);
    expect(mean(heavy)).toBeGreaterThan(mean(light));
    const row = (f: { density: Float32Array }, y: number) => f.density.slice(y * 80, y * 80 + 80).reduce((s, v) => s + v, 0);
    expect(row(heavy, 39)).toBe(0);
    for (const v of heavy.density) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('the weather on the sky', () => {
  it('leaves a clear sky as it is', () => {
    const c = skyColors(11, DAY, SCENES.himalaya.palettes);
    expect(weatherColors(c, 'clear', 0)).toBe(c);
  });

  it('greys and dims the sky under cloud, more so in rain', () => {
    const c = skyColors(11, DAY, SCENES.himalaya.palettes);
    const cloudy = weatherColors(c, 'cloudy', 0);
    const rainy = weatherColors(c, 'rainy', 0);
    expect(saturation(cloudy.sky[1])).toBeLessThan(saturation(c.sky[1]));
    expect(brightness(rainy.sky[1])).toBeLessThan(brightness(cloudy.sky[1]));
  });

  it('lights clouds warm near sunset, dark at night, heavier in rain', () => {
    const noon = cloudTones('cloudy', 0, 0);
    const sunset = cloudTones('cloudy', 0, 1);
    const night = cloudTones('cloudy', 1, 0);
    expect(brightness(night.light)).toBeLessThan(brightness(noon.light) - 100);
    const [r, , b] = (sunset.light.match(/[\d.]+/g) ?? []).map(Number);
    expect(r).toBeGreaterThan(b);
    expect(brightness(cloudTones('rainy', 0, 0).light)).toBeLessThan(brightness(noon.light));
  });
});

describe("each day's clouds and rain", () => {
  it('stay the same all day', () => {
    expect(weatherLook('2026-11-20', 'cloudy')).toEqual(weatherLook('2026-11-20', 'cloudy'));
  });

  it('change from day to day', () => {
    const seeds = new Set<number>();
    const drops = new Set<number>();
    for (let d = 1; d <= 20; d++) {
      const key = `2026-11-${String(d).padStart(2, '0')}`;
      seeds.add(weatherLook(key, 'cloudy').layers[0].seed);
      drops.add(weatherLook(key, 'rainy').rain.drops);
    }
    expect(seeds.size).toBe(20);
    expect(drops.size).toBeGreaterThan(10);
  });

  it('stay within natural ranges', () => {
    for (let d = 1; d <= 60; d++) {
      const key = `2026-${d <= 30 ? '11' : '12'}-${String(((d - 1) % 30) + 1).padStart(2, '0')}`;
      const cloudy = weatherLook(key, 'cloudy');
      const rainy = weatherLook(key, 'rainy');
      for (const layer of cloudy.layers) {
        expect(layer.cover).toBeGreaterThanOrEqual(0.36);
        expect(layer.cover).toBeLessThanOrEqual(0.58);
      }
      // Rain is always more overcast than a cloudy day.
      expect(rainy.layers[0].cover).toBeGreaterThan(0.58);
      expect(rainy.rain.drops).toBeGreaterThanOrEqual(90);
      expect(rainy.rain.drops).toBeLessThanOrEqual(190);
      expect(rainy.rain.wind).toBeGreaterThanOrEqual(0.07);
      expect(rainy.rain.wind).toBeLessThanOrEqual(0.24);
      // The near layer always drifts faster than the far one.
      expect(cloudy.layers[1].seconds).toBeLessThan(cloudy.layers[0].seconds);
      expect([1, -1]).toContain(cloudy.direction);
    }
  });
});

describe('the day’s weather', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('starts each day with the scene’s own weather until the button is tapped', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    vi.stubGlobal('window', { dispatchEvent: () => true });
    expect(loadDayWeather('2026-11-25', 'rainy')).toBe('rainy');
    expect(loadDayWeather('2026-11-25')).toBe('clear');
    saveDayWeather('2026-11-25', 'cloudy');
    expect(loadDayWeather('2026-11-25', 'rainy')).toBe('cloudy');
    // A new day goes back to the scene's own.
    expect(loadDayWeather('2026-11-26', 'rainy')).toBe('rainy');
  });
});

describe('clouds lit by their sky', () => {
  const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
  const base = { weather: 'cloudy' as const, night: 0, sky: [0.35, 0.55, 0.85], accent: '#8DA6C9' };
  it('has white tops by day and gold tops as the sun sets', () => {
    const day = rgb(cloudLight({ ...base, sunLow: 0.05, sun: [1, 0.98, 0.95] }).light);
    const dusk = rgb(cloudLight({ ...base, sunLow: 0.95, sun: [1, 0.55, 0.2] }).light);
    expect(Math.min(...day)).toBeGreaterThan(235);
    expect(dusk[0] - dusk[2]).toBeGreaterThan(50);
  });
  it('keeps bases darker than tops, and greys them in rain', () => {
    const c = cloudLight({ ...base, sunLow: 0.2, sun: [1, 0.95, 0.9] });
    const sum = (s: string) => rgb(s).reduce((a, b) => a + b, 0);
    expect(sum(c.dark)).toBeLessThan(sum(c.light));
    const r = cloudLight({ ...base, weather: 'rainy', sunLow: 0.2, sun: [1, 0.95, 0.9] });
    expect(sum(r.light)).toBeLessThan(sum(c.light));
  });
});
