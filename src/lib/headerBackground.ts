import { STORAGE_KEYS } from './storageKeys';

/**
 * Settings → Appearance → Header background: the built-in sky (SkyHeader.tsx)
 * or the user's own photo, placed with two sliders and faded with a third.
 * The choice is kept in localStorage; the photo, which can be large, in
 * IndexedDB, so it never crowds out the workspace. Both stay on this device.
 */
export interface HeaderBackground {
  mode: 'sky' | 'photo';
  /** Where the photo's focus sits, 0–100 (object-position). */
  x: number;
  y: number;
  /** 0.2–1 */
  opacity: number;
}

export const DEFAULT_HEADER_BACKGROUND: HeaderBackground = { mode: 'sky', x: 50, y: 50, opacity: 0.85 };

/** A change, so an open header follows the settings at once. */
export const HEADER_BACKGROUND_EVENT = 'youdo-header-background';

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** Anything stored, made safe: unknown values fall back to the defaults. */
export function normalizeHeaderBackground(value: unknown): HeaderBackground {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    mode: v.mode === 'photo' ? 'photo' : 'sky',
    x: num(v.x, 0, 100, DEFAULT_HEADER_BACKGROUND.x),
    y: num(v.y, 0, 100, DEFAULT_HEADER_BACKGROUND.y),
    opacity: num(v.opacity, 0.2, 1, DEFAULT_HEADER_BACKGROUND.opacity),
  };
}

export function loadHeaderBackground(): HeaderBackground {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.headerBackground);
    return normalizeHeaderBackground(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_HEADER_BACKGROUND };
  }
}

export function saveHeaderBackground(next: HeaderBackground): void {
  const value = normalizeHeaderBackground(next);
  try {
    localStorage.setItem(STORAGE_KEYS.headerBackground, JSON.stringify(value));
  } catch {
    /* Restricted storage: the header still follows the change for this visit. */
  }
  window.dispatchEvent(new CustomEvent(HEADER_BACKGROUND_EVENT));
}

// ── The photo, in IndexedDB ─────────────────────────────────────────────────

const DB = 'youdo-header';
const STORE = 'photo';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadHeaderPhoto(): Promise<Blob | null> {
  try {
    const value = await withStore<unknown>('readonly', (store) => store.get(KEY));
    return value instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

export async function saveHeaderPhoto(photo: Blob): Promise<void> {
  await withStore('readwrite', (store) => store.put(photo, KEY));
  window.dispatchEvent(new CustomEvent(HEADER_BACKGROUND_EVENT));
}

export async function removeHeaderPhoto(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(KEY));
  } finally {
    window.dispatchEvent(new CustomEvent(HEADER_BACKGROUND_EVENT));
  }
}

/** The longest side a header photo is kept at: sharp on any phone, small on disk. */
export const HEADER_PHOTO_MAX = 1600;

/** The size to scale a `width` × `height` image to, keeping its shape. */
export function fitPhotoSize(width: number, height: number, max = HEADER_PHOTO_MAX): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** A chosen file, scaled down and saved as a JPEG; throws if it isn't a readable image. */
export async function preparePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitPhotoSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) throw new Error('Could not encode the photo');
    return blob;
  } finally {
    bitmap.close();
  }
}
