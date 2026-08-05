import { useLocalStorage } from './useLocalStorage';

export interface Theme {
  darkMode: boolean;
  glassUI: boolean;
}

export const DEFAULT_THEME: Theme = {
  darkMode: true,
  glassUI: true,
};

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>('tudo-theme-v3', DEFAULT_THEME);
  const normalizedTheme: Theme = {
    darkMode: typeof theme?.darkMode === 'boolean' ? theme.darkMode : DEFAULT_THEME.darkMode,
    glassUI: typeof theme?.glassUI === 'boolean' ? theme.glassUI : DEFAULT_THEME.glassUI,
  };
  return [normalizedTheme, setTheme] as const;
}
