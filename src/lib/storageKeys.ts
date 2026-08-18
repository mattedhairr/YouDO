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
  workspaceUpdatedAt: 'youdo-workspace-updated-at-v1',
} as const;

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
