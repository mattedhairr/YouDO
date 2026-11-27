import { describe, expect, it } from 'vitest';
import { airAt, SCENE_SKIES, skyFrame, type RGB, type SkyFrameInput } from './skySim';
import type { SceneId } from './headerScenes';
import type { SunDay } from './sunPath';

// Delhi on 26 Nov: sunrise 6:58, noon 12:08, sunset 5:24 pm.
const DAY: SunDay = { sunrise: 6.97, noon: 12.13, sunset: 17.4, latitude: 28.6, declination: (-21.1 * Math.PI) / 180 };
const W = 412;
const H = 214;
const HORIZON = 150;

const frame = (scene: SceneId, hour: number, extra: Partial<SkyFrameInput> = {}) =>
  skyFrame({ scene, hour, day: DAY, weather: 'clear', cols: 36, rows: 20, width: W, height: H, horizonY: HORIZON, sun: null, valley: 0.54, ...extra });
const at = (f: ReturnType<typeof skyFrame>, fx: number, fy: number): RGB => {
  const i = Math.min(f.cols - 1, Math.floor(fx * f.cols));
  const j = Math.min(f.rows - 1, Math.floor(fy * f.rows));
  const p = (j * f.cols + i) * 4;
  return [f.pixels[p] / 255, f.pixels[p + 1] / 255, f.pixels[p + 2] / 255];
};
const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const SCENES: SceneId[] = ['plains', 'himalaya', 'ghats'];

describe('the simulated sky', () => {
  it('is blue overhead at noon in every scene, with its sun shown', () => {
    for (const scene of SCENES) {
      const f = frame(scene, 12.2, { sun: { x: W * 0.54, y: 60 } });
      const top = at(f, 0.1, 0.05);
      expect(top[2]).toBeGreaterThan(top[0] + 0.1);
      expect(f.night).toBe(0);
      expect(f.sunAlpha).toBeGreaterThan(0.5);
    }
  });

  it('glows warm low down beside the setting sun', () => {
    for (const scene of SCENES) {
      const f = frame(scene, 17.35, { sun: { x: W * 0.7, y: HORIZON - 4 } });
      const low = at(f, 0.6, (HORIZON - 8) / H);
      expect(low[0]).toBeGreaterThan(low[2]);
    }
  });

  it('turns into the scene’s night after dusk, darker than any day', () => {
    for (const scene of SCENES) {
      const night = frame(scene, 20);
      const noon = frame(scene, 12.2, { sun: { x: W * 0.54, y: 60 } });
      expect(night.night).toBe(1);
      expect(lum(at(night, 0.5, 0.1))).toBeLessThan(0.08);
      expect(lum(at(noon, 0.5, 0.1))).toBeGreaterThan(lum(at(night, 0.5, 0.1)) + 0.3);
      expect(night.sunAlpha).toBe(0);
    }
  });

  it('lights the land by day and lets it go dim after sunset, never quite black', () => {
    for (const scene of SCENES) {
      const noon = frame(scene, 12.2, { sun: { x: W * 0.54, y: 60 } });
      const dusk = frame(scene, 17.4 + 0.6);
      expect(lum(noon.landLow)).toBeGreaterThan(0.8);
      expect(lum(dusk.landLow)).toBeLessThan(lum(noon.landLow) - 0.3);
      expect(lum(frame(scene, 21).landLow)).toBeGreaterThan(0.1);
    }
  });

  it('keeps the last light on the Himalayan peaks after the valleys lose it (alpenglow)', () => {
    const f = frame('himalaya', 17.47);
    expect(lum(f.landHigh)).toBeGreaterThan(lum(f.landLow));
    expect(f.landHigh[0]).toBeGreaterThan(f.landHigh[2]);
  });

  it('gives each scene its own sky', () => {
    const tops = SCENES.map((scene) => at(frame(scene, 16.5, { sun: { x: W * 0.67, y: 110 } }), 0.2, 0.3));
    for (let a = 0; a < tops.length; a++) {
      for (let b = a + 1; b < tops.length; b++) {
        expect(Math.hypot(tops[a][0] - tops[b][0], tops[a][1] - tops[b][1], tops[a][2] - tops[b][2])).toBeGreaterThan(0.02);
      }
    }
  });

  it('greys the sky on cloudy and rainy days', () => {
    const chroma = (c: RGB) => Math.max(...c) - Math.min(...c);
    const clear = at(frame('plains', 12.2, { sun: { x: W * 0.54, y: 60 } }), 0.2, 0.1);
    const cloudy = at(frame('plains', 12.2, { sun: { x: W * 0.54, y: 60 }, weather: 'cloudy' }), 0.2, 0.1);
    const rainy = at(frame('plains', 12.2, { sun: { x: W * 0.54, y: 60 }, weather: 'rainy' }), 0.2, 0.1);
    expect(chroma(cloudy)).toBeLessThan(chroma(clear));
    expect(chroma(rainy)).toBeLessThan(chroma(cloudy));
  });

  it('is the same every time for the same moment', () => {
    const a = frame('ghats', 17.3, { sun: { x: W * 0.7, y: HORIZON - 6 } });
    const b = frame('ghats', 17.3, { sun: { x: W * 0.7, y: HORIZON - 6 } });
    expect(Array.from(a.pixels)).toEqual(Array.from(b.pixels));
  });

  it('moves from morning air through the day’s to evening air', () => {
    const { dawn, day, dusk } = SCENE_SKIES.plains.air;
    expect(airAt('plains', 7.5, DAY).mie).toBeCloseTo(dawn.mie);
    expect(airAt('plains', 12.2, DAY).mie).toBeCloseTo(day.mie);
    expect(airAt('plains', 17.5, DAY).mie).toBeCloseTo(dusk.mie);
    const between = airAt('plains', 10, DAY).mie;
    expect(between).toBeLessThan(dawn.mie);
    expect(between).toBeGreaterThan(day.mie);
  });
});
