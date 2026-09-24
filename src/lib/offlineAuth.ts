import type { User } from '@supabase/supabase-js';
import { STORAGE_KEYS } from './storageKeys';
import { supabaseUrl } from './supabase';

/** Allow an already owned device workspace to open while token refresh waits offline. */
export function readCachedWorkspaceUser(
  storage: Pick<Storage, 'getItem'> = localStorage,
  url = supabaseUrl,
): User | null {
  try {
    const owner = storage.getItem(STORAGE_KEYS.workspaceOwner);
    if (!owner) return null;
    const projectRef = new URL(url).hostname.split('.')[0];
    const raw = storage.getItem(`sb-${projectRef}-auth-token`);
    if (!raw) return null;
    const session = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown; user?: { id?: unknown } };
    if (typeof session.access_token !== 'string' || !session.access_token
      || typeof session.refresh_token !== 'string' || !session.refresh_token
      || typeof session.user?.id !== 'string' || session.user.id !== owner) return null;
    return session.user as User;
  } catch {
    return null;
  }
}

export function keepCachedWorkspaceOffline(
  event: string,
  sessionUser: User | null,
  cachedUser: User | null,
  online: boolean,
): boolean {
  return event !== 'SIGNED_OUT' && sessionUser === null && cachedUser !== null && !online;
}
