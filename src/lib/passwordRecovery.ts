import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from './supabase';

export interface RecoveryGrant {
  userId: string;
  accessToken: string;
}

/** A URL marker cannot authorize a password change. Only Supabase's verified callback can. */
export function nextRecoveryGrant(
  current: RecoveryGrant | null,
  event: AuthChangeEvent,
  session: Session | null,
  recoveryUrl: boolean,
): RecoveryGrant | null {
  if (event === 'PASSWORD_RECOVERY') {
    return recoveryUrl && session?.user?.id && session.access_token
      ? { userId: session.user.id, accessToken: session.access_token }
      : null;
  }
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') return null;
  return current;
}

export function matchesRecoveryGrant(
  grant: RecoveryGrant | null,
  session: Session | null,
): grant is RecoveryGrant {
  return Boolean(grant && session && grant.userId === session.user.id && grant.accessToken === session.access_token);
}

/** Send the captured recovery token explicitly; a later account switch cannot redirect this update. */
export async function updatePasswordWithRecoveryToken(accessToken: string, password: string): Promise<void> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  if (response.ok) return;
  const body = await response.json().catch(() => ({})) as { msg?: string; message?: string; error_description?: string; error?: string };
  throw new Error(body.msg || body.message || body.error_description || body.error || 'This reset link could not change the password. Request a new link.');
}
