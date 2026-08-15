import { supabaseUrl } from './supabase';

export const CLOCK_JUMP_EVENT = 'youdo-clock-jump';
export const CLOCK_CLEARED_EVENT = 'youdo-clock-cleared';
export const CLOCK_SKEW_MS = 3 * 60 * 1000;
/** If monotonic time barely moved, the WebView was frozen (screen lock) — not a clock change. */
export const CLOCK_SLEEP_MONO_MAX_MS = 60_000;
export const CLOCK_INCIDENT_KEY = 'youdo-clock-incident-v1';

let lastWall = Date.now();
let lastMono = performance.now();
let primed = false;
let lastHiddenAt = 0;

const RECENT_BACKGROUND_MS = 8_000;

export function markAppHidden(): void {
  lastHiddenAt = Date.now();
}

export function wasRecentlyBackgrounded(ms = RECENT_BACKGROUND_MS): boolean {
  return lastHiddenAt > 0 && Date.now() - lastHiddenAt < ms;
}

/**
 * Android/iOS WebView pauses performance.now() while the screen is locked.
 * Date.now() keeps moving, so a 40-minute lock looks like a huge wall/mono gap.
 */
export function isLikelyAppSleep(
  wallDelta: number,
  monoDelta: number,
  threshold = CLOCK_SKEW_MS,
): boolean {
  return wallDelta > threshold && monoDelta >= 0 && monoDelta < CLOCK_SLEEP_MONO_MAX_MS;
}

/** Wall vs monotonic desync. Screen-lock sleep is a separate check — do not fold it in here. */
export function isClockJump(wallDelta: number, monoDelta: number, threshold = CLOCK_SKEW_MS): boolean {
  return Math.abs(wallDelta - monoDelta) > threshold;
}

export type ClockSampleSource = 'tick' | 'resume' | 'guard';

/**
 * Sleep (WebView frozen) is only trusted after the app was in the background.
 * The same wall/mono gap while visible is a real clock change.
 */
export function classifyClockGap(
  wallDelta: number,
  monoDelta: number,
  source: ClockSampleSource,
  threshold = CLOCK_SKEW_MS,
): 'ok' | 'sleep' | 'jump' {
  const fromBackground = source === 'resume';
  if (fromBackground && isLikelyAppSleep(wallDelta, monoDelta, threshold)) return 'sleep';
  if (isClockJump(wallDelta, monoDelta, threshold)) return 'jump';
  return 'ok';
}

export function resetClockSample(): void {
  lastWall = Date.now();
  lastMono = performance.now();
  primed = true;
}

/** Compare wall clock vs monotonic time. Ignores the first sample after load. */
export function noteClockSample(source: ClockSampleSource = 'guard'): { jumped: boolean; slept: boolean } {
  const wall = Date.now();
  const mono = performance.now();
  const wallDelta = wall - lastWall;
  const monoDelta = mono - lastMono;
  lastWall = wall;
  lastMono = mono;
  if (!primed) {
    primed = true;
    return { jumped: false, slept: false };
  }
  const effective: ClockSampleSource =
    source === 'resume' || wasRecentlyBackgrounded() ? 'resume' : source;
  const kind = classifyClockGap(wallDelta, monoDelta, effective);
  return { jumped: kind === 'jump', slept: kind === 'sleep' };
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

/**
 * Returns false only when the clock is already a proven incident, or jumped
 * while the app was actually running (not after screen lock).
 * Sleep gaps must not emit an incident or drop a session.
 */
export function guardWallClock(source: ClockSampleSource = 'guard'): boolean {
  if (hasClockIncident()) return false;
  const { jumped, slept } = noteClockSample(source);
  if (slept) return true;
  if (jumped) {
    emitClockJump();
    return false;
  }
  return true;
}

export async function fetchServerNowMs(): Promise<number | null> {
  const fromHealth = await readDateHeader(`${supabaseUrl}/auth/v1/health`);
  if (fromHealth != null) return fromHealth;

  try {
    const res = await fetchWithTimeout('https://worldtimeapi.org/api/timezone/Etc/UTC');
    if (!res.ok) return null;
    const body = (await res.json()) as { unixtime?: number };
    if (typeof body.unixtime === 'number') return body.unixtime * 1000;
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { method: 'GET', signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function readDateHeader(url: string): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(url);
    const header = res.headers.get('date');
    if (!header) return null;
    const parsed = Date.parse(header);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
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

/** Sign-in / sign-up: block only when the device is proven skewed. CORS often hides Date. */
export async function assertDeviceClock(): Promise<{ ok: boolean; reason?: string }> {
  const status = await checkDeviceClock();
  if (status === 'skewed') {
    return {
      ok: false,
      reason: 'This device clock does not match server time. Set Date & Time to automatic (correct date), then try again. Your cloud backup is safe.',
    };
  }
  return { ok: true };
}
