import { describe, expect, it } from 'vitest';
import { SCENES, SCENE_OF_ACCENT, sceneForAccent, sceneShape, type SceneId } from './headerScenes';
import { skyColors } from './headerSky';

const IDS: SceneId[] = ['plains', 'himalaya', 'ghats'];
const day = { sunrise: 6.4, sunset: 17.5, noon: 11.95 } as Parameters<typeof skyColors>[1];

describe('header scenes', () => {
  it('give each accent its own landscape; a photo colour shows the fields', () => {
    expect(SCENE_OF_ACCENT).toEqual({ sand: 'plains', slate: 'himalaya', sage: 'ghats' });
    expect(sceneForAccent('custom')).toBe('plains');
    expect(sceneForAccent(undefined)).toBe('plains');
  });

  it('have all five skies with four layers of land', () => {
    for (const id of IDS) {
      for (const time of ['night', 'morning', 'day', 'evening', 'dusk'] as const) {
        const p = SCENES[id].palettes[time];
        expect(p.sky).toHaveLength(4);
        expect(p.layers).toHaveLength(4);
      }
    }
    expect(SCENES.himalaya.palettes.day.snow).toBe('#ffffff');
  });

  it('blend a scene’s own colours through the day, snow included', () => {
    const noon = skyColors(12, day, SCENES.himalaya.palettes);
    const dusk = skyColors(18.2, day, SCENES.himalaya.palettes);
    expect(noon.snow).toBeDefined();
    expect(noon.snow).not.toBe(dusk.snow);
    expect(skyColors(12, day, SCENES.plains.palettes).layers[1]).not.toEqual(noon.layers[1]);
  });

  it('keep the land below the words, the same on every visit', () => {
    for (const id of IDS) {
      for (const [width, lift] of [[392, -14], [392, 14], [340, -14]]) {
        const shape = sceneShape(id, width, lift);
        expect(shape.ranges).toHaveLength(4);
        for (const range of shape.ranges) {
          expect(range[0][0]).toBe(0);
          expect(range[range.length - 1][0]).toBeCloseTo(width);
          // On Today (lift −14) the land stays under the name and countdown (scene y ≈ 100).
          if (lift < 0) expect(Math.min(...range.map((p) => p[1]))).toBeGreaterThan(96);
        }
        expect(JSON.stringify(sceneShape(id, width, lift))).toBe(JSON.stringify(shape));
      }
    }
  });

  it('let the sun set on the fields’ horizon', () => {
    const plains = sceneShape('plains', 392, -14);
    expect(plains.sun.base).toBeGreaterThan(plains.ranges[0][0][1]);
    expect(plains.marks.some((m) => m.dusk)).toBe(true);
  });
});
