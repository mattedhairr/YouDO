import { describe, expect, it } from 'vitest';
import { canContinueOffline, canOpenAccountWorkspace, canOpenOfflineWorkspace } from './workspaceAccess';

describe('workspace render boundary', () => {
  it('opens only the account whose workspace inspection finished', () => {
    expect(canOpenAccountWorkspace('a', 'a', 'a')).toBe(true);
  });
  it('does not reuse account A readiness during account B first render', () => {
    expect(canOpenAccountWorkspace('b', 'a', 'a')).toBe(false);
    expect(canOpenAccountWorkspace('b', 'a', 'b')).toBe(false);
  });
  it('blocks a missing or changed local owner even after inspection', () => {
    expect(canOpenAccountWorkspace('a', 'a', null)).toBe(false);
    expect(canOpenAccountWorkspace('a', 'a', 'b')).toBe(false);
    expect(canOpenAccountWorkspace(null, 'a', 'a')).toBe(false);
  });
});

describe('offline access condition', () => {
  it('permits offline access when there is no existing workspace owner', () => {
    expect(canContinueOffline(false, null)).toBe(true);
    expect(canContinueOffline(true, null)).toBe(true);
  });

  it('permits offline access to preserved workspaces owned by a deleted account', () => {
    expect(canContinueOffline(true, 'deleted-account-id')).toBe(true);
  });

  it('does not permit offline access when owner exists without local data', () => {
    expect(canContinueOffline(false, 'deleted-account-id')).toBe(false);
  });

  it('enforces offline gate rules across session, toggle, and workspace presence', () => {
    // Authenticated user should not enter through offline gate
    expect(canOpenOfflineWorkspace({ user: { id: 'user-1' }, offlineMode: true, hasLocalWorkspace: true, owner: 'deleted-account-id' })).toBe(false);
    // Offline mode not toggled
    expect(canOpenOfflineWorkspace({ user: null, offlineMode: false, hasLocalWorkspace: true, owner: 'deleted-account-id' })).toBe(false);
    // Fresh install or unowned workspace
    expect(canOpenOfflineWorkspace({ user: null, offlineMode: true, hasLocalWorkspace: false, owner: null })).toBe(true);
    // Preserved workspace from deleted account
    expect(canOpenOfflineWorkspace({ user: null, offlineMode: true, hasLocalWorkspace: true, owner: 'deleted-account-id' })).toBe(true);
    // Stale owner marker with no local data
    expect(canOpenOfflineWorkspace({ user: null, offlineMode: true, hasLocalWorkspace: false, owner: 'deleted-account-id' })).toBe(false);
  });
});

