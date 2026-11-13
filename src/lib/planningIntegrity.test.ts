import { describe, expect, it } from 'vitest';
import type { GoalNode, Task, TaskSession } from '../types';
import { mergeWorkspaceThreeWay } from './syncMerge3';
import { pathTitles } from './goalTree';
import { taskOccurrenceOnDate, taskTimelineDates } from './taskTimeline';
import {
  activePlansForDeletedBranch,
  appendGoalChild,
  buildGoalPlanTask,
  collapseDuplicatePlans,
  currentGoalPlan,
  goalDeletionLocation,
  isValidGoalPlanSlice,
  removeGoalBranch,
  rescheduleExistingGoalPlan,
  restoreDeletedBranch,
} from './planningIntegrity';

const leaf: GoalNode = {
  id: 'leaf', kind: 'node', title: 'Mechanics', createdAt: 1,
  children: [], steps: ['Read', 'Solve'], stepDone: [true, false],
  todayTaskId: 'current',
};
const root: GoalNode = {
  id: 'root', kind: 'goal', title: 'Physics', createdAt: 1,
  children: [leaf],
};
const current: Task = {
  id: 'current', title: 'Mechanics', description: '', priority: 'medium',
  targetDate: '2026-09-23', deadline: null, steps: ['Read', 'Solve'],
  progress: 1, createdAt: 2, order: 0, goalNodeId: 'leaf',
};
const history: Task = {
  ...current, id: 'history', targetDate: '2026-09-20', progress: 2, order: 1,
};

describe('planning deletion and restoration', () => {
  it('recalculates parent progress when adding or removing a child', () => {
    const done = { ...leaf, completed: true, stepDone: [true, true] };
    const pending = { ...leaf, id: 'pending', todayTaskId: null };
    const starting = { ...root, children: [done], completed: true };
    const expanded = appendGoalChild([starting], 'root', pending);
    expect(expanded[0].completed).toBe(false);
    expect(removeGoalBranch(expanded, 'root', 'pending')[0].completed).toBe(true);
  });

  it('does not turn an endpoint with execution state into a branch', () => {
    expect(appendGoalChild([root], 'leaf', { ...leaf, id: 'new' })[0].children[0].children).toEqual([]);
  });

  it('never creates a trash record for a node outside the supplied root', () => {
    const other = { ...root, id: 'other', children: [] };
    expect(goalDeletionLocation([other, root], 'other', 'leaf')).toBeNull();
    expect(goalDeletionLocation([other, root], 'root', 'leaf')).toMatchObject({
      node: leaf, parentRootId: 'root', parentNodeId: 'root',
    });
  });

  it('removes only incomplete linked plans, retaining completed Calendar history', () => {
    expect(activePlansForDeletedBranch(root, [current, history])).toEqual([current]);
    expect(activePlansForDeletedBranch(root, [{ ...current, goalNodeId: 'other' }])).toEqual([]);
  });

  it('restores the exact node and plan identities so Goal, Today, and Calendar reconnect', () => {
    const restored = restoreDeletedBranch([], [history], {
      node: root, tasks: [current], parentRootId: null, linkageVersion: 1,
    });
    expect(restored?.goals[0].children[0]).toMatchObject({ id: 'leaf', todayTaskId: 'current' });
    expect(restored?.tasks).toEqual([history, current]);
    expect(pathTitles(restored!.goals[0], restored!.tasks[1].goalNodeId!)).toEqual(['Physics', 'Mechanics']);
  });

  it('keeps old trash tasks as standalone cards rather than restoring broken links', () => {
    const restored = restoreDeletedBranch([], [], {
      node: { ...root, children: [{ ...leaf, id: 'legacy-copy', todayTaskId: null }] },
      tasks: [current], parentRootId: null,
    });
    expect(restored?.tasks[0]).toMatchObject({ id: 'current', goalNodeId: undefined, stepSlice: undefined });
  });

  it('refuses ID collisions without consuming the deleted record', () => {
    expect(restoreDeletedBranch([root], [], {
      node: root, tasks: [current], parentRootId: null, linkageVersion: 1,
    })).toBeNull();
    expect(restoreDeletedBranch([], [current], {
      node: root, tasks: [current], parentRootId: null, linkageVersion: 1,
    })).toBeNull();
  });
});

describe('planning a full endpoint after a sliced backlog card', () => {
  it('rejects an empty or malformed checklist slice instead of making a misleading stepless card', () => {
    expect(isValidGoalPlanSlice(leaf, [])).toBe(false);
    expect(isValidGoalPlanSlice(leaf, [0, 0])).toBe(false);
    expect(isValidGoalPlanSlice(leaf, [2])).toBe(false);
    expect(isValidGoalPlanSlice(leaf, [1])).toBe(true);
  });

  it('retains an unfinished card and its earlier failed dates across another reschedule', () => {
    const prior = { ...current, targetDate: '2026-09-25',
      pastFailedNativeDates: ['2026-09-20'] };
    expect(rescheduleExistingGoalPlan(prior, '2026-09-26', '2026-09-23')).toMatchObject({
      id: 'current', targetDate: '2026-09-26', pastFailedNativeDates: ['2026-09-20'],
    });
  });

  it('shows the missed day and the new plan date without inventing completion', () => {
    const overdue = { ...current, targetDate: '2026-09-20', progress: 0 };
    const moved = rescheduleExistingGoalPlan(overdue, '2026-09-25', '2026-09-23')!;
    const planned = buildGoalPlanTask(leaf, '2026-09-25', [0, 1], moved, moved.id, moved.order, moved.createdAt);
    expect(taskTimelineDates(planned).sort()).toEqual(['2026-09-20', '2026-09-25']);
    expect(taskOccurrenceOnDate(planned, '2026-09-20', '2026-09-23')?.kind).toBe('failed');
    expect(taskOccurrenceOnDate(planned, '2026-09-25', '2026-09-23')?.completedOnDate).toBe(false);
  });

  it('does not retain the old partial step slice when planning all steps', () => {
    const prior = { ...current, stepSlice: [0], steps: ['Read'], progress: 1 };
    const planned = buildGoalPlanTask(leaf, '2026-09-25', [0, 1], prior, 'current', 0, 2);
    expect(planned).toMatchObject({ steps: ['Read', 'Solve'], progress: 1, stepSlice: undefined });
  });

  it('keeps a deliberate partial slice and its completed-step projection', () => {
    const planned = buildGoalPlanTask(leaf, '2026-09-25', [1], null, 'new', 2, 3);
    expect(planned).toMatchObject({ steps: ['Solve'], progress: 0, stepSlice: [1] });
  });
});

