import { useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../lib/storageKeys';

export interface Theme {
  darkMode: boolean;
}

export const DEFAULT_THEME: Theme = {
  darkMode: true,
};

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>(STORAGE_KEYS.theme, DEFAULT_THEME);

  useEffect(() => {
    if (theme.darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light-dusky');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light-dusky');
    }
  }, [theme.darkMode]);

  return [theme, setTheme] as const;
}
