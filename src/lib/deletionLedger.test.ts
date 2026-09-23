import { describe, expect, it } from 'vitest';
import type { GoalNode, Task } from '../types';
import { advanceDeletionLedger, isDeletionLedger, mergeDeletionLedgers, markerMatches } from './deletionLedger';
import { backupContentFingerprint } from './backup';
import { canonicalWorkspaceFingerprint } from './syncPayload';

const root: GoalNode = { id: 'root', title: 'Exam', kind: 'goal', createdAt: 1, children: [
  { id: 'child', title: 'Chapter', kind: 'section', createdAt: 2, children: [] },
] };
const task: Task = { id: 'task', title: 'Practice', description: '', priority: 'medium', targetDate: null, deadline: null, steps: [], progress: 0, createdAt: 1, order: 0 };

describe('durable deletion ledger', () => {
  it('records every removed goal ID and task ID, not only visible trash', () => {
    const result = advanceDeletionLedger([], { tasks: [task], goals: [root] }, { tasks: [], goals: [] }, 42);
    expect(result.map(entry => `${entry.kind}:${entry.id}`).sort()).toEqual(['goal:child', 'goal:root', 'task:task']);
    expect(result.every(entry => entry.deletedAt === 42)).toBe(true);
    expect(markerMatches(result.find(entry => entry.id === 'root')!, root)).toBe(true);
  });

  it('removes a marker when its original ID is intentionally restored', () => {
    const removed = advanceDeletionLedger([], { tasks: [task], goals: [root] }, { tasks: [], goals: [] }, 42);
    expect(advanceDeletionLedger(removed, { tasks: [], goals: [] }, { tasks: [task], goals: [root] }, 43)).toEqual([]);
  });

  it('does not mistake a moved branch or edited task for a deletion', () => {
    const changedRoot = { ...root, title: 'New exam' };
    const changedTask = { ...task, title: 'New practice' };
    expect(advanceDeletionLedger([], { tasks: [task], goals: [root] }, { tasks: [changedTask], goals: [changedRoot] }, 42)).toEqual([]);
  });

  it('unions independent markers and refuses different snapshots of the same ID', () => {
    const first = advanceDeletionLedger([], { tasks: [task], goals: [] }, { tasks: [], goals: [] }, 42);
    const second = advanceDeletionLedger([], { tasks: [], goals: [root] }, { tasks: [], goals: [] }, 43);
    expect(mergeDeletionLedgers(first, second)).toHaveLength(3);
    const changed = advanceDeletionLedger([], { tasks: [{ ...task, title: 'Changed' }], goals: [] }, { tasks: [], goals: [] }, 44);
    expect(() => mergeDeletionLedgers(first, changed)).toThrow(/deletion/i);
  });

  it('validates imported markers rather than accepting malformed deletion evidence', () => {
    expect(isDeletionLedger([])).toBe(true);
    expect(isDeletionLedger([{ kind: 'task', id: 'x', contentFingerprint: '1:00000000000000aa', deletedAt: 4 }])).toBe(true);
    expect(isDeletionLedger([{ kind: 'task', id: '', contentFingerprint: '', deletedAt: -1 }])).toBe(false);
    expect(isDeletionLedger({})).toBe(false);
  });

  it('includes deletion evidence in cloud identity without changing old empty-ledger identities', () => {
    const marker = advanceDeletionLedger([], { tasks: [task], goals: [] }, { tasks: [], goals: [] }, 42)[0];
    const plain = JSON.stringify({ tasks: [], goals: [] });
    const deleted = JSON.stringify({ tasks: [], goals: [], deletionLedger: [marker] });
    expect(backupContentFingerprint(plain)).not.toBe(backupContentFingerprint(deleted));
    const base = { tasks: [], goals: [], sessionHistory: {}, recentlyDeletedGoals: [] };
    expect(canonicalWorkspaceFingerprint(base, '2026-09-23'))
      .toBe(canonicalWorkspaceFingerprint({ ...base, deletionLedger: [] }, '2026-09-23'));
  });
});
