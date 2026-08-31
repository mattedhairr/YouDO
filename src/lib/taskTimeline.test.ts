import { describe, expect, it } from 'vitest';
import type { Task, TaskSession } from '../types';
import { taskCompletionModeOnDate, taskOccurrenceOnDate, taskTimelineDates } from './taskTimeline';

function task(patch: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Revise topic',
    description: '',
    priority: 'medium',
    targetDate: '2026-08-20',
    deadline: null,
    steps: ['Watch', 'Notes'],
    progress: 2,
    createdAt: 1,
    order: 0,
    ...patch,
  };
}

function session(
  id: string,
  date: string,
  completedStepIndices: number[],
  patch: Partial<TaskSession> = {},
): TaskSession {
  const startTime = new Date(`${date}T10:00:00`).getTime();
  return {
    id,
    taskId: 'task-1',
    startTime,
    endTime: startTime + 60_000,
    pausedDuration: 0,
    pauses: [],
    netFocusMs: 60_000,
    wallClockStart: '10:00 AM',
    wallClockEnd: '10:01 AM',
    completed: completedStepIndices.length > 0 ? 'partial' : false,
    completedStepIndices,
    ...patch,
  };
}

describe('task Plan timeline', () => {
  it('keeps a normal process completion only on its scheduled date', () => {
    const item = task();
    expect(taskTimelineDates(item)).toEqual(['2026-08-20']);
    expect(taskOccurrenceOnDate(item, '2026-08-20', '2026-08-31')).toEqual({
      date: '2026-08-20',
      kind: 'scheduled',
      resolved: true,
      completedOnDate: true,
    });
  });

  it('fades both occurrences after backlog completion while preserving the original failure', () => {
    const item = task({
      targetDate: '2026-08-24',
      originalTargetDate: '2026-08-20',
      pastFailedNativeDates: ['2026-08-20'],
    });
    expect(taskOccurrenceOnDate(item, '2026-08-20', '2026-08-31')).toEqual({
      date: '2026-08-20',
      kind: 'failed',
      resolved: true,
      completedOnDate: false,
    });
    expect(taskOccurrenceOnDate(item, '2026-08-24', '2026-08-31')).toEqual({
      date: '2026-08-24',
      kind: 'backlog-completed',
      resolved: true,
      completedOnDate: true,
    });
  });

  it('keeps an unresolved failed task unfaded until it is completed later', () => {
    const item = task({ targetDate: '2026-08-20', progress: 1 });
    expect(taskOccurrenceOnDate(item, '2026-08-20', '2026-08-31')).toEqual({
      date: '2026-08-20',
      kind: 'failed',
      resolved: false,
      completedOnDate: false,
    });
  });

  it('preserves a failed occurrence when backlog is rescheduled as normal work', () => {
    const replanned = task({
      targetDate: '2026-09-02',
      progress: 1,
      pastFailedNativeDates: ['2026-08-20'],
    });

    expect(taskTimelineDates(replanned)).toEqual(['2026-09-02', '2026-08-20']);
    expect(taskOccurrenceOnDate(replanned, '2026-08-20', '2026-08-31')).toEqual({
      date: '2026-08-20',
      kind: 'failed',
      resolved: false,
      completedOnDate: false,
    });
    expect(taskOccurrenceOnDate(replanned, '2026-09-02', '2026-09-02')).toEqual({
      date: '2026-09-02',
      kind: 'scheduled',
      resolved: false,
      completedOnDate: false,
    });

    const completed = { ...replanned, progress: 2 };
    expect(taskOccurrenceOnDate(completed, '2026-08-20', '2026-09-02')).toMatchObject({
      kind: 'failed',
      resolved: true,
      completedOnDate: false,
    });
    expect(taskOccurrenceOnDate(completed, '2026-09-02', '2026-09-02')).toMatchObject({
      kind: 'scheduled',
      resolved: true,
      completedOnDate: true,
    });
  });

  it('preserves the original result of a five-task day after later backlog completion', () => {
    const originalDate = '2026-08-20';
    const completed = [0, 1, 2].map((index) => task({ id: `done-${index}` }));
    const missed = [0, 1].map((index) => task({ id: `missed-${index}`, progress: 1 }));
    const originalOccurrences = [...completed, ...missed]
      .map((item) => taskOccurrenceOnDate(item, originalDate, '2026-08-31'))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    expect(originalOccurrences).toHaveLength(5);
    expect(originalOccurrences.filter((item) => item.completedOnDate)).toHaveLength(3);
    expect(originalOccurrences.filter((item) => item.kind === 'failed')).toHaveLength(2);

    const resolvedBacklog = task({
      id: 'missed-0',
      targetDate: '2026-08-24',
      originalTargetDate: originalDate,
      pastFailedNativeDates: [originalDate],
    });
    expect(taskOccurrenceOnDate(resolvedBacklog, originalDate, '2026-08-31')).toMatchObject({
      kind: 'failed',
      resolved: true,
      completedOnDate: false,
    });
    expect(taskOccurrenceOnDate(resolvedBacklog, '2026-08-24', '2026-08-31')).toMatchObject({
      kind: 'backlog-completed',
      resolved: true,
      completedOnDate: true,
    });
  });

  it('distinguishes process, manual, and mixed completion', () => {
    const item = task();
    const process = session('process', '2026-08-20', [0, 1], { completed: true });
    const manual = session('manual', '2026-08-20', [1], {
      endTime: new Date('2026-08-20T10:00:00').getTime(),
      netFocusMs: 0,
      manual: true,
    });

    expect(taskCompletionModeOnDate(item, '2026-08-20', [process])).toBe('process');
    expect(taskCompletionModeOnDate(item, '2026-08-20', [manual])).toBe('manual');
    expect(taskCompletionModeOnDate(item, '2026-08-20', [session('process-step', '2026-08-20', [0]), manual])).toBe('mixed');
    expect(taskCompletionModeOnDate(item, '2026-08-20', [])).toBe('manual');
  });

  it('keeps completion mode on the backlog clear date, not the failed date', () => {
    const item = task({
      targetDate: '2026-08-24',
      originalTargetDate: '2026-08-20',
      pastFailedNativeDates: ['2026-08-20'],
    });
    const process = session('process-clear', '2026-08-24', [0]);
    const manual = session('manual-clear', '2026-08-24', [1], {
      endTime: new Date('2026-08-24T10:00:00').getTime(),
      netFocusMs: 0,
      manual: true,
    });

    expect(taskCompletionModeOnDate(item, '2026-08-20', [process, manual])).toBeNull();
    expect(taskCompletionModeOnDate(item, '2026-08-24', [process, manual])).toBe('mixed');
  });
});
