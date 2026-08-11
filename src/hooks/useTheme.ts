import { useLocalStorage } from './useLocalStorage';

export interface Theme {
  darkMode: boolean; // Always true — dark mode only, no toggle
}

export const DEFAULT_THEME: Theme = {
  darkMode: true,
};

export function useTheme() {
  const [, setTheme] = useLocalStorage<Theme>('tudo-theme-v3', DEFAULT_THEME);
  // Permanently locked to dark, solid mode. glassUI removed.
  const normalizedTheme: Theme = { darkMode: true };
  return [normalizedTheme, setTheme] as const;
}
