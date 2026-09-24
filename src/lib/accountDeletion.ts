import { supabaseAnonKey, supabaseUrl } from './supabase';

/** Bind deletion to the session and account displayed when the user confirmed it. */
export async function requestAccountDeletion(accountId: string, accessToken: string): Promise<string> {
  const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ confirmation: 'DELETE', expectedAccountId: accountId }),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; accountId?: string; error?: string } | null;
  if (!response.ok || !result?.ok) throw new Error(result?.error || 'Account deletion was not confirmed by the server.');
  if (result.accountId !== accountId) throw new Error('The account service returned a different account. Keep this device copy and contact support.');
  return result.accountId;
}
