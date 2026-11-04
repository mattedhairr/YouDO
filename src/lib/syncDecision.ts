import type { WorkspaceSlice } from './syncMerge';

export type SyncConflictStrategy = 'merge' | 'cloud' | 'device';

export type SyncDecision =
  | 'noop'
  | 'pull'
  | 'push'
  | 'merge'
  | 'settings'
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
  /** The copies hold the same work and differ only in settings, such as the bar hours. */
  onlySettingsDiffer?: boolean;
  /** The last agreed copy held no work, so this device's emptiness deleted nothing. */
  baseWasEmpty?: boolean;
}): SyncDecision {
  const {
    localFingerprint,
    remoteFingerprint,
    baseFingerprint,
    localEmpty,
    allowEmpty,
    conflictStrategy,
    onlySettingsDiffer,
    baseWasEmpty,
  } = input;

  if (allowEmpty) return 'push';
  // Nothing can be lost between copies of the same work, so settings never stop
  // sync. A first-time empty device (no base) still just takes the cloud's. When
  // only one copy changed since they last agreed, that copy is simply right,
  // whatever the device clocks say; the settings merge is for when both changed.
  if (
    onlySettingsDiffer && localFingerprint !== remoteFingerprint
    && (!localEmpty || baseFingerprint)
    && (!conflictStrategy || conflictStrategy === 'merge')
  ) {
    if (baseFingerprint && localFingerprint === baseFingerprint) return 'pull';
    if (baseFingerprint && remoteFingerprint === baseFingerprint) return 'push';
    return 'settings';
  }
  if (localEmpty) {
    // A new account has neither a cloud copy nor a prior sync base. Create its
    // first (empty) backup; a missing copy after a prior sync still needs review.
    if (!remoteFingerprint) return baseFingerprint && conflictStrategy !== 'merge' ? 'empty-error' : 'push';
    if (localFingerprint === remoteFingerprint) return 'noop';
    if (conflictStrategy === 'cloud') return 'pull';
    // A first-time empty device may hydrate automatically. A previously synced
    // device emptied by edits must never silently restore old cloud work.
    if (!baseFingerprint || (localFingerprint === baseFingerprint && remoteFingerprint !== baseFingerprint)) return 'pull';
    // It never had work (it may have changed a setting), so nothing can come back
    // that was deleted. Otherwise only a tap on Combine copies brings the work here.
    return conflictStrategy === 'merge' || baseWasEmpty ? 'merge' : 'empty-error';
  }
  if (!remoteFingerprint) {
    // The cloud copy is gone. That may be deliberate, so only a tap recreates it.
    return baseFingerprint && !conflictStrategy ? 'conflict' : 'push';
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
