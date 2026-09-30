import { describe, expect, it, vi } from 'vitest';
import { checkAccountAvailability } from './accountAvailability';

describe('account availability', () => {
  const lookup = (userId: string | null, error: { code?: string; name?: string } | null = null) => ({
    getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null }, error }),
  });

  it('accepts a server-verified matching account', async () => {
    expect(await checkAccountAvailability(lookup('account-a'), 'account-a')).toBe('active');
  });

  it.each([
    { code: 'user_not_found' },
    { code: 'session_not_found' },
    { name: 'AuthSessionMissingError' },
  ])('recognizes a missing account or session from Auth', async error => {
    expect(await checkAccountAvailability(lookup(null, error), 'account-a')).toBe('gone');
  });

  it('does not confuse outages, unrelated permission errors, or an account switch with deletion', async () => {
    expect(await checkAccountAvailability(lookup(null, { code: 'request_timeout' }), 'account-a')).toBe('unknown');
    expect(await checkAccountAvailability(lookup(null, { code: 'unexpected_failure' }), 'account-a')).toBe('unknown');
    expect(await checkAccountAvailability(lookup('account-b'), 'account-a')).toBe('unknown');
    expect(await checkAccountAvailability({ getUser: vi.fn().mockRejectedValue(new Error('offline')) }, 'account-a')).toBe('unknown');
  });
});
