import { supabase } from './supabase';
import { fetchPendingRequests, searchProfileByUsername, type Profile } from './profiles';
import { dispatchPrivateHubSync } from './privateHubSync';

export type SquadPrivacy = 'anyone_can_join' | 'invite_only';
export type LegacySquadPrivacy = 'public' | 'private';
export type AnySquadPrivacy = SquadPrivacy | LegacySquadPrivacy;
export type RoomPrivacy = SquadPrivacy;

/**
 * Normalizes any squad privacy value (canonical or legacy) to canonical SquadPrivacy.
 * Canonical: 'anyone_can_join' | 'invite_only'.
 * Legacy: 'public' -> 'anyone_can_join', 'private' -> 'invite_only'.
 */
export function normalizeSquadPrivacy(privacy?: string | null): SquadPrivacy {
  if (!privacy) return 'anyone_can_join';
  if (privacy === 'public' || privacy === 'anyone_can_join') return 'anyone_can_join';
  if (privacy === 'private' || privacy === 'invite_only') return 'invite_only';
  return 'anyone_can_join';
}

/**
 * @deprecated Pace restrictions are removed per Requirement R1. Rooms no longer enforce matching daily bar hours.
 * Kept for backwards compatibility; returns true if either value is null/undefined or if they match.
 */
export function paceHoursMatch(squadBarHours?: number | null, personalBarHours?: number | null): boolean {
  if (squadBarHours == null || personalBarHours == null) return true;
  return Math.abs(Number(squadBarHours) - Number(personalBarHours)) < 0.01;
}

/**
 * @deprecated Room entry is no longer gated by personal daily bar hours.
 */
export function squadPaceGateMessage(squadBarHours?: number | null, personalBarHours?: number | null): string {
  void squadBarHours;
  void personalBarHours;
  return '';
}

/**
 * Unifies all squad members into the collective room board.
 * All members contribute together regardless of differing daily bar targets.
 * Segregation is removed per Requirement R1.
 */
export function partitionSquadPaceMembers<T extends { barHours?: number | null }>(
  members: T[],
  squadBarHours?: number | null,
): { collective: T[]; separate: T[] } {
  void squadBarHours;
  return {
    collective: [...members],
    separate: [],
  };
}

export interface Squad {
  id: string;
  name: string;
  description: string;
  bar_hours?: number | null;
  allow_join_requests: boolean;
  privacy?: SquadPrivacy;
  created_by: string;
  created_at: string;
}

export interface CreateSquadParams {
  ownerId: string;
  name: string;
  icon?: string;
  barHours?: number | null;
  allowJoinRequests?: boolean;
  privacy?: AnySquadPrivacy;
  initialInviteUserIds?: string[];
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

function normalizeSquadPrivacyInPlace(squad: { privacy?: string | null } | null | undefined) {
  if (!squad) return;
  squad.privacy = normalizeSquadPrivacy(squad.privacy);
}

function squadFromJoinedRow(raw: unknown): Squad | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = (Array.isArray(raw) ? raw[0] : raw) as Squad;
  if (!row) return null;
  normalizeSquadPrivacyInPlace(row);
  return row;
}

