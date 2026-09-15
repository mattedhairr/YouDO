import { describe, expect, it } from 'vitest';
import { mergeWorkspace, type WorkspaceSlice } from './syncMerge';
import type { Task } from '../types';

const empty: WorkspaceSlice = { tasks: [], goals: [], sessionHistory: {}, recentlyDeletedGoals: [] };
const task: Task = { id: 'phone-only', title: 'Revision', description: '', priority: 'medium', targetDate: null, deadline: null, steps: [], progress: 0, createdAt: 1, order: 0 };
describe('conservative workspace combination', () => {
  it('does not silently discard an independent task from the older copy', () => {
    expect(() => mergeWorkspace({ ...empty, updatedAt: 3 }, { ...empty, updatedAt: 2, tasks: [task] })).toThrow('cannot safely combine');
  });
  it('does not silently discard a task in an existing goal', () => {
    const goals = [{ id: 'g', title: 'Exam', kind: 'goal' as const, children: [], createdAt: 1 }];
    expect(() => mergeWorkspace({ ...empty, goals, updatedAt: 3 }, { ...empty, goals, updatedAt: 2, tasks: [{ ...task, goalNodeId: 'g' }] })).toThrow('cannot safely combine');
  });
  it('uses every supplied deletion marker before limiting the visible trash', () => {
    const recentlyDeletedGoals = Array.from({ length: 21 }, (_, n) => ({ id: `d${n}`, node: { id: `g${n}`, title: 'Deleted', kind: 'goal' as const, children: [], createdAt: 1 }, deletedAt: n + 1, parentRootId: null, tasks: [] }));
    const merged = mergeWorkspace({ ...empty, goals: recentlyDeletedGoals.map(row => row.node) }, { ...empty, recentlyDeletedGoals });
    expect(merged.goals).toHaveLength(0);
  });
});
