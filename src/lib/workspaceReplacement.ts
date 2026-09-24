import { parseBackupPayload } from './backup';
import { todayISO } from './dates';
import { defaultStreakMeta, sanitizeStreakMeta } from './focusTrends';
import { sanitizePacePrefs } from './paceBoard';
import { sanitizeSessionHistory } from './sessionStats';
import { sanitizeTreeAndTasks } from './goalTree';
import { STORAGE_KEYS, WORKSPACE_ALIAS_KEYS, WORKSPACE_KEYS } from './storageKeys';
import { canonicalWorkspaceFingerprint } from './syncPayload';
import type { TrashRecord, WorkspaceSlice } from './syncMerge';
import { isDeletionLedger } from './deletionLedger';

type DeviceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
// Include old aliases so an intentionally empty replacement cannot revive them.
const REPLACEMENT_KEYS = [...WORKSPACE_KEYS, ...WORKSPACE_ALIAS_KEYS, STORAGE_KEYS.workspaceOwner];
const MUTATION_KEYS = [
  STORAGE_KEYS.tasks, STORAGE_KEYS.goals, STORAGE_KEYS.deletedGoals, STORAGE_KEYS.deletionLedger,
  STORAGE_KEYS.sessionHistory, STORAGE_KEYS.streakMeta, STORAGE_KEYS.pacePrefs,
  STORAGE_KEYS.workspaceUpdatedAt, STORAGE_KEYS.workspaceCloudFingerprint, STORAGE_KEYS.workspaceSyncConflict,
  ...WORKSPACE_ALIAS_KEYS,
] as const;
type MutationKey = typeof MUTATION_KEYS[number];
type WorkspaceMutation = Partial<Record<MutationKey, string | null>>;
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
    const keys = saved?.before && typeof saved.before === 'object' && !Array.isArray(saved.before)
      ? Object.keys(saved.before) : [];
    const validFull = saved?.version === 1 && keys.length === REPLACEMENT_KEYS.length
      && REPLACEMENT_KEYS.every(key => Object.prototype.hasOwnProperty.call(saved.before, key));
    const validMutation = saved?.version === 2 && keys.length > 0
      && keys.every(key => MUTATION_KEYS.includes(key as MutationKey));
    if ((!validFull && !validMutation) || keys.some(key => saved.before[key] !== null && typeof saved.before[key] !== 'string')) {
      throw new Error('Invalid checkpoint');
    }
    if (validFull) writeSnapshot(saved.before, storage);
    else for (const key of keys) {
      const value = saved.before[key];
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
    storage.removeItem(STORAGE_KEYS.workspaceReplacement);
  } catch {
    // Retain the checkpoint when recovery cannot finish. AuthGate stays closed.
    throw new Error(pendingMessage);
  }
}

/** Commit related ordinary workspace keys under the same startup-recovery gate
 * used by account replacement. No React state should advance until this returns.
 * This protects one browser window's writes, not concurrent writers in other tabs.
 */
export function commitWorkspaceMutation(next: WorkspaceMutation, storage: DeviceStorage = localStorage): boolean {
  if (storage.getItem(STORAGE_KEYS.workspaceReplacement) !== null) throw new Error(pendingMessage);
  const entries = Object.entries(next);
  if (entries.some(([key, value]) => !MUTATION_KEYS.includes(key as MutationKey) || (value !== null && typeof value !== 'string'))) {
    throw new Error('Invalid workspace mutation');
  }
  const changed = entries.filter(([key, value]) => storage.getItem(key) !== value);
  if (changed.length === 0) return false;
  const before = Object.fromEntries(changed.map(([key]) => [key, storage.getItem(key)]));
  try { storage.setItem(STORAGE_KEYS.workspaceReplacement, JSON.stringify({ version: 2, before })); }
  catch { throw new Error('There is not enough device storage to protect this save. Your previous copy is unchanged.'); }
  try {
    for (const [key, value] of changed) {
      if (value === null) storage.removeItem(key);
      else if (typeof value === 'string') storage.setItem(key, value);
    }
    storage.removeItem(STORAGE_KEYS.workspaceReplacement);
  } catch {
    recoverWorkspaceReplacement(storage);
    throw new Error('This change could not be saved. The previous device copy was restored. Free some storage, then retry.');
  }
  return true;
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

/** Full Settings import is replacement, never a merge with optional fields
 * from the previous workspace. Validation finishes before any device write.
 */
export function prepareSettingsImport(json: string): WorkspaceSlice | null {
  const parsed = parseBackupPayload(json);
  if (!parsed) return null;
  const { cleanedGoals, cleanedTasks } = sanitizeTreeAndTasks(parsed.goals, parsed.tasks);
  const today = todayISO();
  return {
    tasks: cleanedTasks,
    goals: cleanedGoals,
    sessionHistory: sanitizeSessionHistory(parsed.sessionHistory),
    recentlyDeletedGoals: Array.isArray(parsed.recentlyDeletedGoals) ? parsed.recentlyDeletedGoals as TrashRecord[] : [],
    deletionLedger: isDeletionLedger(parsed.deletionLedger) ? parsed.deletionLedger : [],
    streakMeta: sanitizeStreakMeta(parsed.streakMeta, today) ?? defaultStreakMeta(today),
    pacePrefs: sanitizePacePrefs(parsed.pacePrefs),
    updatedAt: parsed.updatedAt,
  };
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
    deletionLedger: isDeletionLedger(parsed.deletionLedger) ? parsed.deletionLedger : [],
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
    [STORAGE_KEYS.deletionLedger]: JSON.stringify(slice.deletionLedger),
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

/** Capture the signed-in account before the asynchronous auth sign-out. */
export function prepareAccountSignOut(accountId: string, storage: DeviceStorage = localStorage): WorkspaceSnapshot {
  const before = captureWorkspace(storage);
  assertWorkspaceUnchanged(before, storage);
  if (!accountId || before[STORAGE_KEYS.workspaceOwner] !== accountId) {
    throw new Error('The device workspace belongs to another account. Nothing was cleared.');
  }
  assertNoTimer(before);
  return before;
}

/** Clear only the captured account copy, with rollback if storage fails or changes. */
export function finishAccountSignOut(before: WorkspaceSnapshot, storage: DeviceStorage = localStorage): void {
  const empty = Object.fromEntries(REPLACEMENT_KEYS.map(key => [key, null])) as WorkspaceSnapshot;
  commitWorkspaceReplacement(before, empty, storage);
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
