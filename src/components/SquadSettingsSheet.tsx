import { useEffect, useState } from 'react';
import { Check, Globe, Loader2, Lock, Search } from 'lucide-react';
import Overlay from './Overlay';
import { useAuth } from '../contexts/AuthContext';
import {
  roomMemberLimit,
  kickMember,
  inviteUserToSquad,
  acceptSquadJoinRequest,
  declineSquadJoinRequest,
  updateSquadPrivacy,
  normalizeSquadPrivacy,
  type Squad,
  type SquadMember,
  type SquadPrivacy,
} from '../lib/squads';
import { searchProfilesByUsernamePrefix, type Profile } from '../lib/profiles';
import { hapticTick } from '../lib/haptics';
import { HubAvatar, HubSection } from './hub/HubParts';

interface Props {
  open: boolean;
  onClose: () => void;
  squad: Squad;
  members: SquadMember[];
  onMembersChanged: () => void;
}

const PRIVACY_OPTIONS = [
  { value: 'anyone_can_join' as const, icon: Globe, label: 'Open', hint: 'Listed in Discover. People ask, you approve.' },
  { value: 'invite_only' as const, icon: Lock, label: 'Invite only', hint: 'Hidden. Only people you invite can join.' },
];

function squadPrivacy(squad: Squad): SquadPrivacy {
  return normalizeSquadPrivacy(squad.privacy ?? (squad.allow_join_requests ? 'anyone_can_join' : 'invite_only'));
}

