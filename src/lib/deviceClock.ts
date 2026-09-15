import { supabaseUrl } from './supabase';

export const CLOCK_JUMP_EVENT = 'youdo-clock-jump';
export const CLOCK_CLEARED_EVENT = 'youdo-clock-cleared';
export const CLOCK_SKEW_MS = 3 * 60 * 1000;
/** If monotonic time barely moved, the WebView was frozen (screen lock) — not a clock change. */
export const CLOCK_SLEEP_MONO_MAX_MS = 60_000;
export const CLOCK_INCIDENT_KEY = 'youdo-clock-incident-v1';
const CLOCK_BOUNDARY_KEY = 'youdo-clock-boundary-v1';

let lastWall = Date.now();
let lastMono = performance.now();
let primed = false;
let lastHiddenAt = 0;
let requestSequence = 0;
let clockCheck: Promise<ClockCheck> | null = null;
let suspectedBoundary: number | null = null;

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
 * Other gaps are suspicions: suspension can delay visibility events too.
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
  const previousWall = lastWall;
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
  if (kind === 'jump' && suspectedBoundary == null) suspectedBoundary = previousWall;
  return { jumped: kind === 'jump', slept: kind === 'sleep' };
}

export function markClockIncident(): void {
  try {
    localStorage.setItem(CLOCK_INCIDENT_KEY, '1');
    if (suspectedBoundary != null) localStorage.setItem(CLOCK_BOUNDARY_KEY, String(suspectedBoundary));
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
  suspectedBoundary = null;
  try {
    localStorage.removeItem(CLOCK_INCIDENT_KEY);
    localStorage.removeItem(CLOCK_BOUNDARY_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CLOCK_CLEARED_EVENT));
}

/** Preserve the sample before the jump, not a heartbeat written while checking. */
export function clockIncidentBoundary(fallback: number): number {
  if (!hasClockIncident()) return fallback;
  let stored: number | null = null;
  try { const raw = localStorage.getItem(CLOCK_BOUNDARY_KEY); stored = raw ? Number(raw) : null; } catch { /* unavailable */ }
  const boundary = suspectedBoundary ?? stored;
  return boundary != null && Number.isFinite(boundary) ? Math.min(fallback, boundary) : fallback;
}

export function emitClockJump(): void {
  window.dispatchEvent(new Event(CLOCK_JUMP_EVENT));
}

/**
 * Only a server-confirmed incident blocks controls. A local discrepancy requests
 * verification, because WebView suspension can also interrupt monotonic samples.
 */
export function guardWallClock(source: ClockSampleSource = 'guard'): boolean {
  if (hasClockIncident()) return false;
  const { jumped, slept } = noteClockSample(source);
  if (slept) return true;
  if (jumped) {
    emitClockJump();
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
    if (typeof body.unixtime === 'number' && Number.isFinite(body.unixtime)) return body.unixtime * 1000;
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const freshUrl = new URL(url);
    freshUrl.searchParams.set('_youdo_clock', `${Date.now()}-${++requestSequence}`);
    return await fetch(freshUrl.toString(), { method: 'GET', cache: 'no-store', signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function readDateHeader(url: string): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (Number(res.headers.get('age') ?? 0) > 0) return null;
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
  if (clockCheck) return clockCheck;
  clockCheck = (async (): Promise<ClockCheck> => {
    const sample = async () => {
      const before = performance.now();
      const server = await fetchServerNowMs();
      const elapsed = performance.now() - before;
      // Long or interrupted requests cannot establish a precise clock offset.
      return server == null || elapsed < 0 || elapsed > 15_000 ? null : Date.now() - server - elapsed / 2;
    };
    const accept = (): ClockCheck => {
      resetClockSample();
      suspectedBoundary = null;
      if (hasClockIncident()) clearClockIncident();
      return 'ok';
    };
    const first = await sample();
    if (first == null) return 'unknown';
    if (Math.abs(first) <= CLOCK_SKEW_MS) return accept();
    const second = await sample();
    if (second == null) return 'unknown';
    if (Math.abs(second) <= CLOCK_SKEW_MS) return accept();
    return Math.sign(first) === Math.sign(second) && Math.abs(first - second) <= 30_000 ? 'skewed' : 'unknown';
  })();
  try {
    const result = await clockCheck;
    if (result === 'unknown' && !hasClockIncident()) suspectedBoundary = null;
    return result;
  }
  finally { clockCheck = null; }
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
