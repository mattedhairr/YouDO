import { describe, expect, it } from 'vitest';
import { formatDDMMYYYY, localISODate, todayISO } from './dates';
import { formatDuration, formatElapsed, sessionEfficiency } from './format';
import { computeNetFocusMs, finalizeSession, isCountableSession, splitSessionByLocalDate, clampSessionEnd } from './sessionStats';
import { clearRollupCache, cloneNode, clearBacklogIfComplete, isBacklogTask, isOpenBacklogTask, isTaskComplete, mirrorGoalContentToTask, rollupPct, sanitizeTreeAndTasks } from './goalTree';
import type { GoalNode, Task } from '../types';

describe('dates', () => {
  it('formats ISO dates as DD-MM-YYYY', () => {
    expect(formatDDMMYYYY('2026-08-14')).toBe('14-08-2026');
    expect(formatDDMMYYYY(null)).toBe('');
  });

  it('builds local ISO dates without UTC drift', () => {
    expect(localISODate(new Date(2026, 7, 14))).toBe('2026-08-14');
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('format', () => {
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(60_000)).toBe('1 min');
    expect(formatDuration(3_600_000)).toBe('1h');
    expect(formatDuration(7 * 60_000 + 40_000)).toBe('7m 40s');
  });

  it('formats elapsed clocks and efficiency', () => {
    expect(formatElapsed(65)).toBe('01:05');
    expect(formatElapsed(3661)).toBe('01:01:01');
    expect(sessionEfficiency(45, 60)).toBe(75);
    expect(sessionEfficiency(10, 0)).toBe(0);
  });
});

describe('session math', () => {
  const base = {
    taskId: 't1',
    startTime: 1_000_000,
    pausedDuration: 0,
    isPaused: false,
    lastHeartbeat: 1_000_000,
    pauses: [] as { start: number; end?: number }[],
    wallClockStart: '10:00 AM',
  };

  it('drops sub-15s accidental sessions', () => {
    expect(finalizeSession(base, 1_005_000, { completed: false }, undefined)).toBeNull();
  });

  it('subtracts pause time from net focus', () => {
    const paused = {
      ...base,
      isPaused: true,
      pauseStart: 1_060_000,
      pausedDuration: 0,
      pauses: [{ start: 1_060_000, wallClockStart: '10:01 AM' }],
    };
    expect(computeNetFocusMs(paused, 1_120_000)).toBe(60_000);
    const rec = finalizeSession(paused, 1_120_000, { completed: true }, 'g1');
    expect(rec?.netFocusMs).toBe(60_000);
    expect(isCountableSession(rec!)).toBe(true);
  });

  it('counts phone-off time as focus when finalizing later', () => {
    const stale = { ...base, lastHeartbeat: 1_000_000 };
    const rec = finalizeSession(stale, 1_000_000 + 10 * 60_000, { completed: false });
    expect(rec).not.toBeNull();
    expect(rec!.netFocusMs).toBe(10 * 60_000);
  });

  it('can cut a forgotten tail at an earlier end time', () => {
    const rec = finalizeSession(base, 1_000_000 + 5 * 60_000, { completed: true }, 'g1', {
      ignoreOpenPause: true,
    });
    expect(rec!.endTime).toBe(1_000_000 + 5 * 60_000);
    expect(rec!.netFocusMs).toBe(5 * 60_000);
  });

  it('clamps backward clocks and absurd forward jumps', () => {
    expect(clampSessionEnd(1_000_000, 900_000)).toBe(1_000_000);
    const rec = finalizeSession(base, 1_000_000 + 30 * 24 * 60 * 60 * 1000, { completed: false });
    expect(rec!.endTime - rec!.startTime).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('splits overnight sessions onto both local dates', () => {
    const start = new Date(2026, 7, 14, 23, 0, 0).getTime();
    const end = new Date(2026, 7, 15, 1, 0, 0).getTime();
    const slices = splitSessionByLocalDate({
      startTime: start,
      endTime: end,
      netFocusMs: end - start,
      pauses: [],
    });
    expect(slices).toHaveLength(2);
    expect(slices[0].date).toBe('2026-08-14');
    expect(slices[1].date).toBe('2026-08-15');
    expect(slices[0].netFocusMs + slices[1].netFocusMs).toBe(end - start);
  });
});

describe('goal tree', () => {
  const leaf = (partial: Partial<GoalNode>): GoalNode => ({
    id: 'leaf',
    kind: 'leaf',
    title: 'Leaf',
    children: [],
    createdAt: 1,
    ...partial,
  });

  it('computes step-based rollup', () => {
    clearRollupCache();
    expect(rollupPct(leaf({ id: 'a', steps: ['a', 'b', 'c'], stepDone: [true, true, false] }))).toBe(67);
    expect(rollupPct(leaf({ id: 'b', completed: true }))).toBe(100);
  });

  it('treats tasks without steps as incomplete until progress is 1', () => {
    expect(isTaskComplete({ steps: [], progress: 0 })).toBe(false);
    expect(isTaskComplete({ steps: [], progress: 1 })).toBe(true);
    expect(isTaskComplete({ steps: ['a', 'b'], progress: 1 })).toBe(false);
  });

  it('identifies backlog by past incomplete dates', () => {
    const task: Task = {
      id: 't1',
      title: 'Read',
      description: '',
      priority: 'medium',
      targetDate: '2000-01-01',
      deadline: null,
      steps: [],
      progress: 0,
      createdAt: 1,
      order: 0,
    };
    expect(isBacklogTask(task)).toBe(true);
    expect(isBacklogTask({ ...task, progress: 1 })).toBe(false);
  });

  it('keeps catch-up work in backlog until the next day, and stamps the miss on complete', () => {
    const today = todayISO();
    const overdue: Task = {
      id: 't1',
      title: 'Read',
      description: '',
      priority: 'medium',
      targetDate: '2000-01-12',
      deadline: null,
      steps: [],
      progress: 0,
      createdAt: 1,
      order: 0,
    };
    expect(isBacklogTask(overdue, today)).toBe(true);
    const startedButNotMoved = { ...overdue, originalTargetDate: '2000-01-12', targetDate: today };
    expect(isBacklogTask(startedButNotMoved, today)).toBe(true);

    const cleared = clearBacklogIfComplete({ ...overdue, progress: 1 }, today);
    expect(cleared.targetDate).toBe(today);
    expect(cleared.originalTargetDate).toBe('2000-01-12');
    expect(cleared.pastFailedNativeDates).toEqual(['2000-01-12']);
    expect(isBacklogTask(cleared, today)).toBe(true);
    expect(isOpenBacklogTask(cleared, today)).toBe(false);
    expect(isBacklogTask(cleared, '2000-01-15')).toBe(false);
  });

  it('clears stale todayTaskId pointers and duplicate ids', () => {
    const goals: GoalNode[] = [
      {
        id: 'dup',
        kind: 'goal',
        title: 'A',
        createdAt: 1,
        todayTaskId: 'missing',
        children: [{ id: 'dup', kind: 'phase', title: 'B', createdAt: 1, children: [] }],
      },
    ];
    const { cleanedGoals } = sanitizeTreeAndTasks(goals, []);
    expect(cleanedGoals[0].todayTaskId).toBeNull();
    expect(cleanedGoals[0].id).not.toBe(cleanedGoals[0].children[0].id);
  });

  it('clones nodes with new ids and no today pointer', () => {
    const node = leaf({ id: 'old', todayTaskId: 'task-1', pinned: true });
    const copy = cloneNode(node);
    expect(copy.id).not.toBe(node.id);
    expect(copy.todayTaskId).toBeNull();
    expect(copy.pinned).toBe(false);
  });

  it('mirrors goal title, description, and steps onto linked today/calendar cards', () => {
    const node = leaf({
      id: 'leaf',
      title: 'DPP-2',
      description: 'New notes',
      steps: ['Q1-12', 'Q13-20'],
      stepDone: [true, false],
    });
    const todayCard: Task = {
      id: 't-today',
      title: 'DPP-1',
      description: 'Old',
      priority: 'medium',
      targetDate: '2026-08-14',
      deadline: null,
      steps: ['Q : 1-12'],
      progress: 1,
      createdAt: 1,
      order: 0,
      goalNodeId: 'leaf',
    };
    const calendarDone: Task = {
      ...todayCard,
      id: 't-old',
      targetDate: '2026-08-10',
      progress: 1,
    };
    const standalone: Task = { ...todayCard, id: 't-quick', goalNodeId: undefined, title: 'Stay' };
    expect(mirrorGoalContentToTask(todayCard, node).title).toBe('DPP-2');
    expect(mirrorGoalContentToTask(todayCard, node).description).toBe('New notes');
    expect(mirrorGoalContentToTask(todayCard, node).steps).toEqual(['Q1-12', 'Q13-20']);
    expect(mirrorGoalContentToTask(todayCard, node).progress).toBe(1);
    expect(mirrorGoalContentToTask(calendarDone, node).title).toBe('DPP-2');
    expect(mirrorGoalContentToTask(standalone, node).title).toBe('Stay');
    const stepless = leaf({ id: 'leaf', title: 'Essay', completed: true, steps: [] });
    expect(mirrorGoalContentToTask({ ...todayCard, steps: [], progress: 0 }, stepless).progress).toBe(1);
  });
});

describe('device clock integrity', () => {
  it('ignores sleep-sized gaps when wall and monotonic stay in sync', async () => {
    const { isClockJump, CLOCK_SKEW_MS } = await import('./deviceClock');
    const eightHours = 8 * 60 * 60 * 1000;
    expect(isClockJump(eightHours, eightHours)).toBe(false);
    expect(isClockJump(30_000, 30_000)).toBe(false);
    expect(isClockJump(CLOCK_SKEW_MS, CLOCK_SKEW_MS)).toBe(false);
  });

  it('flags wall clock jumping ahead or backward vs monotonic time', async () => {
    const { isClockJump, CLOCK_SKEW_MS } = await import('./deviceClock');
    expect(isClockJump(2 * 60 * 60 * 1000, 15_000)).toBe(true);
    expect(isClockJump(-2 * 60 * 60 * 1000, 15_000)).toBe(true);
    expect(isClockJump(CLOCK_SKEW_MS + 1, 0)).toBe(true);
  });

  it('flags device time far from server time', async () => {
    const { isDeviceSkewedFromServer, CLOCK_SKEW_MS } = await import('./deviceClock');
    const server = 1_700_000_000_000;
    expect(isDeviceSkewedFromServer(server, server + 10_000)).toBe(false);
    expect(isDeviceSkewedFromServer(server, server + CLOCK_SKEW_MS + 1)).toBe(true);
    expect(isDeviceSkewedFromServer(server, server - CLOCK_SKEW_MS - 1)).toBe(true);
  });

  it('does not block sign-in when server time cannot be read', async () => {
    const { assertDeviceClock } = await import('./deviceClock');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    try {
      await expect(assertDeviceClock()).resolves.toEqual({ ok: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('visit snapshot labels', () => {
  it('names the last three app opens', async () => {
    const { visitSnapshotLabel } = await import('./cloudBackup');
    expect(visitSnapshotLabel(0)).toBe('When you opened this time');
    expect(visitSnapshotLabel(1)).toBe('Previous time you opened');
    expect(visitSnapshotLabel(2)).toBe('2 opens ago');
  });
});
