import { parseBackupPayload } from './backup';
import { mergeStreakMeta, sanitizeStreakMeta } from './focusTrends';
import { mergePacePrefs, sanitizePacePrefs } from './paceBoard';
import { sanitizeSessionHistory } from './sessionStats';
import { workspaceFingerprint, type TrashRecord, type WorkspaceSlice } from './syncMerge';
import { isDeletionLedger, sortDeletionLedger } from './deletionLedger';

/**
 * Cloud JSON is normalized while it is read. Fingerprint the device through the
 * same path so optional nulls/defaults cannot masquerade as edits on two devices.
 */
export function canonicalWorkspaceSlice(slice: WorkspaceSlice, todayISO: string): WorkspaceSlice {
  const parsed = parseBackupPayload(JSON.stringify({
    tasks: slice.tasks,
    goals: slice.goals,
    sessionHistory: slice.sessionHistory,
    recentlyDeletedGoals: slice.recentlyDeletedGoals,
    deletionLedger: slice.deletionLedger ?? [],
    streakMeta: slice.streakMeta,
    pacePrefs: slice.pacePrefs,
    updatedAt: slice.updatedAt,
  }));

  if (!parsed) return slice;
  return {
    tasks: parsed.tasks,
    goals: parsed.goals,
    sessionHistory: sanitizeSessionHistory(parsed.sessionHistory),
    recentlyDeletedGoals: Array.isArray(parsed.recentlyDeletedGoals)
      ? (parsed.recentlyDeletedGoals as TrashRecord[])
      : [],
    deletionLedger: isDeletionLedger(parsed.deletionLedger) ? sortDeletionLedger(parsed.deletionLedger) : [],
    streakMeta: sanitizeStreakMeta(parsed.streakMeta, todayISO),
    pacePrefs: sanitizePacePrefs(parsed.pacePrefs),
    updatedAt: parsed.updatedAt ?? 0,
  };
}

export function canonicalWorkspaceFingerprint(slice: WorkspaceSlice, todayISO: string): string {
  return workspaceFingerprint(canonicalWorkspaceSlice(slice, todayISO));
}

/** Goals, tasks, history and trash match: the copies differ at most in settings. */
export function differOnlyInSettings(local: WorkspaceSlice, remote: WorkspaceSlice, todayISO: string): boolean {
  const settings = { streakMeta: remote.streakMeta, pacePrefs: remote.pacePrefs, updatedAt: remote.updatedAt };
  return canonicalWorkspaceFingerprint({ ...local, ...settings }, todayISO) === canonicalWorkspaceFingerprint(remote, todayISO);
}

/** This device's work with each setting taken from whichever copy changed it last. */
export function mergeSettingsInto(local: WorkspaceSlice, remote: WorkspaceSlice): WorkspaceSlice {
  return {
    ...local,
    streakMeta: local.streakMeta ? mergeStreakMeta(local.streakMeta, remote.streakMeta) : remote.streakMeta,
    pacePrefs: local.pacePrefs ? mergePacePrefs(local.pacePrefs, remote.pacePrefs) : remote.pacePrefs,
    updatedAt: Math.max(local.updatedAt ?? 0, remote.updatedAt ?? 0) || undefined,
  };
}
