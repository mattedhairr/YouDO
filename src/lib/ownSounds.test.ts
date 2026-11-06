import { describe, expect, it } from 'vitest';
import { OWN_SOUND_LIMIT, isOwnSoundId, parseOwnSounds } from './ownSounds';
import { fitLoop, formatSoundLength, nameFromFile } from './ownSoundFiles';

const RATE = 8000;

/** A tone of `seconds` at `level`, with optional silence before and after. */
function tone(seconds: number, level: number, { lead = 0, tail = 0 } = {}): Float32Array {
  const out = new Float32Array(Math.round((lead + seconds + tail) * RATE));
  const from = Math.round(lead * RATE);
  const to = from + Math.round(seconds * RATE);
  for (let i = from; i < to; i++) out[i] = level * Math.sin((2 * Math.PI * 220 * i) / RATE);
  return out;
}

describe('fitting a file to loop', () => {
  it('cuts silence at both ends so a repeat never drops out', () => {
    const fit = fitLoop([tone(30, 0.2, { lead: 3, tail: 8 })], RATE)!;
    expect(fit.start).toBeGreaterThan(2.8);
    expect(fit.start).toBeLessThanOrEqual(3);
    expect(fit.end).toBeGreaterThanOrEqual(33);
    expect(fit.end).toBeLessThan(33.2);
  });

  it('matches loudness: a quiet file is raised, a loud one lowered', () => {
    expect(fitLoop([tone(20, 0.02)], RATE)!.gain).toBeGreaterThan(3);
    expect(fitLoop([tone(20, 0.5)], RATE)!.gain).toBeLessThan(0.4);
  });

  it('never raises a file until it clips', () => {
    const loud = tone(20, 0.03);
    loud[RATE * 5] = 0.6; // one sharp peak
    const fit = fitLoop([loud], RATE)!;
    expect(0.6 * fit.gain).toBeLessThanOrEqual(0.89 + 1e-6);
  });

  it('turns down files that are silent or too short to loop', () => {
    expect(fitLoop([new Float32Array(RATE * 20)], RATE)).toBeNull();
    expect(fitLoop([tone(6, 0.2, { tail: 20 })], RATE)).toBeNull();
    expect(fitLoop([], RATE)).toBeNull();
  });
});

describe('the list of own sounds', () => {
  const row = { id: 'own-abcd1234', name: '  Rain   at night ', duration: 60, start: 1, end: 59, gain: 1.2, addedAt: 1 };

  it('keeps valid rows, tidies names and clamps points', () => {
    expect(parseOwnSounds([row])).toEqual([{ ...row, name: 'Rain at night' }]);
    expect(parseOwnSounds([{ ...row, end: 99, gain: 40 }])[0]).toMatchObject({ end: 60, gain: 4 });
  });

  it('drops broken, duplicate and extra rows', () => {
    expect(parseOwnSounds('nope')).toEqual([]);
    expect(parseOwnSounds([{ ...row, id: 'guitar' }, { ...row, start: 'a' }, row, row])).toHaveLength(1);
    const many = Array.from({ length: OWN_SOUND_LIMIT + 3 }, (_, i) => ({ ...row, id: `own-row-${i}` }));
    expect(parseOwnSounds(many)).toHaveLength(OWN_SOUND_LIMIT);
  });

  it('recognises own ids only', () => {
    expect(isOwnSoundId('own-1b2c3d4e')).toBe(true);
    expect(isOwnSoundId('forest')).toBe(false);
    expect(isOwnSoundId('own-<script>')).toBe(false);
  });
});

describe('names and lengths', () => {
  it('makes a readable name from a file name', () => {
    expect(nameFromFile('binks_sake-violin.mp3')).toBe('Binks sake violin');
    expect(nameFromFile('.m4a')).toBe('My sound');
  });

  it('formats a length as m:ss', () => {
    expect(formatSoundLength(222.4)).toBe('3:42');
    expect(formatSoundLength(9)).toBe('0:09');
  });
});
