import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchAcceptedFriends,
  ensureProfileFromAuth,
  fetchProfile,
  normalizeUsername,
  profileDisplayLabel,
  type Profile,
} from '../lib/profiles';
import { Bell, UserPlus, Users, UsersRound, Loader2, Sparkles, X, WifiOff } from 'lucide-react';
import { STORAGE_KEYS } from '../lib/storageKeys';
import BoardView from './BoardView';
import type { PaceRow, PaceWindow } from '../lib/paceBoard';
import UserProfileSheet from './UserProfileSheet';
import AddFriendSheet from './AddFriendSheet';
import PrivateFriendsSheet from './PrivateFriendsSheet';
import NotificationsView from './NotificationsView';
import CreateRoomSheet from './CreateRoomSheet';
import SquadRoomSheet from './SquadRoomSheet';
import DmInboxSheet from './DmInboxSheet';
import RoomsView from './RoomsView';
import HubAuthGate from './HubAuthGate';
import PrivateHubUsernameGate from './PrivateHubUsernameGate';
import { fetchDmInboxPreviews, type DmInboxPreview } from '../lib/messages';
import { ProfileAvatarVisual } from '../lib/profileAvatar';
import { subscribePrivateHubInbox } from '../lib/privateHubSync';

function formatDmListTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function privateHubIntroKey(userId: string) {
  return `${STORAGE_KEYS.privateHubIntroSeen}:${userId}`;
}

