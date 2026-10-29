import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchAcceptedFriends,
  ensureProfileFromAuth,
  fetchProfile,
  normalizeUsername,
  profileDisplayLabel,
  resolvePrivateHubUsername,
  type Profile,
} from '../lib/profiles';
import { Bell, ChevronRight, Loader2, MessageCircle, Plus, UserPlus, Users, WifiOff } from 'lucide-react';
import UserProfileSheet from './UserProfileSheet';
import AddFriendSheet from './AddFriendSheet';
import PrivateFriendsSheet from './PrivateFriendsSheet';
import NotificationsView from './NotificationsView';
import CreateRoomSheet from './CreateRoomSheet';
import SquadRoomSheet from './SquadRoomSheet';
import DmInboxSheet from './DmInboxSheet';
import RoomsView from './RoomsView';
import PrivateHubUsernameGate from './PrivateHubUsernameGate';
import { fetchDmInboxPreviews, type DmInboxPreview } from '../lib/messages';
import { subscribePrivateHubInbox } from '../lib/privateHubSync';
import { HubAvatar, HubAvatarStack, HubEmpty, HubSection } from './hub/HubParts';
import { formatHubTime } from './hub/hubTime';
import { OPEN_DM_EVENT, OPEN_ROOM_EVENT, takePendingDm, takePendingRoom } from './hub/openDm';

/**
 * The Private Hub (DMs, rooms, friends, notifications), shown when the Admin Hub
 * switch lets this account in. Restored as it was before the hub was gated
 * (1c011df); the redesign replaces this layout.
 */
