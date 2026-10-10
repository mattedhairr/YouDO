import { useState, useEffect } from 'react';
import { X, UsersRound, Globe, Lock, Search, Check, UserPlus } from 'lucide-react';
import Overlay from './Overlay';
import { createSquad, type SquadPrivacy } from '../lib/squads';
import { searchProfilesByUsernamePrefix, type Profile } from '../lib/profiles';
import { ProfileAvatarVisual } from '../lib/profileAvatar';
import { useAuth } from '../contexts/AuthContext';
import { clampStreakBarHours, MAX_STREAK_BAR_HOURS, MIN_STREAK_BAR_HOURS } from '../lib/focusTrends';
import { hapticTick } from '../lib/haptics';

interface Props {
  personalPace?: number;
  open: boolean;
  onClose: () => void;
  onSuccess: (squadId: string) => void;
}

export default function CreateRoomSheet({ open, onClose, onSuccess, personalPace = 4 }: Props) {
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🔥');
  const [barHours, setBarHours] = useState<number>(personalPace ?? 4);
  const [privacy, setPrivacy] = useState<SquadPrivacy>('anyone_can_join');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedInvites, setSelectedInvites] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedInvites([]);
      setErrorMsg('');
      return;
    }
    const prefix = searchQuery.replace(/^@/, '').trim();
    if (prefix.length < 2) {
      setSearchResults([]);
      setSearching(false);
      setSearchError('');
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchProfilesByUsernamePrefix(prefix, { excludeId: user?.id, limit: 5 }).then((rows) => {
        if (cancelled) return;
        setSearchResults(rows);
        setSearching(false);
        setSearchError(rows.length === 0 ? 'No user found with that @username.' : '');
      });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, searchQuery, user?.id]);

  if (!open) return null;

  const handleCreate = async () => {
    if (!name.trim()) {
      setErrorMsg('Please give your squad a name.');
      return;
    }
    if (!user) return;

    setLoading(true);
    setErrorMsg('');

    const allowJoinRequests = privacy === 'anyone_can_join';
    const inviteIds = selectedInvites.map((p) => p.id);
    const res = await createSquad(
      user.id,
      name.trim(),
      icon,
      barHours,
      allowJoinRequests,
      privacy,
      inviteIds,
    );

    setLoading(false);
    if (res.ok && res.squad) {
      onSuccess(res.squad.id);
    } else {
      setErrorMsg(res.error || 'Could not create room.');
    }
  };

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-[24px] flex flex-col max-h-[85vh] sm:my-auto mb-4">
        {/* Header */}
        <div className="flex justify-between items-center p-4 pb-2 border-b border-subtle">
          <div className="w-10" />
          <h2 className="text-[14px] font-bold text-content-primary flex items-center gap-1.5">
            <UsersRound size={16} /> Create Squad
          </h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Room Name & Icon */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">
              Squad Identity
            </label>
            <div className="flex gap-3">
              <div className="w-[52px] shrink-0">
                <select
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-full h-11 bg-elevated border border-subtle rounded-xl text-center text-xl outline-none focus:border-primary appearance-none cursor-pointer"
                >
                  {['🔥', '⚡', '🦉', '🚀', '🎯', '📚', '☕', '⚔️', '🌊', '🏔️', '🏆', '💎'].map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                placeholder="e.g. The Night Owls"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                className="flex-1 bg-elevated border border-subtle rounded-xl px-3 py-2.5 text-sm text-content-primary outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Pace Target */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">
              Daily Target Pace
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-12 h-10 rounded-[10px] border border-subtle bg-elevated text-content-primary text-sm font-semibold disabled:opacity-35 hover:bg-base transition-colors"
                disabled={barHours <= MIN_STREAK_BAR_HOURS}
                onClick={() => {
                  hapticTick();
                  setBarHours(clampStreakBarHours(barHours - 0.5));
                  setErrorMsg('');
                }}
              >
                —
              </button>
              <div className="flex-1 h-10 rounded-xl bg-elevated border border-subtle flex items-center justify-center">
                <span className="tabular-nums text-sm font-bold text-content-primary">{barHours}h</span>
              </div>
              <button
                type="button"
                className="w-12 h-10 rounded-[10px] border border-subtle bg-elevated text-content-primary text-sm font-semibold disabled:opacity-35 hover:bg-base transition-colors"
                disabled={barHours >= MAX_STREAK_BAR_HOURS}
                onClick={() => {
                  hapticTick();
                  setBarHours(clampStreakBarHours(barHours + 0.5));
                  setErrorMsg('');
                }}
              >
                +
              </button>
            </div>
            <p className="text-[11px] text-content-muted mt-2 leading-relaxed">
              Target daily focus hours for squad members. Any member can join regardless of personal bar.
            </p>
          </div>

          {/* Privacy Settings */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">
              Room Privacy
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  hapticTick();
                  setPrivacy('anyone_can_join');
                }}
                className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                  privacy === 'anyone_can_join'
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-subtle bg-elevated/60 hover:bg-elevated'
                }`}
              >
                <div
                  className={`p-2 rounded-xl shrink-0 transition-colors ${
                    privacy === 'anyone_can_join' ? 'bg-primary text-on-primary' : 'bg-surface text-content-muted'
                  }`}
                >
                  <Globe size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-bold text-content-primary">Anyone can join</p>
                    {privacy === 'anyone_can_join' && <Check size={16} className="text-primary shrink-0" />}
                  </div>
                  <p className="text-[11px] text-content-secondary mt-0.5 leading-snug">
                    Public squad listed in Discover. Compatible members can find it and request to join.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  hapticTick();
                  setPrivacy('invite_only');
                }}
                className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                  privacy === 'invite_only'
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-subtle bg-elevated/60 hover:bg-elevated'
                }`}
              >
                <div
                  className={`p-2 rounded-xl shrink-0 transition-colors ${
                    privacy === 'invite_only' ? 'bg-primary text-on-primary' : 'bg-surface text-content-muted'
                  }`}
                >
                  <Lock size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-bold text-content-primary">Invite-only</p>
                    {privacy === 'invite_only' && <Check size={16} className="text-primary shrink-0" />}
                  </div>
                  <p className="text-[11px] text-content-secondary mt-0.5 leading-snug">
                    Private squad hidden from Discover. Members can only enter if invited by username.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Invite Members */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-content-muted">
                Invite Members (Optional)
              </label>
              <span className="text-[10px] text-content-muted">{selectedInvites.length}/3 selected</span>
            </div>

            {/* Staged Invitees Chips */}
            {selectedInvites.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2.5">
                {selectedInvites.map((p) => (
                  <div
                    key={p.id}
                    className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-full bg-primary-soft border border-primary/20 text-xs text-primary font-medium"
                  >
                    <ProfileAvatarVisual
                      avatarUrl={p.avatar_url}
                      displayName={p.display_name}
                      className="w-4 h-4 text-[9px]"
                    />
                    <span className="truncate max-w-[120px]">@{p.username}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedInvites((prev) => prev.filter((item) => item.id !== p.id))}
                      className="p-0.5 rounded-full hover:bg-primary/20 text-primary transition-colors"
                      aria-label={`Remove ${p.username}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-3.5 text-content-muted pointer-events-none" />
              <input
                type="search"
                name="room_invite_search"
                id="room_invite_search_query"
                data-protonpass-ignore="true"
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                autoComplete="off"
                placeholder="Search friend handle (e.g. @alex)..."
                value={searchQuery}
                disabled={selectedInvites.length >= 3}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault();
                }}
                className="w-full h-11 bg-elevated border border-subtle rounded-xl pl-10 pr-4 text-[13px] outline-none focus:border-primary disabled:opacity-50 transition-colors"
              />
            </div>

            {searching && <p className="text-[11px] text-content-muted mt-2 text-center">Searching users…</p>}
            {searchError && <p className="text-[11px] text-error mt-2">{searchError}</p>}

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <ul className="mt-2 space-y-1.5 max-h-40 overflow-y-auto no-scrollbar rounded-xl border border-subtle bg-base p-1.5">
                {searchResults.map((profile) => {
                  const isSelected = selectedInvites.some((p) => p.id === profile.id);
                  return (
                    <li
                      key={profile.id}
                      className="flex items-center justify-between gap-2 p-2 hover:bg-elevated rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-primary-soft border border-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                          <ProfileAvatarVisual
                            avatarUrl={profile.avatar_url}
                            displayName={profile.display_name}
                            className="text-xs"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-bold text-content-primary truncate">
                            {profile.display_name}
                          </p>
                          <p className="text-[10px] text-primary truncate">@{profile.username}</p>
                        </div>
                      </div>
                      {isSelected ? (
                        <span className="text-[11px] font-semibold text-content-muted px-2 py-1">Added</span>
                      ) : (
                        <button
                          type="button"
                          disabled={selectedInvites.length >= 3}
                          onClick={() => {
                            setSelectedInvites((prev) => [...prev, profile]);
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                          className="h-7 px-2.5 rounded-lg bg-primary text-on-primary text-[11px] font-bold flex items-center gap-1 disabled:opacity-40 shrink-0"
                        >
                          <UserPlus size={12} />
                          Add
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 bg-error-soft rounded-xl text-[12px] font-semibold text-error text-center">
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            disabled={loading}
            onClick={handleCreate}
            className="w-full mt-2 h-12 rounded-[14px] bg-primary text-on-primary text-[14px] font-bold flex items-center justify-center disabled:opacity-50 transition active:scale-[0.98]"
          >
            {loading ? 'Creating...' : 'Create Squad Room'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
