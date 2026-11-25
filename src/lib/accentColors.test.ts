import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCENT_COLORS, ACCENT_SWATCHES, accentSwatch, DEFAULT_ACCENT, resolveAccent } from './accentColors';
import { accentFromColor, photoColors } from './photoAccent';

describe('accent colours', () => {
  it('offers three accents, one per header scene, with Sand as the default', () => {
    expect(ACCENT_COLORS).toEqual(['sand', 'slate', 'sage']);
    expect(DEFAULT_ACCENT).toBe('sand');
    expect(resolveAccent({})).toBe('sand');
  });

  it('moves every accent offered before to the nearest one now', () => {
    expect(resolveAccent({ accent: 'plum' })).toBe('slate');
    expect(resolveAccent({ accent: 'graphite' })).toBe('slate');
    expect(resolveAccent({ accent: 'clay' })).toBe('sand');
    expect(resolveAccent({ accent: 'blue' })).toBe('slate');
    expect(resolveAccent({ accent: 'purple' })).toBe('slate');
    expect(resolveAccent({ accent: 'pink' })).toBe('sand');
    expect(resolveAccent({ accent: 'green' })).toBe('sage');
    expect(resolveAccent({ accent: 'neon' })).toBe('sand');
  });

  it('uses a custom colour only when one was saved', () => {
    expect(resolveAccent({ accent: 'custom', custom: { dark: '#D98FA0', light: '#8A3A4E' } })).toBe('custom');
    expect(resolveAccent({ accent: 'custom' })).toBe('sand');
    expect(resolveAccent({ accent: 'custom', custom: { dark: 'pink', light: '#8A3A4E' } })).toBe('sand');
    expect(accentSwatch({ accent: 'custom', custom: { dark: '#D98FA0', light: '#8A3A4E' } })).toMatchObject({ dark: '#D98FA0', light: '#8A3A4E', tickDark: '#8FB394' });
    expect(accentSwatch({ accent: 'slate' })).toBe(ACCENT_SWATCHES.slate);
  });

  it('turns a photo colour into a soft dark-mode tone and a deeper light-mode one', () => {
    const lotus = accentFromColor([240, 143, 174]);
    expect(lotus.dark).toMatch(/^#[0-9A-F]{6}$/);
    const lightness = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return (Math.max(n >> 16, (n >> 8) & 255, n & 255) + Math.min(n >> 16, (n >> 8) & 255, n & 255)) / 510;
    };
    expect(lightness(lotus.dark)).toBeCloseTo(0.68, 1);
    expect(lightness(lotus.light)).toBeCloseTo(0.36, 1);
    // A grey photo still gets a hint of colour, never plain grey.
    const grey = accentFromColor([128, 128, 130]);
    expect(grey.dark).not.toBe('#ADADAD');
  });

  it('finds a photo’s main colours, most colourful first', () => {
    const px: number[] = [];
    const paint = (rgb: number[], n: number) => { for (let i = 0; i < n; i++) px.push(...rgb, 255); };
    paint([40, 60, 160], 600); // sky
    paint([230, 120, 150], 200); // flowers
    paint([60, 110, 70], 400); // leaves
    paint([250, 250, 250], 300); // white, left out
    const colors = photoColors(new Uint8ClampedArray(px), 5, 1);
    expect(colors.length).toBe(3);
    expect(colors.some(([r, g, b]) => r > 200 && g < 140 && b > 130)).toBe(true);
    expect(colors.every(([r, g, b]) => !(r > 240 && g > 240 && b > 240))).toBe(true);
    expect(photoColors(new Uint8ClampedArray(0))).toEqual([]);
  });

  it('never pairs an accent with a tick of the same colour', () => {
    for (const accent of ACCENT_COLORS) {
      const s = ACCENT_SWATCHES[accent];
      expect(s.tickDark.toLowerCase()).not.toBe(s.dark.toLowerCase());
      expect(s.tickLight.toLowerCase()).not.toBe(s.light.toLowerCase());
    }
  });

  it('keeps the stylesheet in sync with the palette', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    for (const accent of ACCENT_COLORS) {
      const s = ACCENT_SWATCHES[accent];
      expect(css).toContain(`html.dark[data-accent='${accent}'] { --primary: ${s.dark}; --accent-tick: ${s.tickDark}; }`);
      expect(css).toContain(`html.light-dusky[data-accent='${accent}'] { --primary: ${s.light}; --accent-tick: ${s.tickLight}; }`);
    }
    for (const retired of ['plum', 'clay', 'graphite']) expect(css).not.toContain(`data-accent='${retired}'`);
  });
});
