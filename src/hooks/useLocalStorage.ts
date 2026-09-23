import { useCallback, useEffect, useRef, useState } from 'react';
import { readStorageRaw, readWorkspaceJsonStrict } from '../lib/storageKeys';

type StorageOptions = { persist?: boolean; listen?: boolean; strict?: boolean; validate?: (value: unknown) => boolean };

export function useLocalStorage<T>(key: string, initial: T, options?: StorageOptions) {
  const isMounted = useRef(false);

  const [value, setValue] = useState<T>(() => {
    if (options?.strict) return readWorkspaceJsonStrict(key, initial, options.validate ?? (() => true));
    try {
      const raw = readStorageRaw(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  // Persist to localStorage on every change — but skip the very first render
  // since the value was just hydrated FROM localStorage (no need to write it back).
  useEffect(() => {
    if (options?.persist === false) return;
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota */
    }
  }, [key, value, options?.persist]);

  // Cross-tab sync: when another browser tab writes to the same key, apply it here.
  useEffect(() => {
    if (options?.listen === false) return;
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
  }, [key, options?.listen]);

  const reset = useCallback(() => setValue(initial), [initial]);

  return [value, setValue, reset] as const;
}