export default function PrivateHubView({
  personalPace = 4,
  onSwitchToPublic,
  pendingCount = 0,
  refreshPendingCount,
  refreshDmInbox,
  refreshSquadChat,
  dmsTabAttention = false,
  roomsTabAttention = false,
}: {
  personalPace?: number;
  onSwitchToPublic?: () => void;
  pendingCount?: number;
  refreshPendingCount?: () => void;
  refreshDmInbox?: () => void;
  refreshSquadChat?: () => void;
  dmsTabAttention?: boolean;
  roomsTabAttention?: boolean;
}) {
  const { user } = useAuth();
  const [privateSubTab, setPrivateSubTab] = useState<'dms' | 'rooms'>('dms');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [showDmInbox, setShowDmInbox] = useState<{ id: string; name: string; avatar: string } | null>(null);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [friendsListOpen, setFriendsListOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [draftUsername, setDraftUsername] = useState('');
  const [dmPreviews, setDmPreviews] = useState<Record<string, DmInboxPreview>>({});
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const needsUsernameClaim = Boolean(user && !loadingProfile && !normalizeUsername(myProfile?.username));

  // Supabase hands out a fresh user object on every auth event (session
  // restore, token refresh, metadata sync), often several in a row when the
  // app opens. Keyed on the object, the Hub reloaded once per event; keyed on
  // the id it loads once per account. The latest object is read from a ref.
  const userId = user?.id;
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refreshFriends = useCallback(async () => {
    if (!userId) return;
    const list = await fetchAcceptedFriends(userId);
    setFriends(list);
  }, [userId]);

  const refreshDmPreviews = useCallback(async () => {
    if (!userId) return;
    setDmPreviews(await fetchDmInboxPreviews(userId));
    refreshDmInbox?.();
  }, [userId, refreshDmInbox]);

  const localDmUnread = useMemo(() => {
    let n = 0;
    for (const p of Object.values(dmPreviews)) n += p.unreadCount;
    return n > 0;
  }, [dmPreviews]);

  const showDmsTabDot = privateSubTab !== 'dms' && (dmsTabAttention || localDmUnread);
  const showRoomsTabDot = privateSubTab !== 'rooms' && roomsTabAttention;

  const activeDmConversations = useMemo(() => {
    return friends
      .filter((f) => Boolean(dmPreviews[f.id]?.lastAt))
      .sort((a, b) => {
        const ta = dmPreviews[a.id]?.lastAt ?? '';
        const tb = dmPreviews[b.id]?.lastAt ?? '';
        return tb.localeCompare(ta);
      });
  }, [friends, dmPreviews]);

  useEffect(() => {
    const user = userRef.current;
    if (!userId || !user) {
      setLoadingProfile(false);
      setFriends([]);
      setMyProfile(null);
      setDmPreviews({});
      return;
    }

    setLoadingProfile(true);
    void (async () => {
      const res = await ensureProfileFromAuth(user);
      let p = await fetchProfile(user.id);
      if (!p && res.ok && res.username) {
        p = await fetchProfile(user.id);
        if (!p) {
          p = {
            id: user.id,
            username: res.username,
            display_name:
              (typeof user.user_metadata?.full_name === 'string'
                ? user.user_metadata.full_name.trim()
                : '') || res.username,
            bio: '',
            stats_private: false,
          };
        }
      }
      setMyProfile(p);
      void refreshFriends();
      const handle = normalizeUsername(p?.username);
      if (handle) {
        void refreshFriends();
        refreshPendingCount?.();
        void refreshDmPreviews();
      } else {
        setFriends([]);
        setDmPreviews({});
        const draft = resolvePrivateHubUsername(null, user.user_metadata, user.id);
        if (draft) setDraftUsername(draft);
      }
      setLoadingProfile(false);
    })();


    const stopInbox = subscribePrivateHubInbox(userId, {
      onFriends: () => void refreshFriends(),
      onDms: () => void refreshDmPreviews(),
    });

    return () => {
      stopInbox();
    };
  }, [userId, refreshFriends, refreshDmPreviews, refreshPendingCount]);

  // "Message" from a profile elsewhere (Public Board, a room) lands here.
  const openDmWith = useCallback(
    async (userId: string) => {
      const friend = friends.find((f) => f.id === userId) ?? (await fetchProfile(userId));
      if (!friend) return;
      setPrivateSubTab('dms');
      setShowDmInbox({ id: friend.id, name: profileDisplayLabel(friend), avatar: friend.avatar_url ?? '' });
    },
    [friends],
  );

  useEffect(() => {
    if (loadingProfile || needsUsernameClaim) return;
    const pending = takePendingDm();
    if (pending) void openDmWith(pending);
    const onRequest = () => {
      const next = takePendingDm();
      if (next) void openDmWith(next);
    };
    window.addEventListener(OPEN_DM_EVENT, onRequest);
    return () => window.removeEventListener(OPEN_DM_EVENT, onRequest);
  }, [loadingProfile, needsUsernameClaim, openDmWith]);

  // A Room widget tap: open that room once the hub is ready.
  useEffect(() => {
    if (loadingProfile || needsUsernameClaim) return;
    const openPending = () => {
      const roomId = takePendingRoom();
      if (roomId) setOpenRoomId(roomId);
    };
    openPending();
    window.addEventListener(OPEN_ROOM_EVENT, openPending);
    return () => window.removeEventListener(OPEN_ROOM_EVENT, openPending);
  }, [loadingProfile, needsUsernameClaim]);

  if (!user) return null;

  return (
    <>
      <div className="hub pb-4">
        {loadingProfile ? (
          <div className="flex items-center justify-center gap-2 py-20 text-[14px] text-content-muted" role="status">
            <Loader2 className="animate-spin text-primary" size={18} /> Loading Private Hub…
          </div>
        ) : needsUsernameClaim ? (
          <PrivateHubUsernameGate
            user={user}
            initialDraft={draftUsername}
            onSuccess={(profile) => {
              setMyProfile(profile);
              void refreshFriends();
              refreshPendingCount?.();
              void refreshDmPreviews();
            }}
            onSwitchToPublic={onSwitchToPublic}
          />
        ) : notificationsOpen ? (
          <NotificationsView
            onClose={() => setNotificationsOpen(false)}
            onOpenProfile={(id) => {
              setNotificationsOpen(false);
              setProfileUserId(id);
            }}
            onChanged={() => refreshPendingCount?.()}
          />
        ) : (
          <>
            {!isOnline && (
              <div className="hub-banner is-warning" role="status">
                <WifiOff size={16} className="mt-px shrink-0" />
                <span>You’re offline. Chats and rooms update when you reconnect.</span>
              </div>
            )}

            <div className="hub-toolbar">
              <div className="hub-segmented" role="tablist" aria-label="Private Hub">
                <button type="button" role="tab" aria-selected={privateSubTab === 'dms'} onClick={() => setPrivateSubTab('dms')}>
                  Chats
                  {showDmsTabDot && <span className="hub-segmented-dot" aria-label="new messages" />}
                </button>
                <button type="button" role="tab" aria-selected={privateSubTab === 'rooms'} onClick={() => setPrivateSubTab('rooms')}>
                  Rooms
                  {showRoomsTabDot && <span className="hub-segmented-dot" aria-label="room activity" />}
                </button>
              </div>
              <button
                type="button"
                className="hub-icon-button"
                onClick={() => {
                  refreshPendingCount?.();
                  setNotificationsOpen(true);
                }}
                aria-label={pendingCount > 0 ? `Requests, ${pendingCount} waiting` : 'Requests'}
              >
                <Bell size={18} strokeWidth={2.2} />
                {pendingCount > 0 && <span className="hub-icon-badge" aria-hidden>{pendingCount > 9 ? '9+' : pendingCount}</span>}
              </button>
              <button
                type="button"
                className="hub-icon-button is-filled"
                onClick={() => (privateSubTab === 'dms' ? setAddFriendOpen(true) : setCreateRoomOpen(true))}
                aria-label={privateSubTab === 'dms' ? 'Add friend' : 'New room'}
              >
                {privateSubTab === 'dms' ? <UserPlus size={17} strokeWidth={2.4} /> : <Plus size={19} strokeWidth={2.6} />}
              </button>
            </div>

            {privateSubTab === 'dms' ? (
              friends.length === 0 ? (
                <div className="hub-group">
                  <HubEmpty
                    icon={<Users size={24} />}
                    title="Find your study partners"
                    text="Add friends by their @username to chat privately and start rooms together."
                    action={
                      <button type="button" className="hub-pill-button is-filled" onClick={() => setAddFriendOpen(true)}>
                        <UserPlus size={15} strokeWidth={2.4} /> Add friend
                      </button>
                    }
                  />
                </div>
              ) : (
                <>
                  <HubSection title="Chats" footer="Messages disappear after 24 hours.">
                    <div className="hub-group">
                      {activeDmConversations.length === 0 ? (
                        <HubEmpty
                          icon={<MessageCircle size={24} />}
                          title="No recent chats"
                          text="Start a conversation with one of your friends."
                          action={
                            <button type="button" className="hub-pill-button" onClick={() => setFriendsListOpen(true)}>
                              New chat
                            </button>
                          }
                        />
                      ) : (
                        activeDmConversations.map((friend) => {
                          const preview = dmPreviews[friend.id]!;
                          const unread = preview.unreadCount ?? 0;
                          const title = profileDisplayLabel(friend);
                          return (
                            <button
                              key={friend.id}
                              type="button"
                              className="hub-row"
                              onClick={() => setShowDmInbox({ id: friend.id, name: title, avatar: friend.avatar_url ?? '' })}
                              aria-label={unread > 0 ? `${title}, ${unread} unread` : title}
                            >
                              <HubAvatar url={friend.avatar_url} name={title} />
                              <span className="hub-row-main">
                                <span className="hub-row-title">
                                  <span className="hub-truncate flex-1">{title}</span>
                                  <span className="hub-row-time">{formatHubTime(preview.lastAt)}</span>
                                </span>
                                <span className={`hub-row-subtitle hub-truncate block ${unread > 0 ? 'is-strong' : ''}`}>
                                  {preview.fromMe ? `You: ${preview.lastMessage}` : preview.lastMessage}
                                </span>
                              </span>
                              {unread > 0 && <span className="hub-count" aria-hidden>{unread > 99 ? '99+' : unread}</span>}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </HubSection>
                  <HubSection>
                    <div className="hub-group">
                      <button type="button" className="hub-row is-compact" onClick={() => setFriendsListOpen(true)}>
                        <span className="hub-activity-icon is-tint" aria-hidden><Users size={16} /></span>
                        <span className="hub-row-main">
                          <span className="hub-row-title">Friends</span>
                        </span>
                        <span className="hub-row-trailing">
                          <HubAvatarStack people={friends} max={3} />
                          <span className="text-[15px] text-content-muted tabular-nums">{friends.length}</span>
                          <ChevronRight size={18} className="hub-chevron" />
                        </span>
                      </button>
                    </div>
                  </HubSection>
                </>
              )
            ) : (
              <RoomsView
                personalPace={personalPace}
                onOpenRoom={(id) => setOpenRoomId(id)}
                onCreateRoom={() => setCreateRoomOpen(true)}
                onNotificationsChanged={() => refreshPendingCount?.()}
              />
            )}
          </>
        )}
      </div>

      <UserProfileSheet
        userId={profileUserId}
        onClose={() => setProfileUserId(null)}
        onMessage={() => {
          const friend = friends.find((f) => f.id === profileUserId);
          if (friend) {
            setShowDmInbox({
              id: friend.id,
              name: friend.display_name,
              avatar: friend.avatar_url ?? '',
            });
            setProfileUserId(null);
          }
        }}
        onFriendshipChange={() => {
          void refreshFriends();
          refreshPendingCount?.();
        }}
      />
      <AddFriendSheet
        open={addFriendOpen}
        onClose={() => setAddFriendOpen(false)}
        onOpenProfile={(id) => setProfileUserId(id)}
      />
      <PrivateFriendsSheet
        open={friendsListOpen}
        friends={friends}
        onClose={() => setFriendsListOpen(false)}
        onOpenProfile={(id) => {
          setFriendsListOpen(false);
          setProfileUserId(id);
        }}
        onMessage={(friend) => {
          setFriendsListOpen(false);
          setShowDmInbox({
            id: friend.id,
            name: profileDisplayLabel(friend),
            avatar: friend.avatar_url ?? '',
          });
        }}
      />
      <CreateRoomSheet
        open={createRoomOpen}
        onClose={() => setCreateRoomOpen(false)}
        onSuccess={(id) => {
          setCreateRoomOpen(false);
          setOpenRoomId(id);
        }}
        personalPace={personalPace}
      />
      <SquadRoomSheet
        open={!!openRoomId}
        squadId={openRoomId}
        personalPace={personalPace}
        onClose={() => {
          setOpenRoomId(null);
          refreshSquadChat?.();
        }}
      />
      <DmInboxSheet
        open={!!showDmInbox}
        friendId={showDmInbox?.id || null}
        friendName={showDmInbox?.name}
        friendAvatar={showDmInbox?.avatar}
        onClose={() => {
          setShowDmInbox(null);
          void refreshDmPreviews();
        }}
      />
    </>
  );
}
