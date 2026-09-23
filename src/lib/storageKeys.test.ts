import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearWorkspaceStorage,
  readOfflineMode,
  readLocalWorkspaceSummary,
  readWorkspaceOwner,
  readWorkspaceJsonStrict,
  readWorkspaceCloudFingerprint,
  readWorkspaceUpdatedAt,
  isStoredGoalTree,
  isStoredTaskList,
  isStoredSessionHistory,
  requestAccountAccess,
  REQUEST_ACCOUNT_ACCESS_EVENT,
  STORAGE_KEYS,
  writeOfflineMode,
  writeWorkspaceOwner,
} from './storageKeys';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('account-owned local workspace', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('window', new EventTarget());
  });

  it('detects meaningful legacy device data without counting preferences', () => {
    localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify({ darkMode: true }));
    expect(readLocalWorkspaceSummary().hasData).toBe(false);

    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify([{ id: 'task-1' }]));
    localStorage.setItem(STORAGE_KEYS.goals, JSON.stringify([{ id: 'goal-1' }]));
    localStorage.setItem(STORAGE_KEYS.sessionHistory, JSON.stringify({ 'task-1': [{ id: 'session-1' }] }));
    expect(readLocalWorkspaceSummary()).toEqual({ tasks: 1, goals: 1, sessions: 1, activeSession: false, hasData: true });
  });

  it('clears account work and owner while preserving device preferences', () => {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify([{ id: 'task-1' }]));
    localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify({ darkMode: true }));
    localStorage.setItem(STORAGE_KEYS.haptics, JSON.stringify(true));
    writeWorkspaceOwner('user-1');

    clearWorkspaceStorage();

    expect(localStorage.getItem(STORAGE_KEYS.tasks)).toBeNull();
    expect(readWorkspaceOwner()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.theme)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.haptics)).not.toBeNull();
  });

  it('treats deletion evidence as account-owned data and clears it on sign-out', () => {
    localStorage.setItem(STORAGE_KEYS.deletionLedger, JSON.stringify([
      { kind: 'task', id: 'removed', contentFingerprint: '1:00000000000000aa', deletedAt: 4 },
    ]));
    localStorage.setItem(STORAGE_KEYS.workspaceSyncConflict, '{"accountId":"user-1"}');
    expect(readLocalWorkspaceSummary().hasData).toBe(true);
    clearWorkspaceStorage();
    expect(localStorage.getItem(STORAGE_KEYS.deletionLedger)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.workspaceSyncConflict)).toBeNull();
  });

  it('treats an interrupted active sitting as protected workspace data', () => {
    localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify({ taskId: 'task-1', startTime: 1 }));
    expect(readLocalWorkspaceSummary()).toEqual({
      tasks: 0,
      goals: 0,
      sessions: 0,
      activeSession: true,
      hasData: true,
    });
  });

  it('can clear work while retaining a confirmed owner binding', () => {
    localStorage.setItem(STORAGE_KEYS.goals, JSON.stringify([{ id: 'goal-1' }]));
    writeWorkspaceOwner('user-1');
    clearWorkspaceStorage({ keepOwner: true });
    expect(localStorage.getItem(STORAGE_KEYS.goals)).toBeNull();
    expect(readWorkspaceOwner()).toBe('user-1');
  });

  it('keeps offline entry as a device preference when clearing workspace data', () => {
    writeOfflineMode(true);
    clearWorkspaceStorage();
    expect(readOfflineMode()).toBe(true);
    writeOfflineMode(false);
    expect(readOfflineMode()).toBe(false);
  });

  it('signals the authentication gate without changing workspace data', () => {
    const listener = vi.fn();
    window.addEventListener(REQUEST_ACCOUNT_ACCESS_EVENT, listener);
    requestAccountAccess();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(REQUEST_ACCOUNT_ACCESS_EVENT, listener);
  });

  it('treats a completed timer saved as JSON null as an empty timer', () => {
    localStorage.setItem(STORAGE_KEYS.activeSession, 'null');
    expect(readLocalWorkspaceSummary().activeSession).toBe(false);
    expect(readLocalWorkspaceSummary().hasData).toBe(false);
  });

  it('does not misclassify corrupted private data as an empty workspace', () => {
    localStorage.setItem(STORAGE_KEYS.tasks, '{broken');
    expect(() => readLocalWorkspaceSummary()).toThrow('Today tasks');
    expect(() => readWorkspaceJsonStrict(STORAGE_KEYS.tasks, [], Array.isArray)).toThrow('Today tasks');
  });

  it('rejects the wrong saved collection shape during hydration', () => {
    localStorage.setItem(STORAGE_KEYS.goals, '{}');
    expect(() => readWorkspaceJsonStrict(STORAGE_KEYS.goals, [], Array.isArray)).toThrow('Goals');
  });

  it('reads a legacy key without deleting it before a durable save', () => {
    localStorage.setItem('tudo-tasks-v3', '[{"id":"old"}]');
    expect(readWorkspaceJsonStrict(STORAGE_KEYS.tasks, [], Array.isArray)).toEqual([{ id: 'old' }]);
    expect(localStorage.getItem('tudo-tasks-v3')).not.toBeNull();
  });

  it('does not let old aliases resurrect work after the workspace is cleared', () => {
    localStorage.setItem('tudo-tasks-v3', '[{"id":"old"}]');
    localStorage.setItem('tudo-goals-v3', '[{"id":"old-goal"}]');
    clearWorkspaceStorage();
    expect(readWorkspaceJsonStrict(STORAGE_KEYS.tasks, [], Array.isArray)).toEqual([]);
    expect(readWorkspaceJsonStrict(STORAGE_KEYS.goals, [], Array.isArray)).toEqual([]);
  });

  it('does not mistake unavailable owner storage for a signed-out workspace', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('unavailable'); } });
    expect(() => readWorkspaceOwner()).toThrow('workspace');
  });

  it('rejects nested corruption before startup tree repair can traverse it', () => {
    expect(isStoredGoalTree([{ id: 'g', title: 'Goal', children: [null] }])).toBe(false);
    expect(isStoredGoalTree([{ id: 'g', title: 'Goal', children: {} }])).toBe(false);
    expect(isStoredGoalTree([{ id: 'g', title: 'Goal', children: [{ id: 'n', title: 'Node', children: [] }] }])).toBe(true);
    expect(isStoredTaskList([{ id: 't', title: 'Task' }])).toBe(true);
    expect(isStoredTaskList([null])).toBe(false);
    expect(isStoredSessionHistory({ task: [{}] })).toBe(true);
    expect(isStoredSessionHistory({ task: {} })).toBe(false);
    localStorage.setItem(STORAGE_KEYS.goals, '[{"id":"g","title":"Goal","children":[null]}]');
    expect(() => readWorkspaceJsonStrict(STORAGE_KEYS.goals, [], isStoredGoalTree)).toThrow('Goals');
  });

  it('does not interpret inaccessible sync metadata as an empty cloud base', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('unavailable'); } });
    expect(() => readWorkspaceUpdatedAt()).toThrow('unavailable');
    expect(() => readWorkspaceCloudFingerprint()).toThrow('unavailable');
  });

  it('rejects a corrupt saved workspace timestamp', () => {
    localStorage.setItem(STORAGE_KEYS.workspaceUpdatedAt, 'not-a-timestamp');
    expect(() => readWorkspaceUpdatedAt()).toThrow('sync time');
  });
});
