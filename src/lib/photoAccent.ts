import { toHsl, type CustomAccent, type Rgb } from './accentColors';

/**
 * Colours from the user's own photo for the accent (Settings → Appearance →
 * Scene and colour). Kept apart from accentColors.ts, which is in the first
 * screen's code: only the picker needs these.
 */

function toHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * A photo's colour made into an accent: a soft tone for dark mode and a
 * deeper one for light mode, with calm saturation, so text on a filled
 * button stays readable either way. Greys get a hint of colour.
 */
export function accentFromColor(rgb: Rgb): CustomAccent {
  const [h, s] = toHsl(rgb);
  return {
    dark: toHex(h, Math.min(0.5, Math.max(0.22, s)), 0.68),
    light: toHex(h, Math.min(0.55, Math.max(0.22, s)), 0.36),
  };
}

/**
 * A photo's main colours, for the accent picker: k-means over a sample of its
 * pixels (RGBA, as a canvas gives them), most colourful first, near-duplicates
 * and near-black or near-white areas left out. Runs on the phone.
 */
export function photoColors(pixels: Uint8ClampedArray, count = 5, step = 4): Rgb[] {
  const pts: Rgb[] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4 * step) {
    if (pixels[i + 3] < 128) continue;
    const p: Rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const l = toHsl(p)[2];
    if (l > 0.08 && l < 0.94) pts.push(p);
  }
  if (!pts.length) return [];
  const k = Math.min(count + 3, pts.length);
  let centres: Rgb[] = Array.from({ length: k }, (_, j) => pts[Math.floor(((j + 0.5) * pts.length) / k)].slice() as Rgb);
  let sizes = new Array<number>(k).fill(0);
  for (let round = 0; round < 10; round++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      const s = sums[best];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3]++;
    }
    centres = sums.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centres[j]) as Rgb);
    sizes = sums.map((s) => s[3]);
  }
  const distinct: Rgb[] = [];
  centres
    .map((c, j) => ({ c: c.map(Math.round) as Rgb, size: sizes[j] }))
    .filter((x) => x.size > 0)
    .sort((a, b) => toHsl(b.c)[1] * Math.sqrt(b.size) - toHsl(a.c)[1] * Math.sqrt(a.size))
    .forEach(({ c }) => {
      if (distinct.every((d) => Math.abs(d[0] - c[0]) + Math.abs(d[1] - c[1]) + Math.abs(d[2] - c[2]) > 60)) distinct.push(c);
    });
  return distinct.slice(0, count);
}
