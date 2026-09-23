import type { ActiveSession, TaskSession } from '../types';
import { STORAGE_KEYS } from './storageKeys';

export function parseSavedSession(raw: string | null): ActiveSession | null {
  if (raw === null || raw === 'null') return null;
  const fail = () => { throw new Error('The saved timer is unreadable. Your data has not been erased; export a backup before seeking help.'); };
  let value: ActiveSession;
  try { value = JSON.parse(raw) as ActiveSession; } catch { return fail(); }
  if (!value || typeof value.taskId !== 'string' || !value.taskId
    || !Number.isFinite(value.startTime) || value.startTime <= 0
    || !Number.isFinite(value.pausedDuration) || value.pausedDuration < 0
    || typeof value.isPaused !== 'boolean' || !Number.isFinite(value.lastHeartbeat)
    || (value.pauseStart !== undefined && !Number.isFinite(value.pauseStart))
    || !Array.isArray(value.pauses) || value.pauses.some(pause => !pause || !Number.isFinite(pause.start)
      || (pause.end !== undefined && !Number.isFinite(pause.end)))
    || (value.returnedAt !== undefined && !Number.isFinite(value.returnedAt))
    || (value.nativeActionRevision !== undefined && (!Number.isSafeInteger(value.nativeActionRevision)
      || value.nativeActionRevision < 0))) return fail();
  return value;
}

/** Synchronous timer journal. Never accept a transition whose write failed.
 * The compare-before-write detects stale tabs, not a cross-process transaction.
 */
export function createSessionJournal(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const owner = storage.getItem(STORAGE_KEYS.workspaceOwner);
  let lastRaw = storage.getItem(STORAGE_KEYS.activeSession);
  const checkOwner = () => {
    if (storage.getItem(STORAGE_KEYS.workspaceOwner) !== owner) {
      throw new Error('The workspace account changed in another window. Reopen YouDO before changing the timer.');
    }
  };
  return {
    read(): ActiveSession | null {
      checkOwner();
      const raw = storage.getItem(STORAGE_KEYS.activeSession);
      const value = parseSavedSession(raw);
      lastRaw = raw;
      return value;
    },
    write(next: ActiveSession | null) {
      checkOwner();
      if (storage.getItem(STORAGE_KEYS.activeSession) !== lastRaw) {
        throw new Error('The timer changed in another window. Reopen YouDO before changing it here.');
      }
      parseSavedSession(lastRaw); // Do not silently replace an unreadable record.
      const raw = JSON.stringify(next);
      parseSavedSession(raw);
      storage.setItem(STORAGE_KEYS.activeSession, raw);
      lastRaw = raw;
    },
  };
}

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

/** Notification storage can lag behind a just-persisted WebView transition. */
export function selectNativeSession(current: ActiveSession | null, incoming: ActiveSession,
  history: Record<string, TaskSession[]>): ActiveSession | null {
  if (!Number.isFinite(incoming.lastHeartbeat) || nativeSessionIsFinished(incoming, history)) return current;
  if (!current) return incoming;
  if (current.taskId !== incoming.taskId || current.startTime !== incoming.startTime) return current;
  const currentRevision = current.nativeActionRevision ?? 0;
  const incomingRevision = incoming.nativeActionRevision ?? 0;
  if (incomingRevision !== currentRevision) return incomingRevision > currentRevision ? incoming : current;
  return incoming.lastHeartbeat > current.lastHeartbeat ? incoming : current;
}
