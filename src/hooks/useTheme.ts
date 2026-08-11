import { useLocalStorage } from './useLocalStorage';

export interface Theme {
  darkMode: boolean; // Always true (Dark mode only)
  glassUI: boolean;  // Glass UI vs Solid UI toggle
}

export const DEFAULT_THEME: Theme = {
  darkMode: true,
  glassUI: true,
};

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>('tudo-theme-v3', DEFAULT_THEME);
  const normalizedTheme: Theme = {
    darkMode: true, // Enforce dark mode permanently
    glassUI: typeof theme?.glassUI === 'boolean' ? theme.glassUI : DEFAULT_THEME.glassUI,
  };
  return [normalizedTheme, setTheme] as const;
}
