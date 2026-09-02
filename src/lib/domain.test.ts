import { describe, expect, it } from 'vitest';
import { formatDDMMYYYY, isToday, localISODate, todayISO } from './dates';
import { currentFocusStreak, mergeStreakMeta, netFocusByLocalDate, reconcileStreakMeta, weekHeatmap } from './focusTrends';
import { formatDuration, formatElapsed, sessionEfficiency } from './format';
import { computeNetFocusMs, createManualStepSession, finalizeSession, isCountableSession, isManualSession, splitSessionByLocalDate, clampSessionEnd, tickActiveSession, safetyCapEnd, continueAfterInterruption, shouldOfferSessionRecovery, MAX_CONTINUOUS_FOCUS_MS, STALE_HEARTBEAT_MS, pruneSessionHistoryBefore, buildSessionSummary } from './sessionStats';
import { clearRollupCache, cloneNode, clearBacklogIfComplete, duplicateTaskAsFresh, goalBranchContainsTask, isBacklogTask, isMutableGoalPlan, isOpenBacklogTask, isTaskComplete, mirrorGoalContentToTask, recomputeCompleted, rescheduleOpenBacklogTask, rollupPct, sanitizeTreeAndTasks, syncLinkedTasksFromGoal, updateNode, removeNode } from './goalTree';
import type { GoalNode, Task, TaskSession } from '../types';

