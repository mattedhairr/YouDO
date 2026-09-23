import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mocks.getSession }, from: mocks.from, rpc: mocks.rpc } }));
import { fetchLiveBackupMeta, resetVisitSnapshotFreeze, upsertLiveBackup } from './cloudBackup';

beforeEach(() => { vi.resetAllMocks(); resetVisitSnapshotFreeze(); });
describe('backup request boundaries', () => {
  it('rejects oversized UTF-8 text before any network operation', async () => {
    expect((await upsertLiveBackup('a', 'अ'.repeat(1_500_000), { expectedRevision: 0 })).ok).toBe(false);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('refuses to upload an old account payload with a new account session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'b' } } }, error: null });
    expect((await upsertLiveBackup('a', '{}', { expectedRevision: 0 })).ok).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rechecks identity after awaiting the safety snapshot', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'a' } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'b' } } }, error: null });
    const insert = vi.fn();
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), insert });
    expect((await upsertLiveBackup('a', '{}', { expectedRevision: 0 })).ok).toBe(false);
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
  it('reads the revision alongside the cloud copy', async () => {
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { backup_data: '{}', updated_at: '2026-09-23T00:00:00Z', revision: 7 }, error: null }) }) }) });
    await expect(fetchLiveBackupMeta('a')).resolves.toEqual({ backupData: '{}', updatedAt: '2026-09-23T00:00:00Z', revision: 7 });
  });
  it('keeps the device copy when the revision column is absent', async () => {
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'column revision does not exist' } }) }) }) });
    await expect(fetchLiveBackupMeta('a')).rejects.toThrow(/migration/i);
  });
  it('uses the server revision when conditionally writing a backup', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' } } }, error: null });
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) });
    mocks.rpc.mockResolvedValue({ data: [{ new_revision: 4, new_updated_at: '2026-09-23T00:00:00Z' }], error: null });
    const result = await upsertLiveBackup('a', '{}', { expectedRevision: 3 });
    expect(mocks.rpc).toHaveBeenCalledWith('cas_user_backup', { p_expected_revision: 3, p_backup_data: '{}' });
    expect(result).toMatchObject({ ok: true, revision: 4 });
  });
  it('leaves the cloud unchanged on a stale revision or missing migration', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' } } }, error: null });
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) });
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect((await upsertLiveBackup('a', '{}', { expectedRevision: 3 })).error).toMatch(/changed on another device/i);
    expect((await upsertLiveBackup('a', '{}', { expectedRevision: 3 })).error).toMatch(/migration/i);
  });
  it('blocks an explicit overwrite when the current cloud copy cannot be archived', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' } } }, error: null });
    mocks.from.mockImplementation((table: string) => table === 'user_backups'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { backup_data: '{"tasks":[],"goals":[]}' }, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }), insert: async () => ({ error: { message: 'snapshot unavailable' } }) });
    const result = await upsertLiveBackup('a', '{}', { expectedRevision: 2, requireSafetyCopy: true });
    expect(result.error).toMatch(/safety copy/i);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
