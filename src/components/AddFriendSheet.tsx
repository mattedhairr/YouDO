import { useEffect, useState } from 'react';
import { Search, X, UserPlus, Check } from 'lucide-react';
import Overlay from './Overlay';
import { searchProfilesByUsernamePrefix, sendFriendRequest, type Profile } from '../lib/profiles';
import { useAuth } from '../contexts/AuthContext';
import { ProfileAvatarVisual } from '../lib/profileAvatar';

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

  useEffect(() => {
    if (!open) return;
    const prefix = query.replace(/^@/, '').trim();
    if (prefix.length < 2) {
      setMatches([]);
      setSearching(false);
      setErrorMsg('');
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchProfilesByUsernamePrefix(prefix, { excludeId: user?.id, limit: 8 }).then((rows) => {
        if (cancelled) return;
        setMatches(rows);
        setSearching(false);
        setErrorMsg(rows.length === 0 ? 'No matching @username.' : '');
      });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, user?.id]);

  if (!open) return null;

  const handleSendRequest = async () => {
    if (!user || !selected) return;
    const res = await sendFriendRequest(user.id, selected.id, requestNote);
    if (res.ok) {
      setRequestSent(true);
    } else {
      setErrorMsg(res.error || 'Failed to send request.');
    }
  };

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-[24px] flex flex-col max-h-[85vh] sm:my-auto mb-4">
        <div className="flex justify-between items-center p-4 pb-2 border-b border-subtle">
          <div className="w-10" />
          <h2 className="text-[14px] font-bold text-content-primary">Add Friend</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          <p className="text-[12px] text-content-secondary text-center">
            Search for a companion by their unique @username
          </p>

          <div className="relative flex items-center">
            <Search size={16} className="absolute left-3 text-content-muted pointer-events-none" />
            <input
              type="search"
              placeholder="e.g. @alex_study"
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
              className="w-full bg-elevated border border-subtle rounded-xl pl-9 pr-3 py-2.5 text-sm text-content-primary focus:outline-none focus:border-primary"
            />
          </div>

          {searching && <p className="text-center text-[12px] text-content-muted">Searching…</p>}

          {errorMsg && !selected && (
            <p className="text-center text-[12px] text-red-500">{errorMsg}</p>
          )}

          {!selected && matches.length > 0 && (
            <ul className="divide-y divide-subtle rounded-2xl border border-subtle overflow-hidden">
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
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-elevated"
                  >
                    <div className="w-11 h-11 shrink-0 rounded-full bg-primary-soft text-primary overflow-hidden flex items-center justify-center border border-primary/20">
                      <ProfileAvatarVisual
                        avatarUrl={profile.avatar_url}
                        displayName={profile.display_name}
                        className="text-sm"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-content-primary truncate">{profile.display_name}</p>
                      <p className="text-[11px] font-medium text-primary truncate">@{profile.username}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <div className="bg-elevated border border-subtle rounded-2xl p-4 flex flex-col gap-4">
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => {
                  onClose();
                  onOpenProfile(selected.id);
                }}
              >
                <div className="w-12 h-12 shrink-0 rounded-full bg-primary-soft text-primary overflow-hidden flex items-center justify-center border border-primary/20">
                  <ProfileAvatarVisual
                    avatarUrl={selected.avatar_url}
                    displayName={selected.display_name}
                    className="text-xl"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-bold text-content-primary truncate">{selected.display_name}</h3>
                  <p className="text-[11px] font-medium text-primary truncate">@{selected.username}</p>
                </div>
              </div>

              {errorMsg && <p className="text-[11px] text-red-500 text-center">{errorMsg}</p>}

              {!requestSent && (
                <>
                  <label className="text-[11px] font-medium text-content-secondary">
                    Why are you sending this request?
                  </label>
                  <textarea
                    value={requestNote}
                    onChange={(e) => setRequestNote(e.target.value)}
                    maxLength={280}
                    rows={3}
                    placeholder="Required — a short note so they know who you are."
                    className="w-full resize-none rounded-xl border border-subtle bg-surface px-3 py-2.5 text-[13px] text-content-primary outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    disabled={!requestNote.trim()}
                    onClick={() => void handleSendRequest()}
                    className="w-full h-11 rounded-xl bg-primary text-on-primary text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <UserPlus size={16} />
                    Send request
                  </button>
                </>
              )}
              {requestSent && (
                <p className="text-center text-[12px] text-primary font-medium flex items-center justify-center gap-1.5">
                  <Check size={16} /> Request sent
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
