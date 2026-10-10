import { useEffect, useState } from 'react';
import { Search, X, UserPlus, Check, Loader2, Sparkles, ArrowRight, MessageSquareQuote } from 'lucide-react';
import Overlay from './Overlay';
import { searchProfilesByUsernamePrefix, sendFriendRequest, type Profile } from '../lib/profiles';
import { useAuth } from '../contexts/AuthContext';
import { ProfileAvatarVisual } from '../lib/profileAvatar';
import { requestAccountAccess } from '../lib/storageKeys';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}

export default function AddFriendSheet({ open, onClose, onOpenProfile }: Props) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prefix = query.replace(/^@/, '').trim();
    if (prefix.length < 2) {
      setMatches([]);
      setSearching(false);
      setErrorMsg('');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setMatches([]);
      setSearching(false);
      setErrorMsg('You are offline. Connect to search for study partners.');
      return;
    }

    let cancelled = false;
    setSearching(true);
    let searchFailed = false;
    let isOfflineFailure = false;

    const timer = window.setTimeout(() => {
      void searchProfilesByUsernamePrefix(prefix, {
        excludeId: user?.id,
        limit: 8,
        onError: (err) => {
          searchFailed = true;
          const msg = err && typeof err === 'object' && 'message' in err ? String(err.message).toLowerCase() : '';
          if (
            (typeof navigator !== 'undefined' && !navigator.onLine) ||
            msg.includes('fetch') ||
            msg.includes('network') ||
            msg.includes('offline')
          ) {
            isOfflineFailure = true;
          }
        },
      }).then((rows) => {
        if (cancelled) return;
        setMatches(rows);
        setSearching(false);
        if (isOfflineFailure || (typeof navigator !== 'undefined' && !navigator.onLine && rows.length === 0)) {
          setErrorMsg('You are offline. Connect to search for study partners.');
        } else if (searchFailed && rows.length === 0) {
          setErrorMsg('Unable to reach companion search. Check your connection.');
        } else {
          setErrorMsg(rows.length === 0 ? 'No matching @username found.' : '');
        }
      });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, user?.id]);

  if (!open) return null;

  const handleSendRequest = async () => {
    if (!user) {
      setErrorMsg('Please sign in to send companion requests.');
      requestAccountAccess();
      return;
    }
    if (!selected) return;
    setSending(true);
    setErrorMsg('');
    const res = await sendFriendRequest(user.id, selected.id, requestNote);
    setSending(false);
    if (res.ok) {
      setRequestSent(true);
    } else {
      setErrorMsg(res.error || 'Failed to send request.');
    }
  };

  const handleResetSearch = () => {
    setQuery('');
    setSelected(null);
    setRequestSent(false);
    setRequestNote('');
    setErrorMsg('');
  };

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-[28px] border border-subtle/80 shadow-2xl flex flex-col max-h-[88vh] sm:my-auto mb-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Grab bar */}
        <div className="w-10 h-1 rounded-full bg-subtle mx-auto mt-2.5 mb-1 opacity-70" />

        {/* Modal Header */}
        <div className="flex justify-between items-center px-5 py-2.5 border-b border-subtle/60">
          <div className="flex items-center gap-1.5 text-content-muted">
            <UserPlus size={15} className="text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em]">Add Companion</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {/* Subtitle */}
          <div>
            <h2 className="text-[16px] font-bold text-content-primary tracking-tight">Find Study Partners</h2>
            <p className="text-[12px] text-content-secondary mt-0.5 leading-relaxed">
              Search by unique @username to connect, message, and study together.
            </p>
            {!user && (
              <p className="text-[11px] text-content-muted mt-1 flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-content-muted/60" />
                <span>Browsing as guest. Sign in to send friend requests.</span>
              </p>
            )}
          </div>

          {/* Search Input Box */}
          <div className="relative flex items-center rounded-[18px] bg-elevated/70 border border-subtle focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 focus-within:bg-elevated transition-all px-3.5 py-1">
            <Search
              size={16}
              className={`mr-2.5 transition-colors shrink-0 ${query ? 'text-primary' : 'text-content-muted'}`}
            />
            <input
              type="text"
              inputMode="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Search @username (e.g. @alex_study)"
              value={query}
              autoComplete="off"
              enterKeyHint="search"
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setRequestSent(false);
                setRequestNote('');
                setErrorMsg('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              className="w-full bg-transparent text-[13.5px] font-medium text-content-primary placeholder:text-content-muted/60 focus:outline-none py-2 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={handleResetSearch}
                className="p-1 rounded-full text-content-muted hover:text-content-primary hover:bg-surface transition-colors shrink-0"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Loading Indicator */}
          {searching && (
            <div className="py-6 flex items-center justify-center gap-2 text-content-muted text-[12px] font-medium">
              <Loader2 className="animate-spin text-primary" size={16} />
              <span>Searching companions…</span>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && !selected && (
            <div className="rounded-[14px] border border-error/20 bg-error-soft/60 px-3.5 py-2.5 text-center text-[12px] font-medium text-error">
              {errorMsg}
            </div>
          )}

          {/* Initial Discovery / Empty State */}
          {!query.trim() && !selected && (
            <div className="rounded-[22px] border border-subtle/80 bg-elevated/40 p-5 flex flex-col items-center text-center gap-3">
              <div className="size-12 rounded-2xl bg-primary-soft/70 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-[13.5px] font-bold text-content-primary">Connect &amp; Collaborate</h3>
                <p className="text-[11.5px] text-content-muted mt-1 leading-relaxed max-w-[280px]">
                  Send friend requests with a personal note to unlock 1-on-1 private messaging and room invites.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted/80 bg-surface border border-subtle px-2.5 py-1 rounded-full">
                  1-on-1 DMs
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted/80 bg-surface border border-subtle px-2.5 py-1 rounded-full">
                  Private Rooms
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted/80 bg-surface border border-subtle px-2.5 py-1 rounded-full">
                  Focus Streaks
                </span>
              </div>
            </div>
          )}

          {/* Search Matches List */}
          {!selected && matches.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-content-muted px-1">
                Matching Companions ({matches.length})
              </p>
              <ul className="divide-y divide-subtle/60 rounded-[20px] border border-subtle bg-elevated/40 overflow-hidden shadow-xs">
                {matches.map((profile) => (
                  <li key={profile.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(profile);
                        setErrorMsg('');
                        setRequestSent(false);
                        setRequestNote('');
                      }}
                      className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-elevated transition-colors group cursor-pointer"
                    >
                      <div className="size-10 shrink-0 rounded-full bg-primary-soft text-primary overflow-hidden flex items-center justify-center border border-primary/25 ring-2 ring-primary/10 shadow-xs">
                        <ProfileAvatarVisual
                          avatarUrl={profile.avatar_url}
                          displayName={profile.display_name}
                          className="text-sm"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-bold text-content-primary truncate tracking-tight">
                          {profile.display_name}
                        </p>
                        <span className="inline-flex items-center text-[11px] font-bold text-primary mt-0.5">
                          @{profile.username}
                        </span>
                        {profile.bio && (
                          <p className="text-[11px] text-content-muted truncate mt-0.5">
                            {profile.bio}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-primary bg-primary-soft/90 border border-primary/20 px-2.5 py-1 rounded-full group-hover:bg-primary group-hover:text-on-primary transition-all">
                        Select
                        <ArrowRight size={12} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Selected Companion Connection Card & Request Composer */}
          {selected && (
            <div className="rounded-[24px] border border-subtle bg-elevated/60 p-4.5 flex flex-col gap-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Selected User Header */}
              <div className="flex items-center justify-between pb-3 border-b border-subtle/70">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-12 shrink-0 rounded-full bg-primary-soft text-primary overflow-hidden flex items-center justify-center border border-primary/25 ring-4 ring-primary/10 shadow-sm">
                    <ProfileAvatarVisual
                      avatarUrl={selected.avatar_url}
                      displayName={selected.display_name}
                      className="text-base font-bold"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-content-primary truncate tracking-tight">
                      {selected.display_name}
                    </h3>
                    <span className="inline-flex items-center text-[11.5px] font-bold text-primary mt-0.5">
                      @{selected.username}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProfile(selected.id);
                  }}
                  className="text-[11px] font-bold text-content-secondary hover:text-primary underline-offset-4 hover:underline px-2 py-1 rounded-lg transition-colors shrink-0"
                >
                  View Profile
                </button>
              </div>

              {errorMsg && (
                <div className="rounded-[12px] border border-error/20 bg-error-soft/60 px-3 py-2 text-center text-[11.5px] font-medium text-error">
                  {errorMsg}
                </div>
              )}

              {!requestSent ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center gap-1.5">
                      <MessageSquareQuote size={13} className="text-primary" />
                      Introduction Note
                    </label>
                    <span className="text-[10.5px] text-content-muted tabular-nums">
                      {requestNote.length}/280
                    </span>
                  </div>

                  <textarea
                    value={requestNote}
                    onChange={(e) => setRequestNote(e.target.value)}
                    maxLength={280}
                    rows={3}
                    placeholder="Tell them why you'd like to connect (e.g. We share the same exam goals or study schedule!)"
                    className="w-full resize-none rounded-[16px] border border-subtle bg-surface px-3.5 py-2.5 text-[12.5px] text-content-primary placeholder:text-content-muted/60 focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/15 transition-all"
                  />

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="flex-none px-4 h-10.5 rounded-[14px] text-[12.5px] font-semibold text-content-secondary hover:text-content-primary hover:bg-surface border border-subtle transition-all"
                    >
                      Back
                    </button>
                    {!user ? (
                      <button
                        type="button"
                        onClick={() => {
                          requestAccountAccess();
                          setErrorMsg('Please sign in to send companion requests.');
                        }}
                        className="flex-1 h-10.5 rounded-[14px] bg-primary text-on-primary text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
                      >
                        <UserPlus size={16} strokeWidth={2.5} />
                        <span>Sign in to Connect</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={sending || !requestNote.trim()}
                        onClick={() => void handleSendRequest()}
                        className="flex-1 h-10.5 rounded-[14px] bg-primary text-on-primary text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 cursor-pointer"
                      >
                        {sending ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <UserPlus size={16} strokeWidth={2.5} />
                        )}
                        <span>Send Request</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-4 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="size-11 rounded-full bg-secondary-soft text-secondary flex items-center justify-center border border-secondary/20 shadow-xs">
                    <Check size={20} strokeWidth={3} />
                  </div>
                  <div>
                    <h4 className="text-[14px] font-bold text-content-primary">Request Sent!</h4>
                    <p className="text-[11.5px] text-content-muted mt-0.5">
                      @{selected.username} will be notified of your invitation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetSearch}
                    className="mt-2 px-4 py-2 rounded-xl text-[12px] font-semibold text-primary bg-primary-soft hover:bg-primary hover:text-on-primary transition-all"
                  >
                    Search another companion
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
