import { STORAGE_KEYS, WORKSPACE_ALIAS_KEYS } from './storageKeys';

const SAVED_WORK_KEYS = [
  STORAGE_KEYS.tasks, STORAGE_KEYS.goals, STORAGE_KEYS.deletedGoals,
  STORAGE_KEYS.deletionLedger, STORAGE_KEYS.sessionHistory,
  STORAGE_KEYS.streakMeta, STORAGE_KEYS.pacePrefs, STORAGE_KEYS.workspaceUpdatedAt,
  ...WORKSPACE_ALIAS_KEYS,
];

/** A first sign-in can have a cloud fingerprint before any workspace data was
 * written on this device. Such a device has not deliberately cleared its work.
 */
export function isPristineLocalWorkspace(storage: Pick<Storage, 'getItem'>): boolean {
  if (SAVED_WORK_KEYS.some(key => storage.getItem(key) !== null)) return false;
  const timer = storage.getItem(STORAGE_KEYS.activeSession);
  if (timer !== null && timer !== 'null') return false;
  const discarded = storage.getItem(STORAGE_KEYS.discardedSessions);
  return discarded === null || discarded === '[]';
}
