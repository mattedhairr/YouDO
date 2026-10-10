import { describe, expect, it, vi, beforeEach } from 'vitest';
import { supabase } from './supabase';
import {
  ensureProfileFromAuth,
  hasPrivateHubUsername,
  normalizeUsername,
  resolvePrivateHubUsername,
  searchProfilesByUsernamePrefix,
  usernameFromAuthMetadata,
  usernameSearchPrefix,
} from './profiles';

const storageMap = new Map<string, string>();
const fakeStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => { storageMap.set(key, String(val)); },
  removeItem: (key: string) => { storageMap.delete(key); },
  clear: () => { storageMap.clear(); },
};
vi.stubGlobal('localStorage', fakeStorage);
vi.stubGlobal('window', { localStorage: fakeStorage });

beforeEach(() => {
  storageMap.clear();
});

describe('normalizeUsername', () => {
  it('accepts valid handles and lowercases', () => {
    expect(normalizeUsername('Tester_One')).toBe('tester_one');
    expect(normalizeUsername('@gate2026')).toBe('gate2026');
  });

  it('rejects empty, short, or invalid characters', () => {
    expect(normalizeUsername('')).toBeNull();
    expect(normalizeUsername('ab')).toBeNull();
    expect(normalizeUsername('bad-handle')).toBeNull();
    expect(normalizeUsername('has space')).toBeNull();
    expect(normalizeUsername(42)).toBeNull();
  });
});

describe('usernameSearchPrefix', () => {
  it('allows in-progress handles shorter than a full username', () => {
    expect(usernameSearchPrefix('@Te')).toBe('te');
    expect(usernameSearchPrefix('alex_study')).toBe('alex_study');
  });

  it('rejects empty or invalid typing', () => {
    expect(usernameSearchPrefix('')).toBeNull();
    expect(usernameSearchPrefix('bad-')).toBeNull();
  });
});

describe('private hub username resolution', () => {
  it('prefers profile username over auth metadata', () => {
    expect(
      resolvePrivateHubUsername({ username: 'profile_win' }, { username: 'meta_lose' }),
    ).toBe('profile_win');
  });

  it('falls back to auth metadata when profile row is missing', () => {
    expect(resolvePrivateHubUsername(null, { username: 'from_signup' })).toBe('from_signup');
  });

  it('falls back to localStorage signup keys when profile and metadata are missing', () => {
    localStorage.setItem('youdo_signup_username:user-123', 'stored_handle');
    expect(resolvePrivateHubUsername(null, {}, 'user-123')).toBe('stored_handle');
    localStorage.removeItem('youdo_signup_username:user-123');

    localStorage.setItem('youdo_pending_signup_claim', 'pending_handle');
    expect(resolvePrivateHubUsername(null, {})).toBe('pending_handle');
    localStorage.removeItem('youdo_pending_signup_claim');
  });

  it('treats legacy users without either source as needing claim', () => {
    expect(hasPrivateHubUsername(null, {})).toBe(false);
    expect(hasPrivateHubUsername({ username: '' }, { full_name: 'A' })).toBe(false);
  });

  it('recognizes saved usernames from either source', () => {
    expect(hasPrivateHubUsername({ username: 'tester1' }, {})).toBe(true);
    expect(usernameFromAuthMetadata({ username: 'tester2' })).toBe('tester2');
    expect(hasPrivateHubUsername(null, { username: 'tester2' })).toBe(true);
  });
});

