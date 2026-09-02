export const STORAGE_KEYS = {
  tasks: 'youdo-tasks-v3',
  goals: 'youdo-goals-v3',
  deletedGoals: 'youdo-deleted-goals-v1',
  activeSession: 'youdo-active-session-v1',
  sessionHistory: 'youdo-session-history-v1',
  theme: 'youdo-theme-v4',
  view: 'youdo-view',
  goalPathIds: 'youdo-goal-path-ids',
  helpSeen: 'youdo-help-seen-v1',
  haptics: 'youdo-haptics-v1',
  streakMeta: 'youdo-streak-meta-v1',
  pacePrefs: 'youdo-pace-prefs-v1',
  paceRankSnapshot: 'youdo-pace-rank-snapshot-v1',
  workspaceUpdatedAt: 'youdo-workspace-updated-at-v1',
  workspaceCloudFingerprint: 'youdo-workspace-cloud-fingerprint-v1',
  workspaceOwner: 'youdo-workspace-owner-v1',
} as const;

const WORKSPACE_KEYS = [
  STORAGE_KEYS.tasks,
  STORAGE_KEYS.goals,
  STORAGE_KEYS.deletedGoals,
  STORAGE_KEYS.activeSession,
  STORAGE_KEYS.sessionHistory,
  STORAGE_KEYS.streakMeta,
  STORAGE_KEYS.pacePrefs,
  STORAGE_KEYS.paceRankSnapshot,
  STORAGE_KEYS.workspaceUpdatedAt,
  STORAGE_KEYS.workspaceCloudFingerprint,
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

export function readWorkspaceUpdatedAt(): number {
  const raw = readStorageRaw(STORAGE_KEYS.workspaceUpdatedAt);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function writeWorkspaceUpdatedAt(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.workspaceUpdatedAt, String(value));
  } catch {
    /* ignore */
  }
}

export function readWorkspaceCloudFingerprint(): string | null {
  return readStorageRaw(STORAGE_KEYS.workspaceCloudFingerprint);
}

export function writeWorkspaceCloudFingerprint(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.workspaceCloudFingerprint, value);
  } catch {
    /* ignore */
  }
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

function readArrayCount(key: string): number {
  try {
    const raw = readStorageRaw(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function readObjectCount(key: string): number {
  try {
    const raw = readStorageRaw(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.keys(parsed).length
      : 0;
  } catch {
    return 0;
  }
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
  let sessions = 0;
  try {
    const raw = readStorageRaw(STORAGE_KEYS.sessionHistory);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      sessions = Object.values(parsed as Record<string, unknown>).reduce<number>(
        (total, rows) => total + (Array.isArray(rows) ? rows.length : 0),
        0,
      );
    }
  } catch {
    sessions = 0;
  }
  const deleted = readArrayCount(STORAGE_KEYS.deletedGoals);
  const activeSession = readObjectCount(STORAGE_KEYS.activeSession) > 0;
  return { tasks, goals, sessions, activeSession, hasData: tasks + goals + sessions + deleted > 0 || activeSession };
}

export function readWorkspaceOwner(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.workspaceOwner);
  } catch {
    return null;
  }
}

export function writeWorkspaceOwner(userId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.workspaceOwner, userId);
  } catch {
    /* storage health is reported by the caller's normal persistence flow */
  }
}

/** Remove account-owned work while preserving device preferences such as theme and haptics. */
export function clearWorkspaceStorage(options?: { keepOwner?: boolean }): void {
  try {
    WORKSPACE_KEYS.forEach((key) => localStorage.removeItem(key));
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
