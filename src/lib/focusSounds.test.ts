import { describe, expect, it } from 'vitest';
import { DEFAULT_FOCUS_SOUND_PREFS, FOCUS_SOUNDS, focusSoundAction, loopWindow, parseFocusSoundPrefs } from './focusSounds';
import { generateNoise } from './focusSoundPlayer';

/** A repeatable random source, so noise tests are stable. */
function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe('focus sound settings', () => {
  it('keeps a valid choice and clamps the volume', () => {
    expect(parseFocusSoundPrefs({ sound: 'forest', volume: 1.4, keepPlaying: true })).toEqual({ sound: 'forest', volume: 1, keepPlaying: true });
    expect(parseFocusSoundPrefs({ sound: 'brown', volume: -2 })).toEqual({ sound: 'brown', volume: 0, keepPlaying: false });
  });

  it('falls back to no sound and the default volume for anything unknown', () => {
    expect(parseFocusSoundPrefs({ sound: 'rain', volume: 'loud', keepPlaying: 'yes' })).toEqual(DEFAULT_FOCUS_SOUND_PREFS);
    expect(parseFocusSoundPrefs(null)).toEqual(DEFAULT_FOCUS_SOUND_PREFS);
  });

  it('moves a retired music choice to the closest new track', () => {
    expect(parseFocusSoundPrefs({ sound: 'guitar' }).sound).toBe('strings-at-home');
    expect(parseFocusSoundPrefs({ sound: 'piano-jrpg' }).sound).toBe('piano-first-light');
    expect(parseFocusSoundPrefs({ sound: 'piano-catmint' }).sound).toBe('piano-first-light');
  });

  it('keeps an own sound only while it is still on this phone', () => {
    expect(parseFocusSoundPrefs({ sound: 'own-abcd1234' }, ['own-abcd1234']).sound).toBe('own-abcd1234');
    expect(parseFocusSoundPrefs({ sound: 'own-abcd1234' }, []).sound).toBeNull();
  });
});

describe('built-in sounds', () => {
  it('have unique ids, a file unless generated, and a group', () => {
    expect(new Set(FOCUS_SOUNDS.map((s) => s.id)).size).toBe(FOCUS_SOUNDS.length);
    for (const s of FOCUS_SOUNDS) {
      expect(s.kind === 'noise' ? !s.src : !!s.src?.startsWith('sounds/')).toBe(true);
      expect(['music', 'nature', 'noise']).toContain(s.group);
    }
  });
});

describe('loop window', () => {
  it('plays the whole file by default, blending over at most a quarter of it', () => {
    expect(loopWindow({}, 100)).toEqual({ start: 0, end: 100, length: 100, fade: 4 });
    expect(loopWindow({ fade: 6 }, 12)).toEqual({ start: 0, end: 12, length: 12, fade: 3 });
  });

  it('keeps trim points inside the file', () => {
    expect(loopWindow({ start: 2, end: 50, fade: 6 }, 40)).toEqual({ start: 2, end: 40, length: 38, fade: 6 });
    expect(loopWindow({ start: -3, end: 30 }, 40).start).toBe(0);
  });
});

describe('focus sound follows the session', () => {
  const base = { session: true, paused: false, sound: 'violin-space-arp' as const, visible: true, keepPlaying: false };

  it('plays while the timer runs, pauses with it, and stops without a session or a sound', () => {
    expect(focusSoundAction(base)).toBe('play');
    expect(focusSoundAction({ ...base, paused: true })).toBe('pause');
    expect(focusSoundAction({ ...base, session: false })).toBe('stop');
    expect(focusSoundAction({ ...base, sound: null })).toBe('stop');
  });

  it('pauses when you leave the app, unless Keep playing is on', () => {
    expect(focusSoundAction({ ...base, visible: false })).toBe('pause');
    expect(focusSoundAction({ ...base, visible: false, keepPlaying: true })).toBe('play');
    expect(focusSoundAction({ ...base, visible: false, keepPlaying: true, paused: true })).toBe('pause');
  });
});

describe('generated noise', () => {
  for (const kind of ['brown', 'pink'] as const) {
    it(`makes ${kind} noise of the right length, in range, with a soft loop point`, () => {
      const out = generateNoise(kind, 48000, seeded());
      expect(out).toHaveLength(48000);
      let peak = 0;
      let step = 0;
      for (let i = 1; i < out.length; i++) {
        peak = Math.max(peak, Math.abs(out[i]));
        step = Math.max(step, Math.abs(out[i] - out[i - 1]));
      }
      expect(peak).toBeGreaterThan(0.01);
      expect(peak).toBeLessThanOrEqual(1);
      // Where the loop joins (last sample to first), the jump is no bigger than any step inside it.
      expect(Math.abs(out[0] - out[out.length - 1])).toBeLessThanOrEqual(step + 1e-6);
    });
  }
});
