import { STORAGE_KEYS } from './storageKeys';
import { FOCUS_SOUNDS_EVENT, isOwnSoundId, readOwnSounds, type OwnSound, type OwnSoundId } from './ownSounds';

export { FOCUS_SOUNDS_EVENT };

/**
 * Focus sounds: calm music or steady sound while a session runs. Recordings are
 * CC0 (sources in docs/focus-sounds.md); brown and pink noise are generated here.
 * People can also add their own files (src/lib/ownSounds.ts), kept on the phone.
 * They play only during a session, pause and resume with it, and fade in and out.
 */
export type BuiltInSoundId =
  | 'violin-space-arp'
  | 'piano-yoiyami'
  | 'piano-november-snow'
  | 'strings-at-home'
  | 'piano-first-light'
  | 'koto-oriental-somber'
  | 'thunder'
  | 'forest'
  | 'brown'
  | 'pink';
export type FocusSoundId = BuiltInSoundId | OwnSoundId;
export type FocusSoundGroup = 'music' | 'nature' | 'noise' | 'own';

export interface FocusSound {
  id: FocusSoundId;
  label: string;
  /** A few words under the name: instrument and feel. */
  mood: string;
  /** A small picture for the tile and chip. */
  icon: string;
  group: FocusSoundGroup;
  /** seamless: made to loop; crossfade: each pass blends into the next; noise: generated. */
  kind: 'seamless' | 'crossfade' | 'noise';
  src?: string;
  /** Seconds each pass blends into the next (crossfade only). */
  fade?: number;
  /** The part of the file that plays, in seconds (own sounds). */
  start?: number;
  end?: number;
  /** Level match (own sounds). */
  gain?: number;
}

/** Music blends over 6 s, long enough that the join reads as one phrase into the next. */
export const MUSIC_FADE_S = 6;

export const FOCUS_SOUNDS: FocusSound[] = [
  { id: 'violin-space-arp', label: 'Quiet violin', mood: 'Violin · slow', icon: '🎻', group: 'music', kind: 'seamless', src: 'sounds/violin-space-arp.ogg' },
  { id: 'piano-yoiyami', label: 'Bamboo night', mood: 'Piano · shakuhachi', icon: '🎋', group: 'music', kind: 'crossfade', fade: MUSIC_FADE_S, src: 'sounds/piano-yoiyami.ogg' },
  { id: 'piano-november-snow', label: 'November snow', mood: 'Piano · drifting', icon: '❄️', group: 'music', kind: 'crossfade', fade: MUSIC_FADE_S, src: 'sounds/piano-november-snow.ogg' },
  { id: 'strings-at-home', label: 'Soft strings', mood: 'Strings · warm', icon: '🎼', group: 'music', kind: 'crossfade', fade: MUSIC_FADE_S, src: 'sounds/strings-at-home.ogg' },
  { id: 'piano-first-light', label: 'First light', mood: 'Piano · airy', icon: '🌅', group: 'music', kind: 'crossfade', fade: MUSIC_FADE_S, src: 'sounds/piano-first-light.ogg' },
  { id: 'koto-oriental-somber', label: 'Koto garden', mood: 'Koto · still', icon: '🪕', group: 'music', kind: 'crossfade', fade: MUSIC_FADE_S, src: 'sounds/koto-oriental-somber.ogg' },
  { id: 'thunder', label: 'Soft thunder', mood: 'Distant storm', icon: '⛈️', group: 'nature', kind: 'crossfade', src: 'sounds/thunder.ogg' },
  { id: 'forest', label: 'Forest stream', mood: 'Water · birds', icon: '🌲', group: 'nature', kind: 'crossfade', src: 'sounds/forest.ogg' },
  { id: 'brown', label: 'Brown noise', mood: 'Deep · steady', icon: '🟤', group: 'noise', kind: 'noise' },
  { id: 'pink', label: 'Pink noise', mood: 'Soft · steady', icon: '🌸', group: 'noise', kind: 'noise' },
];

