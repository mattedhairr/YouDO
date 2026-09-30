type AccountLookup = {
  getUser: () => Promise<{
    data: { user: { id: string } | null };
    error: { code?: string; name?: string } | null;
  }>;
};

export type AccountAvailability = 'active' | 'gone' | 'unknown';

/** Only definitive Auth responses can close an account workspace. */
export async function checkAccountAvailability(auth: AccountLookup, expectedUserId: string): Promise<AccountAvailability> {
  try {
    const { data, error } = await auth.getUser();
    if (error) {
      if (error.code === 'user_not_found' || error.code === 'session_not_found'
        || error.name === 'AuthSessionMissingError') return 'gone';
      return 'unknown';
    }
    return data.user?.id === expectedUserId ? 'active' : 'unknown';
  } catch {
    return 'unknown';
  }
}