function isAllowJoinRequestsMissingError(err: { message?: string; details?: string; hint?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  return Boolean(
    err.message?.includes('allow_join_requests') ||
    err.details?.includes('allow_join_requests') ||
    err.hint?.includes('allow_join_requests') ||
    err.code === 'PGRST204' ||
    err.code === '42703',
  );
}

function isPrivacyCheckConstraintError(err: { message?: string; details?: string; hint?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const str = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();
  return Boolean(
    err.code === '23514' ||
    str.includes('squads_privacy_check') ||
    (str.includes('check constraint') && str.includes('privacy'))
  );
}

export async function createSquad(
  params: CreateSquadParams,
): Promise<{ ok: boolean; error?: string; squad?: Squad }>;
export async function createSquad(
  ownerId: string,
  name: string,
  icon: string,
  barHours?: number | null,
  allowJoinRequests?: boolean,
  privacy?: AnySquadPrivacy,
  initialInviteUserIds?: string[],
): Promise<{ ok: boolean; error?: string; squad?: Squad }>;
export async function createSquad(
  ownerIdOrParams: string | CreateSquadParams,
  nameArg?: string,
  iconArg?: string,
  barHoursArg?: number | null,
  allowJoinRequestsArg?: boolean,
  privacyArg?: AnySquadPrivacy,
  initialInviteUserIdsArg?: string[],
): Promise<{ ok: boolean; error?: string; squad?: Squad }> {
  let ownerId: string;
  let name: string;
  let icon: string;
  let barHours: number | null | undefined;
  let allowJoinRequests: boolean;
  let privacy: SquadPrivacy;
  let initialInviteUserIds: string[] | undefined;

  if (typeof ownerIdOrParams === 'object') {
    ownerId = ownerIdOrParams.ownerId;
    name = ownerIdOrParams.name;
    icon = ownerIdOrParams.icon || '🔥';
    barHours = ownerIdOrParams.barHours;
    privacy = normalizeSquadPrivacy(ownerIdOrParams.privacy);
    allowJoinRequests = privacy === 'invite_only' ? false : (ownerIdOrParams.allowJoinRequests ?? true);
    initialInviteUserIds = ownerIdOrParams.initialInviteUserIds;
  } else {
    ownerId = ownerIdOrParams;
    name = nameArg ?? '';
    icon = iconArg || '🔥';
    barHours = barHoursArg;
    privacy = normalizeSquadPrivacy(privacyArg);
    allowJoinRequests = privacy === 'invite_only' ? false : (allowJoinRequestsArg ?? true);
    initialInviteUserIds = initialInviteUserIdsArg;
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, error: 'Please give your squad a name.' };
  }

  const insertPayload: Record<string, unknown> = {
    name: trimmedName,
    description: icon,
    created_by: ownerId,
    privacy,
    allow_join_requests: allowJoinRequests,
  };

  if (barHours != null && Number.isFinite(barHours) && barHours > 0) {
    insertPayload.bar_hours = barHours;
  }

  const attemptInsert = async (payload: Record<string, unknown>) => {
    let res = await supabase
      .from('squads')
      .insert(payload)
      .select()
      .single();
    if (res.error && isAllowJoinRequestsMissingError(res.error)) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.allow_join_requests;
      res = await supabase
        .from('squads')
        .insert(fallbackPayload)
        .select()
        .single();
    }
    return res;
  };

  let { data, error } = await attemptInsert(insertPayload);

  if (error && isPrivacyCheckConstraintError(error)) {
    // Check constraint failed (e.g. live database constraint expects 'public' / 'private')
    // 1. Try mapping: 'anyone_can_join' -> 'public', 'invite_only' -> 'private'
    const mappedPrivacy = privacy === 'anyone_can_join' ? 'public' : 'private';
    const mappedPayload = { ...insertPayload, privacy: mappedPrivacy };
    const retryMapped = await attemptInsert(mappedPayload);

    if (!retryMapped.error && retryMapped.data) {
      data = retryMapped.data;
      error = null;
    } else {
      // 2. If mapped value still fails or privacy is rejected, omit privacy column entirely (let DB default take over)
      const omitPayload = { ...insertPayload };
      delete omitPayload.privacy;
      const retryOmit = await attemptInsert(omitPayload);
      if (!retryOmit.error && retryOmit.data) {
        data = retryOmit.data;
        error = null;
      } else {
        error = retryOmit.error || retryMapped.error || error;
      }
    }
  }

  if (error || !data) {
    console.error('Failed to create squad:', error);
    return { ok: false, error: error?.message || 'Failed to create room.' };
  }

  normalizeSquadPrivacyInPlace(data);

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

  if (initialInviteUserIds && initialInviteUserIds.length > 0) {
    const distinctInvites = [...new Set(initialInviteUserIds)].filter((id) => id !== ownerId);
    if (distinctInvites.length > 0) {
      const inviteRows = distinctInvites.map((userId) => ({
        squad_id: data.id,
        user_id: userId,
        role: 'member' as const,
        status: 'invited' as const,
      }));
      const { error: inviteError } = await supabase.from('squad_members').insert(inviteRows);
      if (inviteError) {
        console.warn('Initial invites failed to send:', inviteError);
      }
    }
  }

  return { ok: true, squad: data as Squad };
}

