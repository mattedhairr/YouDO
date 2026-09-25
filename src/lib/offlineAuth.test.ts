import { describe, expect, it } from 'vitest';
import { readCachedWorkspaceUser, keepCachedWorkspaceOffline } from './offlineAuth';
import { STORAGE_KEYS } from './storageKeys';

const url = 'https://project-ref.supabase.co';
const key = 'sb-project-ref-auth-token';
function storage(values: Record<string, string>) {
  return { getItem: (name: string) => values[name] ?? null };
}
const saved = JSON.stringify({ access_token: 'cached-access', refresh_token: 'cached-refresh', expires_at: 1, user: { id: 'tester' } });

describe('offline workspace identity', () => {
  it('opens an expired but locally owned session while network refresh waits', () => {
    expect(readCachedWorkspaceUser(storage({ [STORAGE_KEYS.workspaceOwner]: 'tester', [key]: saved }), url)?.id).toBe('tester');
  });
  it('never opens another account or a missing saved session', () => {
    expect(readCachedWorkspaceUser(storage({ [STORAGE_KEYS.workspaceOwner]: 'personal', [key]: saved }), url)).toBeNull();
    expect(readCachedWorkspaceUser(storage({ [STORAGE_KEYS.workspaceOwner]: 'tester' }), url)).toBeNull();
    expect(readCachedWorkspaceUser(storage({ [STORAGE_KEYS.workspaceOwner]: 'tester', [key]: '{broken' }), url)).toBeNull();
  });
  it('keeps offline initialization but honors an explicit sign-out', () => {
    const cached = { id: 'tester' } as ReturnType<typeof readCachedWorkspaceUser>;
    expect(keepCachedWorkspaceOffline('INITIAL_SESSION', null, cached, false)).toBe(true);
    expect(keepCachedWorkspaceOffline('SIGNED_OUT', null, cached, false)).toBe(false);
    expect(keepCachedWorkspaceOffline('INITIAL_SESSION', null, cached, true)).toBe(false);
  });
});
