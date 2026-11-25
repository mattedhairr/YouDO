/**
 * The header's three scenes, one for each preset accent: the harvest fields of
 * the plains (sand), the Himalaya (slate) and the Western Ghats (sage). Each is
 * a picture of the land (src/assets/scenes/, made by the owner) with its own
 * five skies drawn live behind it, so the sun can rise and set behind the real
 * ridges and the stars come out over them. Each sky time also sets the light on
 * the land (`land`, multiplied into the picture): golden at sunrise, rose at
 * golden hour, deep blue at night, and a gentle lean toward the scene's accent.
 * Pure data and geometry; SkyHeader.tsx and ScenePicker.tsx draw them.
 */
import type { Weather } from './weather';

export type SceneId = 'plains' | 'himalaya' | 'ghats';
export type Pt = [number, number];
export type SkyTime = 'night' | 'morning' | 'day' | 'evening' | 'dusk';

export interface ScenePalette {
  /** Four colours down the sky, top to horizon. */
  sky: string[];
  /** The light on the land, multiplied into the picture (white leaves it as drawn). */
  land: string;
}

/** How a picture sits in the header: zoomed in, centred on its best part, and how far it sinks below the bottom edge. */
interface Framing { zoom: number; focus: number; drop: number }

export interface SceneInfo {
  id: SceneId;
  name: string;
  place: string;
  /** The weather a new day starts with (the weather button still changes it). */
  weather: Weather;
  palettes: Record<SkyTime, ScenePalette>;
  /** The picture: its size, and where its land starts (fraction of its height) at 97 points across. */
  art: { width: number; height: number; ridge: number[]; today: Framing; tab: Framing };
}

export const SCENES: Record<SceneId, SceneInfo> = {
  plains: {
    id: 'plains',
    name: 'Harvest fields',
    place: 'Wheat on the plains of north India',
    weather: 'clear',
    palettes: {
      night: { sky: ['#020209', '#090a20', '#161937', '#262746'], land: '#353348' },
      morning: { sky: ['#1f2350', '#6a5d8c', '#e19883', '#fbd6a6'], land: '#ffd9c8' },
      day: { sky: ['#3a74aa', '#6ba2cd', '#b5d0de', '#efe4c8'], land: '#fffaf0' },
      evening: { sky: ['#1a1231', '#55305b', '#c9666a', '#f8b25f'], land: '#f2ad98' },
      dusk: { sky: ['#07061a', '#1d1535', '#46264a', '#6b3546'], land: '#62506e' },
    },
    art: { width: 2000, height: 257, ridge: [0.074, 0.082, 0.086, 0.082, 0.07, 0.058, 0.058, 0.07, 0.089, 0.109, 0.128, 0.144, 0.152, 0.148, 0.14, 0.132, 0.136, 0.156, 0.175, 0.132, 0.086, 0.113, 0.28, 0.237, 0.113, 0.097, 0.117, 0.265, 0.288, 0.167, 0.136, 0.156, 0.222, 0.101, 0.027, 0.016, 0.054, 0.051, 0.3, 0.288, 0.296, 0.191, 0.206, 0.35, 0.342, 0.339, 0.296, 0.35, 0.335, 0.253, 0.35, 0.37, 0.37, 0.292, 0.362, 0.362, 0.284, 0.362, 0.292, 0.366, 0.373, 0.362, 0.206, 0.167, 0.156, 0.183, 0.307, 0.249, 0.28, 0.311, 0.296, 0.218, 0.167, 0.249, 0.234, 0.234, 0.261, 0.253, 0.249, 0.241, 0.237, 0.226, 0.214, 0.198, 0.179, 0.171, 0.175, 0.187, 0.202, 0.21, 0.198, 0.171, 0.148, 0.124, 0.101, 0.089, 0.109], today: { zoom: 1.7, focus: 0.45, drop: 0 }, tab: { zoom: 1.2, focus: 0.45, drop: 16 } },
  },
  himalaya: {
    id: 'himalaya',
    name: 'Himalaya',
    place: 'Snow peaks of the Himalaya',
    weather: 'cloudy',
    palettes: {
      night: { sky: ['#010209', '#050a1e', '#0c1736', '#16244a'], land: '#2c3a58' },
      morning: { sky: ['#1a2550', '#5a5f92', '#d4949a', '#f5d2b0'], land: '#ffd6d4' },
      day: { sky: ['#0f4c8a', '#2f7fc6', '#7fb8e4', '#d2e8f6'], land: '#f4f8ff' },
      evening: { sky: ['#151232', '#432b5e', '#b0587a', '#f2a070'], land: '#dda2c0' },
      dusk: { sky: ['#06061a', '#1a1534', '#3b2346', '#5a2f44'], land: '#56507a' },
    },
    art: { width: 2000, height: 387, ridge: [0.015, 0.023, 0.067, 0.09, 0.129, 0.204, 0.24, 0.271, 0.323, 0.253, 0.256, 0.266, 0.261, 0.22, 0.238, 0.256, 0.292, 0.277, 0.264, 0.266, 0.289, 0.292, 0.264, 0.238, 0.245, 0.22, 0.225, 0.209, 0.253, 0.287, 0.323, 0.305, 0.307, 0.331, 0.351, 0.375, 0.401, 0.416, 0.419, 0.413, 0.395, 0.408, 0.429, 0.408, 0.419, 0.45, 0.509, 0.524, 0.519, 0.509, 0.488, 0.473, 0.493, 0.491, 0.478, 0.47, 0.452, 0.465, 0.475, 0.457, 0.478, 0.499, 0.483, 0.478, 0.491, 0.475, 0.47, 0.442, 0.419, 0.421, 0.419, 0.388, 0.382, 0.388, 0.398, 0.403, 0.403, 0.416, 0.377, 0.351, 0.326, 0.328, 0.346, 0.333, 0.297, 0.266, 0.346, 0.323, 0.292, 0.253, 0.24, 0.245, 0.22, 0.155, 0.124, 0.08, 0.049], today: { zoom: 1.45, focus: 0.3, drop: 0 }, tab: { zoom: 1.0, focus: 0.3, drop: 32 } },
  },
  ghats: {
    id: 'ghats',
    name: 'Western Ghats',
    place: 'Misty hills of the monsoon',
    weather: 'rainy',
    palettes: {
      night: { sky: ['#010409', '#051017', '#0b1d28', '#152d38'], land: '#283c46' },
      morning: { sky: ['#1c2a4a', '#5a6a8a', '#d8a090', '#f2dcb8'], land: '#f6d8cc' },
      day: { sky: ['#2c6788', '#5b94b2', '#a1c4cd', '#dde9e2'], land: '#f6fff4' },
      evening: { sky: ['#17152e', '#463559', '#a8687c', '#eaa484'], land: '#daa8aa' },
      dusk: { sky: ['#06081a', '#181a34', '#352a48', '#4f3748'], land: '#4e4c68' },
    },
    art: { width: 2000, height: 382, ridge: [0.037, 0.058, 0.068, 0.079, 0.094, 0.1, 0.113, 0.16, 0.202, 0.223, 0.23, 0.243, 0.264, 0.264, 0.257, 0.257, 0.257, 0.262, 0.262, 0.275, 0.293, 0.298, 0.298, 0.298, 0.296, 0.293, 0.288, 0.291, 0.296, 0.293, 0.306, 0.327, 0.333, 0.33, 0.333, 0.333, 0.333, 0.333, 0.33, 0.333, 0.335, 0.34, 0.377, 0.395, 0.401, 0.403, 0.421, 0.424, 0.427, 0.429, 0.442, 0.45, 0.445, 0.437, 0.442, 0.385, 0.38, 0.38, 0.38, 0.382, 0.382, 0.361, 0.361, 0.366, 0.361, 0.369, 0.353, 0.335, 0.296, 0.28, 0.278, 0.283, 0.283, 0.285, 0.288, 0.288, 0.301, 0.304, 0.278, 0.259, 0.259, 0.251, 0.243, 0.217, 0.191, 0.181, 0.168, 0.141, 0.128, 0.12, 0.094, 0.076, 0.071, 0.058, 0.039, 0.021, 0.016], today: { zoom: 1.45, focus: 0.38, drop: 0 }, tab: { zoom: 1.0, focus: 0.38, drop: 30 } },
  },
};

