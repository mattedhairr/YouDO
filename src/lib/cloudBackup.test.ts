import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), from: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mocks.getSession }, from: mocks.from } }));
import { fetchLiveBackupMeta, resetVisitSnapshotFreeze, upsertLiveBackup } from './cloudBackup';

beforeEach(() => { vi.resetAllMocks(); resetVisitSnapshotFreeze(); });
describe('backup request boundaries', () => {
  it('rejects oversized UTF-8 text before any network operation', async () => {
    expect((await upsertLiveBackup('a', 'अ'.repeat(1_500_000))).ok).toBe(false);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('refuses to upload an old account payload with a new account session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'b' } } }, error: null });
    expect((await upsertLiveBackup('a', '{}')).ok).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rechecks identity after awaiting the safety snapshot', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'a' } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'b' } } }, error: null });
    const insert = vi.fn();
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), insert });
    expect((await upsertLiveBackup('a', '{}', { expectedUpdatedAt: null })).ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
  it('distinguishes a failed cloud read from an absent backup', async () => {
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'network unavailable' } }) }) }) });
    await expect(fetchLiveBackupMeta('a')).rejects.toThrow('Could not read');
  });
  it('returns null for a successfully read empty account', async () => {
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) });
    await expect(fetchLiveBackupMeta('a')).resolves.toBeNull();
  });
});
