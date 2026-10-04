import { describe, expect, it } from 'vitest';
import type { PaceRow } from './paceBoard';
import { collectiveBarPercent, computeSquadBarProgress } from '../components/squad/SquadProgressBoard';

const anchorISO = '2026-10-04';

function row(todayMs: number): PaceRow {
  return {
    userId: 'u1',
    displayName: 'Tester',
    examLabel: 'GATE',
    todayMs,
    weekMs: 0,
    monthMs: 0,
    todayKey: anchorISO,
    streak: 1,
    barHours: 8,
    updatedAt: '2026-10-04T12:00:00Z',
  };
}

describe('computeSquadBarProgress', () => {
  it('computes percent of squad bar for today window', () => {
    const eightHoursMs = 8 * 60 * 60 * 1000;
    const progress = computeSquadBarProgress(row(eightHoursMs / 2), 8, 'today', anchorISO);
    expect(progress.percent).toBe(50);
    expect(progress.percentRaw).toBe(50);
    expect(progress.overMs).toBe(0);
  });

  it('caps fill at 100% and tracks over-bar time', () => {
    const eightHoursMs = 8 * 60 * 60 * 1000;
    const twoHoursOver = 2 * 60 * 60 * 1000;
    const progress = computeSquadBarProgress(row(eightHoursMs + twoHoursOver), 8, 'today', anchorISO);
    expect(progress.percent).toBe(100);
    expect(progress.percentRaw).toBeGreaterThan(100);
    expect(progress.overMs).toBe(twoHoursOver);
  });
});

describe('collectiveBarPercent', () => {
  it('averages member percentRaw values', () => {
    const eightHoursMs = 8 * 60 * 60 * 1000;
    const members = [
      { progress: computeSquadBarProgress(row(0), 8, 'today', anchorISO) },
      { progress: computeSquadBarProgress(row(eightHoursMs), 8, 'today', anchorISO) },
    ];
    expect(collectiveBarPercent(members)).toBe(50);
  });

  it('returns 0 when there are no members', () => {
    expect(collectiveBarPercent([])).toBe(0);
  });
});