/** Music retired in the next release: a saved choice moves to the closest new track. */
const RETIRED: Record<string, BuiltInSoundId> = {
  guitar: 'strings-at-home',
  'piano-jrpg': 'piano-first-light',
  'piano-catmint': 'piano-first-light',
};

export function ownToFocusSound(own: OwnSound): FocusSound {
  return {
    id: own.id,
    label: own.name,
    mood: 'On this phone',
    icon: '♪',
    group: 'own',
    kind: 'crossfade',
    fade: MUSIC_FADE_S,
    start: own.start,
    end: own.end,
    gain: own.gain,
  };
}

/** Built-in sounds, then the ones added on this phone. */
export function allFocusSounds(own: OwnSound[] = readOwnSounds()): FocusSound[] {
  return [...FOCUS_SOUNDS, ...own.map(ownToFocusSound)];
}

export function findFocusSound(id: FocusSoundId, own?: OwnSound[]): FocusSound | undefined {
  return allFocusSounds(own).find((s) => s.id === id);
}

export interface FocusSoundPrefs {
  /** null: no sound. */
  sound: FocusSoundId | null;
  /** 0–1 */
  volume: number;
  /** Keep playing while the app is in the background or the screen is off. */
  keepPlaying: boolean;
}

export const DEFAULT_FOCUS_SOUND_PREFS: FocusSoundPrefs = { sound: null, volume: 0.6, keepPlaying: false };

/** An own sound counts only while it is still on this phone. */
export function parseFocusSoundPrefs(raw: unknown, ownIds: readonly string[] = readOwnSounds().map((s) => s.id)): FocusSoundPrefs {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const picked = typeof row.sound === 'string' ? (RETIRED[row.sound] ?? row.sound) : null;
  const sound = FOCUS_SOUNDS.some((s) => s.id === picked) || (isOwnSoundId(picked) && ownIds.includes(picked))
    ? (picked as FocusSoundId)
    : null;
  const volume = typeof row.volume === 'number' && Number.isFinite(row.volume)
    ? Math.min(1, Math.max(0, row.volume))
    : DEFAULT_FOCUS_SOUND_PREFS.volume;
  return { sound, volume, keepPlaying: row.keepPlaying === true };
}

export function readFocusSoundPrefs(): FocusSoundPrefs {
  try {
    return parseFocusSoundPrefs(JSON.parse(localStorage.getItem(STORAGE_KEYS.focusSounds) ?? 'null'));
  } catch {
    return { ...DEFAULT_FOCUS_SOUND_PREFS };
  }
}

export function saveFocusSoundPrefs(next: FocusSoundPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEYS.focusSounds, JSON.stringify(next));
  } catch {
    /* Restricted storage: the choice lasts for this visit. */
  }
  window.dispatchEvent(new Event(FOCUS_SOUNDS_EVENT));
}

/**
 * What the player should do right now. Sound follows the session: it plays
 * while the timer runs, pauses with it, and stops when it ends. Leaving the app
 * (or turning the screen off) pauses it too, unless "Keep playing" is on.
 */
export function focusSoundAction(state: {
  session: boolean;
  paused: boolean;
  sound: FocusSoundId | null;
  visible: boolean;
  keepPlaying: boolean;
}): 'play' | 'pause' | 'stop' {
  if (!state.session || !state.sound) return 'stop';
  if (state.paused || (!state.visible && !state.keepPlaying)) return 'pause';
  return 'play';
}

/** Default blend for recordings that are not loops (nature). */
const CROSSFADE_S = 4;

/** The part of a buffer a sound plays, and how long it blends at the join. */
export function loopWindow(sound: Pick<FocusSound, 'start' | 'end' | 'fade'>, duration: number) {
  const start = Math.min(Math.max(0, sound.start ?? 0), duration);
  const end = Math.max(start, Math.min(sound.end ?? duration, duration));
  const length = end - start;
  return { start, end, length, fade: Math.min(sound.fade ?? CROSSFADE_S, length / 4) };
}
