import type { WorkspaceSlice } from './syncMerge';

export type SyncConflictStrategy = 'merge' | 'cloud' | 'device';

export type SyncDecision =
  | 'noop'
  | 'pull'
  | 'push'
  | 'merge'
  | 'conflict'
  | 'empty-error';

/** A copy with recorded focus or deletion evidence is not an empty device. */
export function isWorkspaceEffectivelyEmpty(slice: WorkspaceSlice): boolean {
  return slice.tasks.length === 0 && slice.goals.length === 0
    && slice.recentlyDeletedGoals.length === 0
    && (slice.deletionLedger?.length ?? 0) === 0
    && Object.values(slice.sessionHistory).every(rows => rows.length === 0);
}

export function decideSyncAction(input: {
  localFingerprint: string;
  remoteFingerprint: string | null;
  baseFingerprint: string | null;
  localEmpty: boolean;
  allowEmpty?: boolean;
  conflictStrategy?: SyncConflictStrategy;
}): SyncDecision {
  const {
    localFingerprint,
    remoteFingerprint,
    baseFingerprint,
    localEmpty,
    allowEmpty,
    conflictStrategy,
  } = input;

  if (allowEmpty) return 'push';
  if (localEmpty) {
    if (!remoteFingerprint) return 'empty-error';
    if (localFingerprint === remoteFingerprint) return 'noop';
    if (conflictStrategy === 'cloud') return 'pull';
    // A first-time empty device may hydrate automatically. A previously synced
    // device emptied by edits must never silently restore old cloud work.
    if (!baseFingerprint || (localFingerprint === baseFingerprint && remoteFingerprint !== baseFingerprint)) return 'pull';
    return 'empty-error';
  }
  if (!remoteFingerprint) {
    return baseFingerprint && conflictStrategy !== 'device' ? 'conflict' : 'push';
  }
  if (localFingerprint === remoteFingerprint) return 'noop';
  if (conflictStrategy === 'cloud') return 'pull';

  const localChanged = !baseFingerprint || localFingerprint !== baseFingerprint;
  const remoteChanged = !baseFingerprint || remoteFingerprint !== baseFingerprint;
  if (baseFingerprint && !localChanged && remoteChanged) return 'pull';
  if (baseFingerprint && localChanged && !remoteChanged) return 'push';
  if (conflictStrategy === 'merge') return 'merge';
  if (conflictStrategy === 'device') return 'push';
  return 'conflict';
}
