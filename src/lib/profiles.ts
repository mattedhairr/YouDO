import { supabase } from './supabase';
import { dispatchPrivateHubSync } from './privateHubSync';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Normalize and validate a public @handle (lowercase). */
export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.replace(/^@/, '').toLowerCase().trim();
  if (!USERNAME_RE.test(clean)) return null;
  return clean;
}

/** Prefix used while typing a handle (may be shorter than a valid username). */
export function usernameSearchPrefix(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.replace(/^@/, '').toLowerCase().trim();
  if (!/^[a-z0-9_]{1,20}$/.test(clean)) return null;
  return clean;
}

export function usernameFromAuthMetadata(meta: Record<string, unknown> | undefined): string | null {
  return normalizeUsername(meta?.username);
}

/** Profile row is the source of truth for Private Hub; auth metadata is a fast cache. */
export function hasPrivateHubUsername(
  profile: Pick<Profile, 'username'> | null | undefined,
  meta?: Record<string, unknown>,
): boolean {
  if (normalizeUsername(profile?.username)) return true;
  return usernameFromAuthMetadata(meta) !== null;
}

export function resolvePrivateHubUsername(
  profile: Pick<Profile, 'username'> | null | undefined,
  meta?: Record<string, unknown>,
): string | null {
  return normalizeUsername(profile?.username) ?? usernameFromAuthMetadata(meta);
}

function authDisplayName(meta: Record<string, unknown>): string | null {
  const full = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
  return full || null;
}

function authAvatarFromMeta(meta: Record<string, unknown>): string | null {
  const raw = meta.avatar_url;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

/** Prefer real name over a @handle duplicated into `display_name`. */
export function profileDisplayLabel(profile: Pick<Profile, 'display_name' | 'username'>): string {
  const handle = normalizeUsername(profile.username);
  const display = profile.display_name?.trim() ?? '';
  if (display && handle && display.toLowerCase() === handle) {
    return display;
  }
  if (display) return display;
  return handle ? `@${handle}` : 'Member';
}

export function displayNameFromAuthMetadata(meta?: Record<string, unknown>): string {
  const full = typeof meta?.full_name === 'string' ? meta.full_name.trim() : '';
  return full ? full.slice(0, 40) : '';
}

/** Name shown on the Public Board — always the Profile name, never a separate board alias. */
export async function resolvePublicBoardDisplayName(
  userId: string,
  authMeta?: Record<string, unknown>,
): Promise<string> {
  const profile = await fetchProfile(userId);
  const fromProfile = profile?.display_name?.trim() ?? '';
  const handle = normalizeUsername(profile?.username);
  if (fromProfile && handle && fromProfile.toLowerCase() === handle) {
    const fromAuth = displayNameFromAuthMetadata(authMeta);
    if (fromAuth) return fromAuth;
  }
  if (fromProfile) return fromProfile.slice(0, 40);
  const fromAuth = displayNameFromAuthMetadata(authMeta);
  if (fromAuth) return fromAuth;
  return '';
}

export function profileShowsHandleSubtitle(profile: Pick<Profile, 'display_name' | 'username'>): boolean {
  const handle = normalizeUsername(profile.username);
  const display = profile.display_name?.trim() ?? '';
  return Boolean(handle && display && display.toLowerCase() !== handle);
}

/** Keep `profiles` name/avatar aligned with Settings (auth metadata) when the row still looks like a bare handle. */
export async function syncProfileRowFromAuth(user: {
  id: string;
  user_metadata?: Record<string, unknown>;
}): Promise<void> {
  const existing = await fetchProfile(user.id);
  if (!existing) return;

  const meta = user.user_metadata ?? {};
  const metaName = authDisplayName(meta);
  const metaAvatar = authAvatarFromMeta(meta);
  const handle = normalizeUsername(existing.username);
  const displayLooksLikeHandle =
    Boolean(handle && existing.display_name?.trim().toLowerCase() === handle);

  const patch: Partial<Profile> & { id: string } = { id: user.id };
  let dirty = false;

  if (metaName && displayLooksLikeHandle) {
    patch.display_name = metaName;
    dirty = true;
  }

  const rowAvatar = existing.avatar_url?.trim() ?? '';
  const rowHasPhoto = /^https?:\/\//i.test(rowAvatar);
  if (metaAvatar && !rowHasPhoto) {
    patch.avatar_url = metaAvatar;
    dirty = true;
  }

  if (!dirty) return;
  await upsertProfile(patch);
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  stats_private: boolean;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
    
  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('fetchProfile error:', error);
    return null;
  }
  
  return data as Profile;
}

