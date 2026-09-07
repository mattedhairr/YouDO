import type { ActiveSession, TaskSession } from '../types';
import { STORAGE_KEYS } from './storageKeys';

/** Save history before clearing the timer or applying completion. Failure must reach the UI. */
export function persistSessionRecord(history: Record<string, TaskSession[]>, record: TaskSession,
  storage: Pick<Storage, 'setItem'> = localStorage): Record<string, TaskSession[]> {
  const rows = history[record.taskId] ?? [];
  const next = { ...history, [record.taskId]: [...rows.filter((row) => row.id !== record.id), record] };
  storage.setItem(STORAGE_KEYS.sessionHistory, JSON.stringify(next));
  return next;
}

export function nativeSessionIsFinished(session: ActiveSession, history: Record<string, TaskSession[]>): boolean {
  return (history[session.taskId] ?? []).some((row) => row.startTime === session.startTime && row.manual !== true);
}
