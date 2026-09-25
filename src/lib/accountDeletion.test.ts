import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestAccountDeletion } from './accountDeletion';

afterEach(() => vi.unstubAllGlobals());

describe('account deletion request', () => {
  it('binds the confirmation to the displayed account and its captured token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, accountId: 'account-a' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestAccountDeletion('account-a', 'token-a')).resolves.toBe('account-a');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/functions\/v1\/delete-account$/), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer token-a' }),
      body: JSON.stringify({ confirmation: 'DELETE', expectedAccountId: 'account-a' }),
    }));
  });

  it('refuses a success response for another account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, accountId: 'account-b' }) }));
    await expect(requestAccountDeletion('account-a', 'token-a')).rejects.toThrow(/different account/);
  });
});
