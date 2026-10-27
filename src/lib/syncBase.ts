import type { WorkspaceSlice } from './syncMerge';

/**
 * The copy this device and the cloud last agreed on, kept per account so a
 * later sync can see what each device changed since (a three-way merge).
 * It lives in IndexedDB: a large workspace does not fit beside the live
 * workspace in localStorage. Every call fails soft; without a saved copy sync
 * falls back to the cloud restore points, then to keeping everything.
 */
const DB_NAME = 'youdo-sync';
const STORE = 'base';

type Saved = { fingerprint: string; slice: WorkspaceSlice; savedAt: number };

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

export async function saveSyncBase(accountId: string, fingerprint: string, slice: WorkspaceSlice): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      // Structured clone keeps a frozen copy; later edits on the device cannot leak in.
      tx.objectStore(STORE).put({ fingerprint, slice, savedAt: Date.now() } satisfies Saved, accountId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** The saved agreed copy, only when it is the one this device's sync status names. */
export async function loadSyncBase(accountId: string, fingerprint: string): Promise<WorkspaceSlice | null> {
  const db = await openDb();
  if (!db) return null;
  const saved = await new Promise<Saved | null>((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(accountId);
      request.onsuccess = () => resolve((request.result as Saved | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  return saved && saved.fingerprint === fingerprint ? saved.slice : null;
}
