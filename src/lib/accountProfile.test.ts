import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateAccountProfile } from './accountProfile';

afterEach(() => vi.unstubAllGlobals());

describe('account profile update', () => {
  it('uses the captured account token and confirms the response owner', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'account-a', user_metadata: { full_name: 'A' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(updateAccountProfile('account-a', 'token-a', { full_name: 'A' })).resolves.toMatchObject({ id: 'account-a' });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/v1\/user$/), expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer token-a' }),
      body: JSON.stringify({ data: { full_name: 'A' } }),
    }));
  });

  it('does not accept a profile returned for another account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'account-b' }) }));
    await expect(updateAccountProfile('account-a', 'token-a', { full_name: 'A' })).rejects.toThrow(/different profile/);
  });

  it('accepts the wrapped user response also handled by the installed auth client', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: 'account-a' } }) }));
    await expect(updateAccountProfile('account-a', 'token-a', { full_name: 'A' })).resolves.toMatchObject({ id: 'account-a' });
  });
});
