import { describe, expect, it } from 'vitest';
import { mergeWorkspace, type WorkspaceSlice } from './syncMerge';
import { decideSyncAction, isWorkspaceEffectivelyEmpty } from './syncDecision';
import type { Task } from '../types';

const empty: WorkspaceSlice = { tasks: [], goals: [], sessionHistory: {}, recentlyDeletedGoals: [] };
const task: Task = { id: 'phone-only', title: 'Revision', description: '', priority: 'medium', targetDate: null, deadline: null, steps: [], progress: 0, createdAt: 1, order: 0 };
describe('conservative workspace combination', () => {
  it('does not resurrect deliberately emptied local work from an unchanged cloud', () => {
    expect(decideSyncAction({ localFingerprint: 'empty', remoteFingerprint: 'base', baseFingerprint: 'base', localEmpty: true })).toBe('empty-error');
  });
  it('pulls into a genuinely new empty device without a sync base', () => {
    expect(decideSyncAction({ localFingerprint: 'empty', remoteFingerprint: 'cloud', baseFingerprint: null, localEmpty: true })).toBe('pull');
  });
  it('does not call a device with saved history and trash empty', () => {
    const slice: WorkspaceSlice = { ...empty, sessionHistory: { old: [{ id: 's' } as never] }, recentlyDeletedGoals: [{ id: 'd' } as never] };
    expect(isWorkspaceEffectivelyEmpty(slice)).toBe(false);
  });
  it('does not silently discard an independent task from the older copy', () => {
    expect(() => mergeWorkspace({ ...empty, updatedAt: 3 }, { ...empty, updatedAt: 2, tasks: [task] })).toThrow(/cannot safely combine/i);
  });
  it('does not silently discard a task in an existing goal', () => {
    const goals = [{ id: 'g', title: 'Exam', kind: 'goal' as const, children: [], createdAt: 1 }];
    expect(() => mergeWorkspace({ ...empty, goals, updatedAt: 3 }, { ...empty, goals, updatedAt: 2, tasks: [{ ...task, goalNodeId: 'g' }] })).toThrow(/cannot safely combine/i);
  });
  it('uses every supplied deletion marker before limiting the visible trash', () => {
    const recentlyDeletedGoals = Array.from({ length: 21 }, (_, n) => ({ id: `d${n}`, node: { id: `g${n}`, title: 'Deleted', kind: 'goal' as const, children: [], createdAt: 1 }, deletedAt: n + 1, parentRootId: null, tasks: [] }));
    const merged = mergeWorkspace({ ...empty, goals: recentlyDeletedGoals.map(row => row.node) }, { ...empty, recentlyDeletedGoals });
    expect(merged.goals).toHaveLength(0);
  });
  it('refuses a same-ID goal edit that would discard one device state', () => {
    const base = { id: 'g', title: 'Physics', kind: 'goal' as const, children: [], createdAt: 1 };
    expect(() => mergeWorkspace(
      { ...empty, goals: [{ ...base, title: 'Mechanics' }], updatedAt: 300 },
      { ...empty, goals: [{ ...base, title: 'Electromagnetism' }], updatedAt: 200 },
    )).toThrow(/Physics|Mechanics|Electromagnetism|goal/i);
  });
  it('refuses a same-ID task edit instead of choosing the newer whole workspace', () => {
    expect(() => mergeWorkspace(
      { ...empty, tasks: [{ ...task, title: 'Read chapter' }], updatedAt: 300 },
      { ...empty, tasks: [{ ...task, title: 'Solve problems' }], updatedAt: 200 },
    )).toThrow(/task/i);
  });
  it('refuses a same-ID session disagreement rather than rewriting focus evidence', () => {
    const first = { id: 'session', taskId: task.id, startTime: 1, endTime: 60_000, pausedDuration: 0, pauses: [], netFocusMs: 60_000, wallClockStart: '', wallClockEnd: '', completed: false, completedStepIndices: [] };
    expect(() => mergeWorkspace(
      { ...empty, sessionHistory: { [task.id]: [first] } },
      { ...empty, sessionHistory: { [task.id]: [{ ...first, netFocusMs: 30_000 }] } },
    )).toThrow(/session/i);
  });
  it('also refuses differing legacy items without workspace timestamps', () => {
    expect(() => mergeWorkspace(
      { ...empty, tasks: [{ ...task, title: 'Read chapter' }] },
      { ...empty, tasks: [{ ...task, title: 'Solve problems' }] },
    )).toThrow(/task/i);
  });
  it('does not treat a one-sided goal as definitely new when it may have been deleted', () => {
    const oldGoal = { id: 'g', title: 'Old plan', kind: 'goal' as const, children: [], createdAt: 1 };
    expect(() => mergeWorkspace(
      { ...empty, goals: [], updatedAt: 300 },
      { ...empty, goals: [oldGoal], updatedAt: 200 },
    )).toThrow(/cannot safely combine goal/i);
  });
  it('does not treat a one-sided task as definitely new in a legacy backup', () => {
    expect(() => mergeWorkspace({ ...empty }, { ...empty, tasks: [task] })).toThrow(/cannot safely combine task/i);
  });
  it('does not discard edits made to a branch that the other device deleted', () => {
    const original = { id: 'g', title: 'Physics', kind: 'goal' as const, children: [], createdAt: 1 };
    const deleted = { id: 'del', node: original, deletedAt: 3, parentRootId: null, tasks: [] };
    expect(() => mergeWorkspace(
      { ...empty, goals: [{ ...original, title: 'New physics notes' }], updatedAt: 4 },
      { ...empty, recentlyDeletedGoals: [deleted], updatedAt: 3 },
    )).toThrow(/deleted.*edited|edited.*deleted/i);
  });
  it('does not duplicate one session across task buckets', () => {
    const session = { id: 'same', taskId: 'a', startTime: 1, endTime: 60_000, pausedDuration: 0, pauses: [], netFocusMs: 60_000, wallClockStart: '', wallClockEnd: '', completed: false, completedStepIndices: [] };
    expect(() => mergeWorkspace(
      { ...empty, sessionHistory: { a: [session] } },
      { ...empty, sessionHistory: { b: [{ ...session, taskId: 'b' }] } },
    )).toThrow(/session/i);
  });
});
