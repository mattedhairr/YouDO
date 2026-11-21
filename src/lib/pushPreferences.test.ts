import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }));

import { pushPreferencesRow } from './pushPreferences';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from './notifications';

const NOW = new Date('2026-11-21T10:00:00Z');
const prefs = (patch: Partial<NotificationPreferences> = {}): NotificationPreferences => ({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...patch });

describe('the push switches the server reads', () => {
  it('sends the defaults: community mentions and replies, every admin alert on', () => {
    const row = pushPreferencesRow('u1', prefs(), NOW);
    expect(row.community).toEqual({ community_messages: 'mentions', admin_requests: true, admin_replies: true, admin_reports: true });
    expect(row.board).toEqual({ board_updates: true });
    expect(row.base).toMatchObject({ user_id: 'u1', private_hub: true, room_messages: 'mentions', updated_at: NOW.toISOString() });
  });

  it('sends the community choice as it is', () => {
    const p = prefs({ publicHub: { ...DEFAULT_NOTIFICATION_PREFERENCES.publicHub, communityChat: 'all' } });
    expect(pushPreferencesRow('u1', p, NOW).community.community_messages).toBe('all');
  });

  it('folds the Public Hub switch and the master switch into "off"', () => {
    const hubOff = prefs({ publicHub: { ...DEFAULT_NOTIFICATION_PREFERENCES.publicHub, enabled: false, communityChat: 'all' } });
    expect(pushPreferencesRow('u1', hubOff, NOW).community.community_messages).toBe('off');
    expect(pushPreferencesRow('u1', hubOff, NOW).board.board_updates).toBe(false);
    const allOff = prefs({ enabled: false });
    const row = pushPreferencesRow('u1', allOff, NOW);
    expect(row.community).toEqual({ community_messages: 'off', admin_requests: false, admin_replies: false, admin_reports: false });
    expect(row.base.private_hub).toBe(false);
  });

  it('sends each admin switch, and the Admin Hub switch turns them all off', () => {
    const p = prefs({ adminHub: { enabled: true, newHashtagRequests: false, reportedMessages: true, chatReplies: false } });
    expect(pushPreferencesRow('u1', p, NOW).community).toMatchObject({ admin_requests: false, admin_replies: false, admin_reports: true });
    const off = prefs({ adminHub: { enabled: false, newHashtagRequests: true, reportedMessages: true, chatReplies: true } });
    expect(pushPreferencesRow('u1', off, NOW).community).toMatchObject({ admin_requests: false, admin_replies: false, admin_reports: false });
  });
});
