import { describe, expect, it, vi } from 'vitest';
import { captureWorkspace, commitWorkspaceMutation, commitWorkspaceReplacement, prepareSettingsImport, prepareWorkspaceReplacement, recoverWorkspaceReplacement, restoreAccountWorkspace } from './workspaceReplacement';
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

describe('ordinary workspace mutations', () => {
  it('commits related goal and task keys as one recoverable operation', () => {
    const storage = new FaultStorage();
    commitWorkspaceMutation({ [K.tasks]: '[{"id":"new-task"}]', [K.goals]: '[{"id":"new-goal"}]' }, storage);
    expect(storage.getItem(K.tasks)).toContain('new-task');
    expect(storage.getItem(K.goals)).toContain('new-goal');
    expect(storage.getItem(K.workspaceReplacement)).toBeNull();
  });
  it('retires a legacy alias only after its canonical copy is protected', () => {
    const storage = new FaultStorage();
    commitWorkspaceMutation({ [K.tasks]: '[{"id":"new"}]', 'tudo-tasks-v3': null }, storage);
    expect(storage.getItem(K.tasks)).toContain('new');
    expect(storage.getItem('tudo-tasks-v3')).toBeNull();
    expect(storage.getItem(K.workspaceReplacement)).toBeNull();
  });
  it('does not change work when the protective checkpoint cannot fit', () => {
    const storage = new FaultStorage(); const before = new Map(storage.values);
    storage.fault = key => key === K.workspaceReplacement;
    expect(() => commitWorkspaceMutation({ [K.tasks]: '[]', [K.goals]: '[]' }, storage)).toThrow('unchanged');
    expect(storage.values).toEqual(before);
  });
  it('rolls back all related keys when a later write fails', () => {
    const storage = new FaultStorage(); const before = new Map(storage.values); let failed = false;
    storage.fault = key => { if (key === K.goals && !failed) { failed = true; return true; } return false; };
    expect(() => commitWorkspaceMutation({ [K.tasks]: '[]', [K.goals]: '[{"id":"new"}]' }, storage)).toThrow('restored');
    expect(storage.values).toEqual(before);
  });
  it('keeps the checkpoint if rollback fails and recovers it on restart', () => {
    const storage = new FaultStorage(); const before = new Map(storage.values);
    storage.fault = key => key === K.goals;
    expect(() => commitWorkspaceMutation({ [K.tasks]: '[]', [K.goals]: '[{"id":"new"}]' }, storage)).toThrow('recovering');
    expect(storage.getItem(K.workspaceReplacement)).not.toBeNull();
    storage.fault = () => false;
    recoverWorkspaceReplacement(storage);
    expect(storage.values).toEqual(before);
  });
  it('recovers a process exit between the first and second write', () => {
    const storage = new FaultStorage(); const before = new Map(storage.values);
    storage.setItem(K.workspaceReplacement, JSON.stringify({ version: 2, before: {
      [K.tasks]: storage.getItem(K.tasks), [K.goals]: storage.getItem(K.goals),
    } }));
    storage.setItem(K.tasks, '[]');
    recoverWorkspaceReplacement(storage);
    expect(storage.values).toEqual(before);
  });
  it('refuses to overwrite a pending account replacement', () => {
    const storage = new FaultStorage(); const before = captureWorkspace(storage);
    storage.setItem(K.workspaceReplacement, JSON.stringify({ version: 1, before }));
    expect(() => commitWorkspaceMutation({ [K.tasks]: '[]' }, storage)).toThrow('recover');
    expect(storage.getItem(K.tasks)).toContain('Keep my work');
  });
});

describe('Settings backup preparation', () => {
  it('validates before replacement and does not interpret unrelated JSON as an empty workspace', () => {
    expect(prepareSettingsImport('{}')).toBeNull();
    expect(prepareSettingsImport('{"tasks":[{"id":"incomplete"}],"goals":[]}')).toBeNull();
  });
  it('replaces omitted optional collections with clean defaults, not old-account state', () => {
    const imported = prepareSettingsImport('{"tasks":[],"goals":[]}');
    expect(imported).toMatchObject({ tasks: [], goals: [], sessionHistory: {}, recentlyDeletedGoals: [] });
    expect(imported?.streakMeta).toBeTruthy();
    expect(imported?.pacePrefs).toBeTruthy();
  });
});
