import type { User } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from './supabase';

/** Update the account that supplied this token, even if the app session changes meanwhile. */
export async function updateAccountProfile(accountId: string, accessToken: string, data: Record<string, string>): Promise<User> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => null) as (User & { user?: User; msg?: string; message?: string; error_description?: string; error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.msg || body?.message || body?.error_description || body?.error || 'Could not update this profile.');
  const updated = body.user ?? body;
  if (updated.id !== accountId) throw new Error('The account service returned a different profile. Reopen account settings.');
  return updated;
}
