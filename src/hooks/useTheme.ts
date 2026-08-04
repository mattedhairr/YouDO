import { useLocalStorage } from './useLocalStorage';

export interface Theme {
  darkMode: boolean;
}

export const DEFAULT_THEME: Theme = {
  darkMode: false,
};

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>('tudo-theme-v3', DEFAULT_THEME);
  return [theme, setTheme] as const;
}
