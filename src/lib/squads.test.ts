import { describe, expect, it } from 'vitest';
import { paceHoursMatch } from './squads';

describe('paceHoursMatch', () => {
  it('matches equal squad and personal bar hours', () => {
    expect(paceHoursMatch(8, 8)).toBe(true);
    expect(paceHoursMatch(6.5, 6.5)).toBe(true);
  });

  it('treats tiny float drift as a match', () => {
    expect(paceHoursMatch(8, 8.005)).toBe(true);
  });

  it('rejects meaningfully different hours', () => {
    expect(paceHoursMatch(8, 6)).toBe(false);
    expect(paceHoursMatch(4, 8)).toBe(false);
  });
});
