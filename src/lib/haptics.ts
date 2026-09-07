import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { STORAGE_KEYS } from './storageKeys';

const VIBRATE_MS: Record<ImpactStyle, number> = {
  [ImpactStyle.Light]: 8,
  [ImpactStyle.Medium]: 16,
  [ImpactStyle.Heavy]: 28,
};

let pending: number[] = [];
let protectedUntil = 0;
let activePriority = 0;
let lastStarted = -Infinity;

function isHapticsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.haptics);
    if (raw === null) return true;
    return JSON.parse(raw) === true;
  } catch {
    return true;
  }
}

export function setHapticsPreference(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.haptics, JSON.stringify(enabled));
  } catch {
    /* quota */
  }
  if (!enabled) {
    clearPending();
    try { navigator.vibrate?.(0); } catch { /* Unsupported browser. */ }
  }
}

function clearPending() {
  pending.forEach((id) => window.clearTimeout(id));
  pending = [];
}

async function impact(style: ImpactStyle): Promise<void> {
  if (!isHapticsEnabled() || document.visibilityState === 'hidden') return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style });
      return;
    } catch {
      /* WebView without plugin — fall through */
    }
  }
  try {
    navigator.vibrate?.(VIBRATE_MS[style]);
  } catch {
    /* desktop / denied */
  }
}

function play(steps: Array<{ style: ImpactStyle; at: number }>, priority = 1): void {
  if (!isHapticsEnabled() || document.visibilityState === 'hidden') return;
  const now = Date.now();
  // Rapid checkbox/drag ticks must not turn into a buzz or cut off a result cue.
  if ((now - lastStarted < 55 && priority <= activePriority) || (now < protectedUntil && priority < activePriority)) return;
  clearPending();
  lastStarted = now;
  activePriority = priority;
  protectedUntil = now + steps[steps.length - 1].at + 55;
  for (const step of steps) {
    if (step.at <= 0) {
      void impact(step.style);
      continue;
    }
    pending.push(window.setTimeout(() => void impact(step.style), step.at));
  }
}

export function hapticTick() {
  play([{ style: ImpactStyle.Light, at: 0 }]);
}

export function hapticTap() {
  play([{ style: ImpactStyle.Medium, at: 0 }]);
}

/** Engine catch — start a sitting. */
export function hapticSessionStart() {
  play([
    { style: ImpactStyle.Light, at: 0 },
    { style: ImpactStyle.Medium, at: 65 },
  ], 2);
}

export function hapticSessionPause() {
  play([{ style: ImpactStyle.Medium, at: 0 }], 2);
}

export function hapticSuccess() {
  play([
    { style: ImpactStyle.Medium, at: 0 },
    { style: ImpactStyle.Light, at: 95 },
  ], 2);
}

export function hapticGoalComplete() {
  play([
    { style: ImpactStyle.Medium, at: 0 },
    { style: ImpactStyle.Heavy, at: 90 },
    { style: ImpactStyle.Light, at: 190 },
  ], 3);
}

export function hapticWarn() {
  play([
    { style: ImpactStyle.Medium, at: 0 },
    { style: ImpactStyle.Medium, at: 90 },
  ], 3);
}

export function hapticAmbient() {
  play([{ style: ImpactStyle.Light, at: 0 }]);
}
