import { readStorageRaw, STORAGE_KEYS } from './storageKeys';

/**
 * The app-wide accent. Each preset goes with a header landscape
 * (headerScenes.ts), so the sky and the app's colour always belong together:
 * Sand with the harvest fields, Slate with the Himalaya, Sage with the
 * Western Ghats. "Custom" is a colour picked from the user's own header
 * photo. Each accent is paired with the colour of the tick in the YouDO mark.
 * Dark mode uses the soft tone on near-black; light mode a deeper tone so
 * white text on a filled button stays readable.
 */
export const ACCENT_COLORS = ['sand', 'slate', 'sage'] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];
/** A preset, or the colour picked from the user's photo. */
export type AccentChoice = AccentColor | 'custom';

export interface AccentPair {
  label: string;
  /** The accent itself (buttons, links, rings) and the Y of the mark. */
  dark: string;
  light: string;
  /** The tick of the mark that sits with this accent. */
  tickDark: string;
  tickLight: string;
}

/** A colour picked from the user's photo, in its dark- and light-mode tones. */
export interface CustomAccent {
  dark: string;
  light: string;
}

const SAGE_TICK = { tickDark: '#8FB394', tickLight: '#4E7A57' };
const SAND_TICK = { tickDark: '#D6B784', tickLight: '#8C6A3A' };

export const ACCENT_SWATCHES: Record<AccentColor, AccentPair> = {
  sand: { label: 'Sand', dark: '#C9A46E', light: '#8C6A3A', ...SAGE_TICK },
  slate: { label: 'Slate', dark: '#8DA6C9', light: '#4A6A93', ...SAND_TICK },
  sage: { label: 'Sage', dark: '#8FB394', light: '#4E7A57', ...SAND_TICK },
};

export const DEFAULT_ACCENT: AccentColor = 'sand';

/** Accents that were offered before, moved to the nearest one now. */
const RETIRED_ACCENTS: Record<string, AccentColor> = {
  blue: 'slate',
  indigo: 'slate',
  teal: 'slate',
  purple: 'slate',
  plum: 'slate',
  graphite: 'slate',
  pink: 'sand',
  orange: 'sand',
  clay: 'sand',
  green: 'sage',
};

const HEX = /^#[0-9a-f]{6}$/i;

export function isCustomAccent(value: unknown): value is CustomAccent {
  const v = value as Partial<CustomAccent> | null;
  return Boolean(v && typeof v.dark === 'string' && typeof v.light === 'string' && HEX.test(v.dark) && HEX.test(v.light));
}

export function resolveAccent(theme: { accent?: string; custom?: unknown }): AccentChoice {
  const accent = theme.accent;
  if (accent === 'custom') return isCustomAccent(theme.custom) ? 'custom' : DEFAULT_ACCENT;
  if (accent && (ACCENT_COLORS as readonly string[]).includes(accent)) return accent as AccentColor;
  if (accent && accent in RETIRED_ACCENTS) return RETIRED_ACCENTS[accent];
  return DEFAULT_ACCENT;
}

// ── Colour maths (sRGB, HSL) ────────────────────────────────────────────────

export type Rgb = [number, number, number];

export function toHsl([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

/** The mark's tick for a custom accent: sage, unless the accent is green itself (then sand). */
function customTick(accent: CustomAccent): Pick<AccentPair, 'tickDark' | 'tickLight'> {
  const n = parseInt(accent.dark.slice(1), 16);
  const [h] = toHsl([n >> 16, (n >> 8) & 255, n & 255]);
  return h > 75 && h < 170 ? SAND_TICK : SAGE_TICK;
}

/** The colours of a theme's accent, preset or custom. */
export function accentSwatch(theme: { accent?: string; custom?: unknown }): AccentPair {
  const accent = resolveAccent(theme);
  if (accent === 'custom' && isCustomAccent(theme.custom)) {
    return { label: 'Your photo', dark: theme.custom.dark, light: theme.custom.light, ...customTick(theme.custom) };
  }
  return ACCENT_SWATCHES[accent === 'custom' ? DEFAULT_ACCENT : accent];
}

/** The saved theme's accent colours, for code outside React (widgets, notifications). */
export function storedAccentSwatch(): { swatch: AccentPair; darkMode: boolean } {
  try {
    const raw = readStorageRaw(STORAGE_KEYS.theme);
    const theme = (raw ? JSON.parse(raw) : null) as { darkMode?: boolean; accent?: string; custom?: unknown } | null;
    return { swatch: accentSwatch(theme ?? {}), darkMode: theme?.darkMode !== false };
  } catch {
    return { swatch: ACCENT_SWATCHES[DEFAULT_ACCENT], darkMode: true };
  }
}