describe('dates', () => {
  it('formats ISO dates as DD-MM-YYYY', () => {
    expect(formatDDMMYYYY('2026-08-14')).toBe('14-08-2026');
    expect(formatDDMMYYYY(null)).toBe('');
  });

  it('builds local ISO dates without UTC drift', () => {
    expect(localISODate(new Date(2026, 7, 14))).toBe('2026-08-14');
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('treats YYYY-MM-DD as a local calendar date, not UTC midnight', () => {
    expect(isToday(todayISO())).toBe(true);
    expect(isToday('1999-01-01')).toBe(false);
  });
});

function sessionAt(iso: string, netFocusMs: number): TaskSession {
  const [y, m, d] = iso.split('-').map(Number);
  const startTime = new Date(y, m - 1, d, 10, 0, 0).getTime();
  return {
    id: `s-${iso}-${netFocusMs}`,
    taskId: 't1',
    startTime,
    endTime: startTime + 3_600_000,
    pausedDuration: 0,
    pauses: [],
    netFocusMs,
    wallClockStart: '10:00 AM',
    wallClockEnd: '11:00 AM',
    completed: false,
    completedStepIndices: [],
  };
}

describe('focus trends', () => {
  it('ignores manual / sub-15s sittings', () => {
    const byDate = netFocusByLocalDate([
      sessionAt('2026-08-16', 8_000),
      { ...sessionAt('2026-08-16', 60_000), manual: true, netFocusMs: 0 },
      sessionAt('2026-08-16', 45_000),
    ]);
    expect(byDate.get('2026-08-16')).toBe(45_000);
  });

  it('keeps a streak alive when today has not started yet', () => {
    const byDate = netFocusByLocalDate([
      sessionAt('2026-08-14', 20_000),
      sessionAt('2026-08-15', 20_000),
    ]);
    expect(currentFocusStreak(byDate, '2026-08-16')).toBe(2);
  });

  it('does not skip a missed day in the middle of a streak', () => {
    const byDate = netFocusByLocalDate([
      sessionAt('2026-08-14', 20_000),
      sessionAt('2026-08-16', 20_000),
    ]);
    expect(currentFocusStreak(byDate, '2026-08-16')).toBe(1);
  });

  it('builds a 7-day heatmap ending today', () => {
    const byDate = netFocusByLocalDate([sessionAt('2026-08-16', 30_000)]);
    const week = weekHeatmap(byDate, '2026-08-16');
    expect(week).toHaveLength(7);
    expect(week[0].date).toBe('2026-08-10');
    expect(week[6].date).toBe('2026-08-16');
    expect(week[6].focusMs).toBe(30_000);
  });
});

describe('streak bar and backlog revive', () => {
  const hour = 3_600_000;
  const baseMeta = {
    bestStreak: 0,
    barHours: 1,
    barEffectiveFrom: '2026-01-01',
    revive: null,
  };

  it('does not count a day below the bar', () => {
    const byDate = new Map([
      ['2026-08-14', hour],
      ['2026-08-15', hour],
      ['2026-08-16', 20_000],
    ]);
    expect(
      currentFocusStreak(byDate, '2026-08-16', {
        thresholdMs: hour,
        barEffectiveFrom: '2026-01-01',
      }),
    ).toBe(2);
  });

  it('does not rewrite days before the bar effective date', () => {
    const byDate = new Map([
      ['2026-08-14', 20_000],
      ['2026-08-15', 20_000],
      ['2026-08-16', hour],
    ]);
    expect(
      currentFocusStreak(byDate, '2026-08-16', {
        thresholdMs: hour,
        barEffectiveFrom: '2026-08-16',
      }),
    ).toBe(3);
  });

  it('offers a 1.5× focus challenge when the miss snapshot has no backlog', () => {
    const byDate = new Map([
      ['2026-08-14', hour],
      ['2026-08-15', hour],
    ]);
    const { meta, status } = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate,
      meta: baseMeta,
      openBacklogIds: [],
      isTaskStillOpen: () => false,
    });
    expect(status.current).toBe(0);
    expect(meta.revive?.brokenOn).toBe('2026-08-16');
    expect(meta.revive?.windowEnds).toBe('2026-08-17');
    expect(meta.revive?.backlogTaskIds).toEqual([]);
    expect(meta.revive?.challengeMultiplier).toBe(1.5);
    expect(status.revive?.active).toBe(true);
    expect(status.revive?.mode).toBe('challenge');
    expect(status.revive?.challengeBarHours).toBe(1.5);
  });

  it('revives with a 1.5× challenge day when there was no backlog', () => {
    const six = 6 * hour;
    const prior = new Map([
      ['2026-08-14', six],
      ['2026-08-15', six],
    ]);
    const spotted = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate: prior,
      meta: { ...baseMeta, barHours: 6 },
      openBacklogIds: [],
      isTaskStillOpen: () => false,
    });
    expect(spotted.status.revive?.challengeBarHours).toBe(9);

    const short = new Map(prior);
    short.set('2026-08-17', 6 * hour);
    const notYet = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate: short,
      meta: spotted.meta,
      openBacklogIds: [],
      isTaskStillOpen: () => false,
    });
    expect(notYet.meta.revive?.revivedOn).toBeFalsy();

    const long = new Map(prior);
    long.set('2026-08-17', 9 * hour);
    const { meta, status } = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate: long,
      meta: spotted.meta,
      openBacklogIds: [],
      isTaskStillOpen: () => false,
    });
    expect(meta.revive?.revivedOn).toBe('2026-08-17');
    expect(status.current).toBe(3);
  });

  it('does not revive on backlog path until scheduled snapshot tasks are also done', () => {
    const prior = new Map([
      ['2026-08-13', hour],
      ['2026-08-14', hour],
      ['2026-08-15', hour],
    ]);
    const spotted = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate: prior,
      meta: baseMeta,
      openBacklogIds: ['a', 'b'],
      openTodayIds: ['today-1'],
      isTaskStillOpen: () => true,
    });
    expect(spotted.meta.revive?.scheduledTaskIds).toEqual(['today-1']);
    expect(spotted.meta.revive?.windowEnds).toBe('2026-08-17');

    const withSit = new Map(prior);
    withSit.set('2026-08-17', hour);
    const backlogOnly = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate: withSit,
      meta: spotted.meta,
      openBacklogIds: [],
      openTodayIds: ['today-1'],
      isTaskStillOpen: (id) => id === 'today-1',
    });
    expect(backlogOnly.meta.revive?.revivedOn).toBeFalsy();
    expect(backlogOnly.status.revive?.remainingScheduled).toBe(1);

    const { meta, status } = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate: withSit,
      meta: spotted.meta,
      openBacklogIds: [],
      openTodayIds: [],
      isTaskStillOpen: () => false,
    });
    expect(meta.revive?.revivedOn).toBe('2026-08-17');
    expect(status.current).toBe(4);
  });

  it('expires the window without restoring the previous streak', () => {
    const byDate = new Map([
      ['2026-08-10', hour],
      ['2026-08-14', 20_000],
    ]);
    const { status } = reconcileStreakMeta({
      todayISO: '2026-08-14',
      byDate,
      meta: baseMeta,
      openBacklogIds: ['a'],
      isTaskStillOpen: () => true,
    });
    expect(status.current).toBe(0);
    expect(status.revive?.active).toBe(false);
    expect(status.brokenDays).toBeGreaterThanOrEqual(2);
  });

  it('counts scheduled-today tasks added after the miss snapshot', () => {
    const byDate = new Map([
      ['2026-08-14', hour],
      ['2026-08-15', hour],
    ]);
    const first = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate,
      meta: baseMeta,
      openBacklogIds: ['old'],
      openTodayIds: ['today-1'],
      isTaskStillOpen: (id) => id === 'old' || id === 'today-1',
    });
    expect(first.meta.revive?.scheduledTaskIds).toEqual(['today-1']);

    const withSit = new Map(byDate);
    withSit.set('2026-08-17', hour);
    const second = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate: withSit,
      meta: first.meta,
      openBacklogIds: ['old'],
      openTodayIds: ['today-1', 'today-2'],
      isTaskStillOpen: (id) => id === 'old' || id === 'today-1' || id === 'today-2',
    });
    expect(second.meta.revive?.scheduledTaskIds).toEqual(['today-1', 'today-2']);
    expect(second.status.revive?.remainingScheduled).toBe(2);
    expect(second.meta.revive?.revivedOn).toBeFalsy();

    const stillOpenNew = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate: withSit,
      meta: second.meta,
      openBacklogIds: [],
      openTodayIds: ['today-2'],
      isTaskStillOpen: (id) => id === 'today-2',
    });
    expect(stillOpenNew.meta.revive?.revivedOn).toBeFalsy();
    expect(stillOpenNew.status.revive?.remainingScheduled).toBe(1);

    const cleared = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate: withSit,
      meta: stillOpenNew.meta,
      openBacklogIds: [],
      openTodayIds: [],
      isTaskStillOpen: () => false,
    });
    expect(cleared.meta.revive?.revivedOn).toBe('2026-08-17');
  });

  it('ignores backlog items added after the snapshot', () => {
    const byDate = new Map([
      ['2026-08-14', hour],
      ['2026-08-15', hour],
    ]);
    const first = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate,
      meta: baseMeta,
      openBacklogIds: ['old'],
      isTaskStillOpen: (id) => id === 'old',
    });
    expect(first.meta.revive?.backlogTaskIds).toEqual(['old']);
    const second = reconcileStreakMeta({
      todayISO: '2026-08-17',
      byDate,
      meta: first.meta,
      openBacklogIds: ['old', 'new'],
      isTaskStillOpen: (id) => id === 'old' || id === 'new',
    });
    expect(second.meta.revive?.backlogTaskIds).toEqual(['old']);
    expect(second.status.revive?.remainingTasks).toBe(1);
  });
});

