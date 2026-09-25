import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { matchesRecoveryGrant, nextRecoveryGrant, updatePasswordWithRecoveryToken } from './passwordRecovery';

const session = (userId: string, token: string) => ({ user: { id: userId }, access_token: token }) as Session;

afterEach(() => vi.unstubAllGlobals());

describe('password recovery authorization', () => {
  it('does not grant recovery from a URL marker or an ordinary signed-in session', () => {
    expect(nextRecoveryGrant(null, 'INITIAL_SESSION', session('account-a', 'token-a'), true)).toBeNull();
    expect(nextRecoveryGrant(null, 'SIGNED_IN', session('account-a', 'token-a'), true)).toBeNull();
    expect(nextRecoveryGrant(null, 'PASSWORD_RECOVERY', session('account-a', 'token-a'), false)).toBeNull();
  });

  it('binds a verified recovery callback to the account and exact session token', () => {
    const grant = nextRecoveryGrant(null, 'PASSWORD_RECOVERY', session('account-a', 'token-a'), true);
    expect(matchesRecoveryGrant(grant, session('account-a', 'token-a'))).toBe(true);
    expect(matchesRecoveryGrant(grant, session('account-b', 'token-b'))).toBe(false);
    expect(matchesRecoveryGrant(grant, session('account-a', 'new-token'))).toBe(false);
    expect(nextRecoveryGrant(grant, 'SIGNED_OUT', null, true)).toBeNull();
    expect(nextRecoveryGrant(grant, 'SIGNED_IN', session('account-b', 'token-b'), true)).toBeNull();
  });

  it('sends password updates with the verified recovery token rather than a mutable current session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await updatePasswordWithRecoveryToken('recovery-token', 'new-passphrase');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/v1\/user$/), expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ authorization: 'Bearer recovery-token' }),
      body: JSON.stringify({ password: 'new-passphrase' }),
    }));
  });
});
