import { describe, expect, it, vi } from 'vitest';
import { captureWorkspace, commitWorkspaceReplacement, prepareWorkspaceReplacement, recoverWorkspaceReplacement, restoreAccountWorkspace } from './workspaceReplacement';
import { STORAGE_KEYS as K } from './storageKeys';

class FaultStorage {
  values = new Map<string, string>([
    [K.workspaceOwner, 'old-account'], [K.tasks, '[{"id":"old","title":"Keep my work"}]'],
    [K.goals, '[]'], [K.sessionHistory, '{}'], [K.theme, 'dark'], ['tudo-tasks-v3', '[{"title":"Old alias"}]'],
  ]);
  fault: (key: string) => boolean = () => false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fault(key)) throw new Error('quota'); this.values.set(key, value); }
  removeItem(key: string) { if (this.fault(key)) throw new Error('blocked'); this.values.delete(key); }
}
const cloud = '{"tasks":[{"id":"new","title":"Downloaded work"}],"goals":[]}';
const options = (fetchBackup = async () => cloud) => ({ accountId: 'new-account', currentAccountId: () => 'new-account', fetchBackup });

describe('account workspace replacement', () => {
  it('leaves every key untouched when the download fails', async () => {
    const storage = new FaultStorage(); const before = new Map(storage.values);
    await expect(restoreAccountWorkspace(options(async () => { throw new Error('offline'); }), storage)).rejects.toThrow('offline');
    expect(storage.values).toEqual(before);
  });
  it.each([null, '{}', '{broken', '{"tasks":[{"id":"lost"}],"goals":[]}'])('preserves the device when the cloud returns %s', async json => {
    const storage = new FaultStorage(); const before = new Map(storage.values);
    await expect(restoreAccountWorkspace({ ...options(), fetchBackup: async () => json }, storage)).rejects.toThrow();
    expect(storage.values).toEqual(before);
  });
  it('binds the replacement to its starting account', async () => {
    const storage = new FaultStorage(); const before = new Map(storage.values); let account = 'new-account';
    await expect(restoreAccountWorkspace({ ...options(async () => { account = 'other-account'; return cloud; }), currentAccountId: () => account }, storage)).rejects.toThrow('Account changed');
    expect(storage.values).toEqual(before);
  });
  it('refuses to replace edits made during the download', async () => {
    const storage = new FaultStorage();
    await expect(restoreAccountWorkspace(options(async () => { storage.setItem(K.tasks, '[{"title":"Just edited"}]'); return cloud; }), storage)).rejects.toThrow('workspace changed');
    expect(storage.getItem(K.tasks)).toContain('Just edited');
    expect(storage.getItem(K.workspaceOwner)).toBe('old-account');
  });
  it('protects even an unreadable active timer and never downloads', async () => {
    const storage = new FaultStorage(); storage.setItem(K.activeSession, '{broken'); const fetch = vi.fn();
    await expect(restoreAccountWorkspace(options(fetch), storage)).rejects.toThrow('focus session');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('refuses a timer started while waiting for the download', async () => {
    const storage = new FaultStorage();
    await expect(restoreAccountWorkspace(options(async () => { storage.setItem(K.activeSession, '{"taskId":"active"}'); return cloud; }), storage)).rejects.toThrow('workspace changed');
    expect(storage.getItem(K.activeSession)).toContain('active');
  });
  it('refuses before modifying work when the checkpoint cannot fit', async () => {
    const storage = new FaultStorage(); const before = new Map(storage.values);
    storage.fault = key => key === K.workspaceReplacement;
    await expect(restoreAccountWorkspace(options(), storage)).rejects.toThrow('existing copy is unchanged');
    expect(storage.values).toEqual(before);
  });
  it('rolls back all changed keys if any replacement write fails', async () => {
    const storage = new FaultStorage(); const before = new Map(storage.values); let failed = false;
    storage.fault = key => { if (key === K.goals && !failed) { failed = true; return true; } return false; };
    await expect(restoreAccountWorkspace(options(), storage)).rejects.toThrow('previous device copy was restored');
    expect(storage.values).toEqual(before);
  });
  it('keeps the checkpoint if rollback also fails, then recovers on retry', async () => {
    const storage = new FaultStorage(); const before = new Map(storage.values);
    storage.fault = key => key === K.goals;
    await expect(restoreAccountWorkspace(options(), storage)).rejects.toThrow('recovering the previous device copy');
    expect(storage.getItem(K.workspaceReplacement)).not.toBeNull();
    storage.fault = () => false;
    recoverWorkspaceReplacement(storage);
    expect(storage.values).toEqual(before);
  });
  it('recovers after a simulated process termination between writes', () => {
    const storage = new FaultStorage(); const before = new Map(storage.values);
    storage.setItem(K.workspaceReplacement, JSON.stringify({ version: 1, before: captureWorkspace(storage) }));
    storage.setItem(K.tasks, '[]'); storage.setItem(K.workspaceOwner, 'new-account');
    recoverWorkspaceReplacement(storage);
    expect(storage.values).toEqual(before);
  });
  it('never treats an unreadable checkpoint as permission to open a mixed copy', () => {
    const storage = new FaultStorage(); storage.setItem(K.workspaceReplacement, '{broken'); const before = new Map(storage.values);
    expect(() => recoverWorkspaceReplacement(storage)).toThrow('recovering');
    expect(storage.values).toEqual(before);
  });
  it('persists the complete new copy, removes legacy aliases, and preserves device preferences', async () => {
    const storage = new FaultStorage();
    await restoreAccountWorkspace(options(), storage);
    expect(storage.getItem(K.tasks)).toContain('Downloaded work');
    expect(storage.getItem(K.workspaceOwner)).toBe('new-account');
    expect(storage.getItem(K.workspaceReplacement)).toBeNull();
    expect(storage.getItem('tudo-tasks-v3')).toBeNull();
    expect(storage.getItem(K.theme)).toBe('dark');
    expect(storage.getItem(K.workspaceCloudFingerprint)).toBeTruthy();
  });
  it('uses the same checkpoint for an explicitly chosen empty replacement', () => {
    const storage = new FaultStorage(); const before = captureWorkspace(storage);
    commitWorkspaceReplacement(before, prepareWorkspaceReplacement('{"tasks":[],"goals":[]}', 'new-account'), storage);
    expect(storage.getItem(K.tasks)).toBe('[]');
    expect(storage.getItem(K.workspaceOwner)).toBe('new-account');
  });
});
