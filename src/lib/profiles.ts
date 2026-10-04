import { supabase } from './supabase';

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

/** Create or sync `profiles` row from auth metadata after signup/sign-in. */
export async function ensureProfileFromAuth(user: {
  id: string;
  user_metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; needsClaim: boolean; error?: string }> {
  const meta = user.user_metadata ?? {};
  const rawUsername = typeof meta.username === 'string' ? meta.username.toLowerCase().trim() : '';
  if (!rawUsername || !/^[a-z0-9_]+$/.test(rawUsername)) {
    return { ok: false, needsClaim: true };
  }
  const existing = await fetchProfile(user.id);
  if (existing?.username) {
    return { ok: true, needsClaim: false };
  }
  const displayName =
    typeof meta.full_name === 'string' && meta.full_name.trim()
      ? meta.full_name.trim()
      : rawUsername;
  const avatarUrl = typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined;
  const result = await upsertProfile({
    id: user.id,
    username: rawUsername,
    display_name: displayName,
    bio: '',
    stats_private: false,
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
  });
  return { ok: result.ok, needsClaim: false, error: result.error };
}

export async function upsertProfile(profile: Partial<Profile> & { id: string }): Promise<{ ok: boolean; error?: string }> {
  const updateData = { ...profile, updated_at: new Date().toISOString() };

  const { error } = await supabase.from('profiles').upsert(updateData);

  if (!error && profile.username) {
    await supabase.auth.updateUser({
      data: {
        username: profile.username,
        ...(profile.avatar_url !== undefined ? { avatar_url: profile.avatar_url } : {}),
      },
    });
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

export async function sendFriendRequest(requesterId: string, receiverId: string): Promise<{ ok: boolean; error?: string }> {
  if (requesterId === receiverId) return { ok: false, error: 'Cannot send request to yourself.' };
  const { error } = await supabase
    .from('friendships')
    .insert({
      requester_id: requesterId,
      receiver_id: receiverId,
      status: 'pending'
    });
  
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Request already sent or friendship exists.' };
    return { ok: false, error: 'Failed to send request.' };
  }
  return { ok: true };
}


export interface FriendRequest {
  id: string;
  requester_id: string;
  requester: Profile;
  created_at: string;
}

export async function fetchPendingRequests(userId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, created_at')
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
  return !error;
}

export async function rejectFriendRequest(requestId: string): Promise<boolean> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', requestId);
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
  
  const { data: profiles, error: pError } = await supabase
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
      
    return { ok: !error, error: error?.message };
  } catch (err: any) {
    return { ok: false, error: err.message };
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
    return { ok: !error, error: error?.message };
  } catch (err: any) {
    return { ok: false, error: err.message };
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
