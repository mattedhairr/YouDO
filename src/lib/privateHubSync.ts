import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const PRIVATE_HUB_SYNC_EVENT = 'youdo-private-hub-sync';

export type PrivateHubSyncReason = 'pending' | 'friends' | 'dms' | 'squads' | 'all';

export function dispatchPrivateHubSync(reason: PrivateHubSyncReason = 'all') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PRIVATE_HUB_SYNC_EVENT, { detail: { reason } }));
}

type HubSyncHandlers = {
  onPending?: () => void;
  onFriends?: () => void;
  onDms?: () => void;
  onSquads?: () => void;
};

function trackChannel(channel: RealtimeChannel, bucket: RealtimeChannel[]) {
  channel.subscribe();
  bucket.push(channel);
}

/** Postgres realtime for Private Hub badge, friends, and DM list previews. */
export function subscribePrivateHubRealtime(userId: string, handlers: HubSyncHandlers): () => void {
  const channels: RealtimeChannel[] = [];

  const pending = () => {
    handlers.onPending?.();
    dispatchPrivateHubSync('pending');
  };
  const friends = () => {
    handlers.onFriends?.();
    dispatchPrivateHubSync('friends');
  };
  const dms = () => {
    handlers.onDms?.();
    dispatchPrivateHubSync('dms');
  };
  const squads = () => {
    handlers.onSquads?.();
    dispatchPrivateHubSync('squads');
  };

  trackChannel(
    supabase
      .channel(`hub_friendships_in_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `receiver_id=eq.${userId}` },
        pending,
      ),
    channels,
  );

  trackChannel(
    supabase
      .channel(`hub_friendships_out_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `requester_id=eq.${userId}` },
        pending,
      ),
    channels,
  );

  trackChannel(
    supabase
      .channel(`hub_friendships_accept_${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'friendships', filter: `receiver_id=eq.${userId}` },
        friends,
      ),
    channels,
  );

  // Invites / membership changes for this user
  trackChannel(
    supabase
      .channel(`hub_squad_members_self_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'squad_members', filter: `user_id=eq.${userId}` },
        pending,
      ),
    channels,
  );

  // Join requests to squads you admin (RLS delivers only visible rows)
  trackChannel(
    supabase
      .channel(`hub_squad_members_admin_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'squad_members' }, pending),
    channels,
  );

  trackChannel(
    supabase
      .channel(`hub_dm_recv_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${userId}` },
        dms,
      ),
    channels,
  );

  trackChannel(
    supabase
      .channel(`hub_dm_sent_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${userId}` },
        dms,
      ),
    channels,
  );

  trackChannel(
    supabase
      .channel(`hub_squad_messages_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'squad_messages' }, squads),
    channels,
  );

  return () => {
    for (const ch of channels) void supabase.removeChannel(ch);
  };
}

/** DM list + friend list refresh while Private Hub is open (no duplicate pending channels). */
export function subscribePrivateHubInbox(
  userId: string,
  handlers: Pick<HubSyncHandlers, 'onFriends' | 'onDms'>,
): () => void {
  const channels: RealtimeChannel[] = [];

  const friends = () => {
    handlers.onFriends?.();
    dispatchPrivateHubSync('friends');
  };
  const dms = () => {
    handlers.onDms?.();
    dispatchPrivateHubSync('dms');
  };

  trackChannel(
    supabase
      .channel(`hub_inbox_friendships_${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'friendships', filter: `receiver_id=eq.${userId}` },
        friends,
      ),
    channels,
  );

  trackChannel(
    supabase
      .channel(`hub_inbox_dm_recv_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${userId}` },
        dms,
      ),
    channels,
  );

  trackChannel(
    supabase
      .channel(`hub_inbox_dm_sent_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${userId}` },
        dms,
      ),
    channels,
  );

  return () => {
    for (const ch of channels) void supabase.removeChannel(ch);
  };
}

/** Fallback while app is open — WebSocket can lag on mobile or if Realtime isn't enabled in Supabase. */
export function startPrivateHubForegroundSync(onTick: () => void, intervalMs = 8_000): () => void {
  const tick = () => {
    if (document.visibilityState === 'visible') onTick();
  };

  tick();
  const interval = window.setInterval(tick, intervalMs);
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', tick);

  let appListener: { remove: () => void } | undefined;
  void import('@capacitor/app')
    .then(({ App }) =>
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) onTick();
      }),
    )
    .then((handle) => {
      appListener = handle;
    })
    .catch(() => {
      /* web dev */
    });

  return () => {
    window.clearInterval(interval);
    window.removeEventListener('focus', tick);
    document.removeEventListener('visibilitychange', tick);
    appListener?.remove();
  };
}
