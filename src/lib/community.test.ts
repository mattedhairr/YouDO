import { describe, expect, it } from 'vitest';
import {
  canSubmitCommunityAppeal,
  communityAppealAvailableAt,
  describeCommunityAudit,
  isCommunityMessageActive,
  isCommunityUnavailable,
  parseCommunityActivity,
  parseCommunityContext,
  type CommunityAppeal,
  type CommunityMessage,
} from './community';

describe('admin activity values', () => {
  const sample = { day_key: '2026-09-07', as_of: '2026-09-07T00:00:05Z', active_recently: 2, visited_today: 1, board_members: 14 };
  it('allows a recently active member from before midnight without counting a visit today', () => {
    expect(parseCommunityActivity(sample)).toMatchObject({ activeRecently: 2, visitedToday: 1, dayKey: '2026-09-07' });
  });
  it('rejects unavailable, malformed and impossible counts instead of inventing zeros', () => {
    expect(parseCommunityActivity(null)).toBeNull();
    expect(parseCommunityActivity({ ...sample, visited_today: NaN })).toBeNull();
    expect(parseCommunityActivity({ ...sample, visited_today: 15 })).toBeNull();
    expect(parseCommunityActivity({ ...sample, as_of: 'bad date' })).toBeNull();
    expect(parseCommunityActivity({ ...sample, active_recently: -1 })).toBeNull();
  });

});

describe('community availability', () => {
  it('recognises a migration that has not been installed', () => {
    expect(isCommunityUnavailable({ code: 'PGRST205', message: 'not found' })).toBe(true);
    expect(isCommunityUnavailable({ code: '42P01', message: 'relation does not exist' })).toBe(true);
    expect(isCommunityUnavailable({ code: '42883', message: 'function does not exist' })).toBe(true);
  });

  it('does not hide ordinary service errors as missing setup', () => {
    expect(isCommunityUnavailable({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isCommunityUnavailable(null)).toBe(false);
  });
});

describe('community context', () => {
  it('parses the single-request Board and admin context', () => {
    expect(parseCommunityContext({
      day_key: '2026-09-09', is_admin: true, can_join: true, can_post: false,
      settings: { room_enabled: true, appreciations_enabled: false, announcement: 'Focus first.' },
      muted_until: '2026-09-10T00:00:00.000Z', banned_at: null, appeal: null,
    })).toMatchObject({
      available: true, dayKey: '2026-09-09', isAdmin: true, canJoin: true, canPost: false,
      settings: { roomEnabled: true, appreciationsEnabled: false, announcement: 'Focus first.' },
      mutedUntil: '2026-09-10T00:00:00.000Z', banned: false,
    });
  });

  it('rejects malformed context instead of flashing incorrect controls', () => {
    expect(parseCommunityContext({ day_key: 'today' })).toBeNull();
    expect(parseCommunityContext(null)).toBeNull();
  });
});

describe('24-hour community messages', () => {
  const message: CommunityMessage = {
    id: 'message-1', authorId: 'user-1', body: 'Keep going.', kind: 'chat',
    createdAt: '2026-09-08T18:20:00.000Z', expiresAt: '2026-09-09T18:20:00.000Z',
  };

  it('keeps a message for its full rolling window instead of clearing at midnight', () => {
    expect(isCommunityMessageActive(message, Date.parse('2026-09-09T00:00:00.000Z'))).toBe(true);
    expect(isCommunityMessageActive(message, Date.parse('2026-09-09T18:19:59.999Z'))).toBe(true);
  });

  it('hides a message at its exact expiry or when moderation removes it', () => {
    expect(isCommunityMessageActive(message, Date.parse(message.expiresAt))).toBe(false);
    expect(isCommunityMessageActive({ ...message, removedAt: '2026-09-08T19:00:00.000Z' })).toBe(false);
  });
});

describe('community audit descriptions', () => {
  const entry = { id: 1, action: 'settings.room.disabled', reason: '', createdAt: '2026-09-08T09:20:00Z' };

  it('explains control changes instead of exposing database action names', () => {
    expect(describeCommunityAudit(entry)).toEqual({
      category: 'Settings',
      title: 'Community room paused',
      detail: 'New messages and automatic notes are paused.',
    });
  });

  it('names affected members and retains a useful moderation reason', () => {
    expect(describeCommunityAudit({ ...entry, action: 'member.mute_24h', targetUserId: 'user-2', reason: 'Repeated spam' }, 'Asha')).toMatchObject({
      category: 'Member', title: 'Muted Asha for 24 hours', detail: 'Repeated spam',
    });
  });

  it('labels legacy vague records honestly', () => {
    expect(describeCommunityAudit({ ...entry, action: 'settings.updated' }).detail).toContain('earlier app version');
  });
});

describe('community appeal cooldown', () => {
  const declined: CommunityAppeal = {
    id: 'appeal-1', userId: 'user-1', message: 'I understand the rule and would like a review.', status: 'declined',
    adminResponse: 'Please wait before requesting another review.', createdAt: '2026-09-01T00:00:00.000Z', reviewedAt: '2026-09-02T00:00:00.000Z',
  };

  it('allows a new appeal seven days after a decline', () => {
    expect(communityAppealAvailableAt(declined)).toBe(new Date('2026-09-09T00:00:00.000Z').getTime());
    expect(canSubmitCommunityAppeal(declined, new Date('2026-09-08T23:59:59.000Z').getTime())).toBe(false);
    expect(canSubmitCommunityAppeal(declined, new Date('2026-09-09T00:00:00.000Z').getTime())).toBe(true);
  });

  it('prevents duplicate open appeals', () => {
    expect(canSubmitCommunityAppeal({ ...declined, status: 'open', reviewedAt: undefined })).toBe(false);
    expect(canSubmitCommunityAppeal(undefined)).toBe(true);
  });
});