export default function HubView({
  onOpenBoardSettings,
  activeTab = 'social',
  personalPace = 4,
  onSwitchToPrivate,
  onSwitchToPublic,
  pendingCount = 0,
  refreshPendingCount,
  refreshDmInbox,
  refreshSquadChat,
  dmsTabAttention = false,
  roomsTabAttention = false,
}: {
  onOpenBoardSettings: () => void;
  activeTab?: 'social' | 'private';
  personalPace?: number;
  onSwitchToPrivate?: () => void;
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
  const [profileBoardPreview, setProfileBoardPreview] = useState<PaceRow | null>(null);
  const [profileBoardWindow, setProfileBoardWindow] = useState<PaceWindow>('week');
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
  const [showPrivateHubIntro, setShowPrivateHubIntro] = useState(false);
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

  const resolvedUsername = useMemo(
    () => (user ? normalizeUsername(myProfile?.username) : null),
    [user, myProfile],
  );
  const needsUsernameClaim = Boolean(user && !loadingProfile && !normalizeUsername(myProfile?.username));

  const refreshFriends = useCallback(async () => {
    if (!user) return;
    const list = await fetchAcceptedFriends(user.id);
    setFriends(list);
  }, [user]);

  const refreshDmPreviews = useCallback(async () => {
    if (!user) return;
    setDmPreviews(await fetchDmInboxPreviews(user.id));
    refreshDmInbox?.();
  }, [user, refreshDmInbox]);

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
    if (!user) {
      setLoadingProfile(false);
      setFriends([]);
      setMyProfile(null);
      setDmPreviews({});
      return;
    }

    setLoadingProfile(true);
    void (async () => {
      await ensureProfileFromAuth(user);
      const p = await fetchProfile(user.id);
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
        setDraftUsername('');
      }
      setLoadingProfile(false);
    })();

    if (activeTab !== 'private') return;

    const stopInbox = subscribePrivateHubInbox(user.id, {
      onFriends: () => void refreshFriends(),
      onDms: () => void refreshDmPreviews(),
    });

    return () => {
      stopInbox();
    };
  }, [user, activeTab, refreshFriends, refreshDmPreviews, refreshPendingCount]);

  useEffect(() => {
    if (!user || loadingProfile || resolvedUsername) {
      setShowPrivateHubIntro(false);
      return;
    }
    try {
      setShowPrivateHubIntro(localStorage.getItem(privateHubIntroKey(user.id)) !== '1');
    } catch {
      setShowPrivateHubIntro(true);
    }
  }, [user, loadingProfile, resolvedUsername]);

  const dismissPrivateHubIntro = useCallback(() => {
    if (user) {
      try {
        localStorage.setItem(privateHubIntroKey(user.id), '1');
      } catch {
        /* ignore */
      }
    }
    setShowPrivateHubIntro(false);
  }, [user]);

  if (!user) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div key={activeTab} className="hub-screen-transition overflow-x-hidden">
            <HubAuthGate
              tab={activeTab}
              isOffline={!isOnline}
              onSwitchTab={(target) => {
                if (target === 'private') onSwitchToPrivate?.();
                else onSwitchToPublic?.();
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div key={activeTab} className="hub-screen-transition overflow-x-hidden">
          {activeTab === 'social' ? (
            <>
              {showPrivateHubIntro && needsUsernameClaim && (
                <div className="mx-1 mb-3 rounded-[18px] border border-primary/25 bg-gradient-to-br from-primary-soft/80 to-elevated p-4 shadow-elevated relative overflow-hidden">
                  <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-primary/10 blur-2xl" />
                  <button
                    type="button"
                    onClick={dismissPrivateHubIntro}
                    className="absolute right-2 top-2 p-1.5 rounded-full text-content-muted hover:text-content-primary hover:bg-elevated/80"
                    aria-label="Dismiss"
                  >
                    <X size={16} />
                  </button>
                  <div className="flex gap-3 pr-6">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary text-on-primary">
                      <Sparkles size={18} strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">New · Private Hub</p>
                      <p className="mt-1 text-[13px] font-semibold text-content-primary leading-snug">
                        DM friends, run squad rooms, and keep public board separate.
                      </p>
                      <p className="mt-1.5 text-[11.5px] text-content-secondary leading-relaxed">
                        Pick a one-time @username to unlock Private. Public board works as before until then.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            dismissPrivateHubIntro();
                            onSwitchToPrivate?.();
                          }}
                          className="h-9 px-3.5 rounded-[10px] bg-primary text-on-primary text-[12px] font-bold"
                        >
                          Set up Private Hub
                        </button>
                        <button
                          type="button"
                          onClick={dismissPrivateHubIntro}
                          className="h-9 px-3.5 rounded-[10px] border border-subtle bg-surface/80 text-[12px] font-semibold text-content-secondary"
                        >
                          Later
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <BoardView
                onOpenBoardSettings={onOpenBoardSettings}
                onOpenProfile={(id, row, paceWindow) => {
                  setProfileUserId(id);
                  setProfileBoardPreview(row);
                  setProfileBoardWindow(paceWindow);
                }}
              />
            </>
          ) : (
            <div className="py-2">
              {loadingProfile && (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-content-muted">
                  <Loader2 className="animate-spin text-primary" size={28} />
                  <p className="text-[12px] font-medium">Loading Private Hub…</p>
                </div>
              )}

              {!loadingProfile && needsUsernameClaim ? (
                <PrivateHubUsernameGate
                  user={user}
                  initialDraft={draftUsername}
                  onSuccess={(profile) => {
                    setMyProfile(profile);
                    dismissPrivateHubIntro();
                    void refreshFriends();
                    refreshPendingCount?.();
                    void refreshDmPreviews();
                  }}
                  onSwitchToPublic={onSwitchToPublic}
                />
              ) : !loadingProfile ? (
                <>
                  {!isOnline && (
                    <div className="mx-1 mb-3 rounded-2xl border border-warning/30 bg-warning-soft/60 px-3.5 py-2.5 flex items-center gap-2 text-[11.5px] text-warning">
                      <WifiOff size={15} className="shrink-0" />
                      <span>You are offline. Reconnect to sync squad rooms, messages, and companion requests.</span>
                    </div>
                  )}

                  {!notificationsOpen && (
                    <div className="flex items-center justify-between border-b border-subtle pb-3 mb-4">
                      <div className="flex gap-5 px-1">
                        <button
                          type="button"
                          onClick={() => setPrivateSubTab('dms')}
                          className={`text-[15px] font-semibold transition-colors relative ${
                            privateSubTab === 'dms' ? 'text-primary' : 'text-content-muted'
                          }`}
                        >
                          <span className="relative inline-flex items-center gap-1.5">
                            DMs
                            {showDmsTabDot && (
                              <span
                                className="size-[6px] rounded-full bg-primary shrink-0"
                                aria-label="DMs have new activity"
                              />
                            )}
                          </span>
                          {privateSubTab === 'dms' && (
                            <div className="absolute -bottom-[13px] left-0 right-0 h-[2px] bg-primary rounded-t-full" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrivateSubTab('rooms')}
                          className={`text-[15px] font-semibold transition-colors relative ${
                            privateSubTab === 'rooms' ? 'text-primary' : 'text-content-muted'
                          }`}
                        >
                          <span className="relative inline-flex items-center gap-1.5">
                            Rooms
                            {showRoomsTabDot && (
                              <span
                                className="size-[6px] rounded-full bg-primary shrink-0"
                                aria-label="Rooms have pending activity"
                              />
                            )}
                          </span>
                          {privateSubTab === 'rooms' && (
                            <div className="absolute -bottom-[13px] left-0 right-0 h-[2px] bg-primary rounded-t-full" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 pr-1 text-content-secondary">
                        <button
                          type="button"
                          onClick={() => {
                            refreshPendingCount?.();
                            setNotificationsOpen(true);
                          }}
                          className="relative grid place-items-center size-7 rounded-full hover:text-primary transition-colors"
                          title="Notifications"
                          aria-label="Notifications"
                        >
                          <Bell size={18} strokeWidth={2.2} />
                          {pendingCount > 0 && (
                            <span
                              className="absolute top-1 right-1 size-2 rounded-full bg-error ring-2 ring-[var(--bg-surface)]"
                              aria-hidden
                            />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (privateSubTab === 'dms') setAddFriendOpen(true);
                            else setCreateRoomOpen(true);
                          }}
                          className="grid place-items-center size-7 rounded-full bg-primary-soft text-primary hover:bg-primary hover:text-on-primary transition-colors"
                          title={privateSubTab === 'dms' ? 'Add Friend' : 'Create Room'}
                          aria-label={privateSubTab === 'dms' ? 'Add friend' : 'Create room'}
                        >
                          {privateSubTab === 'dms' ? (
                            <UserPlus size={15} strokeWidth={2.5} />
                          ) : (
                            <UsersRound size={15} strokeWidth={2.5} />
                          )}
                        </button>
                        {privateSubTab === 'dms' && friends.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setFriendsListOpen(true)}
                            className="h-7 px-2.5 rounded-full border border-subtle bg-elevated/80 text-[10.5px] font-semibold text-content-secondary tabular-nums hover:border-primary/30 hover:text-primary transition-colors"
                            aria-label={`${friends.length} friends`}
                          >
                            {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {notificationsOpen ? (
                    <NotificationsView
                      onClose={() => setNotificationsOpen(false)}
                      onOpenProfile={(id) => {
                        setNotificationsOpen(false);
                        setProfileUserId(id);
                      }}
                      onChanged={() => refreshPendingCount?.()}
                    />
                  ) : privateSubTab === 'dms' ? (
                    <div>
                      <p className="text-[10.5px] text-content-muted px-0.5 pb-2">
                        Active chats in the last 24 hours. Tap friends to message someone new.
                      </p>
                      {friends.length === 0 ? (
                        <div className="text-center p-8 bg-elevated border border-subtle rounded-2xl flex flex-col items-center justify-center gap-3">
                          <div className="w-12 h-12 bg-primary-soft text-primary rounded-full flex items-center justify-center mb-1">
                            <Users size={24} />
                          </div>
                          <h3 className="text-sm font-bold text-content-primary">No friends yet</h3>
                          <p className="text-xs text-content-secondary max-w-[220px]">
                            Search by @username to send a friend request, then start a private chat.
                          </p>
                        </div>
                      ) : activeDmConversations.length === 0 ? (
                        <div className="text-center py-10 px-6 rounded-[16px] border border-subtle bg-elevated">
                          <p className="text-[13px] font-semibold text-content-primary">No active chats</p>
                          <p className="text-[11.5px] text-content-muted mt-1.5 max-w-[240px] mx-auto">
                            Messages expire after 24 hours. Open your friends list to start a conversation.
                          </p>
                          <button
                            type="button"
                            onClick={() => setFriendsListOpen(true)}
                            className="mt-4 h-9 px-4 rounded-full bg-primary-soft text-primary text-[12px] font-semibold"
                          >
                            View {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-[16px] border border-subtle bg-elevated overflow-hidden divide-y divide-subtle">
                          {activeDmConversations.map((friend) => {
                            const preview = dmPreviews[friend.id]!;
                            const hasUnread = (preview.unreadCount ?? 0) > 0;
                            const title = profileDisplayLabel(friend);
                            const openChat = () =>
                              setShowDmInbox({
                                id: friend.id,
                                name: title,
                                avatar: friend.avatar_url ?? '',
                              });
                            return (
                              <div
                                key={friend.id}
                                role="button"
                                tabIndex={0}
                                onClick={openChat}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openChat();
                                  }
                                }}
                                className={`flex items-center gap-3 px-3.5 py-3 cursor-pointer transition-colors active:bg-surface ${
                                  hasUnread ? 'bg-primary-soft/20' : ''
                                }`}
                              >
                                <button
                                  type="button"
                                  className="relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProfileUserId(friend.id);
                                  }}
                                  aria-label={`Open ${title}'s profile`}
                                >
                                  <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center bg-primary-soft text-primary font-bold ring-1 ring-border-subtle">
                                    <ProfileAvatarVisual
                                      avatarUrl={friend.avatar_url}
                                      displayName={title}
                                      className="text-sm font-bold"
                                      imgClassName="w-full h-full object-cover"
                                    />
                                  </div>
                                  {hasUnread && (
                                    <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-error ring-2 ring-elevated" />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <div className="min-w-0">
                                      <p
                                        className={`text-[14px] leading-tight truncate ${
                                          hasUnread ? 'font-bold text-content-primary' : 'font-semibold text-content-primary'
                                        }`}
                                      >
                                        {title}
                                      </p>
                                    </div>
                                    <span className="text-[10px] text-content-muted shrink-0 tabular-nums">
                                      {formatDmListTime(preview.lastAt)}
                                    </span>
                                  </div>
                                  <p
                                    className={`text-[12.5px] truncate mt-0.5 ${
                                      hasUnread ? 'font-semibold text-content-primary' : 'text-content-secondary'
                                    }`}
                                  >
                                    {preview.fromMe ? `You: ${preview.lastMessage}` : preview.lastMessage}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <RoomsView
                      personalPace={personalPace}
                      onOpenRoom={(id) => setOpenRoomId(id)}
                      onNotificationsChanged={() => {
                        refreshPendingCount?.();
                      }}
                    />
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <UserProfileSheet
        userId={profileUserId}
        boardPreview={profileBoardPreview}
        boardPaceWindow={profileBoardWindow}
        onClose={() => {
          setProfileUserId(null);
          setProfileBoardPreview(null);
        }}
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
    </div>
  );
}
