import { useState } from 'react';
import { ChevronRight, Globe, Loader2, Lock, LogOut, Settings, Trash2 } from 'lucide-react';
import Overlay from '../Overlay';
import { roomMemberLimit, normalizeSquadPrivacy, type Squad, type SquadMember } from '../../lib/squads';
import { HubAvatar, HubSection } from '../hub/HubParts';

interface Props {
  open: boolean;
  onClose: () => void;
  squad: Squad;
  members: SquadMember[];
  currentUserId?: string;
  canManage: boolean;
  onOpenSettings: () => void;
  onOpenProfile: (userId: string) => void;
  onLeave: () => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}

/** Who is in the room, plus leave / settings / delete. Opens from the room's info button. */
export default function RoomInfoSheet({
  open,
  onClose,
  squad,
  members,
  currentUserId,
  canManage,
  onOpenSettings,
  onOpenProfile,
  onLeave,
  onDelete,
}: Props) {
  const [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!open) return null;

  const isCreator = squad.created_by === currentUserId;
  const accepted = members.filter((m) => m.status === 'accepted');
  const invited = members.filter((m) => m.status === 'invited').length;
  const isPrivate = normalizeSquadPrivacy(squad.privacy) === 'invite_only';

  const run = async (action: () => Promise<boolean>, failure: string) => {
    setBusy(true);
    setError('');
    const ok = await action();
    setBusy(false);
    if (!ok) setError(failure);
  };

  return (
    <Overlay open={open} onClose={() => { if (confirm) setConfirm(null); else onClose(); }} align="bottom">
      <div className="hub hub-sheet" role="dialog" aria-label="Room info">
        <div className="hub-sheet-grabber" aria-hidden />
        <div className="hub-sheet-header">
          <span />
          <h2>Room Info</h2>
          <button type="button" className="hub-text-button is-strong is-end" onClick={onClose}>Done</button>
        </div>
        <div className="hub-sheet-body">
          <div className="mb-5 flex flex-col items-center gap-2 text-center">
            <span className="hub-room-tile !size-16 !text-[34px]" aria-hidden>{squad.description || '🔥'}</span>
            <p className="text-[22px] font-bold tracking-tight">{squad.name}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-content-secondary">
              {isPrivate ? <Lock size={13} /> : <Globe size={13} />}
              {isPrivate ? 'Invite only' : 'Open room'}
              {squad.bar_hours ? ` · ${squad.bar_hours}h a day` : ''}
            </p>
          </div>

          {error && <div className="hub-banner is-error" role="alert">{error}</div>}

          <HubSection
            title="Members"
            aside={`${accepted.length} of ${roomMemberLimit(squad)}`}
            footer={invited > 0 ? `${invited} ${invited === 1 ? 'invite' : 'invites'} waiting for an answer.` : undefined}
          >
            <div className="hub-group">
              {accepted.map((m) => {
                const name = m.profiles?.display_name || 'Member';
                const isSelf = m.user_id === currentUserId;
                return (
                  <button key={m.user_id} type="button" className="hub-row is-compact" onClick={() => onOpenProfile(m.user_id)}>
                    <HubAvatar url={m.profiles?.avatar_url} name={name} size="sm" />
                    <span className="hub-row-main">
                      <span className="hub-row-title text-[16px]">
                        <span className="hub-truncate">{isSelf ? `${name} (you)` : name}</span>
                      </span>
                      {m.profiles?.username && <span className="hub-row-subtitle block">@{m.profiles.username}</span>}
                    </span>
                    {m.role === 'admin' && <span className="hub-chip is-tint">Admin</span>}
                    <ChevronRight size={17} className="hub-chevron" />
                  </button>
                );
              })}
            </div>
          </HubSection>

          {canManage && (
            <HubSection>
              <div className="hub-group">
                <button type="button" className="hub-row is-compact" onClick={onOpenSettings}>
                  <span className="hub-activity-icon is-tint" aria-hidden><Settings size={15} /></span>
                  <span className="hub-row-main"><span className="hub-row-title text-[16px]">Room settings</span></span>
                  <span className="hub-row-subtitle">Invites, requests, privacy</span>
                  <ChevronRight size={17} className="hub-chevron" />
                </button>
              </div>
            </HubSection>
          )}

          <HubSection
            footer={isCreator ? 'Deleting removes the room, its chat and its members for everyone.' : 'You can ask to join again later.'}
          >
            <div className="hub-group">
              {confirm ? (
                <div className="hub-row flex-col !items-stretch gap-3">
                  <p className="text-center text-[15px] text-content-secondary">
                    {confirm === 'delete' ? `Delete “${squad.name}” for everyone?` : `Leave “${squad.name}”?`}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" className="hub-button is-tinted !min-h-[44px] !text-[16px]" onClick={() => setConfirm(null)} disabled={busy}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="hub-button is-danger !min-h-[44px] !text-[16px]"
                      disabled={busy}
                      onClick={() =>
                        void run(confirm === 'delete' ? onDelete : onLeave, confirm === 'delete' ? 'Could not delete the room.' : 'Could not leave the room.')
                      }
                    >
                      {busy ? <Loader2 size={17} className="animate-spin" /> : confirm === 'delete' ? 'Delete' : 'Leave'}
                    </button>
                  </div>
                </div>
              ) : isCreator ? (
                <button type="button" className="hub-row is-compact text-error" onClick={() => setConfirm('delete')}>
                  <Trash2 size={18} />
                  <span className="text-[16px] font-medium">Delete room</span>
                </button>
              ) : (
                <button type="button" className="hub-row is-compact text-error" onClick={() => setConfirm('leave')}>
                  <LogOut size={18} />
                  <span className="text-[16px] font-medium">Leave room</span>
                </button>
              )}
            </div>
          </HubSection>
        </div>
      </div>
    </Overlay>
  );
}