export default function SquadSettingsSheet({ open, onClose, squad, members, onMembersChanged }: Props) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<Profile[]>([]);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<SquadPrivacy>(() => squadPrivacy(squad));
  const [privacySaving, setPrivacySaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const isAdmin = members.some((m) => m.user_id === user?.id && m.role === 'admin' && m.status === 'accepted');
  const accepted = members.filter((m) => m.status === 'accepted');
  const invited = members.filter((m) => m.status === 'invited');
  const pending = members.filter((m) => m.status === 'pending');
  const memberLimit = roomMemberLimit(squad);
  const full = accepted.length >= memberLimit;

  useEffect(() => {
    setPrivacy(squadPrivacy(squad));
  }, [squad]);

  useEffect(() => {
    if (!open) return;
    const prefix = search.replace(/^@/, '').trim();
    if (prefix.length < 2) {
      setMatches([]);
      setSearching(false);
      setSearchError('');
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchProfilesByUsernamePrefix(prefix, { excludeId: user?.id, limit: 8 }).then((rows) => {
        if (cancelled) return;
        setMatches(rows);
        setSearching(false);
        setSearchError(rows.length === 0 ? 'No one with that @username.' : '');
      });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, user?.id]);

  if (!open) return null;

  const changePrivacy = async (next: SquadPrivacy) => {
    if (next === privacy || !isAdmin || privacySaving) return;
    hapticTick();
    setPrivacy(next);
    setPrivacySaving(true);
    setNotice(null);
    const ok = await updateSquadPrivacy(squad.id, next);
    setPrivacySaving(false);
    if (ok) {
      onMembersChanged();
    } else {
      setPrivacy(squadPrivacy(squad));
      setNotice({ text: 'Could not change who can join. Try again.', error: true });
    }
  };

  const run = async (id: string, action: () => Promise<unknown>, failure: string) => {
    setBusyId(id);
    setNotice(null);
    const result = await action();
    const ok = result === true || (typeof result === 'object' && result !== null && 'ok' in result && (result as { ok: boolean }).ok);
    if (!ok) {
      const reason = typeof result === 'object' && result !== null && 'error' in result ? (result as { error?: string }).error : undefined;
      setNotice({ text: reason || failure, error: true });
    }
    setBusyId(null);
    onMembersChanged();
  };

  const memberRow = (m: SquadMember, trailing: React.ReactNode) => {
    const name = m.profiles?.display_name || 'Member';
    return (
      <div key={m.user_id} className="hub-row is-compact">
        <HubAvatar url={m.profiles?.avatar_url} name={name} size="sm" />
        <span className="hub-row-main">
          <span className="hub-row-title text-[16px]">
            <span className="hub-truncate">{m.user_id === user?.id ? `${name} (you)` : name}</span>
          </span>
          {m.profiles?.username && <span className="hub-row-subtitle block">@{m.profiles.username}</span>}
        </span>
        {trailing}
      </div>
    );
  };

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="hub hub-sheet" role="dialog" aria-label="Room settings">
        <div className="hub-sheet-grabber" aria-hidden />
        <div className="hub-sheet-header">
          <span />
          <h2>Room Settings</h2>
          <button type="button" className="hub-text-button is-strong is-end" onClick={onClose}>Done</button>
        </div>
        <div className="hub-sheet-body">
          <p className="mb-4 text-center text-[15px] text-content-secondary">
            {squad.description || '🔥'} {squad.name}
            {squad.bar_hours != null ? ` · ${squad.bar_hours}h a day` : ''}
          </p>

          {notice && <div className={`hub-banner ${notice.error ? 'is-error' : 'is-success'}`} role="status">{notice.text}</div>}

          {isAdmin ? (
            <HubSection title="Who can join" aside={privacySaving ? 'Saving…' : undefined}>
              <div className="hub-group" role="radiogroup" aria-label="Who can join">
                {PRIVACY_OPTIONS.map(({ value, icon: Icon, label, hint }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={privacy === value}
                    disabled={privacySaving}
                    className="hub-row hub-option"
                    onClick={() => void changePrivacy(value)}
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
          ) : (
            <HubSection title="Room access">
              <div className="hub-group">
                <div className="hub-row is-compact">
                  <span className="hub-activity-icon" aria-hidden>{privacy === 'invite_only' ? <Lock size={16} /> : <Globe size={16} />}</span>
                  <span className="hub-row-main">
                    <span className="hub-row-title text-[16px]">{privacy === 'invite_only' ? 'Invite only' : 'Open'}</span>
                  </span>
                </div>
              </div>
            </HubSection>
          )}

          {isAdmin && pending.length > 0 && (
            <HubSection title="Asking to join" aside={`${pending.length}`} footer={full ? `The room is full (${memberLimit} members). Approving needs a free place.` : undefined}>
              <div className="hub-group">
                {pending.map((m) =>
                  memberRow(
                    m,
                    <span className="flex gap-1.5">
                      <button
                        type="button"
                        className="hub-pill-button is-filled"
                        disabled={busyId === m.user_id || full}
                        onClick={() => void run(m.user_id, () => acceptSquadJoinRequest(squad.id, m.user_id), 'Could not approve the request.')}
                      >
                        {busyId === m.user_id ? <Loader2 size={14} className="animate-spin" /> : 'Approve'}
                      </button>
                      <button
                        type="button"
                        className="hub-pill-button is-quiet"
                        disabled={busyId === m.user_id}
                        onClick={() => void run(m.user_id, () => declineSquadJoinRequest(squad.id, m.user_id), 'Could not decline the request.')}
                      >
                        Decline
                      </button>
                    </span>,
                  ),
                )}
              </div>
            </HubSection>
          )}

          {isAdmin && (
            <HubSection title="Invite people" footer={`They answer in their Requests. This room holds ${memberLimit} people.`}>
              <div className="hub-search mb-2">
                <Search size={16} aria-hidden />
                <input
                  type="search"
                  name="room_people_lookup"
                  data-protonpass-ignore="true"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Find people to invite"
                  aria-label="Search people to invite"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="[&::-webkit-search-cancel-button]:hidden"
                />
                {searching && <Loader2 size={15} className="animate-spin" />}
              </div>
              {searchError && <p className="hub-section-footer">{searchError}</p>}
              {matches.length > 0 && (
                <div className="hub-group">
                  {matches.map((profile) => {
                    const membership = members.find((m) => m.user_id === profile.id);
                    const state = membership?.status === 'accepted' ? 'Member' : membership?.status === 'invited' ? 'Invited' : membership?.status === 'pending' ? 'Asked to join' : null;
                    return (
                      <div key={profile.id} className="hub-row is-compact">
                        <HubAvatar url={profile.avatar_url} name={profile.display_name} size="sm" />
                        <span className="hub-row-main">
                          <span className="hub-row-title text-[16px]"><span className="hub-truncate">{profile.display_name}</span></span>
                          <span className="hub-row-subtitle block">@{profile.username}</span>
                        </span>
                        {state ? (
                          <span className="hub-chip">{state}</span>
                        ) : (
                          <button
                            type="button"
                            className="hub-pill-button"
                            disabled={busyId === profile.id}
                            onClick={() => void run(profile.id, () => inviteUserToSquad(squad.id, profile.id), 'Could not send the invite.')}
                          >
                            {busyId === profile.id ? <Loader2 size={14} className="animate-spin" /> : 'Invite'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </HubSection>
          )}

          <HubSection title="Members" aside={`${accepted.length} of ${memberLimit}`}>
            <div className="hub-group">
              {accepted.map((m) =>
                memberRow(
                  m,
                  m.role === 'admin' ? (
                    <span className="hub-chip is-tint">Admin</span>
                  ) : isAdmin && m.user_id !== user?.id ? (
                    confirmRemove === m.user_id ? (
                      <span className="flex gap-1.5">
                        <button type="button" className="hub-pill-button is-quiet" onClick={() => setConfirmRemove(null)}>Keep</button>
                        <button
                          type="button"
                          className="hub-pill-button is-danger"
                          disabled={busyId === m.user_id}
                          onClick={() => {
                            setConfirmRemove(null);
                            void run(m.user_id, () => kickMember(squad.id, m.user_id), 'Could not remove the member.');
                          }}
                        >
                          Remove
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="hub-pill-button is-quiet" onClick={() => setConfirmRemove(m.user_id)}>Remove</button>
                    )
                  ) : null,
                ),
              )}
            </div>
          </HubSection>

          {invited.length > 0 && (
            <HubSection title="Invited" footer="Waiting for them to answer.">
              <div className="hub-group">
                {invited.map((m) =>
                  memberRow(
                    m,
                    isAdmin ? (
                      <button
                        type="button"
                        className="hub-pill-button is-quiet"
                        disabled={busyId === m.user_id}
                        onClick={() => void run(m.user_id, () => kickMember(squad.id, m.user_id), 'Could not cancel the invite.')}
                      >
                        Cancel invite
                      </button>
                    ) : (
                      <span className="hub-chip">Invited</span>
                    ),
                  ),
                )}
              </div>
            </HubSection>
          )}
        </div>
      </div>
    </Overlay>
  );
}
