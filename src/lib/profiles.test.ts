import { describe, expect, it } from 'vitest';
import {
  ensureProfileFromAuth,
  hasPrivateHubUsername,
  normalizeUsername,
  resolvePrivateHubUsername,
  usernameFromAuthMetadata,
  usernameSearchPrefix,
} from './profiles';

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
});
