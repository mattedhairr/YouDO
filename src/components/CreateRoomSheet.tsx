import { useEffect, useState } from 'react';
import { Check, Globe, Loader2, Lock, Minus, Plus, Search, X } from 'lucide-react';
import Overlay from './Overlay';
import { ROOM_MEMBER_LIMIT, ROOM_SIZES, createSquad, type SquadPrivacy } from '../lib/squads';
import { searchProfilesByUsernamePrefix, type Profile } from '../lib/profiles';
import { useAuth } from '../contexts/AuthContext';
import { clampStreakBarHours, MAX_STREAK_BAR_HOURS, MIN_STREAK_BAR_HOURS } from '../lib/focusTrends';
import { hapticSuccess, hapticTick } from '../lib/haptics';
import { HubAvatar, HubSection } from './hub/HubParts';

const ROOM_ICONS = ['🔥', '⚡', '🦉', '🚀', '🎯', '📚', '☕', '⚔️', '🌊', '🏔️', '🏆', '💎'];

interface Props {
  personalPace?: number;
  open: boolean;
  onClose: () => void;
  onSuccess: (squadId: string) => void;
}

export default function CreateRoomSheet({ open, onClose, onSuccess, personalPace = 4 }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ROOM_ICONS[0]);
  const [barHours, setBarHours] = useState<number>(personalPace);
  const [privacy, setPrivacy] = useState<SquadPrivacy>('anyone_can_join');
  const [roomSize, setRoomSize] = useState<number>(ROOM_MEMBER_LIMIT);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [invites, setInvites] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Every new room starts from a clean form.
  useEffect(() => {
    if (!open) return;
    setName('');
    setIcon(ROOM_ICONS[0]);
    setBarHours(clampStreakBarHours(personalPace));
    setPrivacy('anyone_can_join');
    setRoomSize(ROOM_MEMBER_LIMIT);
    setQuery('');
    setResults([]);
    setInvites([]);
    setError('');
  }, [open, personalPace]);

  useEffect(() => {
    if (!open) return;
    const prefix = query.replace(/^@/, '').trim();
    if (prefix.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchProfilesByUsernamePrefix(prefix, { excludeId: user?.id, limit: 5 }).then((rows) => {
        if (cancelled) return;
        setResults(rows);
        setSearching(false);
      });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, user?.id]);

  if (!open) return null;

  const canCreate = name.trim().length > 0 && !saving;
  const maxInvites = roomSize - 1;

  const create = async () => {
    if (!user || !canCreate) return;
    setSaving(true);
    setError('');
    const res = await createSquad(
      user.id,
      name.trim(),
      icon,
      barHours,
      privacy === 'anyone_can_join',
      privacy,
      invites.map((p) => p.id),
      roomSize,
    );
    setSaving(false);
    if (res.ok && res.squad) {
      hapticSuccess();
      onSuccess(res.squad.id);
    } else {
      setError(res.error || 'Could not create the room. Try again.');
    }
  };

  const toggleInvite = (profile: Profile) => {
    hapticTick();
    setInvites((current) =>
      current.some((p) => p.id === profile.id)
        ? current.filter((p) => p.id !== profile.id)
        : current.length >= maxInvites ? current : [...current, profile],
    );
  };

  const chooseSize = (size: number) => {
    hapticTick();
    setRoomSize(size);
    // A smaller room keeps the friends invited first.
    setInvites((current) => current.slice(0, size - 1));
  };

  const stepHours = (delta: number) => {
    hapticTick();
    setBarHours((h) => clampStreakBarHours(h + delta));
  };

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="hub hub-sheet" role="dialog" aria-label="New room">
        <div className="hub-sheet-grabber" aria-hidden />
        <div className="hub-sheet-header">
          <button type="button" className="hub-text-button is-start" onClick={onClose}>Cancel</button>
          <h2>New Room</h2>
          <button type="button" className="hub-text-button is-strong is-end" disabled={!canCreate} onClick={() => void create()}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : 'Create'}
          </button>
        </div>

        <div className="hub-sheet-body">
          {error && <div className="hub-banner is-error" role="alert">{error}</div>}

          <HubSection>
            <div className="hub-group">
              <div className="hub-row is-compact">
                <span className="hub-room-tile" aria-hidden>{icon}</span>
                <input
                  className="hub-field px-0"
                  value={name}
                  maxLength={40}
                  autoFocus
                  placeholder="Room name"
                  aria-label="Room name"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
                />
              </div>
              <div className="hub-row is-compact">
                <div className="flex flex-1 gap-1.5 overflow-x-auto no-scrollbar p-1 -mx-1" role="radiogroup" aria-label="Room icon">
                  {ROOM_ICONS.map((glyph) => (
                    <button
                      key={glyph}
                      type="button"
                      role="radio"
                      aria-checked={icon === glyph}
                      onClick={() => { hapticTick(); setIcon(glyph); }}
                      className={`grid size-10 shrink-0 place-items-center rounded-[11px] text-[21px] transition-colors ${icon === glyph ? 'bg-primary/20 ring-2 ring-primary' : 'bg-[var(--bg-fill)]'}`}
                    >
                      {glyph}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </HubSection>

          <HubSection footer="Members can keep their own daily bar; this is the room’s default.">
            <div className="hub-group">
              <div className="hub-row is-compact">
                <span className="hub-row-main">
                  <span className="hub-row-title">Daily target</span>
                </span>
                <span className="mr-1 text-[17px] font-semibold tabular-nums text-content-primary">{barHours}h</span>
                <span className="hub-stepper">
                  <button type="button" aria-label="Less" disabled={barHours <= MIN_STREAK_BAR_HOURS} onClick={() => stepHours(-0.5)}>
                    <Minus size={16} strokeWidth={2.6} />
                  </button>
                  <button type="button" aria-label="More" disabled={barHours >= MAX_STREAK_BAR_HOURS} onClick={() => stepHours(0.5)}>
                    <Plus size={16} strokeWidth={2.6} />
                  </button>
                </span>
              </div>
            </div>
          </HubSection>

          <HubSection title="Room size" footer="Including you. This can’t be changed after the room is created.">
            <div className="ios-segmented" role="group" aria-label="Room size">
              {ROOM_SIZES.map((size) => (
                <button key={size} type="button" aria-pressed={roomSize === size} onClick={() => chooseSize(size)}>
                  {size} people
                </button>
              ))}
            </div>
          </HubSection>

          <HubSection title="Who can join">
            <div className="hub-group" role="radiogroup" aria-label="Who can join">
              {([
                ['anyone_can_join', Globe, 'Open', 'Listed in Discover. People ask, you approve.'],
                ['invite_only', Lock, 'Invite only', 'Hidden. Only people you invite can join.'],
              ] as const).map(([value, Icon, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={privacy === value}
                  className="hub-row hub-option"
                  onClick={() => { hapticTick(); setPrivacy(value); }}
                >
                  <span className={`hub-activity-icon ${privacy === value ? 'is-tint' : ''}`} aria-hidden><Icon size={16} /></span>
                  <span className="hub-row-main">
                    <span className="hub-row-title">{label}</span>
                    <span className="hub-row-subtitle block">{hint}</span>
                  </span>
                  <span className="hub-option-check" aria-hidden>{privacy === value && <Check size={20} strokeWidth={2.6} />}</span>
                </button>
              ))}
            </div>
          </HubSection>

          <HubSection
            title="Invite friends"
            aside={`${invites.length} of ${maxInvites}`}
            footer={`This room holds ${roomSize} people including you. Room-mates see each other’s focus time, never what they work on.`}
          >
            {invites.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                {invites.map((p) => (
                  <button key={p.id} type="button" className="hub-chip is-tint" onClick={() => toggleInvite(p)} aria-label={`Remove @${p.username}`}>
                    @{p.username} <X size={12} strokeWidth={2.6} />
                  </button>
                ))}
              </div>
            )}
            <div className="hub-search mb-2">
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={query}
                placeholder="Search @username"
                aria-label="Search friends to invite"
                name="room_invite_search"
                id="room_invite_search_query"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-protonpass-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault();
                }}
                className="[&::-webkit-search-cancel-button]:hidden"
                onChange={(e) => setQuery(e.target.value)}
              />
              {searching && <Loader2 size={15} className="animate-spin" />}
            </div>
            {results.length > 0 && (
              <div className="hub-group">
                {results.map((p) => {
                  const added = invites.some((i) => i.id === p.id);
                  return (
                    <div key={p.id} className="hub-row is-compact">
                      <HubAvatar url={p.avatar_url} name={p.display_name} size="sm" />
                      <span className="hub-row-main">
                        <span className="hub-row-title"><span className="hub-truncate">{p.display_name}</span></span>
                        <span className="hub-row-subtitle block">@{p.username}</span>
                      </span>
                      <button
                        type="button"
                        className={`hub-pill-button ${added ? 'is-quiet' : ''}`}
                        disabled={!added && invites.length >= maxInvites}
                        onClick={() => toggleInvite(p)}
                      >
                        {added ? 'Added' : 'Invite'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {query.replace(/^@/, '').trim().length >= 2 && !searching && results.length === 0 && (
              <p className="hub-section-footer">No one with that @username.</p>
            )}
          </HubSection>
        </div>
      </div>
    </Overlay>
  );
}
