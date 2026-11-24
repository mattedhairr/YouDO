import { STORAGE_KEYS } from './storageKeys';
import { APP_VERSION } from './version';

/**
 * Once a day, when YouDO opens online, it tells the server "this phone opened
 * YouDO today" (supabase/admin_hub.sql, record_app_open): a random number for
 * the phone and the app version, nothing else. The server adds who is signed
 * in. It lets the owner count people who use YouDO without an account.
 * Settings → About and updates → Count my visits turns it off.
 */

export function usageCountOn(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try { return storage.getItem(STORAGE_KEYS.usageCount) !== 'false'; } catch { return true; }
}

export function setUsageCountOn(on: boolean, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(STORAGE_KEYS.usageCount, on ? 'true' : 'false'); } catch { /* the default stays on */ }
}

export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** The phone's random number, made once. It is not linked to anything on the phone. */
export function deviceNumber(storage: Pick<Storage, 'getItem' | 'setItem'>, make: () => string): string {
  const known = storage.getItem(STORAGE_KEYS.deviceNumber);
  if (known && /^[0-9a-f-]{36}$/i.test(known)) return known;
  const fresh = make();
  storage.setItem(STORAGE_KEYS.deviceNumber, fresh);
  return fresh;
}

/** Whether today's note is still to be sent. */
export function openDue(storage: Pick<Storage, 'getItem'>, today: string, online: boolean): boolean {
  if (!online || !usageCountOn(storage)) return false;
  return storage.getItem(STORAGE_KEYS.lastOpenNote) !== today;
}

let sending = false;

export async function noteAppOpen(): Promise<void> {
  if (sending) return;
  try {
    const today = localDay();
    if (!openDue(localStorage, today, navigator.onLine)) return;
    sending = true;
    const device = deviceNumber(localStorage, () => crypto.randomUUID());
    const { supabase } = await import('./supabase');
    const { error } = await supabase.rpc('record_app_open', { opened_device: device, opened_version: APP_VERSION });
    if (!error) localStorage.setItem(STORAGE_KEYS.lastOpenNote, today);
  } catch {
    // Offline, storage blocked or an older server: try again next time.
  } finally {
    sending = false;
  }
}