describe('streak meta merge', () => {
  it('prefers the newer updatedAt and keeps the higher best streak', () => {
    const older = {
      bestStreak: 5,
      barHours: 1,
      barEffectiveFrom: '2026-01-01',
      revive: null,
      updatedAt: 100,
    };
    const newer = {
      bestStreak: 3,
      barHours: 2,
      barEffectiveFrom: '2026-08-01',
      revive: null,
      updatedAt: 200,
    };
    const merged = mergeStreakMeta(older, newer);
    expect(merged.barHours).toBe(2);
    expect(merged.bestStreak).toBe(5);
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

describe('session history prune', () => {
  it('keeps sittings that ended on or after the cutoff', () => {
    const oldRow = sessionAt('2026-01-01', 20_000);
    const keepRow = sessionAt('2026-08-01', 20_000);
    const cutoff = keepRow.endTime - 1000;
    const next = pruneSessionHistoryBefore({ t1: [oldRow, keepRow], t2: [oldRow] }, cutoff);
    expect(next.t1).toHaveLength(1);
    expect(next.t1[0].id).toBe(keepRow.id);
    expect(next.t2).toBeUndefined();
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

  it('records manual step completions without counting focus time', () => {
    const row = createManualStepSession('t1', [1], { goalNodeId: 'g1', completed: true });
    expect(row.manual).toBe(true);
    expect(row.completedStepIndices).toEqual([1]);
    expect(isCountableSession(row)).toBe(false);
    expect(isManualSession(row)).toBe(true);
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

  it('does not move lastHeartbeat on a stale gap (phone was away)', () => {
    const stale = { ...base, lastHeartbeat: 1_000_000 };
    const later = 1_000_000 + STALE_HEARTBEAT_MS + 1;
    expect(tickActiveSession(stale, later)).toBe(stale);
    expect(shouldOfferSessionRecovery(stale, later)).toBe(true);
  });

  it('pauses at 4h of continuous foreground time, not at wake', () => {
    const now = base.startTime + MAX_CONTINUOUS_FOCUS_MS;
    const ticked = tickActiveSession({ ...base, lastHeartbeat: now - 30_000 }, now);
    expect(ticked.isPaused).toBe(true);
    expect(ticked.pauseStart).toBe(base.startTime + MAX_CONTINUOUS_FOCUS_MS);
    expect(ticked.lastHeartbeat).toBe(now);
  });

  it('caps forgotten sittings at 4h from the last resume', () => {
    const eightHours = base.startTime + 8 * 60 * 60 * 1000;
    expect(safetyCapEnd(base, eightHours)).toBe(base.startTime + MAX_CONTINUOUS_FOCUS_MS);
    const resumed = { ...base, returnedAt: base.startTime + 40 * 60_000 };
    expect(safetyCapEnd(resumed, eightHours)).toBe(base.startTime + 40 * 60_000 + MAX_CONTINUOUS_FOCUS_MS);
  });

  it('resume after a lock keeps the sitting and starts counting again', () => {
    const now = base.startTime + 40 * 60 * 1000;
    const next = continueAfterInterruption(base, now);
    expect(next.returnedAt).toBe(now);
    expect(next.isPaused).toBe(false);
    expect(next.lastHeartbeat).toBe(now);
  });

  it('does not unpause a sitting that was already paused', () => {
    const paused = {
      ...base,
      isPaused: true,
      pauseStart: base.startTime + 60_000,
      lastHeartbeat: base.startTime + 60_000,
      pauses: [{ start: base.startTime + 60_000, wallClockStart: '10:01 AM' }],
    };
    const later = paused.lastHeartbeat + STALE_HEARTBEAT_MS + 1;
    expect(shouldOfferSessionRecovery(paused, later)).toBe(false);
    const next = continueAfterInterruption(paused, later);
    expect(next.isPaused).toBe(true);
    expect(next.pauseStart).toBe(paused.pauseStart);
    expect(next.lastHeartbeat).toBe(later);
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

  it('rolls up by leaf work, not sibling count', () => {
    clearRollupCache();
    const small = leaf({ id: 's', steps: ['a'], stepDone: [true] });
    const big = leaf({ id: 'b', steps: ['a', 'b', 'c', 'd'], stepDone: [false, false, false, false] });
    const root: GoalNode = { id: 'r', kind: 'goal', title: 'R', children: [small, big], createdAt: 1 };
    expect(rollupPct(root)).toBe(20);
  });

  it('clears ancestor completed when a leaf is unchecked', () => {
    const child = leaf({ id: 'c', completed: true, steps: ['a'], stepDone: [true] });
    const root: GoalNode = { id: 'r', kind: 'goal', title: 'R', completed: true, children: [child], createdAt: 1 };
    const next = recomputeCompleted(updateNode(root, 'c', (n) => ({ ...n, stepDone: [false], completed: false })));
    expect(next.completed).toBe(false);
    expect(next.children[0].completed).toBe(false);
  });

  it('reuses unchanged goal branches when patching a leaf', () => {
    const untouched = leaf({ id: 'keep' });
    const target = leaf({ id: 'edit', title: 'Old' });
    const root: GoalNode = {
      id: 'root',
      kind: 'goal',
      title: 'Root',
      children: [untouched, target],
      createdAt: 1,
    };
    const next = updateNode(root, 'edit', (n) => ({ ...n, title: 'New' }));
    expect(next).not.toBe(root);
    expect(next.children[0]).toBe(untouched);
    expect(next.children[1]).not.toBe(target);
    expect(next.children[1].title).toBe('New');
    const same = updateNode(root, 'missing', (n) => ({ ...n, title: 'X' }));
    expect(same).toBe(root);
    const afterRemove = removeNode(root, 'missing');
    expect(afterRemove).toBe(root);
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

  it('reschedules open backlog as normal work while retaining its failed date', () => {
    const overdue: Task = {
      id: 'overdue',
      title: 'Read',
      description: '',
      priority: 'medium',
      targetDate: '2026-08-20',
      deadline: null,
      steps: ['Read', 'Revise'],
      progress: 1,
      createdAt: 1,
      order: 4,
      goalNodeId: 'leaf-1',
    };

    const replanned = rescheduleOpenBacklogTask(overdue, '2026-09-02', '2026-08-31');
    expect(replanned).toEqual({
      ...overdue,
      targetDate: '2026-09-02',
      originalTargetDate: undefined,
      pastFailedNativeDates: ['2026-08-20'],
    });
    expect(isBacklogTask(replanned!, '2026-08-31')).toBe(false);
    expect(rescheduleOpenBacklogTask({ ...overdue, progress: 2 }, '2026-09-02', '2026-08-31')).toBeNull();
  });

  it('never rewrites a completed historical card when its Goal node changes', () => {
    const today = todayISO();
    const node = leaf({
      id: 'leaf-history',
      title: 'Renamed current node',
      todayTaskId: 'old-card',
      steps: ['Watch', 'Notes'],
      stepDone: [true, true],
      completed: true,
    });
    const historical: Task = {
      id: 'old-card',
      title: 'Title on the study day',
      description: '',
      priority: 'medium',
      targetDate: '2000-01-12',
      deadline: null,
      steps: ['Watch', 'Notes'],
      progress: 2,
      createdAt: 1,
      order: 0,
      goalNodeId: node.id,
    };
    expect(isMutableGoalPlan(historical, node, today)).toBe(false);
    expect(syncLinkedTasksFromGoal([historical], node)).toEqual([historical]);
  });

  it('duplicates backlog content without copying failure history or Goal linkage', () => {
    const backlog: Task = {
      id: 'backlog-source',
      title: 'Revise topic',
      description: '',
      priority: 'medium',
      targetDate: '2026-08-31',
      deadline: null,
      steps: ['Watch', 'Notes'],
      progress: 2,
      createdAt: 1,
      order: 0,
      goalNodeId: 'leaf-1',
      stepSlice: [0, 1],
      originalTargetDate: '2026-08-20',
      pastFailedNativeDates: ['2026-08-20'],
      pastFailedBacklogDates: ['2026-08-21'],
    };

    expect(duplicateTaskAsFresh(backlog, 'copy', 2, 4)).toEqual({
      ...backlog,
      id: 'copy',
      title: 'Revise topic (copy)',
      progress: 0,
      createdAt: 2,
      order: 4,
      goalNodeId: undefined,
      stepSlice: undefined,
      originalTargetDate: undefined,
      pastFailedNativeDates: undefined,
      pastFailedBacklogDates: undefined,
    });
  });

  it('recognizes an active task inside a Goal branch even when todayTaskId is stale', () => {
    const child = leaf({ id: 'leaf-active', todayTaskId: null });
    const branch: GoalNode = {
      id: 'phase-active',
      kind: 'phase',
      title: 'Phase',
      children: [child],
      createdAt: 1,
    };
    const activeTask: Task = {
      id: 'active-task',
      title: 'Active',
      description: '',
      priority: 'medium',
      targetDate: '2026-08-31',
      deadline: null,
      steps: [],
      progress: 0,
      createdAt: 1,
      order: 0,
      goalNodeId: child.id,
    };

    expect(goalBranchContainsTask(branch, activeTask)).toBe(true);
    expect(goalBranchContainsTask(leaf({ id: 'other' }), activeTask)).toBe(false);
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

  it('treats screen-lock freeze as sleep only after a background resume', async () => {
    const { isClockJump, isLikelyAppSleep, classifyClockGap } = await import('./deviceClock');
    const fortyMinutes = 40 * 60 * 1000;
    expect(isLikelyAppSleep(fortyMinutes, 40)).toBe(true);
    expect(classifyClockGap(fortyMinutes, 40, 'resume')).toBe('sleep');
    expect(classifyClockGap(fortyMinutes, 40, 'tick')).toBe('jump');
    expect(classifyClockGap(fortyMinutes, 40, 'guard')).toBe('jump');
    expect(isClockJump(fortyMinutes, 40)).toBe(true);
  });

  it('flags wall clock jumping while the app is actually running', async () => {
    const { isClockJump } = await import('./deviceClock');
    expect(isClockJump(2 * 60 * 60 * 1000, 15 * 60 * 1000)).toBe(true);
    expect(isClockJump(-2 * 60 * 60 * 1000, 15_000)).toBe(true);
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
  it('names cloud safety copies clearly', async () => {
    const { visitSnapshotLabel } = await import('./cloudBackup');
    expect(visitSnapshotLabel(0)).toBe('Most recent safety copy');
    expect(visitSnapshotLabel(1)).toBe('Previous safety copy');
    expect(visitSnapshotLabel(2)).toBe('Safety copy 3');
  });
});

describe('cloud merge', () => {
  it('keeps sessions from both phones', async () => {
    const { mergeSessionHistories } = await import('./syncMerge');
    const merged = mergeSessionHistories(
      { t1: [{ id: 'a', taskId: 't1', startTime: 1, endTime: 60_000, pausedDuration: 0, pauses: [], netFocusMs: 60_000, wallClockStart: '', wallClockEnd: '', completed: false, completedStepIndices: [] }] },
      { t1: [{ id: 'b', taskId: 't1', startTime: 2, endTime: 90_000, pausedDuration: 0, pauses: [], netFocusMs: 88_000, wallClockStart: '', wallClockEnd: '', completed: true, completedStepIndices: [0] }] },
    );
    expect(merged.t1.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });

  it('does not resurrect a goal the other phone deleted', async () => {
    const { mergeWorkspace } = await import('./syncMerge');
    const node = { id: 'g1', kind: 'goal' as const, title: 'Keep', children: [], createdAt: 1 };
    const gone = { id: 'g2', kind: 'goal' as const, title: 'Gone', children: [], createdAt: 1 };
    const merged = mergeWorkspace(
      { tasks: [], goals: [node, gone], sessionHistory: {}, recentlyDeletedGoals: [] },
      {
        tasks: [],
        goals: [node],
        sessionHistory: {},
        recentlyDeletedGoals: [{ id: 'del-1', node: gone, deletedAt: 9, parentRootId: null, tasks: [] }],
      },
    );
    expect(merged.goals.map((g) => g.id)).toEqual(['g1']);
  });

  it('does not re-mark a locally unmarked node from an older cloud copy', async () => {
    const { mergeWorkspace } = await import('./syncMerge');
    const unmarked = {
      id: 'g1',
      kind: 'leaf' as const,
      title: 'Drill',
      children: [],
      createdAt: 1,
      steps: ['a', 'b'],
      stepDone: [false, false],
      completed: false,
    };
    const marked = { ...unmarked, stepDone: [true, true], completed: true };
    const merged = mergeWorkspace(
      { tasks: [], goals: [unmarked], sessionHistory: {}, recentlyDeletedGoals: [], updatedAt: 200 },
      { tasks: [], goals: [marked], sessionHistory: {}, recentlyDeletedGoals: [], updatedAt: 100 },
    );
    expect(merged.goals[0].completed).toBe(false);
    expect(merged.goals[0].stepDone).toEqual([false, false]);
  });

  it('keeps branches that only exist in the older device copy', async () => {
    const { mergeWorkspace } = await import('./syncMerge');
    const phoneOnly = { id: 'section-phone', kind: 'section' as const, title: 'Phone work', children: [], createdAt: 2 };
    const browserRoot = { id: 'goal', kind: 'goal' as const, title: 'Exam', children: [], createdAt: 1 };
    const phoneRoot = { ...browserRoot, children: [phoneOnly] };
    const merged = mergeWorkspace(
      { tasks: [], goals: [browserRoot], sessionHistory: {}, recentlyDeletedGoals: [], updatedAt: 300 },
      {
        tasks: [{ id: 'task-phone', title: 'Phone plan', description: '', priority: 'medium', targetDate: null, deadline: null, steps: [], progress: 0, createdAt: 2, order: 2, goalNodeId: 'section-phone' }],
        goals: [phoneRoot], sessionHistory: {}, recentlyDeletedGoals: [], updatedAt: 200,
      },
    );
    expect(merged.goals[0].children.map((node) => node.id)).toEqual(['section-phone']);
    expect(merged.tasks.map((task) => task.id)).toEqual(['task-phone']);
  });

  it('fingerprints workspace content deterministically', async () => {
    const { workspaceFingerprint } = await import('./syncMerge');
    const base = { tasks: [], goals: [], sessionHistory: {}, recentlyDeletedGoals: [] };
    expect(workspaceFingerprint(base)).toBe(workspaceFingerprint({ ...base }));
    expect(workspaceFingerprint(base)).not.toBe(workspaceFingerprint({
      ...base,
      goals: [{ id: 'g', kind: 'goal', title: 'Exam', children: [], createdAt: 1 }],
    }));
  });

  it('treats cloud-normalized optional fields as the same synced workspace', async () => {
    const { canonicalWorkspaceFingerprint } = await import('./syncPayload');
    const { parseBackupPayload } = await import('./backup');
    const local = {
      tasks: [{
        id: 'task-1', title: 'Lecture', description: '', priority: 'medium' as const,
        targetDate: null, deadline: null, steps: [], progress: 0, createdAt: 1, order: 1,
        originalTargetDate: null,
      }],
      goals: [{
        id: 'goal-1', kind: 'goal' as const, title: 'GATE', children: [], createdAt: 1,
        todayTaskId: null, pinned: undefined,
      }],
      sessionHistory: {},
      recentlyDeletedGoals: [],
      streakMeta: null,
      pacePrefs: null,
      updatedAt: 10,
    };
    const parsed = parseBackupPayload(JSON.stringify(local));
    expect(parsed).not.toBeNull();
    const cloudRead = {
      ...local,
      tasks: parsed!.tasks,
      goals: parsed!.goals,
      updatedAt: parsed!.updatedAt,
    };
    expect(canonicalWorkspaceFingerprint(local, '2026-09-02'))
      .toBe(canonicalWorkspaceFingerprint(cloudRead, '2026-09-02'));
  });

  it('clamps impossible session numbers', async () => {
    const { sanitizeSession } = await import('./sessionStats');
    const row = sanitizeSession({
      id: 'x',
      taskId: 't',
      startTime: 1_000,
      endTime: 2_000,
      netFocusMs: 9_000_000_000,
      pausedDuration: 0,
      pauses: [],
      wallClockStart: '',
      wallClockEnd: '',
      completed: false,
      completedStepIndices: [],
    });
    expect(row?.netFocusMs).toBe(1_000);
  });
});

describe('backup recovery metadata', () => {
  it('ignores volatile export timestamps but detects workspace changes', async () => {
    const { backupContentFingerprint } = await import('./backup');
    const first = JSON.stringify({ exportedAt: 'a', updatedAt: 1, goals: [], tasks: [] });
    const second = JSON.stringify({ exportedAt: 'b', updatedAt: 2, goals: [], tasks: [] });
    const changed = JSON.stringify({ exportedAt: 'b', updatedAt: 2, goals: [{ id: 'g', title: 'Exam', kind: 'goal', children: [] }], tasks: [] });
    expect(backupContentFingerprint(first)).toBe(backupContentFingerprint(second));
    expect(backupContentFingerprint(first)).not.toBe(backupContentFingerprint(changed));
  });

  it('summarizes restore points without applying them', async () => {
    const { summarizeBackupPayload } = await import('./backup');
    const summary = summarizeBackupPayload(JSON.stringify({
      goals: [{
        id: 'g', title: 'GATE', kind: 'goal', children: [
          { id: 'l', title: 'Lecture', kind: 'leaf', children: [] },
        ],
      }],
      tasks: [{ id: 't', title: 'Today', steps: [] }],
      sessionHistory: { t: [{ id: 's' }] },
    }));
    expect(summary).toMatchObject({ roots: 1, nodes: 2, leaves: 1, tasks: 1, sessions: 1, rootNames: ['GATE'] });
  });
});

describe('two-device sync decisions', () => {
  it('pulls when only cloud changed and pushes when only this device changed', async () => {
    const { decideSyncAction } = await import('./syncDecision');
    expect(decideSyncAction({
      localFingerprint: 'base', remoteFingerprint: 'cloud-new', baseFingerprint: 'base', localEmpty: false,
    })).toBe('pull');
    expect(decideSyncAction({
      localFingerprint: 'local-new', remoteFingerprint: 'base', baseFingerprint: 'base', localEmpty: false,
    })).toBe('push');
  });

  it('pauses when both devices changed or the first comparison differs', async () => {
    const { decideSyncAction } = await import('./syncDecision');
    expect(decideSyncAction({
      localFingerprint: 'local-new', remoteFingerprint: 'cloud-new', baseFingerprint: 'base', localEmpty: false,
    })).toBe('conflict');
    expect(decideSyncAction({
      localFingerprint: 'local', remoteFingerprint: 'cloud', baseFingerprint: null, localEmpty: false,
    })).toBe('conflict');
  });

  it('never treats an empty device as permission to clear a cloud copy', async () => {
    const { decideSyncAction } = await import('./syncDecision');
    expect(decideSyncAction({
      localFingerprint: 'empty', remoteFingerprint: 'cloud', baseFingerprint: 'cloud', localEmpty: true,
    })).toBe('pull');
    expect(decideSyncAction({
      localFingerprint: 'empty', remoteFingerprint: null, baseFingerprint: null, localEmpty: true,
    })).toBe('empty-error');
  });

  it('requires an explicit strategy to resolve a conflict', async () => {
    const { decideSyncAction } = await import('./syncDecision');
    const base = { localFingerprint: 'local', remoteFingerprint: 'cloud', baseFingerprint: 'base', localEmpty: false };
    expect(decideSyncAction({ ...base, conflictStrategy: 'merge' })).toBe('merge');
    expect(decideSyncAction({ ...base, conflictStrategy: 'cloud' })).toBe('pull');
    expect(decideSyncAction({ ...base, conflictStrategy: 'device' })).toBe('push');
  });
});

describe('pace board', () => {
  it('uses local Monday as the week start', async () => {
    const { mondayOfLocalISO, monthStartLocalISO } = await import('./paceBoard');
    expect(mondayOfLocalISO('2026-08-30')).toBe('2026-08-24');
    expect(mondayOfLocalISO('2026-08-31')).toBe('2026-08-31');
    expect(monthStartLocalISO('2026-08-30')).toBe('2026-08-01');
  });

  it('sums net focus from Monday through today, not a rolling 7 days', async () => {
    const { paceWindowTotals } = await import('./paceBoard');
    const sessions = [
      sessionAt('2026-08-23', 60_000),
      sessionAt('2026-08-24', 120_000),
      sessionAt('2026-08-30', 45_000),
    ];
    const totals = paceWindowTotals(sessions, '2026-08-30');
    expect(totals.todayMs).toBe(45_000);
    expect(totals.weekMs).toBe(165_000);
    expect(totals.monthMs).toBe(225_000);
  });

  it('ranks by total window hours and marks up/down vs the last snapshot', async () => {
    const { rankedIds, rankDeltas } = await import('./paceBoard');
    const rows = [
      { userId: 'a', displayName: 'A', examLabel: '', todayMs: 10, weekMs: 10, monthMs: 10, streak: 1, barHours: 1, updatedAt: '' },
      { userId: 'b', displayName: 'B', examLabel: '', todayMs: 30, weekMs: 30, monthMs: 30, streak: 1, barHours: 1, updatedAt: '' },
      { userId: 'c', displayName: 'C', examLabel: '', todayMs: 20, weekMs: 20, monthMs: 20, streak: 1, barHours: 1, updatedAt: '' },
    ];
    expect(rankedIds(rows, 'today')).toEqual(['b', 'c', 'a']);
    expect(rankDeltas(['b', 'a', 'c'], ['a', 'b', 'c'])).toEqual({
      b: 'up',
      a: 'down',
      c: null,
    });
  });

  it('shows only the top ten when the current user is already among them', async () => {
    const { selectPaceBoardRows } = await import('./paceBoard');
    const ids = Array.from({ length: 15 }, (_, index) => `user-${index + 1}`);
    expect(selectPaceBoardRows(ids, 'user-4')).toEqual({
      topIds: ids.slice(0, 10),
      myRank: 4,
      nearbyIds: [],
    });
  });

  it('keeps an outside user visible with nearby competitors and no top-ten duplicates', async () => {
    const { selectPaceBoardRows } = await import('./paceBoard');
    const ids = Array.from({ length: 15 }, (_, index) => `user-${index + 1}`);
    expect(selectPaceBoardRows(ids, 'user-12')).toEqual({
      topIds: ids.slice(0, 10),
      myRank: 12,
      nearbyIds: ['user-11', 'user-13', 'user-14'],
    });
    expect(selectPaceBoardRows(ids, 'user-15')).toMatchObject({
      myRank: 15,
      nearbyIds: ['user-13', 'user-14'],
    });
  });

  it('does not invent a personal rank when the signed-in user is absent', async () => {
    const { selectPaceBoardRows } = await import('./paceBoard');
    const ids = Array.from({ length: 12 }, (_, index) => `user-${index + 1}`);
    expect(selectPaceBoardRows(ids, 'not-opted-in')).toEqual({
      topIds: ids.slice(0, 10),
      myRank: null,
      nearbyIds: [],
    });
  });

  it('keeps newer pace prefs when merging devices', async () => {
    const { mergePacePrefs } = await import('./paceBoard');
    const merged = mergePacePrefs(
      { optedIn: false, displayName: 'Local', examLabel: '', updatedAt: 10 },
      { optedIn: true, displayName: 'Cloud', examLabel: 'GATE', updatedAt: 20 },
    );
    expect(merged.optedIn).toBe(true);
    expect(merged.displayName).toBe('Cloud');
  });
});

describe('session summary', () => {
  const task: Task = {
    id: 't1',
    title: 'DPP-1',
    description: '',
    priority: 'medium',
    targetDate: '2026-08-16',
    deadline: null,
    progress: 0,
    steps: ['Q 1-12', 'Q 13-24'],
    createdAt: 1,
    order: 0,
    goalNodeId: 'g1',
  };

  it('builds a short line from steps completed in the session', () => {
    const session: TaskSession = {
      ...sessionAt('2026-08-16', 45 * 60_000),
      completed: 'partial',
      completedStepIndices: [0],
    };
    const summary = buildSessionSummary(session, task, {
      goalPath: 'GATE / Phase-2',
      netFocusMs: 45 * 60_000,
      durationMs: 50 * 60_000,
    });
    expect(summary.short).toBe('DPP-1 — Q 1-12');
    expect(summary.goalPath).toBe('GATE / Phase-2');
    expect(summary.pathSegments).toEqual(['GATE', 'Phase-2']);
    expect(summary.stepNames).toEqual(['Q 1-12']);
    expect(summary.outcomeTone).toBe('partial');
    expect(summary.focusEfficiency).toBe(90);
  });

  it('describes focus-only sessions without step marks', () => {
    const session: TaskSession = { ...sessionAt('2026-08-16', 30 * 60_000), completed: false };
    const { short } = buildSessionSummary(session, task);
    expect(short).toBe('DPP-1 — focused, no steps logged');
  });
});
