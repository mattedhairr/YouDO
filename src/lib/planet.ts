/**
 * The planet of the day on the ambient screen. The seven weekdays carry the
 * names of the seven bodies the eye can follow across the sky (Sunday the Sun,
 * Monday the Moon, Saturday Saturn, and so on in many languages). The day's one
 * sits small in the sky and crosses it once a day; a tap shows its name and its
 * moons for a moment (PlanetOfTheDay.tsx).
 */

export interface DayPlanet {
  name: string;
  /** "Friday's planet", "Sunday's star". */
  role: string;
  /** Its brightest moons: how many to show, and how far out (in planet radii). */
  moons: { distance: number; size: number }[];
}

/** Indexed by the JavaScript weekday: 0 is Sunday. */
export const PLANETS: DayPlanet[] = [
  { name: 'Sun', role: 'Sunday’s star', moons: [] },
  { name: 'Moon', role: 'Monday', moons: [] },
  { name: 'Mars', role: 'Tuesday’s planet', moons: [{ distance: 1.8, size: 0.7 }, { distance: 2.6, size: 0.6 }] }, // Phobos, Deimos
  { name: 'Mercury', role: 'Wednesday’s planet', moons: [] },
  // Io, Europa, Ganymede, Callisto
  { name: 'Jupiter', role: 'Thursday’s planet', moons: [{ distance: 1.8, size: 0.9 }, { distance: 2.3, size: 0.85 }, { distance: 3.0, size: 1.1 }, { distance: 3.9, size: 1 }] },
  { name: 'Venus', role: 'Friday’s planet', moons: [] },
  { name: 'Saturn', role: 'Saturday’s planet', moons: [{ distance: 3.2, size: 1.1 }] }, // Titan
];

/** The weekday (0 is Sunday) of a local date key, "YYYY-MM-DD". */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getDay();
}

function seedOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0–1 through the Moon's cycle (0 new, 0.5 full): a mean synodic month, enough to draw and name the phase. */
export function moonPhase(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const days = (Date.UTC(y, (m || 1) - 1, d || 1, 12) - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000;
  return (((days / 29.530588853) % 1) + 1) % 1;
}

const PHASES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];

export function phaseName(phase: number): string {
  return PHASES[Math.round(phase * 8) % 8];
}

/** What a tap shows under the name: the role, or for the Moon its phase. */
export function planetSubtitle(index: number, dateKey: string): string {
  return index === 1 ? `Monday · ${phaseName(moonPhase(dateKey))}` : PLANETS[index].role;
}

/**
 * Where the moons are, in planet radii from its centre: along its equator,
 * each on its own side and distance, different every day (as they really
 * move around it night to night).
 */
export function moonLayout(index: number, dateKey: string): { dx: number; dy: number; size: number }[] {
  const next = random(seedOf(`${dateKey}:moons`));
  const tilt = index === 6 ? -0.38 : 0.03; // Saturn's rings are tilted; Jupiter's moons lie almost flat
  return PLANETS[index].moons.map((moon) => {
    const side = next() < 0.5 ? -1 : 1;
    const reach = moon.distance * (0.55 + 0.45 * next()) * side;
    return { dx: reach * Math.cos(tilt), dy: reach * Math.sin(tilt), size: moon.size };
  });
}

/**
 * Where the planet is, as fractions of the screen, `minutes` after midnight.
 * It crosses the sky once a day, left to right, on an arc above the timer,
 * like a planet rising and setting; where the crossing starts depends on the
 * date. It fades out at the right edge and back in at the left (`opacity`),
 * and it never stands still.
 */
export function planetPosition(dateKey: string, minutes: number, portrait: boolean): { x: number; y: number; opacity: number } {
  const start = 300 + random(seedOf(`${dateKey}:path`))() * 720;
  const p = ((((minutes - start) % 1440) + 1440) % 1440) / 1440;
  const arc = Math.sin(p * Math.PI);
  const opacity = Math.max(0, Math.min(1, p / 0.035, (1 - p) / 0.035));
  return portrait
    ? { x: 0.1 + 0.8 * p, y: 0.19 - 0.055 * arc, opacity }
    : { x: 0.1 + 0.8 * p, y: 0.25 - 0.11 * arc, opacity };
}
