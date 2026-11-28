import { describe, expect, it } from 'vitest';
import type { Task, TaskSession } from '../types';
import { extraFocusForGoal } from './extraFocus';

const at = (iso: string) => new Date(iso).getTime();
const sitting = (taskId: string, start: string, minutes: number, extra: Partial<TaskSession> = {}): TaskSession => ({
  id: `${taskId}-${start}`, taskId, startTime: at(start), endTime: at(start) + minutes * 60000, pausedDuration: 0, pauses: [],
  netFocusMs: minutes * 60000, wallClockStart: '', wallClockEnd: '', completed: false, completedStepIndices: [], ...extra,
});
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id, title: id, description: '', priority: 'medium', targetDate: '2026-11-27', deadline: null, steps: [], progress: 0, createdAt: 0, order: 0, ...extra,
});

describe('Extra focus', () => {
  // 2026-11-27 is a Friday; its week starts Monday 23 Nov.
  const tasks = [task('pyq', { goalId: 'g1', title: 'Polity · 30 PYQs' }), task('step', { goalNodeId: 'n1', goalId: 'g1' }), task('other', { goalId: 'g2' })];
  const history = {
    pyq: [sitting('pyq', '2026-11-27T09:00:00', 48), sitting('pyq', '2026-11-26T09:00:00', 30), sitting('pyq', '2026-11-20T09:00:00', 60)],
    step: [sitting('step', '2026-11-27T11:00:00', 90, { goalNodeId: 'n1' })],
    other: [sitting('other', '2026-11-27T12:00:00', 20)],
    gone: [sitting('gone', '2026-11-25T08:00:00', 25, { goalId: 'g1' })],
  };

  it('adds this week’s quick-task focus for the goal only', () => {
    const extra = extraFocusForGoal('g1', history, tasks, '2026-11-27');
    expect(extra.weekMs).toBe((48 + 30 + 25) * 60000);
    expect(extra.rows.map((r) => [r.title, r.day, r.ms / 60000])).toEqual([
      ['Polity · 30 PYQs', '2026-11-27', 48],
      ['Polity · 30 PYQs', '2026-11-26', 30],
      ['Quick task', '2026-11-25', 25],
    ]);
  });

  it('is empty for a goal with no quick tasks', () => {
    expect(extraFocusForGoal('g3', history, tasks, '2026-11-27')).toEqual({ weekMs: 0, rows: [] });
  });
});
