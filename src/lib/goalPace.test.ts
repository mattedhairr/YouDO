import { describe, expect, it } from 'vitest';
import type { GoalNode } from '../types';
import { currentStage, daysUntil, goalPace } from './goalPace';

const node = (id: string, extra: Partial<GoalNode> = {}): GoalNode => ({ id, kind: 'node', title: id, children: [], createdAt: 0, ...extra });
const leaves = (n: number, done = 0) => Array.from({ length: n }, (_, i) => node(`l${i}`, { completed: i < done }));
const open = (n: GoalNode): number => (n.children.length ? n.children.reduce((sum, c) => sum + open(c), 0) : n.completed ? 0 : 1);

// Planned one stage at a time: phase 3 is under way, phase 4 has barely anything in it.
const goal = node('GATE', {
  kind: 'goal', endDate: '2026-12-31',
  children: [
    node('Phase 1', { endDate: '2026-10-01', children: leaves(2, 2) }),
    node('Phase 2', { children: leaves(5, 4) }),
    node('Phase 3', { startDate: '2026-10-20', endDate: '2026-11-15', children: leaves(20) }),
    node('Phase 4', { startDate: '2026-11-16', endDate: '2026-12-10', children: leaves(2) }),
  ],
});

describe('goalPace', () => {
  it('counts days to a date, 0 on the day', () => {
    expect(daysUntil('2026-12-31', '2026-10-29')).toBe(63);
    expect(daysUntil('2026-10-29', '2026-10-29')).toBe(0);
  });

  it('paces the stage in progress, not the stages planned later', () => {
    expect(currentStage(goal, '2026-10-29')?.title).toBe('Phase 3');
    expect(goalPace(goal, '2026-12-31', open, '2026-10-29')).toMatchObject({ stage: { title: 'Phase 3' }, open: 20, daysLeft: 17 });
  });

  it('skips finished, ended and not yet started stages, and single dated items', () => {
    expect(currentStage(node('g', { children: [node('Mock test', { endDate: '2026-11-01' })] }), '2026-10-29')).toBeNull();
    expect(currentStage(goal, '2026-09-15')).toBeNull(); // phase 1 is done; 3 and 4 have not started
    expect(currentStage(goal, '2026-11-20')?.title).toBe('Phase 4');
  });

  it('falls back to the whole goal, as planned so far, without dated stages', () => {
    const undated = node('Spanish', { kind: 'goal', children: leaves(10, 4) });
    expect(goalPace(undated, '2026-11-08', open, '2026-10-29')).toEqual({ stage: null, open: 6, daysLeft: 10 });
    expect(goalPace(undated, undefined, open, '2026-10-29')).toBeNull();
  });
});
