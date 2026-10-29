import { STORAGE_KEYS } from './storageKeys';

/** The ambient timer as two-digit minutes and seconds: 00:00, 09:58, 1:39:58. */
export function formatAmbientTimer(totalSeconds: number): string {
  const { hours, minutes, seconds } = ambientDigits(totalSeconds);
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * What the ambient clock shows: minutes and seconds big, always two digits,
 * and the hours apart and small (0 when under an hour).
 */
export function ambientDigits(totalSeconds: number): { hours: number; minutes: string; seconds: string } {
  const s = Math.max(0, Math.floor(totalSeconds));
  return {
    hours: Math.floor(s / 3600),
    minutes: String(Math.floor((s % 3600) / 60)).padStart(2, '0'),
    seconds: String(s % 60).padStart(2, '0'),
  };
}

/** Largest drift of the whole face from centre, in px: the small text moves past its own strokes. */
export const DRIFT_RANGE = 8;

/**
 * Largest drift of the big digits, in px. Their strokes are about a tenth of the
 * digit height thick, so they must move further than the small text for the
 * middle of each stroke to leave its pixels. Matches --digit-size in ambient.css.
 */
export function ambientClockDriftRange(width: number, height: number): number {
  const digitSize = Math.min(width * 0.33, height * 0.56);
  return Math.max(DRIFT_RANGE, Math.round(digitSize * 0.12));
}

/**
 * Where the face sits after `step` minutes: a slow, repeating walk around the
 * centre, so no digit edge stays lit on the same pixels (OLED burn-in).
 */
export function ambientDrift(step: number, range = DRIFT_RANGE): { x: number; y: number } {
  const angle = step * 2.399963; // golden angle: points spread evenly, never repeat quickly
  const radius = range * Math.sqrt(((step % 12) + 1) / 12);
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}

/** Settings → Focus and streak: open the ambient clock when the phone turns sideways during a session. */
export function ambientAutoOpenEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.ambientAutoOpen) !== 'false';
  } catch {
    return true;
  }
}

export function setAmbientAutoOpen(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ambientAutoOpen, String(enabled));
  } catch {
    /* Restricted storage: the default (on) stays. */
  }
}

/**
 * A phone turned sideways, by the device's real rotation. The viewport is not
 * used: an on-screen keyboard shortens it, so typing a note looked "sideways"
 * and kept reopening the ambient clock. Touch screens only (not a laptop window).
 */
export function phoneIsSideways(
  screenInfo: { width: number; height: number; orientation?: { type?: string } } = window.screen,
  coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
): boolean {
  if (!coarsePointer) return false;
  const type = screenInfo.orientation?.type;
  const landscape = type ? type.startsWith('landscape') : screenInfo.width > screenInfo.height;
  return landscape && Math.min(screenInfo.width, screenInfo.height) <= 520;
}

export function ambientTipSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.ambientTipSeen) === 'true';
  } catch {
    return true;
  }
}

export function markAmbientTipSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ambientTipSeen, 'true');
  } catch {
    /* ignore */
  }
}
