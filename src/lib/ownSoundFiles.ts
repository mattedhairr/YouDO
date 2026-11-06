import {
  OWN_SOUND_LIMIT,
  OWN_SOUND_MIN_SECONDS,
  cleanSoundName,
  readOwnSounds,
  saveOwnSounds,
  type OwnSound,
  type OwnSoundId,
} from './ownSounds';

/**
 * Adding, reading and removing the files behind Your sounds, and fitting a
 * file to loop. Only Settings and the player need this, so it stays off the
 * first screen's JavaScript.
 */

/** A readable default name from a file name: "binks_sake-violin.mp3" → "Binks sake violin". */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_-]+/g, ' ');
  const clean = cleanSoundName(base);
  return clean ? clean[0].toUpperCase() + clean.slice(1) : 'My sound';
}

export function formatSoundLength(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Typical level of the built-in music (about -21 LUFS), measured the way
 * fitLoop measures: their median 50 ms level is close to -24 dBFS.
 */
const TARGET_RMS = 0.0645;
const PEAK_CEILING = 0.89;

export interface LoopFit {
  start: number;
  end: number;
  gain: number;
}

/**
 * Where a file should loop and how loud to play it. Quiet lead-in and silent
 * endings are cut, so a repeat never drops into silence, and the level is
 * matched to the built-in sounds without letting the loudest moment clip.
 * Returns null when there is not enough sound to loop.
 */
export function fitLoop(channels: Float32Array[], sampleRate: number): LoopFit | null {
  const length = channels[0]?.length ?? 0;
  if (!length || !sampleRate) return null;
  const win = Math.max(1, Math.round(sampleRate * 0.05));
  const levels: number[] = [];
  let peak = 0;
  for (let s = 0; s < length; s += win) {
    const stop = Math.min(length, s + win);
    let sum = 0;
    for (const ch of channels) {
      for (let i = s; i < stop; i++) {
        const v = ch[i];
        sum += v * v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
    }
    levels.push(Math.sqrt(sum / ((stop - s) * channels.length)));
  }
  const loudest = Math.max(...levels);
  // Silence is below -50 dBFS, or 40 dB under the loudest part.
  const threshold = Math.max(0.00316, loudest * 0.01);
  const first = levels.findIndex((v) => v > threshold);
  if (first < 0) return null;
  let last = levels.length - 1;
  while (last > first && levels[last] <= threshold) last--;
  const start = Math.max(0, (first - 1) * win) / sampleRate;
  const end = Math.min(length, (last + 2) * win) / sampleRate;
  if (end - start < OWN_SOUND_MIN_SECONDS) return null;
  const body = levels.slice(first, last + 1).filter((v) => v > threshold).sort((a, b) => a - b);
  const median = body[Math.floor(body.length / 2)];
  let gain = median > 0 ? TARGET_RMS / median : 1;
  gain = Math.min(4, Math.max(0.25, gain));
  if (peak > 0) gain = Math.min(gain, PEAK_CEILING / peak);
  return { start: round3(start), end: round3(end), gain: round3(gain) };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Files live in IndexedDB. Every call fails soft.
const DB_NAME = 'youdo-own-sounds';
const STORE = 'files';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest | null, fallback: T): Promise<T> {
  return openDb().then((db) => {
    if (!db) return fallback;
    return new Promise<T>((resolve) => {
      let result = fallback;
      try {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        if (request) request.onsuccess = () => { result = (request.result as T) ?? fallback; };
        tx.oncomplete = () => { db.close(); resolve(mode === 'readwrite' ? (true as T) : result); };
        tx.onerror = () => { db.close(); resolve(fallback); };
        tx.onabort = () => { db.close(); resolve(fallback); };
      } catch {
        db.close();
        resolve(fallback);
      }
    });
  });
}

export function loadOwnSoundFile(id: OwnSoundId): Promise<Blob | null> {
  return withStore<Blob | null>('readonly', (store) => store.get(id), null);
}

function newOwnSoundId(): OwnSoundId {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `own-${random.toLowerCase()}`;
}

/** Keeps the file on this phone and adds it to Your sounds. */
export async function addOwnSound(file: Blob, name: string, duration: number, fit: LoopFit): Promise<OwnSound | null> {
  const list = readOwnSounds();
  if (list.length >= OWN_SOUND_LIMIT) return null;
  const sound: OwnSound = {
    id: newOwnSoundId(),
    name: cleanSoundName(name) || 'My sound',
    duration,
    ...fit,
    addedAt: Date.now(),
  };
  const stored = await withStore<boolean>('readwrite', (store) => store.put(file, sound.id), false);
  if (!stored) return null;
  saveOwnSounds([...list, sound]);
  return sound;
}

export async function removeOwnSound(id: OwnSoundId): Promise<void> {
  saveOwnSounds(readOwnSounds().filter((s) => s.id !== id));
  await withStore<boolean>('readwrite', (store) => store.delete(id), false);
}

export function renameOwnSound(id: OwnSoundId, name: string) {
  const clean = cleanSoundName(name);
  if (!clean) return;
  saveOwnSounds(readOwnSounds().map((s) => (s.id === id ? { ...s, name: clean } : s)));
}
