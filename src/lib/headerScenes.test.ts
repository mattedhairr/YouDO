import { describe, expect, it } from 'vitest';
import { SCENES, SCENE_OF_ACCENT, sceneForAccent, sceneLand, type SceneId } from './headerScenes';
import { skyColors } from './headerSky';
import { weatherColors } from './weather';

const IDS: SceneId[] = ['plains', 'himalaya', 'ghats'];
const day = { sunrise: 6.4, sunset: 17.5, noon: 11.95 } as Parameters<typeof skyColors>[1];
// The header's scene heights (SkyHeader.tsx: HEIGHT + OFFSET).
const TODAY = 214;
const TAB = 150;

describe('header scenes', () => {
  it('give each accent its own landscape; a photo colour shows the fields', () => {
    expect(SCENE_OF_ACCENT).toEqual({ sand: 'plains', slate: 'himalaya', sage: 'ghats' });
    expect(sceneForAccent('custom')).toBe('plains');
    expect(sceneForAccent(undefined)).toBe('plains');
  });

  it('start each new day with its own weather: sun on the fields, cloud over the Himalaya, monsoon rain in the Ghats', () => {
    expect(IDS.map((id) => SCENES[id].weather)).toEqual(['clear', 'cloudy', 'rainy']);
  });

  it('have all five skies, each with the light on its land', () => {
    for (const id of IDS) {
      for (const time of ['night', 'morning', 'day', 'evening', 'dusk'] as const) {
        const p = SCENES[id].palettes[time];
        expect(p.sky).toHaveLength(4);
        expect(p.land).toMatch(/^#[0-9a-f]{6}$/);
      }
      // By day the land is near its own colours; at night it is dark.
      expect(SCENES[id].palettes.day.land > SCENES[id].palettes.night.land).toBe(true);
      expect(SCENES[id].art.ridge).toHaveLength(97);
    }
  });

  it('light the land through the day, and dim it under cloud and rain', () => {
    const noon = skyColors(12, day, SCENES.ghats.palettes);
    const sunset = skyColors(17.4, day, SCENES.ghats.palettes);
    expect(noon.land).not.toBe(sunset.land);
    const bright = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).reduce((a, v) => a + Number(v), 0);
    expect(bright(weatherColors(noon, 'rainy', 0).land)).toBeLessThan(bright(weatherColors(noon, 'cloudy', 0).land));
    expect(bright(weatherColors(noon, 'cloudy', 0).land)).toBeLessThan(bright(noon.land));
  });

  it('sit at the foot of the header, below the name and countdown on Today', () => {
    for (const id of IDS) {
      for (const width of [340, 392, 430]) {
        for (const [height, today] of [[TODAY, true], [TAB, false]] as const) {
          const land = sceneLand(id, width, height, today);
          // It fills the width and reaches the bottom edge.
          expect(land.x).toBeLessThanOrEqual(0);
          expect(land.x + land.w).toBeGreaterThanOrEqual(width - 0.01);
          expect(land.y + land.h).toBeGreaterThanOrEqual(height);
          // The ridge spans the width, inside the picture.
          expect(land.ridge[0][0]).toBe(0);
          expect(land.ridge[land.ridge.length - 1][0]).toBeCloseTo(width);
          const top = Math.min(...land.ridge.map((p) => p[1]));
          expect(top).toBeGreaterThanOrEqual(land.y - 0.01);
          // On Today the land stays under the name and countdown (scene y ≈ 96); on a tab under the title (≈ 92).
          expect(top).toBeGreaterThan(today ? 96 : 92);
          expect(JSON.stringify(sceneLand(id, width, height, today))).toBe(JSON.stringify(land));
        }
      }
    }
  });

  it('set the sun behind the land, and keep it under the top row at noon', () => {
    for (const id of IDS) {
      const land = sceneLand(id, 392, TODAY, true);
      const valleyY = land.ridge[Math.round(land.sun.valley * 48)][1];
      expect(land.sun.base).toBeGreaterThan(valleyY);
      expect(land.sun.base - land.sun.span).toBeGreaterThanOrEqual(44);
    }
  });
});
