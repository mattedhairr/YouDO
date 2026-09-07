import { useLayoutEffect, useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from '../lib/storageKeys';

const EVENT = 'youdo-effects-change';
let memoryPreference: boolean | undefined;
export function reducedEffectsSnapshot(): boolean {
  if (memoryPreference !== undefined) return memoryPreference;
  try {
    const value = localStorage.getItem(STORAGE_KEYS.reducedEffects);
    if (value === 'true' || value === 'false') return value === 'true';
  } catch { /* Restricted storage: respect the device preference. */ }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export function setReducedEffects(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEYS.reducedEffects, String(enabled));
    memoryPreference = undefined;
  } catch { memoryPreference = enabled; }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(notify: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const changed = () => notify();
  window.addEventListener(EVENT, changed);
  window.addEventListener('storage', changed);
  if (media.addEventListener) media.addEventListener('change', changed);
  else media.addListener(changed);
  return () => {
    window.removeEventListener(EVENT, changed);
    window.removeEventListener('storage', changed);
    if (media.removeEventListener) media.removeEventListener('change', changed);
    else media.removeListener(changed);
  };
}
export function useReducedEffects() {
  const reduced = useSyncExternalStore(subscribe, reducedEffectsSnapshot, () => true);
  useLayoutEffect(() => {
    document.documentElement.dataset.reducedEffects = String(reduced);
  }, [reduced]);
  return [reduced, setReducedEffects] as const;
}
