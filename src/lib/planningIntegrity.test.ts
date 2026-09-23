import { describe, expect, it } from 'vitest';
import type { GoalNode, Task } from '../types';
import { pathTitles } from './goalTree';
import { taskOccurrenceOnDate, taskTimelineDates } from './taskTimeline';
import {
  activePlansForDeletedBranch,
  appendGoalChild,
  buildGoalPlanTask,
  goalDeletionLocation,
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
