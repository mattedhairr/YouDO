import { useEffect, useState } from 'react';
import { Check, ChevronRight, Loader2, Search, UserPlus, X } from 'lucide-react';
import Overlay from './Overlay';
import { fetchAcceptedFriends, searchProfilesByUsernamePrefix, sendFriendRequest, type Profile } from '../lib/profiles';
import { useAuth } from '../contexts/AuthContext';
import { requestAccountAccess } from '../lib/storageKeys';
import { hapticSuccess } from '../lib/haptics';
import { HubAvatar, HubEmpty, HubSection } from './hub/HubParts';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}

const NOTE_LIMIT = 280;

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
  const [friendIds, setFriendIds] = useState<Set<string>>(() => new Set());

  // Every visit starts from an empty search.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setMatches([]);
    setSelected(null);
    setRequestSent(false);
    setRequestNote('');
    setErrorMsg('');
    if (!user) return;
    let cancelled = false;
    void fetchAcceptedFriends(user.id).then((list) => {
      if (!cancelled) setFriendIds(new Set(list.map((f) => f.id)));
    });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

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
      setErrorMsg('You’re offline. Connect to search for study partners.');
      return;
    }

    let cancelled = false;
    let searchFailed = false;
    let offline = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchProfilesByUsernamePrefix(prefix, {
        excludeId: user?.id,
        limit: 8,
        onError: (err) => {
          searchFailed = true;
          const msg = err && typeof err === 'object' && 'message' in err ? String(err.message).toLowerCase() : '';
          if ((typeof navigator !== 'undefined' && !navigator.onLine) || /fetch|network|offline/.test(msg)) offline = true;
        },
      }).then((rows) => {
        if (cancelled) return;
        setMatches(rows);
        setSearching(false);
        if (offline) setErrorMsg('You’re offline. Connect to search for study partners.');
        else if (searchFailed && rows.length === 0) setErrorMsg('Search is unavailable right now. Check your connection.');
        else setErrorMsg('');
      });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, user?.id]);

  if (!open) return null;

  const send = async () => {
    if (!user) {
      setErrorMsg('Sign in to send friend requests.');
      requestAccountAccess();
      return;
    }
    if (!selected) return;
    setSending(true);
    setErrorMsg('');
    // The note is optional: it helps, but never blocks sending.
    const res = await sendFriendRequest(user.id, selected.id, requestNote.trim());
    setSending(false);
    if (res.ok) {
      hapticSuccess();
      setRequestSent(true);
    } else {
      setErrorMsg(res.error || 'Could not send the request.');
    }
  };

  const reset = () => {
    setQuery('');
    setSelected(null);
    setRequestSent(false);
    setRequestNote('');
    setErrorMsg('');
  };

  const searched = query.replace(/^@/, '').trim().length >= 2;

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="hub hub-sheet" role="dialog" aria-label="Add friend">
        <div className="hub-sheet-grabber" aria-hidden />
        <div className="hub-sheet-header">
          {selected && !requestSent ? (
            <button type="button" className="hub-text-button is-start" onClick={() => setSelected(null)}>Back</button>
          ) : (
            <span />
          )}
          <h2>Add Friend</h2>
          <button type="button" className="hub-text-button is-strong is-end" onClick={onClose}>
            {requestSent ? 'Done' : 'Close'}
          </button>
        </div>

        <div className="hub-sheet-body">
          {!user && (
            <div className="hub-banner" role="note">Browsing as a guest. Sign in to send friend requests.</div>
          )}

          {!selected ? (
            <>
              <div className="hub-search mb-4">
                <Search size={16} aria-hidden />
                <input
                  type="search"
                  name="companion_search"
                  id="companion_search_query"
                  data-protonpass-ignore="true"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  inputMode="search"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="off"
                  enterKeyHint="search"
                  autoFocus
                  placeholder="Search by @username"
                  aria-label="Search people"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setErrorMsg('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                  className="[&::-webkit-search-cancel-button]:hidden"
                />
                {searching ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : query ? (
                  <button type="button" onClick={reset} aria-label="Clear search" className="grid size-5 place-items-center rounded-full bg-[var(--bg-fill-strong)]">
                    <X size={12} strokeWidth={3} />
                  </button>
                ) : null}
              </div>

              {errorMsg && <div className="hub-banner is-error" role="alert">{errorMsg}</div>}

              {!searched ? (
                <div className="hub-group">
                  <HubEmpty
                    icon={<UserPlus size={24} />}
                    title="Find study partners"
                    text="Type at least two letters of their @username. Friends can message you and invite you to rooms."
                  />
                </div>
              ) : matches.length > 0 ? (
                <HubSection title="People">
                  <div className="hub-group">
                    {matches.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        className="hub-row"
                        onClick={() => {
                          if (friendIds.has(profile.id)) {
                            onClose();
                            onOpenProfile(profile.id);
                            return;
                          }
                          setSelected(profile);
                          setErrorMsg('');
                        }}
                      >
                        <HubAvatar url={profile.avatar_url} name={profile.display_name} backer={profile.is_backer === true} />
                        <span className="hub-row-main">
                          <span className="hub-row-title"><span className="hub-truncate">{profile.display_name}</span></span>
                          <span className="hub-row-subtitle hub-truncate block">@{profile.username}{profile.bio ? ` · ${profile.bio}` : ''}</span>
                        </span>
                        {friendIds.has(profile.id) && <span className="hub-chip is-success">Friends</span>}
                        <ChevronRight size={18} className="hub-chevron" />
                      </button>
                    ))}
                  </div>
                </HubSection>
              ) : !searching && !errorMsg ? (
                <p className="hub-section-footer text-center">No one with that @username.</p>
              ) : null}
            </>
          ) : (
            <>
              <div className="mb-5 flex flex-col items-center gap-1.5 text-center">
                <HubAvatar url={selected.avatar_url} name={selected.display_name} size="lg" backer={selected.is_backer === true} />
                <p className="mt-1 text-[22px] font-bold tracking-tight">{selected.display_name}</p>
                <p className="text-[15px] text-content-secondary">@{selected.username}</p>
                <button
                  type="button"
                  className="hub-text-button !text-[15px]"
                  onClick={() => {
                    onClose();
                    onOpenProfile(selected.id);
                  }}
                >
                  View profile
                </button>
              </div>

              {errorMsg && <div className="hub-banner is-error" role="alert">{errorMsg}</div>}

              {requestSent ? (
                <div className="hub-group">
                  <HubEmpty
                    icon={<Check size={24} strokeWidth={3} />}
                    title="Request sent"
                    text={`@${selected.username} will see it in their requests.`}
                    action={
                      <button type="button" className="hub-pill-button" onClick={reset}>
                        Add someone else
                      </button>
                    }
                  />
                </div>
              ) : (
                <>
                  <HubSection title="Add a note" aside={`${requestNote.length}/${NOTE_LIMIT}`} footer="Optional. A line about your exam or schedule helps them say yes.">
                    <div className="hub-group">
                      <textarea
                        className="hub-field"
                        value={requestNote}
                        maxLength={NOTE_LIMIT}
                        rows={3}
                        placeholder="Hi! We’re preparing for the same exam…"
                        aria-label="Note (optional)"
                        onChange={(e) => setRequestNote(e.target.value)}
                      />
                    </div>
                  </HubSection>
                  <div className="mt-5">
                    <button type="button" className="hub-button" disabled={sending} onClick={() => void send()}>
                      {sending ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} strokeWidth={2.4} />}
                      {user ? 'Send Friend Request' : 'Sign in to add friends'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Overlay>
  );
}
