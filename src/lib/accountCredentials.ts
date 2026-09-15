import type { User } from '@supabase/supabase-js';
import { createCredentialVerificationClient, supabase } from './supabase';
import { authErrorMessage } from './authError';

export type CredentialChangeResult = { ok: boolean; user?: User; error?: string; cleanupWarning?: boolean };
export async function changeVerifiedCredentials(account: Pick<User, 'id' | 'email'>, currentPassword: string,
  attributes: { email: string } | { password: string }, options?: { emailRedirectTo?: string }): Promise<CredentialChangeResult> {
  if (!account.email) return { ok: false, error: 'No email is attached to this account.' };
  const client = createCredentialVerificationClient();
  let temporarySession = false;
  let result: CredentialChangeResult = { ok: false };
  const assertAccount = async () => {
    const current = await supabase.auth.getSession();
    if (current.error || current.data.session?.user.id !== account.id) {
      throw new Error('Account changed. This credential change was cancelled. Reopen account settings.');
    }
  };
  try {
    await assertAccount();
    const verified = await client.auth.signInWithPassword({ email: account.email, password: currentPassword });
    temporarySession = Boolean(verified.data.session);
    if (verified.error) throw new Error(authErrorMessage(verified.error, 'password'));
    if (!verified.data.session || verified.data.session.user.id !== account.id || verified.data.user?.id !== account.id) {
      throw new Error('The password check did not verify this account. No credentials were changed.');
    }
    await assertAccount();
    // Use the verified client's own in-memory session. Even a subsequent app
    // account switch cannot substitute a different account's bearer token.
    const updated = await client.auth.updateUser(attributes, options);
    if (updated.error) throw new Error(authErrorMessage(updated.error, 'password'));
    if (updated.data.user?.id !== account.id) throw new Error('The account service did not confirm this change. Check your account before retrying.');
    result = { ok: true, user: updated.data.user };
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : 'The account change could not be confirmed. Check your connection.' };
  } finally {
    if (temporarySession) {
      try { result.cleanupWarning = Boolean((await client.auth.signOut({ scope: 'local' })).error); }
      catch { result.cleanupWarning = true; }
    }
  }
  return result;
}
