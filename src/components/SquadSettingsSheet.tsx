import { useEffect, useState } from 'react';
import { X, Search, UserPlus, LogOut, Check, UserMinus, Globe, Lock } from 'lucide-react';
import Overlay from './Overlay';
import { useAuth } from '../contexts/AuthContext';
import {
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
import { ProfileAvatarVisual } from '../lib/profileAvatar';

interface Props {
  open: boolean;
  onClose: () => void;
  squad: Squad;
  members: SquadMember[];
  onMembersChanged: () => void;
}

export default function SquadSettingsSheet({ open, onClose, squad, members, onMembersChanged }: Props) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<Profile[]>([]);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [invitedId, setInvitedId] = useState<string | null>(null);

  const isAdmin = members.some(
    (m) => m.user_id === user?.id && m.role === 'admin' && m.status === 'accepted',
  );

  const [currentPrivacy, setCurrentPrivacy] = useState<SquadPrivacy>(
    normalizeSquadPrivacy(squad.privacy ?? (squad.allow_join_requests ? 'anyone_can_join' : 'invite_only')),
  );
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyMsg, setPrivacyMsg] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPrivacy(normalizeSquadPrivacy(squad.privacy ?? (squad.allow_join_requests ? 'anyone_can_join' : 'invite_only')));
  }, [squad.privacy, squad.allow_join_requests]);

  const handlePrivacyChange = async (nextPrivacy: SquadPrivacy) => {
    if (nextPrivacy === currentPrivacy || !isAdmin || privacySaving) return;
    setCurrentPrivacy(nextPrivacy);
    setPrivacySaving(true);
    setPrivacyMsg(null);

    const ok = await updateSquadPrivacy(squad.id, nextPrivacy);
    setPrivacySaving(false);

    if (ok) {
      setPrivacyMsg(`Room privacy changed to ${nextPrivacy === 'anyone_can_join' ? 'Public' : 'Invite-only'}.`);
      onMembersChanged();
      setTimeout(() => setPrivacyMsg(null), 3000);
    } else {
      // Revert on failure
      setCurrentPrivacy(normalizeSquadPrivacy(squad.privacy ?? (squad.allow_join_requests ? 'anyone_can_join' : 'invite_only')));
      setPrivacyMsg('Failed to update privacy.');
    }
  };

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
        setSearchError(rows.length === 0 ? 'No user with that @username.' : '');
      });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, user?.id]);

  const handleInvite = async (userId: string) => {
    setInviteBusy(true);
    setSearchError('');
    const ok = await inviteUserToSquad(squad.id, userId);
    setInviteBusy(false);
    if (ok) {
      setInvitedId(userId);
      onMembersChanged();
    } else {
      setSearchError('Could not send invite. They may already be in this squad.');
    }
  };

  const handleKick = async (userId: string) => {
    if (!window.confirm('Remove this member from the squad?')) return;
    await kickMember(squad.id, userId);
    onMembersChanged();
  };

  const acceptedMembers = members.filter((m) => m.status === 'accepted');
  const invitedMembers = members.filter((m) => m.status === 'invited');
  const pendingMembers = members.filter((m) => m.status === 'pending');

  if (!open) return null;

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-md mx-auto rounded-[24px] flex flex-col max-h-[85vh] sm:my-auto mb-4">
        <div className="flex justify-between items-center p-4 pb-2 border-b border-subtle">
          <div className="w-10" />
          <div className="text-center">
            <h2 className="text-[14px] font-bold text-content-primary">Squad settings</h2>
            <p className="text-[10px] text-content-muted mt-0.5 truncate max-w-[200px]">{squad.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Room Pace & Privacy Settings */}
          <div className="space-y-3">
            {squad.bar_hours != null && (
              <div className="rounded-[14px] border border-subtle bg-elevated/50 px-3.5 py-3 flex items-center justify-between gap-2">
                <span className="text-[11px] text-content-secondary">Squad target pace</span>
                <span className="text-[12px] font-bold text-primary">🎯 {squad.bar_hours}h/day bar</span>
              </div>
            )}

            {/* Admin Privacy Control */}
            {isAdmin ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted">
                    Room Privacy
                  </h3>
                  {privacySaving && <span className="text-[10px] text-content-muted">Saving…</span>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={privacySaving}
                    onClick={() => void handlePrivacyChange('anyone_can_join')}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                      currentPrivacy === 'anyone_can_join'
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm'
                        : 'border-subtle bg-elevated text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    <Globe size={16} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[12px] leading-tight font-bold">Anyone can join</p>
                      <p className="text-[9.5px] opacity-75 font-normal mt-0.5">Listed in Discover</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={privacySaving}
                    onClick={() => void handlePrivacyChange('invite_only')}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                      currentPrivacy === 'invite_only'
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm'
                        : 'border-subtle bg-elevated text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    <Lock size={16} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[12px] leading-tight font-bold">Invite-only</p>
                      <p className="text-[9.5px] opacity-75 font-normal mt-0.5">Hidden from Discover</p>
                    </div>
                  </button>
                </div>

                {privacyMsg && (
                  <p className="text-[11px] font-medium text-secondary mt-1.5 px-1">{privacyMsg}</p>
                )}
              </div>
            ) : (
              /* Member Read-Only Privacy Indicator */
              <div className="rounded-[14px] border border-subtle bg-elevated/30 px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-content-secondary">Room access</span>
                <span className="text-[11px] font-semibold text-content-primary flex items-center gap-1.5">
                  {currentPrivacy === 'invite_only' ? (
                    <>
                      <Lock size={12} className="text-secondary" /> Invite-only (private)
                    </>
                  ) : (
                    <>
                      <Globe size={12} className="text-primary" /> Anyone can join (public)
                    </>
                  )}
                </span>
              </div>
            )}
          </div>

          {isAdmin && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">
                Invite by @username
              </h3>
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-3.5 text-content-muted pointer-events-none" />
                <input
                  type="search"
                  name="squad_invite_search"
                  id="squad_invite_search_query"
                  data-protonpass-ignore="true"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  placeholder="Search friend handle (e.g. @alex)..."
                  value={search}
                  autoComplete="off"
                  enterKeyHint="search"
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setInvitedId(null);
                    setSearchError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                  className="w-full h-11 bg-base border border-subtle rounded-xl pl-10 pr-4 text-[13px] outline-none focus:border-primary transition-colors"
                />
              </div>
              <p className="text-[10px] text-content-muted mt-2 leading-relaxed">
                Matches appear as you type. Tap Invite to send — they must accept in Notifications.
              </p>

              {searching && <p className="text-[12px] text-content-muted mt-3 text-center">Searching…</p>}
              {searchError && <p className="text-[11px] text-error mt-2">{searchError}</p>}

              {matches.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {matches.map((profile) => {
                    const alreadyIn = members.some((m) => m.user_id === profile.id && m.status !== 'pending');
                    const justInvited = invitedId === profile.id || members.some((m) => m.user_id === profile.id && m.status === 'invited');
                    return (
                      <li
                        key={profile.id}
                        className="flex items-center justify-between gap-3 p-3 bg-elevated border border-subtle rounded-xl"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-primary-soft border border-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                            <ProfileAvatarVisual
                              avatarUrl={profile.avatar_url}
                              displayName={profile.display_name}
                              className="text-sm"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-content-primary truncate">{profile.display_name}</p>
                            <p className="text-[11px] text-primary truncate">@{profile.username}</p>
                          </div>
                        </div>
                        {justInvited ? (
                          <span className="text-[11px] font-semibold text-content-muted shrink-0">Invited</span>
                        ) : (
                          <button
                            type="button"
                            disabled={inviteBusy || alreadyIn}
                            onClick={() => void handleInvite(profile.id)}
                            className="h-9 px-3 rounded-lg bg-primary text-on-primary text-[12px] font-bold disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                          >
                            <UserPlus size={14} />
                            Invite
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {isAdmin && pendingMembers.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">
                Join requests ({pendingMembers.length})
              </h3>
              <div className="space-y-2">
                {pendingMembers.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between gap-2 p-3 bg-primary-soft/20 border border-primary/20 rounded-xl"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary-soft flex items-center justify-center text-sm font-bold">
                        {m.profiles?.avatar_url || '🎓'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold truncate">{m.profiles?.display_name || 'Aspirant'}</p>
                        <p className="text-[11px] text-content-secondary truncate">@{m.profiles?.username || '…'}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          void acceptSquadJoinRequest(squad.id, m.user_id).then(() => onMembersChanged());
                        }}
                        className="h-8 w-8 rounded-lg bg-primary text-on-primary flex items-center justify-center"
                        aria-label="Accept"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void declineSquadJoinRequest(squad.id, m.user_id).then(() => onMembersChanged());
                        }}
                        className="h-8 w-8 rounded-lg border border-subtle text-content-muted flex items-center justify-center"
                        aria-label="Decline"
                      >
                        <UserMinus size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">
              Members ({acceptedMembers.length}/4)
            </h3>
            <div className="space-y-2">
              {acceptedMembers.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between p-3 bg-elevated border border-subtle rounded-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary-soft border border-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                      <ProfileAvatarVisual
                        avatarUrl={m.profiles?.avatar_url}
                        displayName={m.profiles?.display_name || 'Member'}
                        className="text-sm"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-content-primary truncate">
                        {m.profiles?.display_name}
                        {m.role === 'admin' && (
                          <span className="ml-2 text-[10px] text-primary bg-primary-soft px-1.5 py-0.5 rounded-md">
                            Admin
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-content-secondary truncate">@{m.profiles?.username}</p>
                    </div>
                  </div>

                  {isAdmin && m.user_id !== user?.id && (
                    <button
                      type="button"
                      onClick={() => void handleKick(m.user_id)}
                      className="text-error hover:bg-error-soft p-2 rounded-lg transition-colors shrink-0"
                      title="Remove member"
                    >
                      <LogOut size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {invitedMembers.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-content-muted mb-2">
                Pending invites
              </h3>
              <div className="space-y-2">
                {invitedMembers.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between p-3 bg-surface border border-dashed border-subtle rounded-xl opacity-90"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-base text-content-muted font-bold flex items-center justify-center text-sm">
                        {m.profiles?.avatar_url || '🎓'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold truncate">{m.profiles?.display_name}</p>
                        <p className="text-[11px] text-content-secondary truncate">@{m.profiles?.username}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-content-muted shrink-0">Invited</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
