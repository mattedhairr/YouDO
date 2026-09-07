import { describe, expect, it } from 'vitest';
import { dialStep } from './calendarDial';
import { shiftLocalISO } from './dates';

describe('calendar dial', () => {
  it('moves one day for deliberate horizontal gestures, never vertical scrolling or taps', () => {
    expect(dialStep(-60, 4)).toBe(1);
    expect(dialStep(60, 4)).toBe(-1);
    expect(dialStep(20, 0)).toBe(0);
    expect(dialStep(40, 80)).toBe(0);
    expect(dialStep(40, 35)).toBe(0);
  });
  it('crosses month/year boundaries without clamping to a fixed three days', () => {
    expect(shiftLocalISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftLocalISO('2028-03-01', -1)).toBe('2028-02-29');
  });
});
