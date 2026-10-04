import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCommunityContext } from '../lib/community';
import { fetchDmInboxPreviews, squadRoomsHaveUnreadChat } from '../lib/messages';
import {
  PRIVATE_HUB_SYNC_EVENT,
  type PrivateHubSyncReason,
  startPrivateHubForegroundSync,
  subscribePrivateHubRealtime,
} from '../lib/privateHubSync';
import {
  fetchIncomingSquadJoinRequests,
  fetchOutgoingSquadJoinRequests,
  fetchPendingSquadInvites,
} from '../lib/squads';
import { fetchPendingRequests } from '../lib/profiles';

export function useHubAttention(userId: string | undefined, publicBoardOptedIn = false) {
  const [friendPending, setFriendPending] = useState(0);
  const [squadInboxPending, setSquadInboxPending] = useState(0);
  const [roomsOutgoingPending, setRoomsOutgoingPending] = useState(0);
  const [squadChatUnread, setSquadChatUnread] = useState(false);
  const [dmUnread, setDmUnread] = useState(0);
  const [communityUnread, setCommunityUnread] = useState(0);

  const privatePending = friendPending + squadInboxPending;

  const refreshPrivate = useCallback(async () => {
    if (!userId) return;
    const [friends, invites, joins, outgoing] = await Promise.all([
      fetchPendingRequests(userId),
      fetchPendingSquadInvites(userId),
      fetchIncomingSquadJoinRequests(userId),
      fetchOutgoingSquadJoinRequests(),
    ]);
    setFriendPending(friends.length);
    setSquadInboxPending(invites.length + joins.length);
    setRoomsOutgoingPending(outgoing.length);
  }, [userId]);

  const refreshDmInbox = useCallback(async () => {
    if (!userId) return;
    const previews = await fetchDmInboxPreviews(userId);
    let total = 0;
    for (const p of Object.values(previews)) total += p.unreadCount;
    setDmUnread(total);
  }, [userId]);

  const refreshSquadChat = useCallback(async () => {
    if (!userId) return;
    setSquadChatUnread(await squadRoomsHaveUnreadChat(userId));
  }, [userId]);

  const refreshCommunity = useCallback(async () => {
    if (!userId || !publicBoardOptedIn) {
      setCommunityUnread(0);
      return;
    }
    try {
      const ctx = await fetchCommunityContext(userId);
      if (ctx.error || ctx.banned) {
        setCommunityUnread(0);
        return;
      }
      setCommunityUnread((ctx.unread?.chat ?? 0) + (ctx.unread?.updates ?? 0));
    } catch {
      /* keep last count */
    }
  }, [userId, publicBoardOptedIn]);

  const refreshAll = useCallback(() => {
    void refreshPrivate();
    void refreshDmInbox();
    void refreshSquadChat();
    if (publicBoardOptedIn) void refreshCommunity();
    else setCommunityUnread(0);
  }, [refreshPrivate, refreshDmInbox, refreshSquadChat, refreshCommunity, publicBoardOptedIn]);

  useEffect(() => {
    if (!userId) {
      setFriendPending(0);
      setSquadInboxPending(0);
      setRoomsOutgoingPending(0);
      setSquadChatUnread(false);
      setDmUnread(0);
      setCommunityUnread(0);
      return;
    }

    if (!publicBoardOptedIn) {
      setCommunityUnread(0);
    }

    refreshAll();

    const stopRealtime = subscribePrivateHubRealtime(userId, {
      onPending: () => void refreshPrivate(),
      onDms: () => void refreshDmInbox(),
      onSquads: () => void refreshSquadChat(),
    });

    const stopPoll = startPrivateHubForegroundSync(refreshAll);

    const onCommunityRead = () => {
      if (publicBoardOptedIn) void refreshCommunity();
    };
    window.addEventListener('youdo-community-read', onCommunityRead);

    const onPrivateSync = (e: Event) => {
      const reason = (e as CustomEvent<{ reason?: PrivateHubSyncReason }>).detail?.reason ?? 'all';
      if (reason === 'pending' || reason === 'all') void refreshPrivate();
      if (reason === 'dms' || reason === 'all') void refreshDmInbox();
      if (reason === 'squads' || reason === 'all') void refreshSquadChat();
    };
    window.addEventListener(PRIVATE_HUB_SYNC_EVENT, onPrivateSync);

    return () => {
      stopRealtime();
      stopPoll();
      window.removeEventListener('youdo-community-read', onCommunityRead);
      window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, onPrivateSync);
    };
  }, [userId, publicBoardOptedIn, refreshAll, refreshCommunity, refreshPrivate, refreshDmInbox, refreshSquadChat]);

  const publicHubUnread = publicBoardOptedIn ? communityUnread : 0;

  const privateHubAttention = useMemo(
    () => privatePending > 0 || dmUnread > 0 || roomsOutgoingPending > 0 || squadChatUnread,
    [privatePending, dmUnread, roomsOutgoingPending, squadChatUnread],
  );

  const dmsTabAttention = dmUnread > 0;
  const roomsTabAttention = squadInboxPending > 0 || roomsOutgoingPending > 0 || squadChatUnread;

  const showHubNavDot = publicHubUnread > 0 || privateHubAttention;

  return {
    privatePending,
    dmUnread,
    roomsOutgoingPending,
    squadChatUnread,
    communityUnread: publicHubUnread,
    privateHubAttention,
    dmsTabAttention,
    roomsTabAttention,
    showHubNavDot,
    refreshPrivate,
    refreshDmInbox,
    refreshSquadChat,
    refreshCommunity,
    refreshAll,
  };
}
