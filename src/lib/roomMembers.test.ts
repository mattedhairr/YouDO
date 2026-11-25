import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { filterRoomMembers, parseRoomMembers } from './roomMembers';

// Made-up people.
const raw = {
  total: 4,
  members: [
    { user_id: 'u1', display_name: 'Ravi K.', username: 'ravi_k', avatar_url: '', is_backer: false, relation: 'self', request_id: null },
    { user_id: 'u2', display_name: 'Meera S.', username: 'meera_s', avatar_url: 'https://example.com/m.webp', is_backer: true, relation: 'friend' },
    { user_id: 'u3', display_name: 'Priya N.', username: 'priya_n', avatar_url: '📚', relation: 'incoming', request_id: 'r9' },
    { user_id: 'u4', display_name: '', username: null, relation: 'mystery' },
    { display_name: 'No id' },
  ],
};

describe('room members', () => {
  it('reads each person and how they relate to you', () => {
    const { total, members } = parseRoomMembers(raw);
    expect(total).toBe(4);
    expect(members.map((m) => m.id)).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(members[0]).toMatchObject({ relation: 'self', avatarUrl: undefined, backer: false, requestId: undefined });
    expect(members[1]).toMatchObject({ relation: 'friend', backer: true, avatarUrl: 'https://example.com/m.webp' });
    expect(members[2]).toMatchObject({ relation: 'incoming', requestId: 'r9', avatarUrl: '📚' });
    expect(members[3]).toMatchObject({ name: 'Board member', username: undefined, relation: 'none' });
  });

  it('copes with nothing', () => {
    expect(parseRoomMembers(null)).toEqual({ total: 0, members: [] });
  });

  it('searches names and @usernames', () => {
    const { members } = parseRoomMembers(raw);
    expect(filterRoomMembers(members, '@MEERA').map((m) => m.id)).toEqual(['u2']);
    expect(filterRoomMembers(members, 'priya').map((m) => m.id)).toEqual(['u3']);
    expect(filterRoomMembers(members, '  ')).toHaveLength(4);
  });
});

describe('what each row offers', () => {
  it('message a friend, accept a request, add someone with an @username', async () => {
    const { roomMemberAction } = await import('./roomMembers');
    expect(roomMemberAction({ relation: 'self' }, true)).toBe('you');
    expect(roomMemberAction({ relation: 'friend' }, true)).toBe('message');
    expect(roomMemberAction({ relation: 'friend' }, false)).toBe('friend');
    expect(roomMemberAction({ relation: 'requested' }, true)).toBe('requested');
    expect(roomMemberAction({ relation: 'incoming', requestId: 'r1' }, true)).toBe('accept');
    expect(roomMemberAction({ relation: 'incoming' }, true)).toBe('requested');
    expect(roomMemberAction({ relation: 'none', username: 'arjun_up' }, true)).toBe('add');
    expect(roomMemberAction({ relation: 'none' }, true)).toBe('cannot-add');
  });
});

describe('the Admin Hub view of a room', () => {
  it('marks staff, mutes and bans, and filters them', async () => {
    const { parseAdminRoomMembers, filterAdminRoomMembers } = await import('./roomMembers');
    const room = parseAdminRoomMembers({
      total: 3, muted: 1, banned: 1,
      members: [
        { user_id: 'u1', display_name: 'Ravi', username: 'ravi_k', staff_role: 'admin', on_board: true },
        { user_id: 'u2', display_name: 'Kabir', username: 'kabir_27', muted_until: '2026-11-26T10:00:00Z', on_board: true },
        { user_id: 'u3', display_name: 'Spam Bot', username: 'offers_now', banned_at: '2026-11-20T10:00:00Z', on_board: false },
        { display_name: 'No id' },
      ],
    });
    expect(room.members.map((m) => m.id)).toEqual(['u1', 'u2', 'u3']);
    expect(room.members[0].staff).toBe('admin');
    expect(room.members[2]).toMatchObject({ banned: true, onBoard: false });
    expect(filterAdminRoomMembers(room.members, 'muted', '').map((m) => m.id)).toEqual(['u2']);
    expect(filterAdminRoomMembers(room.members, 'banned', '').map((m) => m.id)).toEqual(['u3']);
    expect(filterAdminRoomMembers(room.members, 'all', '@KAB').map((m) => m.id)).toEqual(['u2']);
  });
});
