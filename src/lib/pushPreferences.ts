import { supabase } from './supabase';
import type { NotificationPreferences } from './notifications';

/**
 * The row of push switches the server reads to decide what to push while the
 * app is closed (supabase/hub_push.sql, board_update_push.sql and
 * community_push.sql). Master switches are folded in here, so the server sees
 * one plain answer per kind.
 */
export function pushPreferencesRow(userId: string, prefs: NotificationPreferences, now = new Date()) {
  const on = prefs.enabled;
  const hub = prefs.privateHub;
  const pub = on && prefs.publicHub.enabled;
  const admin = prefs.adminHub ?? { enabled: true, newHashtagRequests: true, reportedMessages: true, chatReplies: true };
  const adminOn = on && admin.enabled;
  return {
    base: {
      user_id: userId,
      private_hub: on && hub.enabled,
      direct_messages: hub.directMessages,
      requests: hub.friendRequests || hub.roomInvites,
      room_messages: hub.roomMessages,
      message_previews: hub.messagePreviews !== false,
      updated_at: now.toISOString(),
    },
    board: { board_updates: pub && prefs.publicHub.boardUpdates !== false },
    community: {
      community_messages: pub ? prefs.publicHub.communityChat : 'off',
      admin_requests: adminOn && admin.newHashtagRequests !== false,
      admin_replies: adminOn && admin.chatReplies !== false,
      admin_reports: adminOn && admin.reportedMessages !== false,
    },
    backers: { admin_backers: adminOn && admin.backerClaims !== false },
  };
}

/**
 * Mirrors the switches to the server. Best effort: while offline, or until a
 * server update adds a column (an unknown column is PGRST204), the newer parts
 * are left out and the rest still syncs; the server keeps its defaults.
 */
export async function syncPushPreferences(userId: string | undefined, prefs: NotificationPreferences): Promise<void> {
  if (!userId) return;
  const { base, board, community, backers } = pushPreferencesRow(userId, prefs);
  try {
    for (const row of [{ ...base, ...board, ...community, ...backers }, { ...base, ...board, ...community }, { ...base, ...board }, base]) {
      const { error } = await supabase.from('push_preferences').upsert(row);
      if (error?.code !== 'PGRST204') return;
    }
  } catch {
    /* Retried on the next change or sign-in. */
  }
}
