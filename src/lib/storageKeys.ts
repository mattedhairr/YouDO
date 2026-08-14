export const STORAGE_KEYS = {
  tasks: 'youdo-tasks-v3',
  goals: 'youdo-goals-v3',
  deletedGoals: 'youdo-deleted-goals-v1',
  activeSession: 'youdo-active-session-v1',
  sessionHistory: 'youdo-session-history-v1',
  theme: 'youdo-theme-v4',
  view: 'youdo-view',
  goalPathIds: 'youdo-goal-path-ids',
} as const;

const LEGACY_ALIASES: Record<string, string[]> = {
  [STORAGE_KEYS.tasks]: ['tudo-tasks-v3'],
  [STORAGE_KEYS.goals]: ['tudo-goals-v3'],
  [STORAGE_KEYS.theme]: ['tudo-theme-v4'],
  [STORAGE_KEYS.view]: ['todo.view'],
  [STORAGE_KEYS.goalPathIds]: ['todo.goalPathIds'],
};

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