describe('one unfinished card per Goal step', () => {
  const step = (todayTaskId: string | null): GoalNode => ({
    id: 'ch4', kind: 'node', title: 'Chapter - 4', createdAt: 1,
    children: [], steps: ['PYQ'], stepDone: [false], todayTaskId,
  });
  const root = (todayTaskId: string | null): GoalNode => ({
    id: 'gate', kind: 'goal', title: 'GATE 2027', createdAt: 1, children: [step(todayTaskId)],
  });
  const card = (id: string, targetDate: string, extra: Partial<Task> = {}): Task => ({
    id, title: 'Chapter - 4', description: '', priority: 'medium', targetDate, deadline: null,
    steps: ['PYQ'], progress: 0, createdAt: Date.parse(targetDate), order: 0, goalNodeId: 'ch4', ...extra,
  });
  const sitting = (id: string, taskId: string, startTime: number): TaskSession => ({
    id, taskId, startTime, endTime: startTime + 60000, pausedDuration: 0, pauses: [], netFocusMs: 60000,
    wallClockStart: '9:00 AM', wallClockEnd: '9:01 AM', completed: false, completedStepIndices: [],
  });
  const today = '2026-11-13';

  it('keeps the step\'s current card and folds in the other\'s missed date and sittings', () => {
    const work = {
      goals: [root('b')],
      tasks: [card('a', '2026-11-11'), card('b', '2026-11-12', { pastFailedNativeDates: ['2026-11-10'] })],
      sessionHistory: { a: [sitting('s1', 'a', 1)], b: [sitting('s2', 'b', 2)] },
    };
    const out = collapseDuplicatePlans(work, today);
    expect(out.tasks.map((t) => t.id)).toEqual(['b']);
    expect(out.tasks[0].targetDate).toBe('2026-11-12');
    expect(out.tasks[0].pastFailedNativeDates).toEqual(['2026-11-10', '2026-11-11']);
    expect(out.sessionHistory.a).toBeUndefined();
    expect(out.sessionHistory.b.map((s) => [s.id, s.taskId])).toEqual([['s1', 'b'], ['s2', 'b']]);
    expect(out.goals[0].children[0].todayTaskId).toBe('b');
  });

  it('keeps the newest card when the step points at neither, and relinks it', () => {
    const out = collapseDuplicatePlans({
      goals: [root(null)], tasks: [card('a', '2026-11-12'), card('b', '2026-11-11')], sessionHistory: {},
    }, today);
    expect(out.tasks.map((t) => t.id)).toEqual(['a']);
    expect(out.tasks[0].pastFailedNativeDates).toEqual(['2026-11-11']);
    expect(out.goals[0].children[0].todayTaskId).toBe('a');
  });

  it('never drops the card of a running sitting', () => {
    const out = collapseDuplicatePlans({
      goals: [root('b')], tasks: [card('a', '2026-11-11'), card('b', '2026-11-12')], sessionHistory: {},
    }, today, 'a');
    expect(out.tasks.map((t) => t.id)).toEqual(['a']);
    expect(out.goals[0].children[0].todayTaskId).toBe('a');
  });

  it('leaves finished history cards and unlinked cards alone', () => {
    const work = {
      goals: [root('b')],
      tasks: [card('a', '2026-11-11', { progress: 1 }), card('b', '2026-11-12'), card('c', '2026-11-12', { goalNodeId: undefined })],
      sessionHistory: {},
    };
    expect(collapseDuplicatePlans(work, today)).toBe(work);
  });

  it('cleans up two devices that planned the same step before syncing', () => {
    const base = { tasks: [], goals: [root(null)], sessionHistory: {}, recentlyDeletedGoals: [] };
    const phone = { ...base, goals: [root('a')], tasks: [card('a', '2026-11-11')], updatedAt: 1 };
    const web = { ...base, goals: [root('b')], tasks: [card('b', '2026-11-12')], updatedAt: 2 };
    const { slice } = mergeWorkspaceThreeWay(base, phone, web, 3);
    const open = slice.tasks.filter((t) => t.goalNodeId === 'ch4');
    expect(open.map((t) => t.id)).toEqual(['b']);
    expect(open[0].pastFailedNativeDates).toEqual(['2026-11-11']);
    expect(slice.goals[0].children[0].todayTaskId).toBe('b');
  });

  it('plans onto an unfinished card that lost its link instead of making another', () => {
    const lost = card('a', '2026-11-11');
    expect(currentGoalPlan([lost], step(null))?.id).toBe('a');
    expect(currentGoalPlan([card('done', '2026-11-10', { progress: 1 }), lost], step('done'))?.id).toBe('a');
    expect(currentGoalPlan([card('done', '2026-11-10', { progress: 1 })], step('done'))?.id).toBe('done');
  });
});
