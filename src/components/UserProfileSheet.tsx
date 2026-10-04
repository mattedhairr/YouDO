import { useEffect, useState } from 'react';
import { UserPlus, UserMinus, MessageCircle, X, Lock, Loader2 } from 'lucide-react';
import Overlay from './Overlay';
import {
  fetchProfile,
  checkFriendshipStatus,
  sendFriendRequest,
  removeFriend,
  type Profile,
} from '../lib/profiles';
import { fetchPaceRowForUser } from '../lib/paceCloud';
import { type PaceRow, type PaceWindow, windowMs } from '../lib/paceBoard';
import { formatDuration } from '../lib/format';
import { ProfileAvatarVisual } from '../lib/profileAvatar';
import { useAuth } from '../contexts/AuthContext';

type ProfileFocusWindow = PaceWindow | 'all';

const FOCUS_WINDOWS: { id: ProfileFocusWindow; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'all', label: 'All-time' },
];

function focusMsForWindow(row: PaceRow, window: ProfileFocusWindow): number {
  if (window === 'all') {
    return Math.max(windowMs(row, 'today'), windowMs(row, 'week'), windowMs(row, 'month'));
  }
  return windowMs(row, window);
}

interface Props {
  onMessage?: () => void;
  onFriendshipChange?: () => void;
  userId: string | null;
  onClose: () => void;
}

export default function UserProfileSheet({ userId, onClose, onMessage, onFriendshipChange }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [friendship, setFriendship] = useState<'none' | 'pending' | 'friends'>('none');
  const [actionBusy, setActionBusy] = useState(false);
  const { user } = useAuth();
  const [focusWindow, setFocusWindow] = useState<ProfileFocusWindow>('week');
  const [paceRow, setPaceRow] = useState<PaceRow | null>(null);

  const isSelf = Boolean(user?.id && userId && user.id === userId);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setFriendship('none');
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const data = await fetchProfile(userId);
      let status: 'none' | 'pending' | 'friends' = 'none';
      if (user?.id && userId !== user.id) {
        status = await checkFriendshipStatus(user.id, userId);
      }
      const pace = data && !data.stats_private ? await fetchPaceRowForUser(userId) : null;
      if (!cancelled) {
        setProfile(data);
        setFriendship(status);
        setPaceRow(pace);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, user?.id]);

  if (!userId) return null;

  const handleAddFriend = async () => {
    if (!user?.id || !userId) return;
    setActionBusy(true);
    const res = await sendFriendRequest(user.id, userId);
    if (res.ok) {
      setFriendship('pending');
      onFriendshipChange?.();
    }
    setActionBusy(false);
  };

  const handleRemoveFriend = async () => {
    if (!user?.id || !userId) return;
    if (!window.confirm('Remove this friend?')) return;
    setActionBusy(true);
    await removeFriend(user.id, userId);
    setFriendship('none');
    onFriendshipChange?.();
    setActionBusy(false);
    onClose();
  };

  return (
    <Overlay open={!!userId} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-[24px] flex flex-col max-h-[85vh] sm:my-auto mb-4">
        <div className="flex justify-between items-center p-4 pb-2 border-b border-subtle">
          <div className="w-10" />
          <h2 className="text-[14px] font-bold text-content-primary">Profile</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-10 text-center text-sm text-content-muted">Loading profile...</div>
          ) : profile ? (
            <>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 shrink-0 rounded-full bg-primary-soft border border-primary/20 flex items-center justify-center text-primary text-4xl font-bold shadow-elevated overflow-hidden">
                  <ProfileAvatarVisual
                    avatarUrl={profile.avatar_url}
                    displayName={profile.display_name}
                    className="text-4xl"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-[18px] font-bold text-content-primary truncate">{profile.display_name}</h1>
                  <p className="text-[13px] font-medium text-primary mt-0.5 truncate">@{profile.username}</p>
                  {profile.bio && (
                    <p className="text-[12px] text-content-secondary mt-1.5 leading-snug line-clamp-2">{profile.bio}</p>
                  )}
                </div>
              </div>

              {!isSelf && user && (
                <div className="mt-5 flex gap-2">
                  {friendship === 'friends' ? (
                    <>
                      <button
                        type="button"
                        onClick={onMessage}
                        className="flex-1 bg-primary text-on-primary h-11 rounded-[12px] text-[14px] font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                      >
                        <MessageCircle size={16} strokeWidth={2.5} />
                        Message
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleRemoveFriend()}
                        className="flex-none bg-error-soft text-error px-4 h-11 rounded-[12px] text-[14px] font-semibold flex items-center justify-center hover:bg-error/20 transition-opacity disabled:opacity-50"
                        title="Remove Friend"
                      >
                        <UserMinus size={18} strokeWidth={2.5} />
                      </button>
                    </>
                  ) : friendship === 'pending' ? (
                    <button
                      type="button"
                      disabled
                      className="w-full bg-elevated text-content-muted h-11 rounded-[12px] text-[14px] font-semibold border border-subtle"
                    >
                      Request sent
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleAddFriend()}
                      className="w-full bg-primary text-on-primary h-11 rounded-[12px] text-[14px] font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {actionBusy ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={16} strokeWidth={2.5} />}
                      Add Friend
                    </button>
                  )}
                </div>
              )}

              <div className="mt-6">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-content-muted mb-2.5 px-0.5">
                  Focus Stats
                </h3>

                {profile.stats_private ? (
                  <div className="bg-elevated/50 border border-dashed border-subtle rounded-[14px] p-5 flex flex-col items-center justify-center text-content-muted">
                    <Lock size={20} className="mb-2 opacity-50" />
                    <p className="text-[12px] font-medium">This user keeps their stats private</p>
                  </div>
                ) : !paceRow ? (
                  <div className="bg-elevated/50 border border-dashed border-subtle rounded-[14px] p-4 text-center">
                    <p className="text-[12px] text-content-secondary leading-relaxed">
                      No public focus on the Board yet. Stats appear after they opt into Social and sync focus.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-elevated border border-subtle rounded-[14px] p-3.5 flex flex-col">
                      <span className="text-[11px] font-medium text-content-secondary mb-1">Current Streak</span>
                      <span className="text-[20px] font-bold text-content-primary tabular-nums">
                        {paceRow.streak} {paceRow.streak === 1 ? 'day' : 'days'}
                      </span>
                    </div>

                    <div className="bg-elevated border border-subtle rounded-[14px] p-3.5 flex flex-col">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[11px] font-medium text-content-secondary">Total Focus</span>
                        <select
                          value={focusWindow}
                          onChange={(e) => setFocusWindow(e.target.value as ProfileFocusWindow)}
                          className="text-[10px] font-semibold text-primary bg-primary-soft px-1.5 py-0.5 rounded-md border-0 outline-none cursor-pointer max-w-[5.5rem]"
                          aria-label="Focus time window"
                        >
                          {FOCUS_WINDOWS.map((w) => (
                            <option key={w.id} value={w.id}>{w.label}</option>
                          ))}
                        </select>
                      </div>
                      <span className="text-[20px] font-bold text-content-primary tabular-nums">
                        {formatDuration(focusMsForWindow(paceRow, focusWindow))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-content-muted">Profile not found.</div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