/** Each preset accent's landscape; a colour from the user's photo shows the harvest fields. */
export const SCENE_OF_ACCENT: Record<string, SceneId> = { sand: 'plains', slate: 'himalaya', sage: 'ghats' };

export function sceneForAccent(accent: string | undefined): SceneId {
  return (accent && SCENE_OF_ACCENT[accent]) || 'plains';
}

export interface SceneLand {
  /** Where the picture is drawn (scene coordinates). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The land's top edge across the header, for the sun's rising and setting. */
  ridge: Pt[];
  /** The sun's valley (fraction of the width), its lowest line and how far it climbs. */
  sun: { valley: number; base: number; span: number };
}

/**
 * Where a scene's picture sits in a header `width` × `height` (Today's is
 * taller): bottom-aligned, zoomed in on its best part, and the sun's track,
 * which starts just behind the land so it rises and sets behind the ridges.
 */
export function sceneLand(id: SceneId, width: number, height: number, today: boolean): SceneLand {
  const art = SCENES[id].art;
  const frame = today ? art.today : art.tab;
  const w = width * frame.zoom;
  const h = (w * art.height) / art.width;
  const x = -(w - width) * frame.focus;
  const y = height - h + frame.drop;
  const ridge: Pt[] = [];
  for (let k = 0; k <= 48; k++) {
    const sx = (k / 48) * width;
    const at = ((sx - x) / w) * (art.ridge.length - 1);
    const i = Math.max(0, Math.min(art.ridge.length - 2, Math.floor(at)));
    const t = Math.max(0, Math.min(1, at - i));
    ridge.push([sx, y + h * (art.ridge[i] + (art.ridge[i + 1] - art.ridge[i]) * t)]);
  }
  const valley = 0.54;
  const under = ridge[Math.round(valley * 48)][1];
  const base = Math.min(height - 8, under + 14);
  return { x, y, w, h, ridge, sun: { valley, base, span: Math.max(30, Math.min(70, base - 48)) } };
}
