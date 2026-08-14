import { supabaseUrl } from './supabase';

export const CLOCK_JUMP_EVENT = 'youdo-clock-jump';
export const CLOCK_CLEARED_EVENT = 'youdo-clock-cleared';
export const CLOCK_SKEW_MS = 3 * 60 * 1000;
export const CLOCK_INCIDENT_KEY = 'youdo-clock-incident-v1';

let lastWall = Date.now();
let lastMono = performance.now();
let primed = false;

export function isClockJump(wallDelta: number, monoDelta: number, threshold = CLOCK_SKEW_MS): boolean {
  return Math.abs(wallDelta - monoDelta) > threshold;
}

export function resetClockSample(): void {
  lastWall = Date.now();
  lastMono = performance.now();
  primed = true;
}

/** Compare wall clock vs monotonic time. Ignores the first sample after load. */
export function noteClockSample(): { jumped: boolean } {
  const wall = Date.now();
  const mono = performance.now();
  const wallDelta = wall - lastWall;
  const monoDelta = mono - lastMono;
  lastWall = wall;
  lastMono = mono;
  if (!primed) {
    primed = true;
    return { jumped: false };
  }
  return { jumped: isClockJump(wallDelta, monoDelta) };
}

export function markClockIncident(): void {
  try {
    localStorage.setItem(CLOCK_INCIDENT_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function hasClockIncident(): boolean {
  try {
    return localStorage.getItem(CLOCK_INCIDENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearClockIncident(): void {
  try {
    localStorage.removeItem(CLOCK_INCIDENT_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CLOCK_CLEARED_EVENT));
}

export function emitClockJump(): void {
  markClockIncident();
  window.dispatchEvent(new Event(CLOCK_JUMP_EVENT));
}

/** Returns false if the wall clock is untrustworthy; caller must not save session time. */
export function guardWallClock(): boolean {
  if (hasClockIncident()) return false;
  if (noteClockSample().jumped) {
    emitClockJump();
    return false;
  }
  return true;
}

export async function fetchServerNowMs(): Promise<number | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      signal: ctrl.signal,
    });
    const header = res.headers.get('date');
    if (!header) return null;
    const ms = Date.parse(header);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export function isDeviceSkewedFromServer(serverMs: number, deviceMs = Date.now(), threshold = CLOCK_SKEW_MS): boolean {
  return Math.abs(deviceMs - serverMs) > threshold;
}

export type ClockCheck = 'ok' | 'skewed' | 'unknown';

export async function checkDeviceClock(): Promise<ClockCheck> {
  const serverMs = await fetchServerNowMs();
  if (serverMs == null) return 'unknown';
  if (isDeviceSkewedFromServer(serverMs)) return 'skewed';
  resetClockSample();
  return 'ok';
}

/** Sign-in / sign-up: fail closed until device time matches the server. */
export async function assertDeviceClock(): Promise<{ ok: boolean; reason?: string }> {
  const status = await checkDeviceClock();
  if (status === 'unknown') {
    return {
      ok: false,
      reason: 'Could not verify time with the server. Turn on internet and set Date & Time to automatic, then try again.',
    };
  }
  if (status === 'skewed') {
    return {
      ok: false,
      reason: 'This device clock does not match server time. Set Date & Time to automatic (correct date), then sign in again. Your cloud backup is safe.',
    };
  }
  return { ok: true };
}
