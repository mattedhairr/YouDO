import { useCallback, useEffect, useRef, useState } from 'react';
import { readStorageRaw } from '../lib/storageKeys';

export function useLocalStorage<T>(key: string, initial: T) {
  const isMounted = useRef(false);

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = readStorageRaw(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  // Persist to localStorage on every change — but skip the very first render
  // since the value was just hydrated FROM localStorage (no need to write it back).
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota */
    }
  }, [key, value]);

  // Cross-tab sync: when another browser tab writes to the same key, apply it here.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== key || e.newValue === null) return;
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        /* ignore malformed external writes */
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [key]);

  const reset = useCallback(() => setValue(initial), [initial]);

  return [value, setValue, reset] as const;
}
