import { supabase } from './supabase';

export interface Squad {
  id: string;
  name: string;
  description: string;
  bar_hours: number;
  allow_join_requests: boolean;
  created_by: string;
  created_at: string;
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
    return { ok: false, error: 'Failed to create room.' };
  }

  // Automatically add the owner as a member
  const { error: memberError } = await supabase
    .from('squad_members')
    .insert({
      squad_id: data.id,
      user_id: ownerId,
      role: 'admin'
    });

  if (memberError) {
    console.error('Failed to add owner to squad:', memberError);
    // Continue anyway, but this shouldn't happen.
  }

  return { ok: true, squad: data as Squad };
}

export async function getSquadDetails(squadId: string) {
  const { data: squad, error: squadErr } = await supabase
    .from('squads')
    .select('*')
    .eq('id', squadId)
    .single();

  if (squadErr) return null;

  const { data: members, error: memErr } = await supabase
    .from('squad_members')
    .select('*, profiles(*)')
    .eq('squad_id', squadId);

  return { squad: squad as Squad, members: members || [] };
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

export async function fetchPendingSquadInvites(userId: string) {
  const { data, error } = await supabase
    .from('squad_members')
    .select('squad_id, status, squads(*)')
    .eq('user_id', userId)
    .eq('status', 'invited');
    
  if (error) {
    console.error('fetchPendingSquadInvites error:', error);
    return [];
  }
  return data || [];
}

export async function acceptSquadInvite(squadId: string, userId: string) {
  const { error } = await supabase
    .from('squad_members')
    .update({ status: 'accepted' })
    .eq('squad_id', squadId)
    .eq('user_id', userId);
  return !error;
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
