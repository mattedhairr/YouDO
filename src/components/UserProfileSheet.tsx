import { useEffect, useState } from 'react';
import { UserPlus, UserMinus, MessageCircle, X, Lock, Loader2, Flame, Clock, Target, Sparkles } from 'lucide-react';
import Overlay from './Overlay';
import {
  fetchProfile,
  checkFriendshipStatus,
  sendFriendRequest,
  removeFriend,
  normalizeUsername,
  type Profile,
} from '../lib/profiles';
import { fetchPaceRowForUser } from '../lib/paceCloud';
import { type PaceRow, type PaceWindow, windowMs } from '../lib/paceBoard';
import { formatDuration } from '../lib/format';
import { ProfileAvatarVisual } from '../lib/profileAvatar';
import { useAuth } from '../contexts/AuthContext';

const FOCUS_WINDOWS: { id: PaceWindow; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

interface Props {
  open?: boolean;
  onMessage?: () => void;
  onFriendshipChange?: () => void;
  userId: string | null;
  boardPreview?: PaceRow | null;
  boardPaceWindow?: PaceWindow;
  onClose: () => void;
}

export default function UserProfileSheet({
  open,
  userId,
  boardPreview,
  boardPaceWindow = 'week',
  onClose,
  onMessage,
  onFriendshipChange,
}: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [friendship, setFriendship] = useState<'none' | 'pending' | 'friends'>('none');
  const [actionBusy, setActionBusy] = useState(false);
  const [friendRequestNote, setFriendRequestNote] = useState('');
  const [friendRequestError, setFriendRequestError] = useState('');
  const { user } = useAuth();
  const [focusWindow, setFocusWindow] = useState<PaceWindow>(boardPaceWindow);
  const [paceRow, setPaceRow] = useState<PaceRow | null>(boardPreview?.userId === userId ? boardPreview : null);

  const isSelf = Boolean(user?.id && userId && user.id === userId);
  const privateHandle = normalizeUsername(profile?.username);
  const displayName = profile?.display_name ?? paceRow?.displayName ?? boardPreview?.displayName ?? 'Aspirant';
  const canUsePrivateHub = Boolean(privateHandle);

  const isOpen = open !== undefined ? open : Boolean(userId);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setFriendship('none');
      setPaceRow(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFriendRequestNote('');
    setFriendRequestError('');
    setFocusWindow(boardPaceWindow);
    setPaceRow(boardPreview?.userId === userId ? boardPreview : null);
    void (async () => {
      const data = await fetchProfile(userId);
      let status: 'none' | 'pending' | 'friends' = 'none';
      if (user?.id && userId !== user.id && normalizeUsername(data?.username)) {
        status = await checkFriendshipStatus(user.id, userId);
      }
      const statsHidden = data?.stats_private === true;
      let pace: PaceRow | null = null;
      if (!statsHidden) {
        pace =
          boardPreview?.userId === userId
            ? boardPreview
            : await fetchPaceRowForUser(userId);
      }
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
  }, [userId, user?.id, boardPreview, boardPaceWindow]);

  if (!userId && !isOpen) return null;

  const handleAddFriend = async () => {
    if (!user?.id || !userId) return;
    setFriendRequestError('');
    const note = friendRequestNote.trim();
    if (!note) {
      setFriendRequestError('Tell them why you want to connect.');
      return;
    }
    setActionBusy(true);
    const res = await sendFriendRequest(user.id, userId, note);
    if (res.ok) {
      setFriendship('pending');
      setFriendRequestNote('');
      onFriendshipChange?.();
    } else {
      setFriendRequestError(res.error || 'Could not send request.');
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

  const hasPublicView = Boolean(profile || paceRow);

  return (
    <Overlay open={isOpen} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-[28px] border border-subtle/80 shadow-2xl flex flex-col max-h-[88vh] sm:my-auto mb-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Grab bar */}
        <div className="w-10 h-1 rounded-full bg-subtle mx-auto mt-2.5 mb-1 opacity-70" />

        {/* Modal Header */}
        <div className="flex justify-between items-center px-5 py-2.5 border-b border-subtle/60">
          <div className="flex items-center gap-1.5 text-content-muted">
            <Sparkles size={14} className="text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em]">Profile Card</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors"
            aria-label="Close profile"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && !hasPublicView ? (
            <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-content-muted">
              <Loader2 className="animate-spin text-primary" size={24} />
              <p className="text-[13px] font-medium">Loading profile...</p>
            </div>
          ) : hasPublicView ? (
            <>
              {/* Profile Identity Hero */}
              <div className="rounded-[22px] border border-subtle bg-elevated/50 p-4 flex items-start gap-4 shadow-sm">
                <div className="relative shrink-0">
                  <div className="w-16 h-16 shrink-0 aspect-square rounded-full bg-primary-soft border border-primary/25 ring-4 ring-primary/10 flex items-center justify-center text-primary text-3xl font-bold shadow-md overflow-hidden select-none">
                    <ProfileAvatarVisual
                      avatarUrl={profile?.avatar_url}
                      displayName={displayName}
                      className="text-3xl leading-none flex items-center justify-center select-none"
                    />
                  </div>
                  {isSelf && (
                    <span className="absolute -bottom-0.5 -right-0.5 text-[8.5px] font-extrabold uppercase tracking-wider bg-primary text-on-primary px-1.5 py-0.5 rounded-full border-2 border-surface shadow-sm">
                      You
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h1 className="text-[17px] font-bold text-content-primary truncate tracking-tight">{displayName}</h1>
                  
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {privateHandle ? (
                      <span className="inline-flex items-center text-[11.5px] font-bold text-primary bg-primary-soft/90 border border-primary/20 px-2 py-0.5 rounded-full">
                        @{privateHandle}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-content-muted bg-surface/70 px-2 py-0.5 rounded-full border border-subtle">
                        Public board only
                      </span>
                    )}

                    {paceRow?.hashtagLabel && (
                      <span className="inline-flex items-center text-[11px] font-bold text-secondary bg-secondary-soft/80 border border-secondary/20 px-2 py-0.5 rounded-full truncate max-w-[130px]">
                        #{paceRow.hashtagLabel}
                      </span>
                    )}
                  </div>

                  {profile?.bio && (
                    <p className="text-[12px] text-content-secondary mt-2.5 leading-relaxed bg-surface/50 border border-subtle/50 rounded-xl p-2.5 line-clamp-3">
                      {profile.bio}
                    </p>
                  )}
                </div>
              </div>

              {/* Social Actions (Friends / Message / Add) */}
              {!isSelf && user && canUsePrivateHub && (
                <div className="space-y-2">
                  {friendship === 'friends' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={onMessage}
                        className="flex-1 bg-primary text-on-primary h-11 rounded-[14px] text-[13.5px] font-bold flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-[0.98] transition-all"
                      >
                        <MessageCircle size={16} strokeWidth={2.5} />
                        Message
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleRemoveFriend()}
                        className="flex-none bg-error-soft text-error px-4 h-11 rounded-[14px] text-[13px] font-semibold flex items-center justify-center border border-error/20 hover:bg-error/20 transition-all disabled:opacity-50"
                        title="Remove Friend"
                      >
                        <UserMinus size={17} strokeWidth={2.5} />
                      </button>
                    </div>
                  ) : friendship === 'pending' ? (
                    <div className="w-full bg-elevated/70 text-content-muted h-11 rounded-[14px] text-[13px] font-semibold border border-subtle flex items-center justify-center gap-2">
                      <span className="size-2 rounded-full bg-primary animate-pulse" />
                      Friend request pending
                    </div>
                  ) : (
                    <div className="rounded-[20px] border border-subtle bg-elevated/40 p-3.5 space-y-2.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted px-0.5 block">
                        Send Friend Request
                      </label>
                      <textarea
                        value={friendRequestNote}
                        onChange={(e) => setFriendRequestNote(e.target.value)}
                        maxLength={280}
                        rows={2}
                        placeholder="Say hello or introduce what you're focusing on..."
                        className="w-full resize-none rounded-[14px] border border-subtle bg-surface px-3 py-2 text-[12.5px] text-content-primary placeholder:text-content-muted/60 outline-none focus:border-primary transition-colors"
                      />
                      {friendRequestError && (
                        <p className="text-[11px] text-error font-medium px-0.5">{friendRequestError}</p>
                      )}
                      <button
                        type="button"
                        disabled={actionBusy || !friendRequestNote.trim()}
                        onClick={() => void handleAddFriend()}
                        className="w-full bg-primary text-on-primary h-10 rounded-[12px] text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40"
                      >
                        {actionBusy ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={15} strokeWidth={2.5} />}
                        Send Request
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!isSelf && user && !canUsePrivateHub && paceRow && (
                <p className="text-[11px] text-center text-content-secondary leading-relaxed rounded-[14px] border border-dashed border-subtle bg-elevated/40 px-3.5 py-2.5">
                  Private Hub messaging &amp; requests unlock when this user claims a username handle.
                </p>
              )}

              {/* Focus Stats Card */}
              <div className="rounded-[22px] border border-subtle bg-elevated/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Target size={14} className="text-primary" />
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-content-muted">
                      Focus Stats
                    </h3>
                  </div>

                  {paceRow && !profile?.stats_private && (
                    <div className="flex gap-1 p-0.5 bg-surface border border-subtle rounded-[10px]">
                      {FOCUS_WINDOWS.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setFocusWindow(w.id)}
                          className={`px-2 py-0.5 rounded-[8px] text-[10.5px] font-bold transition-all ${
                            focusWindow === w.id
                              ? 'bg-primary-soft text-primary shadow-xs'
                              : 'text-content-muted hover:text-content-primary'
                          }`}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {profile?.stats_private ? (
                  <div className="border border-dashed border-subtle/80 bg-surface/50 rounded-[16px] p-6 flex flex-col items-center justify-center text-content-muted gap-2">
                    <Lock size={18} className="opacity-50" />
                    <p className="text-[12px] font-medium">This user keeps their focus stats private</p>
                  </div>
                ) : !paceRow ? (
                  <div className="border border-dashed border-subtle/80 bg-surface/50 rounded-[16px] p-5 text-center">
                    <p className="text-[12px] text-content-secondary leading-relaxed">
                      No public focus on the Board yet. Stats appear after opting into the Public Board.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-surface border border-subtle rounded-[16px] p-3.5 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 text-content-muted mb-1">
                        <Flame size={13} className="text-secondary" />
                        <span className="text-[10.5px] font-bold uppercase tracking-wider">Streak</span>
                      </div>
                      <span className="text-[21px] font-extrabold text-content-primary tabular-nums">
                        {paceRow.streak} <span className="text-[12px] font-medium text-content-muted">{paceRow.streak === 1 ? 'day' : 'days'}</span>
                      </span>
                    </div>

                    <div className="bg-surface border border-subtle rounded-[16px] p-3.5 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 text-content-muted mb-1">
                        <Clock size={13} className="text-primary" />
                        <span className="text-[10.5px] font-bold uppercase tracking-wider">{focusWindow} focus</span>
                      </div>
                      <span className="text-[21px] font-extrabold text-primary tabular-nums">
                        {formatDuration(windowMs(paceRow, focusWindow))}
                      </span>
                    </div>
                  </div>
                )}

                {paceRow && !profile?.stats_private && (
                  <p className="text-[9.5px] text-content-muted leading-relaxed px-0.5">
                    Synced from the Public Board with daily pace verified.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-sm text-content-muted">
              This person is not on the Public Board and has not set up a profile yet.
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
