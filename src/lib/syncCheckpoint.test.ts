import { describe, expect, it } from 'vitest';
import { defaultStreakMeta } from './focusTrends';
import { defaultPacePrefs } from './paceBoard';
import { STORAGE_KEYS as K } from './storageKeys';
import { canonicalWorkspaceFingerprint } from './syncPayload';
import { decideSyncAction } from './syncDecision';
import { isPristineLocalWorkspace } from './syncCheckpoint';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function emptyFingerprint(streakMeta: ReturnType<typeof defaultStreakMeta>) {
  return canonicalWorkspaceFingerprint({
    tasks: [], goals: [], sessionHistory: {}, recentlyDeletedGoals: [],
    streakMeta, pacePrefs: defaultPacePrefs(),
  }, '2026-09-24');
}

describe('first-account sync checkpoint', () => {
  it('creates the first backup for a new empty account', () => {
    expect(decideSyncAction({
      localFingerprint: 'empty', remoteFingerprint: null, baseFingerprint: null,
      localEmpty: true,
    })).toBe('push');
  });
  it('recognizes an untouched device with only a prior fingerprint as pristine', () => {
    const storage = memoryStorage({ [K.workspaceCloudFingerprint]: 'old', [K.workspaceSyncConflict]: 'review' });
    expect(isPristineLocalWorkspace(storage)).toBe(true);
    expect(isPristineLocalWorkspace(memoryStorage({ [K.activeSession]: 'null' }))).toBe(true);
    expect(isPristineLocalWorkspace(memoryStorage({ [K.workspaceUpdatedAt]: '1' }))).toBe(false);
    expect(isPristineLocalWorkspace(memoryStorage({ [K.tasks]: '[]' }))).toBe(false);
    expect(isPristineLocalWorkspace(memoryStorage({ [K.activeSession]: '{"id":"running"}' }))).toBe(false);
    expect(isPristineLocalWorkspace(memoryStorage({ [K.discardedSessions]: '["old"]' }))).toBe(false);
  });

  it('does not infer a deletion from generated defaults on reload', () => {
    const first = defaultStreakMeta('2026-09-24');
    const initial = emptyFingerprint(first);
    const storage = memoryStorage({ [K.workspaceCloudFingerprint]: initial });
    expect(isPristineLocalWorkspace(storage)).toBe(true);
    // A fresh default on a later mount can differ without any user edit.
    const later = { ...first, updatedAt: (first.updatedAt ?? 0) + 1000 };
    expect(emptyFingerprint(later)).not.toBe(initial);
    expect(decideSyncAction({
      localFingerprint: emptyFingerprint(later), remoteFingerprint: initial,
      baseFingerprint: isPristineLocalWorkspace(storage) ? null : storage.getItem(K.workspaceCloudFingerprint),
      localEmpty: true,
    })).toBe('pull');

    expect(isPristineLocalWorkspace(storage)).toBe(true);
  });
});
