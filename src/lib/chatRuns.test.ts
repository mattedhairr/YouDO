import { describe, expect, it } from 'vitest';
import { chatDayLabels, chatRuns, nameTone, NAME_TONES } from './chatRuns';

const t = (h: number, m: number, day = 24) => new Date(2026, 10, day, h, m).getTime();

describe('chat runs', () => {
  it('groups one person\'s messages in a row', () => {
    const runs = chatRuns([
      { author: 'a', at: t(18, 0) },
      { author: 'a', at: t(18, 1) },
      { author: 'b', at: t(18, 2) },
      { author: 'a', at: t(18, 3) },
    ]);
    expect(runs).toEqual([
      { first: true, last: false },
      { first: false, last: true },
      { first: true, last: true },
      { first: true, last: true },
    ]);
  });

  it('starts a new run after five quiet minutes, a new day or a system line', () => {
    expect(chatRuns([{ author: 'a', at: t(18, 0) }, { author: 'a', at: t(18, 6) }])[1].first).toBe(true);
    expect(chatRuns([{ author: 'a', at: t(23, 59, 23) }, { author: 'a', at: t(0, 1) }])[1].first).toBe(true);
    expect(chatRuns([{ author: 'a' }, { alone: true }, { author: 'a' }])[2].first).toBe(true);
  });

  it('joins messages without times by author alone', () => {
    expect(chatRuns([{ author: 'a' }, { author: 'a' }])).toEqual([{ first: true, last: false }, { first: false, last: true }]);
  });

  it('never joins messages with no author', () => {
    expect(chatRuns([{ author: null }, { author: null }])[1].first).toBe(true);
  });
});

describe('day labels', () => {
  it('labels the first message of each day', () => {
    const now = new Date(2026, 10, 24, 20, 0);
    expect(chatDayLabels([t(22, 0, 23), t(23, 0, 23), t(9, 0), undefined, t(10, 0)], now))
      .toEqual(['Yesterday', null, 'Today', null, null]);
    expect(chatDayLabels([t(9, 0, 20)], now)[0]).toMatch(/20/);
  });
});

describe('name colours', () => {
  it('gives each person one stable colour', () => {
    expect(nameTone('user-1')).toBe(nameTone('user-1'));
    expect(nameTone(undefined)).toBe(0);
    const tones = new Set(['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'].map(nameTone));
    expect(tones.size).toBeGreaterThan(2);
    for (const tone of tones) expect(tone).toBeLessThan(NAME_TONES);
  });
});