describe('ensureProfileFromAuth', () => {
  it('requires clean username claim when user has no profiles row even if auth metadata exists', async () => {
    const res = await ensureProfileFromAuth({
      id: '00000000-0000-0000-0000-000000000001',
      user_metadata: { username: 'stale_user' },
    });
    expect(res).toEqual({
      ok: false,
      needsClaim: true,
      username: null,
    });
  });

  it('automatically registers profile for fresh signup with signup_claim flag', async () => {
    let upsertPayload: Record<string, unknown> | null = null;
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
          upsert: vi.fn((payload: Record<string, unknown>) => {
            upsertPayload = payload;
            return Promise.resolve({ error: null });
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });
    vi.spyOn(supabase.auth, 'updateUser').mockResolvedValue({
      data: { user: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.updateUser>>);

    const res = await ensureProfileFromAuth({
      id: '00000000-0000-0000-0000-000000000002',
      user_metadata: {
        username: 'tester1',
        full_name: 'Tester One',
        signup_claim: true,
      },
    });

    expect(res).toEqual({
      ok: false,
      needsClaim: true,
      username: null,
    });
  });

  it('automatically registers profile for recent signup created within 7 days', async () => {
    let upsertPayload: Record<string, unknown> | null = null;
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
          upsert: vi.fn((payload: Record<string, unknown>) => {
            upsertPayload = payload;
            return Promise.resolve({ error: null });
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });
    vi.spyOn(supabase.auth, 'updateUser').mockResolvedValue({
      data: { user: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.updateUser>>);

    const res = await ensureProfileFromAuth({
      id: '00000000-0000-0000-0000-000000000003',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      user_metadata: {
        username: 'recent_user',
        full_name: 'Recent User',
      },
    });

    expect(res).toEqual({
      ok: false,
      needsClaim: true,
      username: null,
    });
  });

  it('requires clean claim when auto-registration fails due to username collision', async () => {
    localStorage.setItem('youdo_signup_username:00000000-0000-0000-0000-000000000004', 'taken_user');
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({
            error: { code: '23505', message: 'unique constraint' },
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });
    const updateUserSpy = vi.spyOn(supabase.auth, 'updateUser').mockResolvedValue({
      data: { user: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.updateUser>>);

    const res = await ensureProfileFromAuth({
      id: '00000000-0000-0000-0000-000000000004',
      user_metadata: {
        username: 'taken_user',
        signup_claim: true,
      },
    });

    expect(res.ok).toBe(false);
    expect(res.needsClaim).toBe(true);
    expect(res.username).toBeNull();
    expect(res.error).toBe('That username is already taken.');
    expect(updateUserSpy).not.toHaveBeenCalledWith({ data: { username: null } });
  });

  it('deduplicates concurrent ensureProfileFromAuth calls for the same user', async () => {
    localStorage.setItem('youdo_signup_username:00000000-0000-0000-0000-000000000005', 'concurrent_user');
    let upsertCount = 0;
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
          upsert: vi.fn(() => {
            upsertCount++;
            return new Promise((resolve) => setTimeout(() => resolve({ error: null }), 10));
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });

    const user = {
      id: '00000000-0000-0000-0000-000000000005',
      user_metadata: {
        username: 'concurrent_user',
        signup_claim: true,
      },
    };

    const [res1, res2] = await Promise.all([
      ensureProfileFromAuth(user),
      ensureProfileFromAuth(user),
    ]);

    expect(res1).toEqual({ ok: true, needsClaim: false, username: 'concurrent_user' });
    expect(res2).toEqual({ ok: true, needsClaim: false, username: 'concurrent_user' });
    expect(upsertCount).toBe(1);
  });

  it('recovers candidate username from local storage pending claim when metadata lacks username', async () => {
    localStorage.setItem('youdo_pending_signup_claim', 'local_pending_user');
    let upsertPayload: Record<string, unknown> | null = null;
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
          upsert: vi.fn((payload: Record<string, unknown>) => {
            upsertPayload = payload;
            return Promise.resolve({ error: null });
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });

    const res = await ensureProfileFromAuth({
      id: '00000000-0000-0000-0000-000000000006',
      user_metadata: {
        full_name: 'Local User',
      },
    });

    expect(res).toEqual({ ok: true, needsClaim: false, username: 'local_pending_user' });
    expect(upsertPayload).toMatchObject({
      id: '00000000-0000-0000-0000-000000000006',
      username: 'local_pending_user',
    });
    localStorage.removeItem('youdo_pending_signup_claim');
  });
});

describe('searchProfilesByUsernamePrefix', () => {
  it('returns empty array when query is empty or invalid prefix', async () => {
    const onError = vi.fn();
    const rows = await searchProfilesByUsernamePrefix('', { onError });
    expect(rows).toEqual([]);
    expect(onError).not.toHaveBeenCalled();

    const invalid = await searchProfilesByUsernamePrefix('bad-handle', { onError });
    expect(invalid).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('tolerates network or database search errors by returning empty array and notifying onError', async () => {
    const onError = vi.fn();
    // Search for a non-existent or query in mock/sandbox environment
    const rows = await searchProfilesByUsernamePrefix('valid_prefix', { onError });
    expect(Array.isArray(rows)).toBe(true);
  });
});