async function syncAuthUsernameMetadata(username: string, avatarUrl?: string): Promise<void> {
  await supabase.auth.updateUser({
    data: {
      username,
      ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
    },
  });
}

/** Create or sync `profiles` after signup/sign-in; repair metadata ↔ profile mismatches. */
export async function ensureProfileFromAuth(user: {
  id: string;
  user_metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; needsClaim: boolean; username: string | null; error?: string }> {
  const meta = user.user_metadata ?? {};
  const metaUsername = usernameFromAuthMetadata(meta);
  const existing = await fetchProfile(user.id);
  const profileUsername = normalizeUsername(existing?.username);

  if (profileUsername) {
    if (metaUsername !== profileUsername) {
      await syncAuthUsernameMetadata(profileUsername, existing?.avatar_url);
    }
    await syncProfileRowFromAuth(user);
    return { ok: true, needsClaim: false, username: profileUsername };
  }

  // If no profiles row exists, do not revive stale metadata into the database;
  // require a clean username claim.
  return { ok: false, needsClaim: true, username: null };
}

export async function upsertProfile(profile: Partial<Profile> & { id: string }): Promise<{ ok: boolean; error?: string }> {
  const updateData: Partial<Profile> & { id: string; updated_at: string } = {
    ...profile,
    updated_at: new Date().toISOString(),
  };
  if (profile.username !== undefined) {
    const normalized = normalizeUsername(profile.username);
    if (!normalized) {
      return { ok: false, error: 'Username must be 3–20 characters: lowercase letters, numbers, and underscores only.' };
    }
    updateData.username = normalized;
  }

  const { error } = await supabase.from('profiles').upsert(updateData);

  const savedUsername = normalizeUsername(profile.username);
  if (!error && savedUsername) {
    await syncAuthUsernameMetadata(savedUsername, profile.avatar_url);
  } else if (!error && profile.avatar_url !== undefined) {
    await supabase.auth.updateUser({ data: { avatar_url: profile.avatar_url } });
  }
    
  if (error) {
    // Unique constraint violation (username already taken)
    if (error.code === '23505') {
      return { ok: false, error: 'That username is already taken.' };
    }
    // Check constraint violation (regex failed)
    if (error.code === '23514') {
      return { ok: false, error: 'Username can only contain lowercase letters, numbers, and underscores.' };
    }
    console.error('upsertProfile error:', error);
    return { ok: false, error: 'Failed to save profile. Please check your inputs.' };
  }
  
  return { ok: true };
}


export async function searchProfileByUsername(username: string): Promise<Profile | null> {
  const clean = username.replace(/^@/, '').toLowerCase();
  if (!clean) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', clean)
    .single();
  
  if (error) return null;
  return data as Profile;
}

export async function searchProfilesByUsernamePrefix(
  query: string,
  options?: { excludeId?: string; limit?: number },
): Promise<Profile[]> {
  const prefix = usernameSearchPrefix(query);
  if (!prefix) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('username', `${prefix}%`)
    .order('username', { ascending: true })
    .limit(options?.limit ?? 8);

  if (error || !data) return [];
  return (data as Profile[]).filter((row) => {
    if (!normalizeUsername(row.username)) return false;
    if (options?.excludeId && row.id === options.excludeId) return false;
    return true;
  });
}

export async function sendFriendRequest(
  requesterId: string,
  receiverId: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  if (requesterId === receiverId) return { ok: false, error: 'Cannot send request to yourself.' };
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: 'Add a short note explaining why you want to connect.' };
  if (trimmed.length > 280) return { ok: false, error: 'Message must be 280 characters or fewer.' };
  const { error } = await supabase
    .from('friendships')
    .insert({
      requester_id: requesterId,
      receiver_id: receiverId,
      status: 'pending',
      request_message: trimmed,
    });
  
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Request already sent or friendship exists.' };
    return { ok: false, error: 'Failed to send request.' };
  }
  dispatchPrivateHubSync('pending');
  return { ok: true };
}


