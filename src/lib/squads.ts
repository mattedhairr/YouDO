import { supabase } from './supabase';
import { fetchPendingRequests, type Profile } from './profiles';

/** Match squad room pace to personal daily bar hours from settings. */
export function paceHoursMatch(squadBarHours: number, personalBarHours: number): boolean {
  return Math.abs(Number(squadBarHours) - Number(personalBarHours)) < 0.01;
}

export interface Squad {
  id: string;
  name: string;
  description: string;
  bar_hours: number;
  allow_join_requests: boolean;
  created_by: string;
  created_at: string;
}

export type SquadMemberStatus = 'accepted' | 'invited' | 'pending';
export type SquadMemberRole = 'admin' | 'member';

export interface SquadMember {
  user_id: string;
  squad_id: string;
  role: SquadMemberRole;
  status: SquadMemberStatus;
  profiles: Profile | null;
}

export interface PendingSquadInvite {
  squad_id: string;
  status: string;
  squads: Squad | null;
}

function squadFromJoinedRow(raw: unknown): Squad | null {
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw)) return (raw[0] as Squad) ?? null;
  return raw as Squad;
}

export async function createSquad(
  ownerId: string,
  name: string,
  icon: string, // We'll store icon in description for now since we didn't add an icon column
  barHours: number,
  allowJoinRequests: boolean
): Promise<{ ok: boolean; error?: string; squad?: Squad }> {
  // First, verify the owner's personal pace matches barHours.
  // In YouDO, personal pace is usually stored in local state/sync or metadata.
  // We'll trust the client to pass the owner's current pace for validation.
  // The actual check will be done by the UI before calling this.

  const { data, error } = await supabase
    .from('squads')
    .insert({
      name,
      description: icon, 
      bar_hours: barHours,
      allow_join_requests: allowJoinRequests,
      created_by: ownerId
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create squad:', error);
    return { ok: false, error: error.message || 'Failed to create room.' };
  }

  const { error: memberError } = await supabase.from('squad_members').insert({
    squad_id: data.id,
    user_id: ownerId,
    role: 'admin',
    status: 'accepted',
  });

  if (memberError) {
    console.error('Failed to add owner to squad:', memberError);
    return { ok: false, error: memberError.message || 'Room created but membership failed.' };
  }

  return { ok: true, squad: data as Squad };
}

export async function getSquadDetails(squadId: string): Promise<{ squad: Squad; members: SquadMember[] } | null> {
  const { data: squad, error: squadErr } = await supabase
    .from('squads')
    .select('*')
    .eq('id', squadId)
    .single();

  if (squadErr || !squad) {
    if (squadErr) console.error('getSquadDetails squad:', squadErr);
    return null;
  }

  const { data: members, error: memErr } = await supabase
    .from('squad_members')
    .select('*')
    .eq('squad_id', squadId);

  if (memErr || !members) {
    if (memErr) console.error('getSquadDetails members:', memErr);
    return { squad: squad as Squad, members: [] };
  }

  const userIds = members.map((m) => m.user_id);
  const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return {
    squad: squad as Squad,
    members: members.map((m) => ({
      user_id: m.user_id,
      squad_id: m.squad_id,
      role: m.role as SquadMemberRole,
      status: m.status as SquadMemberStatus,
      profiles: profileById.get(m.user_id) ?? null,
    })),
  };
}

export async function kickMember(squadId: string, userId: string) {
  const { error } = await supabase
    .from('squad_members')
    .delete()
    .eq('squad_id', squadId)
    .eq('user_id', userId);
  return !error;
}

export async function inviteUserToSquad(squadId: string, userId: string) {
  // We can insert an invitation into a hypothetical 'squad_invites' table,
  // or we can just directly insert them into 'squad_members' with role 'invited' or 'pending'.
  // The database schema hub_private_rooms.sql doesn't explicitly have an invites table.
  // We'll just insert into squad_members with role='pending'.
  const { error } = await supabase
    .from('squad_members')
    .insert({ squad_id: squadId, user_id: userId, role: 'member', status: 'invited' });
  
  return !error;
}

export async function fetchPendingSquadInvites(userId: string): Promise<PendingSquadInvite[]> {
  const { data, error } = await supabase
    .from('squad_members')
    .select('squad_id, status, squads(*)')
    .eq('user_id', userId)
    .eq('status', 'invited');
    
  if (error) {
    console.error('fetchPendingSquadInvites error:', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    squad_id: row.squad_id,
    status: row.status,
    squads: squadFromJoinedRow(row.squads),
  }));
}

export async function acceptSquadJoinRequest(squadId: string, memberUserId: string): Promise<boolean> {
  const { error } = await supabase
    .from('squad_members')
    .update({ status: 'accepted' })
    .eq('squad_id', squadId)
    .eq('user_id', memberUserId)
    .in('status', ['pending', 'invited']);
  return !error;
}

