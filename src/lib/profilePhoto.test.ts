import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { baseScale, clampCrop, cropSource, MAX_ZOOM, photoPath } from './profilePhoto';

describe('cropping a profile photo', () => {
  it('fills the frame with the shorter side at zoom 1', () => {
    expect(baseScale(1200, 800, 300)).toBeCloseTo(300 / 800);
    expect(cropSource({ zoom: 1, x: 0, y: 0 }, 1200, 800, 300)).toEqual({ sx: 200, sy: 0, size: 800 });
  });

  it('keeps the frame covered: no edge can be dragged into the circle', () => {
    // At zoom 1 a landscape photo moves only sideways, at most half the spare width.
    const crop = clampCrop({ zoom: 1, x: 999, y: 999 }, 1200, 800, 300);
    expect(crop.y).toBe(0);
    expect(crop.x).toBeCloseTo((1200 * (300 / 800) - 300) / 2);
    const source = cropSource({ zoom: 1, x: 999, y: 0 }, 1200, 800, 300);
    expect(source.sx).toBeCloseTo(0);
    expect(source.size).toBeCloseTo(800);
  });

  it('zooms in on the middle and keeps zoom between 1 and the maximum', () => {
    expect(cropSource({ zoom: 2, x: 0, y: 0 }, 1000, 1000, 250)).toEqual({ sx: 250, sy: 250, size: 500 });
    expect(clampCrop({ zoom: 0.2, x: 0, y: 0 }, 1000, 1000, 250).zoom).toBe(1);
    expect(clampCrop({ zoom: 99, x: 0, y: 0 }, 1000, 1000, 250).zoom).toBe(MAX_ZOOM);
    expect(clampCrop({ zoom: Number.NaN, x: Number.NaN, y: 0 }, 1000, 1000, 250)).toEqual({ zoom: 1, x: 0, y: 0 });
  });

  it('moving the photo right shows more of its left side', () => {
    const left = cropSource({ zoom: 2, x: 50, y: 0 }, 1000, 1000, 250);
    expect(left.sx).toBeLessThan(250);
  });
});

describe('finding your photo in storage', () => {
  const url = 'https://abc.supabase.co/storage/v1/object/public/avatars/u1/1764000000000.webp';
  it('reads the path of your own photo only', () => {
    expect(photoPath(url, 'u1')).toBe('u1/1764000000000.webp');
    expect(photoPath(url, 'u2')).toBeNull();
    expect(photoPath('🎓', 'u1')).toBeNull();
    expect(photoPath(undefined, 'u1')).toBeNull();
  });
});