export async function updateSquadPrivacy(
  squadId: string,
  privacy: AnySquadPrivacy,
): Promise<boolean> {
  const canonical = normalizeSquadPrivacy(privacy);
  const attemptUpdate = async (patch: Record<string, unknown>) => {
    let res = await supabase
      .from('squads')
      .update(patch)
      .eq('id', squadId);
    if (res.error && isAllowJoinRequestsMissingError(res.error)) {
      const fallbackPatch = { ...patch };
      delete fallbackPatch.allow_join_requests;
      res = await supabase
        .from('squads')
        .update(fallbackPatch)
        .eq('id', squadId);
    }
    return res;
  };

  let { error } = await attemptUpdate({
    privacy: canonical,
    allow_join_requests: canonical === 'anyone_can_join',
  });

  if (error && isPrivacyCheckConstraintError(error)) {
    const legacyPrivacy = canonical === 'anyone_can_join' ? 'public' : 'private';
    const retry = await attemptUpdate({
      privacy: legacyPrivacy,
      allow_join_requests: canonical === 'anyone_can_join',
    });
    error = retry.error;
  }

  return !error;
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

  normalizeSquadPrivacyInPlace(squad);

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

export async function inviteUserToSquad(squadId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('squad_members')
    .insert({ squad_id: squadId, user_id: userId, role: 'member', status: 'invited' });
  
  if (error) {
    console.error('inviteUserToSquad error:', error);
    return false;
  }
  dispatchPrivateHubSync('pending');
  return true;
}

export async function inviteUserToSquadByUsername(
  squadId: string,
  username: string,
): Promise<{ ok: boolean; error?: string; userId?: string }> {
  const clean = username.trim().replace(/^@/, '').toLowerCase();
  if (!clean) {
    return { ok: false, error: 'Enter a valid username.' };
  }

  // Try database RPC first (from rooms_privacy_and_invites.sql)
  try {
    const { data, error } = await supabase.rpc('invite_to_squad_by_username', {
      p_squad_id: squadId,
      p_username: clean,
    });

    if (!error && data) {
      const res = typeof data === 'string' ? JSON.parse(data) : data;
      if (res.ok) {
        dispatchPrivateHubSync('pending');
        return { ok: true, userId: res.user_id };
      }
      return { ok: false, error: res.error || 'Failed to invite user.' };
    }
  } catch {
    // RPC may not be present before migration runs; fallback to client lookup
  }

  // Fallback: search profile by username
  const profile = await searchProfileByUsername(clean);
  if (!profile) {
    return { ok: false, error: 'User not found.' };
  }

  const ok = await inviteUserToSquad(squadId, profile.id);
  if (ok) {
    dispatchPrivateHubSync('pending');
  }
  return ok
    ? { ok: true, userId: profile.id }
    : { ok: false, error: 'Could not send squad invite.' };
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
  return (data ?? [])
    .map((row) => ({
      squad_id: row.squad_id,
      status: row.status,
      squads: squadFromJoinedRow(row.squads),
    }))
    .filter((inv) => inv.squads !== null);
}

export async function acceptSquadJoinRequest(squadId: string, memberUserId: string): Promise<boolean> {
  const { error } = await supabase
    .from('squad_members')
    .update({ status: 'accepted' })
    .eq('squad_id', squadId)
    .eq('user_id', memberUserId)
    .in('status', ['pending', 'invited']);
  if (!error) dispatchPrivateHubSync('squads');
  return !error;
}

export async function declineSquadJoinRequest(squadId: string, memberUserId: string): Promise<boolean> {
  const { error } = await supabase
    .from('squad_members')
    .delete()
    .eq('squad_id', squadId)
    .eq('user_id', memberUserId)
    .in('status', ['pending', 'invited']);
  if (!error) dispatchPrivateHubSync('squads');
  return !error;
}

export async function acceptSquadInvite(squadId: string, userId: string) {
  const { error } = await supabase
    .from('squad_members')
    .update({ status: 'accepted' })
    .eq('squad_id', squadId)
    .eq('user_id', userId);
  if (!error) dispatchPrivateHubSync('squads');
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
    .map((row) => squadFromJoinedRow(row.squads))
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
  const squads = (data ?? []) as Squad[];
  squads.forEach(normalizeSquadPrivacyInPlace);
  return squads;
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
  (squads ?? []).forEach(normalizeSquadPrivacyInPlace);
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
  const squads = (data ?? []) as Squad[];
  squads.forEach(normalizeSquadPrivacyInPlace);
  return squads;
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
  dispatchPrivateHubSync('squads');
  return { ok: true };
}

export async function rejectSquadInvite(squadId: string, userId: string) {
  const { error } = await supabase
    .from('squad_members')
    .delete()
    .eq('squad_id', squadId)
    .eq('user_id', userId)
    .eq('status', 'invited');
  if (!error) dispatchPrivateHubSync('squads');
  return !error;
}
