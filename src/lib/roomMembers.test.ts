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
