import { parseBackupPayload } from './backup';
import { todayISO } from './dates';
import { defaultStreakMeta, sanitizeStreakMeta } from './focusTrends';
import { sanitizePacePrefs } from './paceBoard';
import { sanitizeSessionHistory } from './sessionStats';
import { STORAGE_KEYS, WORKSPACE_KEYS } from './storageKeys';
import { canonicalWorkspaceFingerprint } from './syncPayload';
import type { TrashRecord } from './syncMerge';

type DeviceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
// Include old aliases so an intentionally empty replacement cannot revive them.
const REPLACEMENT_KEYS = [...WORKSPACE_KEYS, 'tudo-tasks-v3', 'tudo-goals-v3', 'todo.goalPathIds', STORAGE_KEYS.workspaceOwner];
type WorkspaceSnapshot = Record<string, string | null>;
const pendingMessage = 'YouDO could not finish recovering the previous device copy. Keep app data intact, free some device storage, then retry.';

export function captureWorkspace(storage: DeviceStorage = localStorage): WorkspaceSnapshot {
  return Object.fromEntries(REPLACEMENT_KEYS.map(key => [key, storage.getItem(key)]));
}

function writeSnapshot(snapshot: WorkspaceSnapshot, storage: DeviceStorage) {
  // Bind the new owner only after all of its data has been written.
  for (const key of REPLACEMENT_KEYS) {
    const value = snapshot[key];
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  }
}

/** Called before mounting a workspace. Incomplete replacements roll back, never
 * open a mixture. This is a crash-recovery journal, not a cross-tab database lock.
 */
export function recoverWorkspaceReplacement(storage: DeviceStorage = localStorage): void {
  const raw = storage.getItem(STORAGE_KEYS.workspaceReplacement);
  if (raw === null) return;
  try {
    const saved = JSON.parse(raw) as { version: number; before: WorkspaceSnapshot };
    if (saved?.version !== 1 || !saved.before || Array.isArray(saved.before)
      || Object.keys(saved.before).length !== REPLACEMENT_KEYS.length
      || REPLACEMENT_KEYS.some(key => !(key in saved.before) || (saved.before[key] !== null && typeof saved.before[key] !== 'string'))) {
      throw new Error('Invalid checkpoint');
    }
    writeSnapshot(saved.before, storage);
    storage.removeItem(STORAGE_KEYS.workspaceReplacement);
  } catch {
    // Retain the checkpoint when recovery cannot finish. AuthGate stays closed.
    throw new Error(pendingMessage);
  }
}

export function assertWorkspaceUnchanged(before: WorkspaceSnapshot, storage: DeviceStorage = localStorage) {
  if (storage.getItem(STORAGE_KEYS.workspaceReplacement) !== null) throw new Error(pendingMessage);
  if (REPLACEMENT_KEYS.some(key => storage.getItem(key) !== before[key])) {
    throw new Error('The device workspace changed while preparing this choice. Nothing was replaced. Review it and try again.');
  }
}

function assertNoTimer(before: WorkspaceSnapshot) {
  const timer = before[STORAGE_KEYS.activeSession];
  if (timer !== null && timer !== 'null') throw new Error('Finish the saved focus session in its workspace before replacing this device copy.');
}

export function prepareWorkspaceReplacement(json: string, accountId: string): WorkspaceSnapshot {
  const parsed = parseBackupPayload(json);
  if (!parsed || !accountId) throw new Error('The cloud backup is unreadable. Your device copy has not been replaced.');
  const today = todayISO();
  const sourceStreak = sanitizeStreakMeta(parsed.streakMeta, today);
  const slice = {
    tasks: parsed.tasks, goals: parsed.goals,
    sessionHistory: sanitizeSessionHistory(parsed.sessionHistory),
    recentlyDeletedGoals: (parsed.recentlyDeletedGoals ?? []) as TrashRecord[],
    streakMeta: sourceStreak ?? defaultStreakMeta(today),
    pacePrefs: sanitizePacePrefs(parsed.pacePrefs),
    updatedAt: parsed.updatedAt ?? Date.now(),
  };
  return {
    ...Object.fromEntries(REPLACEMENT_KEYS.map(key => [key, null])),
    [STORAGE_KEYS.tasks]: JSON.stringify(slice.tasks),
    [STORAGE_KEYS.goals]: JSON.stringify(slice.goals),
    [STORAGE_KEYS.sessionHistory]: JSON.stringify(slice.sessionHistory),
    [STORAGE_KEYS.deletedGoals]: JSON.stringify(slice.recentlyDeletedGoals),
    [STORAGE_KEYS.streakMeta]: JSON.stringify(slice.streakMeta),
    [STORAGE_KEYS.pacePrefs]: JSON.stringify(slice.pacePrefs),
    [STORAGE_KEYS.workspaceUpdatedAt]: String(slice.updatedAt),
    // The sync base describes the downloaded copy, not device defaults added
    // while hydrating a legacy backup with no streak settings.
    [STORAGE_KEYS.workspaceCloudFingerprint]: canonicalWorkspaceFingerprint({ ...slice, streakMeta: sourceStreak }, today),
    [STORAGE_KEYS.workspaceOwner]: accountId,
  };
}

export function commitWorkspaceReplacement(before: WorkspaceSnapshot, next: WorkspaceSnapshot, storage: DeviceStorage = localStorage): void {
  assertNoTimer(before);
  assertWorkspaceUnchanged(before, storage);
  // If there is no room for a recovery copy, refuse before touching any data.
  try { storage.setItem(STORAGE_KEYS.workspaceReplacement, JSON.stringify({ version: 1, before })); }
  catch { throw new Error('There is not enough available device storage to protect this replacement. Your existing copy is unchanged.'); }
  try {
    writeSnapshot(next, storage);
    storage.removeItem(STORAGE_KEYS.workspaceReplacement);
  } catch {
    recoverWorkspaceReplacement(storage);
    throw new Error('The replacement could not be saved. The previous device copy was restored. Free some storage, then retry.');
  }
}

/** Download and validate before touching device data; recheck the account and
 * every persisted workspace key after the await, including an intervening timer.
 */
export async function restoreAccountWorkspace(options: {
  accountId: string;
  currentAccountId: () => string | null;
  fetchBackup: () => Promise<string | null>;
}, storage: DeviceStorage = localStorage): Promise<void> {
  const before = captureWorkspace(storage);
  assertNoTimer(before);
  assertWorkspaceUnchanged(before, storage);
  if (options.currentAccountId() !== options.accountId) throw new Error('Account changed. Nothing was replaced.');
  const json = await options.fetchBackup();
  if (options.currentAccountId() !== options.accountId) throw new Error('Account changed. Nothing was replaced.');
  if (!json) throw new Error('No cloud backup was found. Your device copy has not been replaced.');
  const next = prepareWorkspaceReplacement(json, options.accountId);
  commitWorkspaceReplacement(before, next, storage);
}
