import { describe, expect, it } from 'vitest';
import { sessionClockLabel, sessionClockRange } from './sessionClock';

describe('session clock labels', () => {
  it('renders a timezone-crossing pause as two instants in the same zone', () => {
    const start = Date.parse('2026-09-24T02:25:00Z');
    const end = Date.parse('2026-09-24T02:29:00Z');
    expect(sessionClockRange(start, end, '7:55 AM', '6:29 AM', 'Asia/Kolkata')).toBe('7:55 AM – 7:59 AM');
    expect(sessionClockRange(start, end, '7:55 AM', '6:29 AM', 'Asia/Dubai')).toBe('6:25 AM – 6:29 AM');
  });

  it('uses a saved label only when an older record has no usable instant', () => {
    expect(sessionClockLabel(Number.NaN, '8:00 AM', 'Asia/Kolkata')).toBe('8:00 AM');
  });
});
