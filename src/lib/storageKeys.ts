import { isDeletionLedger } from './deletionLedger';

export const STORAGE_KEYS = {
  tasks: 'youdo-tasks-v3',
  goals: 'youdo-goals-v3',
  deletedGoals: 'youdo-deleted-goals-v1',
  deletionLedger: 'youdo-deletion-ledger-v1',
  activeSession: 'youdo-active-session-v1',
  discardedSessions: 'youdo-discarded-sessions-v1',
  sessionHistory: 'youdo-session-history-v1',
  theme: 'youdo-theme-v4',
  view: 'youdo-view',
  goalPathIds: 'youdo-goal-path-ids',
  helpSeen: 'youdo-help-seen-v1',
  haptics: 'youdo-haptics-v1',
  reducedEffects: 'youdo-reduced-effects-v1',
  streakMeta: 'youdo-streak-meta-v1',
  pacePrefs: 'youdo-pace-prefs-v1',
  paceRankSnapshot: 'youdo-pace-rank-snapshot-v1',
  workspaceUpdatedAt: 'youdo-workspace-updated-at-v1',
  workspaceCloudFingerprint: 'youdo-workspace-cloud-fingerprint-v1',
  workspaceSyncConflict: 'youdo-workspace-sync-conflict-v1',
  workspaceOwner: 'youdo-workspace-owner-v1',
  workspaceReplacement: 'youdo-workspace-replacement-v1',
  offlineMode: 'youdo-offline-mode-v1',
} as const;

export const REQUEST_ACCOUNT_ACCESS_EVENT = 'youdo:request-account-access';

export const WORKSPACE_KEYS = [
  STORAGE_KEYS.tasks,
  STORAGE_KEYS.goals,
  STORAGE_KEYS.deletedGoals,
  STORAGE_KEYS.deletionLedger,
  STORAGE_KEYS.activeSession,
  STORAGE_KEYS.discardedSessions,
  STORAGE_KEYS.sessionHistory,
  STORAGE_KEYS.streakMeta,
  STORAGE_KEYS.pacePrefs,
  STORAGE_KEYS.paceRankSnapshot,
  STORAGE_KEYS.workspaceUpdatedAt,
  STORAGE_KEYS.workspaceCloudFingerprint,
  STORAGE_KEYS.workspaceSyncConflict,
  STORAGE_KEYS.goalPathIds,
] as const;

const LEGACY_ALIASES: Record<string, string[]> = {
  [STORAGE_KEYS.tasks]: ['tudo-tasks-v3'],
  [STORAGE_KEYS.goals]: ['tudo-goals-v3'],
  [STORAGE_KEYS.theme]: ['tudo-theme-v4'],
  [STORAGE_KEYS.view]: ['todo.view'],
  [STORAGE_KEYS.goalPathIds]: ['todo.goalPathIds'],
  [STORAGE_KEYS.helpSeen]: ['youdo_has_seen_help'],
  [STORAGE_KEYS.haptics]: ['youdo_haptics_enabled'],
};

export const WORKSPACE_ALIAS_KEYS = [
  ...LEGACY_ALIASES[STORAGE_KEYS.tasks],
  ...LEGACY_ALIASES[STORAGE_KEYS.goals],
  ...LEGACY_ALIASES[STORAGE_KEYS.goalPathIds],
] as const;

export function readWorkspaceUpdatedAt(): number {
  const raw = readWorkspaceRawStrict(STORAGE_KEYS.workspaceUpdatedAt);
  const n = raw ? Number(raw) : 0;
  if (raw !== null && (!Number.isFinite(n) || n < 0)) throw new Error('Saved workspace sync time is invalid. Keep app data intact and retry.');
  return n > 0 ? n : 0;
}

export function readWorkspaceCloudFingerprint(): string | null {
  return readWorkspaceRawStrict(STORAGE_KEYS.workspaceCloudFingerprint);
}

/** Check only fields required for safe traversal; older optional fields remain valid. */
export function isStoredTaskList(value: unknown): boolean {
  return Array.isArray(value) && value.every(task => task !== null && typeof task === 'object' && !Array.isArray(task)
    && typeof task.id === 'string' && typeof task.title === 'string');
}

export function isStoredSessionHistory(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every(rows => Array.isArray(rows)
      && rows.every(row => row !== null && typeof row === 'object' && !Array.isArray(row)));
}

export function isStoredGoalTree(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const pending: unknown[] = [...value];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return false;
    const goal = node as Record<string, unknown>;
    if (typeof goal.id !== 'string' || typeof goal.title !== 'string' || !Array.isArray(goal.children)) return false;
    pending.push(...goal.children);
  }
  return true;
}