export async function declineSquadJoinRequest(squadId: string, memberUserId: string): Promise<boolean> {
  const { error } = await supabase
    .from('squad_members')
    .delete()
    .eq('squad_id', squadId)
    .eq('user_id', memberUserId)
    .in('status', ['pending', 'invited']);
  return !error;
}

export async function acceptSquadInvite(squadId: string, userId: string) {
  const { error } = await supabase
    .from('squad_members')
    .update({ status: 'accepted' })
    .eq('squad_id', squadId)
    .eq('user_id', userId);
  return !error;
}

export async function fetchMySquads(userId: string): Promise<Squad[]> {
  const { data, error } = await supabase
    .from('squad_members')
    .select('squads(*)')
    .eq('user_id', userId)
    .eq('status', 'accepted');

  if (error || !data) {
    if (error) console.error('fetchMySquads error:', error);
    return [];
  }
  return data
    .map((row) => {
      const squad = row.squads;
      if (!squad) return null;
      if (Array.isArray(squad)) return squad[0] ?? null;
      return squad as Squad;
    })
    .filter((s): s is Squad => s != null);
}

export interface IncomingSquadJoinRequest {
  squad_id: string;
  user_id: string;
  joined_at: string;
  squad: Squad;
  requester: Profile | null;
}

export async function fetchOutgoingSquadJoinRequests(): Promise<Squad[]> {
  const { data, error } = await supabase.rpc('my_pending_squad_joins');
  if (error) {
    console.error('fetchOutgoingSquadJoinRequests error:', error);
    return [];
  }
  return (data ?? []) as Squad[];
}

export async function cancelOutgoingSquadJoinRequest(squadId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('squad_members')
    .delete()
    .eq('squad_id', squadId)
    .eq('user_id', userId)
    .eq('status', 'pending');
  return !error;
}

export async function fetchIncomingSquadJoinRequests(adminUserId: string): Promise<IncomingSquadJoinRequest[]> {
  const { data: adminRows, error: adminErr } = await supabase
    .from('squad_members')
    .select('squad_id')
    .eq('user_id', adminUserId)
    .eq('role', 'admin')
    .eq('status', 'accepted');

  if (adminErr || !adminRows?.length) {
    if (adminErr) console.error('fetchIncomingSquadJoinRequests admin:', adminErr);
    return [];
  }

  const squadIds = [...new Set(adminRows.map((r) => r.squad_id))];
  const { data: pending, error: pendingErr } = await supabase
    .from('squad_members')
    .select('squad_id, user_id, joined_at')
    .in('squad_id', squadIds)
    .eq('status', 'pending');

  if (pendingErr || !pending?.length) {
    if (pendingErr) console.error('fetchIncomingSquadJoinRequests pending:', pendingErr);
    return [];
  }

  const { data: squads } = await supabase.from('squads').select('*').in('id', squadIds);
  const squadById = new Map((squads ?? []).map((s) => [s.id, s as Squad]));
  const requesterIds = [...new Set(pending.map((p) => p.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('*').in('id', requesterIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));

  return pending
    .map((row) => {
      const squad = squadById.get(row.squad_id);
      if (!squad) return null;
      return {
        squad_id: row.squad_id,
        user_id: row.user_id,
        joined_at: row.joined_at,
        squad,
        requester: profileById.get(row.user_id) ?? null,
      };
    })
    .filter((r): r is IncomingSquadJoinRequest => r !== null);
}

/** Badge: only incoming items that need your action (not sent). */
export async function countActionableNotifications(userId: string): Promise<number> {
  const [friends, invites, joins] = await Promise.all([
    fetchPendingRequests(userId),
    fetchPendingSquadInvites(userId),
    fetchIncomingSquadJoinRequests(userId),
  ]);
  return friends.length + invites.length + joins.length;
}

export async function fetchDiscoverableSquads(): Promise<Squad[]> {
  const { data, error } = await supabase.rpc('discover_squads');
  if (error) {
    console.error('fetchDiscoverableSquads error:', error);
    return [];
  }
  return (data ?? []) as Squad[];
}

export async function requestJoinSquad(
  squadId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('squad_members').insert({
    squad_id: squadId,
    user_id: userId,
    role: 'member',
    status: 'pending',
  });
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'You already requested or joined this squad.' };
    return { ok: false, error: error.message || 'Could not send join request.' };
  }
  return { ok: true };
}

export async function rejectSquadInvite(squadId: string, userId: string) {
  const { error } = await supabase
    .from('squad_members')
    .delete()
    .eq('squad_id', squadId)
    .eq('user_id', userId)
    .eq('status', 'invited');
  return !error;
}
