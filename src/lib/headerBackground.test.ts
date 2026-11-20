import { describe, expect, it } from 'vitest';
import { DEFAULT_HEADER_BACKGROUND, fitPhotoSize, normalizeHeaderBackground } from './headerBackground';

describe('header background settings', () => {
  it('fall back to the sky for anything missing or broken', () => {
    expect(normalizeHeaderBackground(null)).toEqual(DEFAULT_HEADER_BACKGROUND);
    expect(normalizeHeaderBackground('photo')).toEqual(DEFAULT_HEADER_BACKGROUND);
    expect(normalizeHeaderBackground({ mode: 'video', x: 'left', opacity: NaN })).toEqual(DEFAULT_HEADER_BACKGROUND);
  });

  it('keep a photo choice and clamp the sliders to their ranges', () => {
    expect(normalizeHeaderBackground({ mode: 'photo', x: 140, y: -5, opacity: 0.05 })).toEqual({ mode: 'photo', x: 100, y: 0, opacity: 0.2 });
    expect(normalizeHeaderBackground({ mode: 'photo', x: 30, y: 70, opacity: 0.6 })).toEqual({ mode: 'photo', x: 30, y: 70, opacity: 0.6 });
    expect(normalizeHeaderBackground({ mode: 'summit' }).mode).toBe('summit');
  });
});

describe('header photo size', () => {
  it('scales a large photo down to 1600 on its long side, keeping its shape', () => {
    expect(fitPhotoSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitPhotoSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('leaves a small photo as it is', () => {
    expect(fitPhotoSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitPhotoSize(0, 600)).toEqual({ width: 0, height: 0 });
  });
});
