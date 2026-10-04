import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  fetchAcceptedFriends,
  fetchProfile,
  upsertProfile,
  removeFriend,
  type Profile,
  sendFriendRequest,
  fetchPendingRequests,
} from '../lib/profiles';
import { Bell, UserPlus, UsersRound, Lock, Loader2, ArrowRight, Users } from 'lucide-react';
import BoardView from './BoardView';
import UserProfileSheet from './UserProfileSheet';
import AddFriendSheet from './AddFriendSheet';
import NotificationsSheet from './NotificationsSheet';
import CreateRoomSheet from './CreateRoomSheet';
import SquadRoomSheet from './SquadRoomSheet';
import DmInboxSheet from './DmInboxSheet';
import RoomsView from './RoomsView';
import { fetchDmInboxPreviews, type DmInboxPreview } from '../lib/messages';
import { ProfileAvatarVisual } from '../lib/profileAvatar';

function formatDmListTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function HubView({
  onOpenBoardSettings,
  activeTab = 'social',
  personalPace = 4,
}: {
  onOpenBoardSettings: () => void;
  activeTab?: 'social' | 'private';
  personalPace?: number;
}) {
  const { user } = useAuth();
  const [privateSubTab, setPrivateSubTab] = useState<'dms' | 'rooms'>('dms');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [showDmInbox, setShowDmInbox] = useState<{ id: string; name: string; avatar: string } | null>(null);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [draftUsername, setDraftUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [dmPreviews, setDmPreviews] = useState<Record<string, DmInboxPreview>>({});

  const refreshFriends = useCallback(async () => {
    if (!user) return;
    const list = await fetchAcceptedFriends(user.id);
    setFriends(list);
  }, [user]);

  const refreshPendingCount = useCallback(async () => {
    if (!user) return;
    const reqs = await fetchPendingRequests(user.id);
    setPendingCount(reqs.length);
  }, [user]);

  const refreshDmPreviews = useCallback(async () => {
    if (!user) return;
    setDmPreviews(await fetchDmInboxPreviews(user.id));
  }, [user]);

  const friendsSortedForDm = useMemo(() => {
    return [...friends].sort((a, b) => {
      const ta = dmPreviews[a.id]?.lastAt ?? '';
      const tb = dmPreviews[b.id]?.lastAt ?? '';
      if (ta && tb) return tb.localeCompare(ta);
      if (tb) return 1;
      if (ta) return -1;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [friends, dmPreviews]);

  useEffect(() => {
    if (!user) {
      setLoadingProfile(false);
      setFriends([]);
      setMyProfile(null);
      setPendingCount(0);
      setDmPreviews({});
      return;
    }

    setLoadingProfile(true);
    void refreshFriends();
    void refreshPendingCount();
    void refreshDmPreviews();
    fetchProfile(user.id).then((p) => {
      setMyProfile(p);
      setLoadingProfile(false);
      if (!p?.username && user.user_metadata?.username) {
        setDraftUsername(String(user.user_metadata.username));
      }
    });

    const friendshipsChannel = supabase
      .channel(`friendships_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friendships',
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          void refreshPendingCount();
        },
      )
      .subscribe();

    const dmChannel = supabase
      .channel(`dm_inbox_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, () => {
        void refreshDmPreviews();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(friendshipsChannel);
      supabase.removeChannel(dmChannel);
    };
  }, [user, refreshFriends, refreshPendingCount, refreshDmPreviews]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div key={activeTab} className="hub-screen-transition">
          {activeTab === 'social' ? (
            <BoardView onOpenBoardSettings={onOpenBoardSettings} />
          ) : (
            <div className="py-2">
              <div className="flex items-center justify-between border-b border-subtle pb-3 mb-4">
                <div className="flex gap-5 px-1">
                  <button
                    type="button"
                    onClick={() => setPrivateSubTab('dms')}
                    className={`text-[15px] font-semibold transition-colors relative ${
                      privateSubTab === 'dms' ? 'text-primary' : 'text-content-muted'
                    }`}
                  >
                    DMs
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
                    Rooms
                    {privateSubTab === 'rooms' && (
                      <div className="absolute -bottom-[13px] left-0 right-0 h-[2px] bg-primary rounded-t-full" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-4 pr-1 text-content-secondary">
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(true)}
                    className="relative hover:text-primary transition-colors"
                    title="Notifications"
                  >
                    <Bell size={18} strokeWidth={2.2} />
                    {pendingCount > 0 && (
                      <span
                        className="absolute -top-0.5 -right-0.5 min-w-[8px] h-2 px-0.5 rounded-full bg-error ring-2 ring-[var(--bg-surface)]"
                        aria-label={`${pendingCount} pending requests`}
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
                  >
                    {privateSubTab === 'dms' ? (
                      <UserPlus size={15} strokeWidth={2.5} />
                    ) : (
                      <UsersRound size={15} strokeWidth={2.5} />
                    )}
                  </button>
                </div>
              </div>

              {activeTab === 'private' && !loadingProfile && (!myProfile || !myProfile.username) ? (
                <div className="flex-1 flex flex-col justify-center px-4 py-8 max-w-sm mx-auto w-full fade-in">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-full bg-primary-soft text-primary flex items-center justify-center mx-auto mb-4">
                      <Lock size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-content-primary mb-2">Claim your handle</h2>
                    <p className="text-content-secondary text-[14px]">
                      To join private rooms and DM friends, pick a unique @username.
                    </p>
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!draftUsername.trim() || !user) return;
                      if (!/^[a-z0-9_]+$/.test(draftUsername.toLowerCase())) {
                        setUsernameError('Letters, numbers, and underscores only.');
                        return;
                      }
                      setSavingUsername(true);
                      setUsernameError('');
                      const { ok, error } = await upsertProfile({
                        id: user.id,
                        username: draftUsername.toLowerCase().trim(),
                        display_name: draftUsername.trim(),
                      });
                      if (ok) {
                        const p = await fetchProfile(user.id);
                        setMyProfile(p);
                        setSavingUsername(false);
                      } else {
                        setUsernameError(error || 'Username might be taken!');
                        setSavingUsername(false);
                      }
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-content-tertiary font-bold">@</span>
                        <input
                          type="text"
                          value={draftUsername}
                          onChange={(e) => setDraftUsername(e.target.value)}
                          placeholder="username"
                          maxLength={20}
                          className="w-full bg-elevated border-2 border-subtle rounded-2xl py-3 pl-9 pr-4 font-bold text-content-primary focus:border-primary focus:outline-none transition-colors"
                        />
                      </div>
                      {usernameError && (
                        <p className="text-error text-[13px] mt-2 ml-1 font-medium">{usernameError}</p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={savingUsername || !draftUsername.trim()}
                      className="w-full bg-primary text-on-primary py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                    >
                      {savingUsername ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        <>
                          Continue <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  {privateSubTab === 'dms' ? (
                    <div className="space-y-2.5">
                      <p className="text-[10.5px] text-content-muted px-1 mb-1">
                        Messages disappear after 24 hours, like community chat.
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
                      ) : (
                        friendsSortedForDm.map((friend) => {
                          const preview = dmPreviews[friend.id];
                          const hasUnread = (preview?.unreadCount ?? 0) > 0;
                          return (
                          <div
                            key={friend.id}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setShowDmInbox({
                                id: friend.id,
                                name: friend.display_name,
                                avatar: friend.avatar_url ?? '',
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setShowDmInbox({
                                  id: friend.id,
                                  name: friend.display_name,
                                  avatar: friend.avatar_url ?? '',
                                });
                              }
                            }}
                            className={`bg-elevated border rounded-[16px] p-3.5 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors active:scale-[0.99] ${
                              hasUnread ? 'border-primary/35' : 'border-subtle'
                            }`}
                          >
                            <div
                              className="relative"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProfileUserId(friend.id);
                              }}
                            >
                              {hasUnread && (
                                <span className="absolute -top-0.5 -right-0.5 z-10 min-w-[8px] h-2 px-0.5 rounded-full bg-error ring-2 ring-elevated" />
                              )}
                              <div className="w-11 h-11 rounded-full bg-primary-soft border border-primary/20 flex items-center justify-center text-primary font-bold text-sm overflow-hidden">
                                <ProfileAvatarVisual
                                  avatarUrl={friend.avatar_url}
                                  displayName={friend.display_name}
                                  className="text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <p className={`text-[13px] truncate ${hasUnread ? 'font-bold text-content-primary' : 'font-bold text-content-primary'}`}>
                                  {friend.display_name}
                                </p>
                                {preview?.lastAt && (
                                  <span className="text-[10px] text-content-muted shrink-0 tabular-nums">
                                    {formatDmListTime(preview.lastAt)}
                                  </span>
                                )}
                              </div>
                              <p
                                className={`text-[12px] truncate ${
                                  hasUnread ? 'font-semibold text-content-primary' : 'text-content-secondary'
                                }`}
                              >
                                {preview
                                  ? `${preview.fromMe ? 'You: ' : ''}${preview.lastMessage}`
                                  : `@${friend.username} · Tap to chat`}
                              </p>
                            </div>
                          </div>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <RoomsView personalPace={personalPace} onOpenRoom={(id) => setOpenRoomId(id)} />
                  )}
                </>
              )}
            </div>
          )}
        </div>
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
          void refreshPendingCount();
        }}
      />
      <AddFriendSheet
        open={addFriendOpen}
        onClose={() => setAddFriendOpen(false)}
        onOpenProfile={(id) => setProfileUserId(id)}
      />
      <NotificationsSheet
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onOpenProfile={(id) => setProfileUserId(id)}
        onFriendAccepted={() => {
          void refreshFriends();
          void refreshPendingCount();
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
      <SquadRoomSheet open={!!openRoomId} squadId={openRoomId} onClose={() => setOpenRoomId(null)} />
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
