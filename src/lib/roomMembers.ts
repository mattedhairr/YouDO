import { supabase } from './supabase';

/**
 * An exam hashtag room's members (supabase/community_room_members.sql): the
 * Board members in it, each with how they relate to you.
 */
export type RoomRelation = 'self' | 'friend' | 'requested' | 'incoming' | 'none';

export interface RoomMember {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  backer: boolean;
  relation: RoomRelation;
  /** Their friend request to you, when relation is 'incoming'. */
  requestId?: string;
}

const RELATIONS: ReadonlySet<string> = new Set(['self', 'friend', 'requested', 'incoming', 'none']);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

export function parseRoomMembers(raw: unknown): { total: number; members: RoomMember[] } {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const members = (Array.isArray(row.members) ? row.members : []).flatMap((item): RoomMember[] => {
    const person = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const id = text(person.user_id);
    if (!id) return [];
    const relation = typeof person.relation === 'string' && RELATIONS.has(person.relation) ? person.relation as RoomRelation : 'none';
    return [{
      id,
      name: text(person.display_name) ?? 'Board member',
      username: text(person.username),
      avatarUrl: text(person.avatar_url),
      backer: person.is_backer === true,
      relation,
      requestId: relation === 'incoming' ? text(person.request_id) : undefined,
    }];
  });
  const total = typeof row.total === 'number' && Number.isFinite(row.total) ? row.total : members.length;
  return { total, members };
}

/** Name or @username contains the search, ignoring case and a leading @. */
export function filterRoomMembers(members: RoomMember[], search: string): RoomMember[] {
  const needle = search.trim().toLowerCase().replace(/^@/, '');
  if (!needle) return members;
  return members.filter((member) => member.name.toLowerCase().includes(needle) || (member.username ?? '').toLowerCase().includes(needle));
}

export async function fetchRoomMembers(roomId: string): Promise<{ total: number; members: RoomMember[] }> {
  const { data, error } = await supabase.rpc('community_room_members', { room: roomId });
  if (error) {
    throw new Error(error.message?.includes('Could not find the function') ? 'The members list needs a server update first.' : error.message || 'Could not load the members.');
  }
  return parseRoomMembers(data);
}

/** The one action a row offers: message a friend, accept their request, add them, or none. */
export type RoomMemberAction = 'you' | 'message' | 'friend' | 'requested' | 'accept' | 'add' | 'cannot-add';

export function roomMemberAction(member: Pick<RoomMember, 'relation' | 'username' | 'requestId'>, canMessage: boolean): RoomMemberAction {
  switch (member.relation) {
    case 'self': return 'you';
    case 'friend': return canMessage ? 'message' : 'friend';
    case 'requested': return 'requested';
    case 'incoming': return member.requestId ? 'accept' : 'requested';
    default: return member.username ? 'add' : 'cannot-add';
  }
}

/** Admin Hub → Hashtag rooms: everyone in a room, for staff, with mute and ban marked. */
export interface AdminRoomMember {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  backer: boolean;
  staff?: 'owner' | 'admin';
  mutedUntil?: string;
  banned: boolean;
  onBoard: boolean;
}
export interface AdminRoomMembers { total: number; muted: number; banned: number; members: AdminRoomMember[] }
export type AdminRoomFilter = 'all' | 'muted' | 'banned';

export function parseAdminRoomMembers(raw: unknown): AdminRoomMembers {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  const members = (Array.isArray(row.members) ? row.members : []).flatMap((item): AdminRoomMember[] => {
    const person = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const id = text(person.user_id);
    if (!id) return [];
    const staff = person.staff_role === 'owner' || person.staff_role === 'admin' ? person.staff_role : undefined;
    return [{
      id,
      name: text(person.display_name) ?? 'Board member',
      username: text(person.username),
      avatarUrl: text(person.avatar_url),
      backer: person.is_backer === true,
      staff,
      mutedUntil: text(person.muted_until),
      banned: Boolean(text(person.banned_at)),
      onBoard: person.on_board !== false,
    }];
  });
  return { total: count(row.total) || members.length, muted: count(row.muted), banned: count(row.banned), members };
}

export function filterAdminRoomMembers(members: AdminRoomMember[], filter: AdminRoomFilter, search: string): AdminRoomMember[] {
  const shown = filter === 'banned' ? members.filter((m) => m.banned) : filter === 'muted' ? members.filter((m) => m.mutedUntil && !m.banned) : members;
  const needle = search.trim().toLowerCase().replace(/^@/, '');
  if (!needle) return shown;
  return shown.filter((m) => m.name.toLowerCase().includes(needle) || (m.username ?? '').toLowerCase().includes(needle));
}

export async function fetchAdminRoomMembers(roomId: string): Promise<AdminRoomMembers> {
  const { data, error } = await supabase.rpc('admin_room_members', { room: roomId });
  if (error) {
    throw new Error(error.message?.includes('Could not find the function') ? 'Room members need a server update first (community_room_members.sql).' : error.message || 'Could not load the members.');
  }
  return parseAdminRoomMembers(data);
}