export function readStorageRaw(key: string): string | null {
  try {
    const current = localStorage.getItem(key);
    if (current != null) return current;

    const aliases = LEGACY_ALIASES[key] ?? [];
    for (const alias of aliases) {
      const legacy = localStorage.getItem(alias);
      if (legacy != null) {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(alias);
        return legacy;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Workspace hydration must distinguish an empty key from inaccessible storage.
 * Read legacy aliases without deleting them until a durable canonical save.
 */
export function readWorkspaceRawStrict(key: string): string | null {
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  for (const alias of LEGACY_ALIASES[key] ?? []) {
    const legacy = localStorage.getItem(alias);
    if (legacy !== null) return legacy;
  }
  return null;
}

export function readWorkspaceJsonStrict<T>(key: string, initial: T, validate: (value: unknown) => boolean): T {
  try {
    const raw = readWorkspaceRawStrict(key);
    if (raw === null) return initial;
    const parsed = JSON.parse(raw) as unknown;
    if (!validate(parsed)) throw new Error('Invalid saved shape');
    return parsed as T;
  } catch {
    const collection = ({
      [STORAGE_KEYS.tasks]: 'Today tasks',
      [STORAGE_KEYS.goals]: 'Goals',
      [STORAGE_KEYS.deletedGoals]: 'Recently Deleted goals',
      [STORAGE_KEYS.sessionHistory]: 'focus history',
      [STORAGE_KEYS.activeSession]: 'active session',
      [STORAGE_KEYS.streakMeta]: 'streak settings',
      [STORAGE_KEYS.pacePrefs]: 'pace settings',
    } as Record<string, string>)[key] ?? 'workspace';
    throw new Error(`Saved YouDO ${collection} data cannot be read safely. Do not clear app data or reinstall; retry after checking device storage.`);
  }
}

function readArrayCount(key: string): number {
  return readWorkspaceJsonStrict<unknown[]>(key, [], Array.isArray).length;
}

export interface LocalWorkspaceSummary {
  tasks: number;
  goals: number;
  sessions: number;
  activeSession: boolean;
  hasData: boolean;
}

export function readLocalWorkspaceSummary(): LocalWorkspaceSummary {
  const tasks = readArrayCount(STORAGE_KEYS.tasks);
  const goals = readArrayCount(STORAGE_KEYS.goals);
  const history = readWorkspaceJsonStrict<Record<string, unknown>>(STORAGE_KEYS.sessionHistory, {},
    value => value !== null && typeof value === 'object' && !Array.isArray(value)
      && Object.values(value).every(Array.isArray));
  const sessions = Object.values(history).reduce<number>((total, rows) => total + (rows as unknown[]).length, 0);
  const deleted = readArrayCount(STORAGE_KEYS.deletedGoals);
  const durableDeletions = readWorkspaceJsonStrict(STORAGE_KEYS.deletionLedger, [], isDeletionLedger).length;
  // Clearing a timer intentionally writes JSON `null`; it is not corruption.
  const savedTimer = readWorkspaceJsonStrict<Record<string, unknown> | null>(STORAGE_KEYS.activeSession, null,
    value => value === null || (typeof value === 'object' && !Array.isArray(value)));
  const activeSession = savedTimer !== null && Object.keys(savedTimer).length > 0;
  return { tasks, goals, sessions, activeSession, hasData: tasks + goals + sessions + deleted + durableDeletions > 0 || activeSession };
}

export function readWorkspaceOwner(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.workspaceOwner);
  } catch {
    throw new Error('The account workspace cannot be read from device storage. Keep app data intact and retry.');
  }
}

export function writeWorkspaceOwner(userId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.workspaceOwner, userId);
  } catch {
    /* storage health is reported by the caller's normal persistence flow */
  }
}

export function readOfflineMode(): boolean {
  return readStorageRaw(STORAGE_KEYS.offlineMode) === 'true';
}

export function writeOfflineMode(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEYS.offlineMode, 'true');
    else localStorage.removeItem(STORAGE_KEYS.offlineMode);
  } catch {
    /* the in-memory gate still handles this visit when storage is unavailable */
  }
}

export function requestAccountAccess(): void {
  window.dispatchEvent(new Event(REQUEST_ACCOUNT_ACCESS_EVENT));
}

/** Remove account-owned work while preserving device preferences such as theme and haptics. */
export function clearWorkspaceStorage(options?: { keepOwner?: boolean }): void {
  try {
    [...WORKSPACE_KEYS, ...WORKSPACE_ALIAS_KEYS].forEach((key) => localStorage.removeItem(key));
    if (!options?.keepOwner) localStorage.removeItem(STORAGE_KEYS.workspaceOwner);
  } catch {
    /* caller handles the signed-out gate even if storage is unavailable */
  }
}

export function clearYouDoStorage(): void {
  const prefixes = ['youdo-', 'tudo-', 'todo.'];
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && prefixes.some((p) => key.startsWith(p))) toRemove.push(key);
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}
