import { STORAGE_KEYS } from './storageKeys';

/**
 * "Your sounds": audio files the user adds from their own phone. The files
 * stay on this device (IndexedDB) and are never uploaded or synced; only a
 * small list of names and loop points lives in localStorage.
 */
export const FOCUS_SOUNDS_EVENT = 'youdo-focus-sounds-changed';

export type OwnSoundId = `own-${string}`;

export interface OwnSound {
  id: OwnSoundId;
  name: string;
  /** Whole file, in seconds. */
  duration: number;
  /** The part that loops: quiet lead-in and trailing silence are left out. */
  start: number;
  end: number;
  /** Brings the sound to the same loudness as the built-in ones. */
  gain: number;
  addedAt: number;
}

export const OWN_SOUND_LIMIT = 12;
export const OWN_SOUND_MAX_BYTES = 60 * 1024 * 1024;
/** Long files take a lot of memory once decoded on a phone. */
export const OWN_SOUND_MAX_SECONDS = 8 * 60;
export const OWN_SOUND_MIN_SECONDS = 10;
export const OWN_SOUND_NAME_MAX = 40;

export const isOwnSoundId = (value: unknown): value is OwnSoundId =>
  typeof value === 'string' && /^own-[a-z0-9-]{4,64}$/.test(value);

export function parseOwnSounds(raw: unknown): OwnSound[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: OwnSound[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const nums = [r.duration, r.start, r.end, r.gain, r.addedAt];
    if (!isOwnSoundId(r.id) || seen.has(r.id) || typeof r.name !== 'string') continue;
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    const duration = r.duration as number;
    const start = Math.max(0, Math.min(r.start as number, duration));
    const end = Math.max(start, Math.min(r.end as number, duration));
    if (end - start < 1) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      name: cleanSoundName(r.name) || 'My sound',
      duration,
      start,
      end,
      gain: Math.min(4, Math.max(0.05, r.gain as number)),
      addedAt: r.addedAt as number,
    });
    if (out.length >= OWN_SOUND_LIMIT) break;
  }
  return out;
}

export function readOwnSounds(): OwnSound[] {
  try {
    return parseOwnSounds(JSON.parse(localStorage.getItem(STORAGE_KEYS.ownSounds) ?? '[]'));
  } catch {
    return [];
  }
}

export function saveOwnSounds(list: OwnSound[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.ownSounds, JSON.stringify(list));
  } catch {
    /* Restricted storage: the list lasts for this visit. */
  }
  window.dispatchEvent(new Event(FOCUS_SOUNDS_EVENT));
}

export function cleanSoundName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, OWN_SOUND_NAME_MAX);
}