export interface FriendRequest {
  id: string;
  requester_id: string;
  requester: Profile;
  request_message: string;
  created_at: string;
}

export interface OutgoingFriendRequest {
  id: string;
  receiver_id: string;
  receiver: Profile;
  request_message: string;
  created_at: string;
}

export async function fetchOutgoingFriendRequests(userId: string): Promise<OutgoingFriendRequest[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, receiver_id, request_message, created_at')
    .eq('requester_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    if (error) console.error('fetchOutgoingFriendRequests error:', error);
    return [];
  }

  const receiverIds = [...new Set(data.map((row) => row.receiver_id))];
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .in('id', receiverIds);

  if (profileError) return [];

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));

  return data
    .map((row) => {
      const receiver = profileById.get(row.receiver_id);
      if (!receiver) return null;
      return {
        id: row.id,
        receiver_id: row.receiver_id,
        receiver,
        request_message: typeof row.request_message === 'string' ? row.request_message : '',
        created_at: row.created_at,
      };
    })
    .filter((row): row is OutgoingFriendRequest => row !== null);
}

export async function cancelOutgoingFriendRequest(requestId: string): Promise<boolean> {
  const { error } = await supabase.from('friendships').delete().eq('id', requestId).eq('status', 'pending');
  if (!error) dispatchPrivateHubSync('pending');
  return !error;
}

export async function fetchPendingRequests(userId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, request_message, created_at')
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    if (error) console.error('fetchPendingRequests error:', error);
    return [];
  }

  const requesterIds = [...new Set(data.map((row) => row.requester_id))];
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .in('id', requesterIds);

  if (profileError) {
    console.error('fetchPendingRequests profiles error:', profileError);
    return [];
  }

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));

  return data
    .map((row) => {
      const requester = profileById.get(row.requester_id);
      if (!requester) return null;
      return {
        id: row.id,
        requester_id: row.requester_id,
        requester,
        request_message: typeof row.request_message === 'string' ? row.request_message : '',
        created_at: row.created_at,
      };
    })
    .filter((row): row is FriendRequest => row !== null);
}

export async function acceptFriendRequest(requestId: string): Promise<boolean> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', requestId);
  if (!error) dispatchPrivateHubSync('friends');
  return !error;
}

export async function rejectFriendRequest(requestId: string): Promise<boolean> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', requestId);
  if (!error) dispatchPrivateHubSync('pending');
  return !error;
}

export async function fetchAcceptedFriends(userId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id, receiver_id')
    .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq('status', 'accepted');
    
  if (error || !data) {
    return [];
  }
  
  const friendIds = data.map(row => row.requester_id === userId ? row.receiver_id : row.requester_id);
  if (friendIds.length === 0) return [];
  
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('id', friendIds);
    
  return profiles || [];
}

export async function removeFriend(userId1: string, userId2: string) {
  try {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .or(`and(requester_id.eq.${userId1},receiver_id.eq.${userId2}),and(requester_id.eq.${userId2},receiver_id.eq.${userId1})`);
      
    if (!error) dispatchPrivateHubSync('friends');
    return { ok: !error, error: error?.message };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed' };
  }
}


export async function addFriend(requesterId: string, receiverId: string) {
  try {
    const { error } = await supabase
      .from('friendships')
      .insert({
        requester_id: requesterId,
        receiver_id: receiverId,
        status: 'accepted'
      });
    if (!error) dispatchPrivateHubSync('friends');
    return { ok: !error, error: error?.message };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed' };
  }
}

export async function checkFriendshipStatus(user1Id: string, user2Id: string): Promise<'none' | 'pending' | 'friends'> {
  const { data, error } = await supabase
    .from('friendships')
    .select('status')
    .or(`and(requester_id.eq.${user1Id},receiver_id.eq.${user2Id}),and(requester_id.eq.${user2Id},receiver_id.eq.${user1Id})`)
    .maybeSingle();
    
  if (error || !data) return 'none';
  return data.status === 'accepted' ? 'friends' : 'pending';
}
