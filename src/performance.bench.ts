import { bench, describe } from 'vitest';
import type { GoalNode, Task, TaskSession } from './types';
import { backupContentFingerprint, parseBackupPayload } from './lib/backup';
import { calendarFocusSummary } from './lib/calendarSummary';
import { netFocusByLocalDateOverlapping } from './lib/focusTrends';
import { clearRollupCache, findNode, rollupPct } from './lib/goalTree';

// Synthetic only. Fits the 4 MiB cloud limit; never reads a user's workspace.
const start = new Date(2025, 0, 1, 10).getTime();
const tasks: Task[] = Array.from({ length: 500 }, (_, i) => ({
  id: `task-${i}`, title: `Study topic ${i}`, description: '', priority: 'medium',
  targetDate: '2025-01-01', deadline: null, steps: ['Read', 'Practice'], progress: i % 3,
  createdAt: start, order: i,
}));
const goals: GoalNode[] = Array.from({ length: 10 }, (_, i) => ({
  id: `goal-${i}`, kind: 'goal', title: `Subject ${i}`, createdAt: start,
  children: Array.from({ length: 50 }, (_, j) => ({
    id: `branch-${i}-${j}`, kind: 'node', title: `Chapter ${j}`, createdAt: start,
    children: Array.from({ length: 10 }, (_, k) => ({
      id: `leaf-${i}-${j}-${k}`, kind: 'node', title: `Topic ${k}`, createdAt: start,
      children: [], completed: k % 2 === 0,
    })),
  })),
}));
const sessions: TaskSession[] = Array.from({ length: 5000 }, (_, i) => ({
  id: `session-${i}`, taskId: `task-${i % 500}`, startTime: start + i * 7200000,
  endTime: start + i * 7200000 + 3600000, pausedDuration: 0, pauses: [],
  netFocusMs: 3600000, wallClockStart: '', wallClockEnd: '', completed: false,
  completedStepIndices: [],
}));
const sessionHistory: Record<string, TaskSession[]> = {};
for (const session of sessions) (sessionHistory[session.taskId] ??= []).push(session);
const backup = JSON.stringify({ tasks, goals, sessionHistory });
if (new TextEncoder().encode(backup).length >= 4 * 1024 * 1024) throw new Error('Benchmark fixture exceeds cloud limit');
console.info(`Synthetic fixture: 5,510 tree nodes, 500 tasks, 5,000 sittings, ${backup.length} JSON characters`);

describe('workspace performance (synthetic)', () => {
  bench('tree: cold rollup and last-node lookup', () => {
    clearRollupCache();
    for (const goal of goals) rollupPct(goal);
    for (const goal of goals) findNode(goal, 'leaf-9-49-9');
  });
  bench('history: selected calendar day', () => { calendarFocusSummary(sessions, '2025-12-01'); });
  bench('history: all daily focus totals', () => { netFocusByLocalDateOverlapping(sessions); });
  bench('sync: validate backup', () => { parseBackupPayload(backup); });
  bench('sync: content fingerprint', () => { backupContentFingerprint(backup); });
});
