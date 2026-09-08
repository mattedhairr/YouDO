import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearWorkspaceStorage,
  readOfflineMode,
  readLocalWorkspaceSummary,
  readWorkspaceOwner,
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
});
