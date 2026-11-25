import { useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { readStorageRaw, STORAGE_KEYS } from '../lib/storageKeys';
import { accentSwatch, DEFAULT_ACCENT, resolveAccent, type AccentChoice, type CustomAccent } from '../lib/accentColors';

export interface Theme {
  darkMode: boolean;
  /** Optional so themes stored before v8 keep loading unchanged. */
  accent?: AccentChoice;
  /** The colour picked from the user's header photo, when the accent is "custom". */
  custom?: CustomAccent;
}

export const DEFAULT_THEME: Theme = {
  darkMode: true,
  accent: DEFAULT_ACCENT,
};

function applyMode(darkMode: boolean) {
  document.documentElement.classList.toggle('dark', darkMode);
  document.documentElement.classList.toggle('light-dusky', !darkMode);
}

/**
 * The accent on the page: presets through index.css (data-accent), a custom
 * colour as inline variables on <html>, in the tone for the current mode.
 */
function applyAccent(theme: Theme) {
  const root = document.documentElement;
  const accent = resolveAccent(theme);
  root.dataset.accent = accent;
  if (accent === 'custom') {
    const swatch = accentSwatch(theme);
    root.style.setProperty('--primary', theme.darkMode ? swatch.dark : swatch.light);
    root.style.setProperty('--accent-tick', theme.darkMode ? swatch.tickDark : swatch.tickLight);
  } else {
    root.style.removeProperty('--primary');
    root.style.removeProperty('--accent-tick');
  }
}

/** Puts the saved mode and accent on the page before it first paints, so the
 *  start screen already wears them. */
export function applyStoredTheme(): void {
  let theme: Theme = DEFAULT_THEME;
  try {
    const raw = readStorageRaw(STORAGE_KEYS.theme);
    if (raw) theme = (JSON.parse(raw) as Theme | null) ?? DEFAULT_THEME;
  } catch {
    /* keep the default look */
  }
  applyMode(Boolean(theme.darkMode));
  applyAccent(theme);
}

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<Theme>(STORAGE_KEYS.theme, DEFAULT_THEME);
  const accent = resolveAccent(theme);
  const customDark = theme.custom?.dark;
  const customLight = theme.custom?.light;

  useEffect(() => {
    applyMode(Boolean(theme.darkMode));
  }, [theme.darkMode]);

  useEffect(() => {
    applyAccent({ darkMode: theme.darkMode, accent, custom: customDark && customLight ? { dark: customDark, light: customLight } : undefined });
  }, [accent, theme.darkMode, customDark, customLight]);

  return [theme, setTheme] as const;
}
