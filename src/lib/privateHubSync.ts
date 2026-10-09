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

/** Postgres realtime for Private Hub badge, friends, and DM list previews. */
export function subscribePrivateHubRealtime(userId: string, handlers: HubSyncHandlers): () => void {
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

  const channel = supabase
    .channel(`hub_realtime_${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'friendships', filter: `receiver_id=eq.${userId}` },
      (payload) => {
        pending();
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && payload.eventType === 'INSERT') {
          const rec = payload.new as { requester_id?: string; status?: string } | undefined;
          if (rec?.requester_id && rec?.status === 'pending') {
            void import('./profiles').then(({ fetchProfile }) => {
              void fetchProfile(rec.requester_id!).then((profile) => {
                const name = profile?.display_name || (profile?.username ? `@${profile.username}` : 'Someone');
                void import('./notifications').then(({ dispatchFriendRequestNotification }) => {
                  void dispatchFriendRequestNotification(name);
                });
              });
            });
          }
        }
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'friendships', filter: `requester_id=eq.${userId}` },
      pending,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'friendships', filter: `receiver_id=eq.${userId}` },
      friends,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'squad_members', filter: `user_id=eq.${userId}` },
      (payload) => {
        pending();
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && payload.eventType === 'INSERT') {
          const rec = payload.new as { squad_id?: string } | undefined;
          if (rec?.squad_id) {
            void import('./squads').then(({ getSquadDetails }) => {
              void getSquadDetails(rec.squad_id!).then((squadRes) => {
                const roomName = squadRes?.squad?.name || 'a room';
                void import('./notifications').then(({ dispatchRoomInviteNotification }) => {
                  void dispatchRoomInviteNotification(roomName, 'A squad member');
                });
              });
            });
          }
        }
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'squad_members' },
      pending,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${userId}` },
      (payload) => {
        dms();
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && payload.eventType === 'INSERT') {
          const rec = payload.new as { sender_id?: string; content?: string } | undefined;
          if (rec?.sender_id && rec?.content) {
            void import('./profiles').then(({ fetchProfile }) => {
              void fetchProfile(rec.sender_id!).then((profile) => {
                const name = profile?.display_name || (profile?.username ? `@${profile.username}` : 'Friend');
                void import('./notifications').then(({ dispatchDmNotification }) => {
                  void dispatchDmNotification({ friendId: rec.sender_id!, friendName: name, content: rec.content! });
                });
              });
            });
          }
        }
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${userId}` },
      dms,
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'squad_messages' },
      (payload) => {
        squads();
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && payload.eventType === 'INSERT') {
          const rec = payload.new as { squad_id?: string; sender_id?: string; content?: string } | undefined;
          if (rec?.squad_id && rec?.sender_id && rec.sender_id !== userId && rec?.content) {
            void Promise.all([
              import('./squads').then(({ getSquadDetails }) => getSquadDetails(rec.squad_id!)),
              import('./profiles').then(({ fetchProfile }) => fetchProfile(rec.sender_id!)),
              import('./notifications').then(({ dispatchRoomNotification }) => dispatchRoomNotification),
            ]).then(([squadRes, senderProfile, dispatchRoom]) => {
              const squadName = squadRes?.squad?.name || 'Squad Room';
              const senderName = senderProfile?.display_name || (senderProfile?.username ? `@${senderProfile.username}` : 'Member');
              void dispatchRoom({
                squadId: rec.squad_id!,
                squadName,
                senderName,
                content: rec.content!,
              });
            });
          }
        }
      },
    );

  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** DM list + friend list refresh while Private Hub is open (no duplicate pending channels). */
export function subscribePrivateHubInbox(
  userId: string,
  handlers: Pick<HubSyncHandlers, 'onFriends' | 'onDms'>,
): () => void {
  const friends = () => {
    handlers.onFriends?.();
    dispatchPrivateHubSync('friends');
  };
  const dms = () => {
    handlers.onDms?.();
    dispatchPrivateHubSync('dms');
  };

  const channel = supabase
    .channel(`hub_inbox_${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'friendships', filter: `receiver_id=eq.${userId}` },
      friends,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'friendships', filter: `requester_id=eq.${userId}` },
      friends,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${userId}` },
      dms,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${userId}` },
      dms,
    );

  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Fallback while app is open — WebSocket can lag on mobile or if Realtime isn't enabled in Supabase. */
export function startPrivateHubForegroundSync(onTick: () => void, intervalMs = 3_500): () => void {
  const tick = () => {
    if (document.visibilityState === 'visible') onTick();
  };

  tick();
  const interval = window.setInterval(tick, intervalMs);
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', tick);

  let disposed = false;
  let appListener: { remove: () => void } | undefined;
  void import('@capacitor/app')
    .then(({ App }) =>
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) onTick();
      }),
    )
    .then((handle) => {
      if (disposed) {
        handle.remove();
      } else {
        appListener = handle;
      }
    })
    .catch(() => {
      /* web dev */
    });

  return () => {
    disposed = true;
    window.clearInterval(interval);
    window.removeEventListener('focus', tick);
    document.removeEventListener('visibilitychange', tick);
    appListener?.remove();
  };
}
