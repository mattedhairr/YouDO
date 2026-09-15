import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), primaryUpdate: vi.fn(), signIn: vi.fn(), update: vi.fn(), signOut: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession, updateUser: mocks.primaryUpdate } },
  createCredentialVerificationClient: () => ({ auth: { signInWithPassword: mocks.signIn, updateUser: mocks.update, signOut: mocks.signOut } }),
}));
import { changeVerifiedCredentials } from './accountCredentials';
const account = { id: 'a', email: 'fixture@example.invalid' };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: { user: account } }, error: null });
  mocks.signIn.mockResolvedValue({ data: { session: { user: account }, user: account }, error: null });
  mocks.update.mockResolvedValue({ data: { user: account }, error: null });
  mocks.primaryUpdate.mockResolvedValue({ data: { user: account }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe('verified credential changes', () => {
  it('changes credentials through the verified account session, not the mutable app session', async () => {
    expect((await changeVerifiedCredentials(account, 'old-test-password', { password: 'new-test-password' })).ok).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ password: 'new-test-password' }, undefined);
    expect(mocks.primaryUpdate).not.toHaveBeenCalled();
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.signOut.mock.invocationCallOrder[0]);
  });
  it('refuses to start if the app has already changed accounts', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'b' } } }, error: null });
    expect((await changeVerifiedCredentials(account, 'old-test-password', { password: 'new-test-password' })).ok).toBe(false);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('cancels if the app switches accounts while checking the password', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: { user: account } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'b' } } }, error: null });
    expect((await changeVerifiedCredentials(account, 'old-test-password', { email: 'next@example.invalid' })).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.primaryUpdate).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('rejects verification for an identity other than the requested account', async () => {
    mocks.signIn.mockResolvedValue({ data: { session: { user: { id: 'b' } }, user: { id: 'b' } }, error: null });
    expect((await changeVerifiedCredentials(account, 'old-test-password', { password: 'new-test-password' })).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.primaryUpdate).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
  it('cleans up its temporary session even if the update throws', async () => {
    mocks.update.mockRejectedValue(new Error('Test network unavailable'));
    expect((await changeVerifiedCredentials(account, 'old-test-password', { email: 'next@example.invalid' })).ok).toBe(false);
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
  it('does not turn a successful password change into a false failure if cleanup fails', async () => {
    mocks.signOut.mockResolvedValue({ error: { message: 'Test cleanup unavailable' } });
    expect(await changeVerifiedCredentials(account, 'old-test-password', { password: 'new-test-password' })).toMatchObject({ ok: true, cleanupWarning: true });
  });
  it('does not send an update for incorrect credentials', async () => {
    mocks.signIn.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid login credentials' } });
    expect((await changeVerifiedCredentials(account, 'wrong-test-password', { email: 'next@example.invalid' })).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.primaryUpdate).not.toHaveBeenCalled();
  });
  it('keeps the configured email confirmation redirect on the verified request', async () => {
    await changeVerifiedCredentials(account, 'old-test-password', { email: 'next@example.invalid' }, { emailRedirectTo: 'https://example.invalid/confirm' });
    expect(mocks.update).toHaveBeenCalledWith({ email: 'next@example.invalid' }, { emailRedirectTo: 'https://example.invalid/confirm' });
  });
  it('returns a cleanup warning without throwing after a successful update', async () => {
    mocks.signOut.mockRejectedValue(new Error('Test cleanup unavailable'));
    expect(await changeVerifiedCredentials(account, 'old-test-password', { password: 'new-test-password' })).toMatchObject({ ok: true, cleanupWarning: true });
  });
  it('does not treat an unavailable current-session check as authorization', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: new Error('Test session unavailable') });
    expect((await changeVerifiedCredentials(account, 'old-test-password', { password: 'new-test-password' })).ok).toBe(false);
    expect(mocks.signIn).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
});
