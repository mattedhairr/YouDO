import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  acceptFriendRequest,
  rejectFriendRequest,
  fetchPendingRequests,
  fetchOutgoingFriendRequests,
  type FriendRequest,
  type OutgoingFriendRequest,
} from '../lib/profiles';
import {
  acceptSquadInvite,
  rejectSquadInvite,
  fetchPendingSquadInvites,
  fetchOutgoingSquadJoinRequests,
  fetchIncomingSquadJoinRequests,
  acceptSquadJoinRequest,
  declineSquadJoinRequest,
  cancelOutgoingSquadJoinRequest,
  type IncomingSquadJoinRequest,
  type PendingSquadInvite,
  type Squad,
  type SquadActionResult,
} from '../lib/squads';
import { PRIVATE_HUB_SYNC_EVENT } from '../lib/privateHubSync';
import { dismissFriendRequestNotification, dismissRoomInviteNotification } from '../lib/notifications';
import { HubAvatar, HubEmpty, HubSection } from './hub/HubParts';
import { formatHubTime } from './hub/hubTime';

type Tab = 'received' | 'sent';

interface Props {
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onChanged?: () => void;
}

/** Accept / decline, side by side under the request. */
function Choices({
  primary,
  secondary,
  onPrimary,
  onSecondary,
  busy,
}: {
  primary: string;
  secondary: string;
  onPrimary: () => void;
  onSecondary: () => void;
  busy: boolean;
}) {
  return (
    <span className="mt-2.5 flex gap-2">
      <button type="button" className="hub-pill-button is-filled flex-1" disabled={busy} onClick={onPrimary}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : primary}
      </button>
      <button type="button" className="hub-pill-button is-quiet flex-1" disabled={busy} onClick={onSecondary}>
        {secondary}
      </button>
    </span>
  );
}

function RequestRow({ leading, children }: { leading: ReactNode; children: ReactNode }) {
  return (
    <div className="hub-row !items-start">
      {leading}
      <span className="hub-row-main">{children}</span>
    </div>
  );
}

export default function NotificationsView({ onClose, onOpenProfile, onChanged }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('received');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const [friendIn, setFriendIn] = useState<FriendRequest[]>([]);
  const [friendOut, setFriendOut] = useState<OutgoingFriendRequest[]>([]);
  const [squadInvites, setSquadInvites] = useState<PendingSquadInvite[]>([]);
  const [squadJoinIn, setSquadJoinIn] = useState<IncomingSquadJoinRequest[]>([]);
  const [squadJoinOut, setSquadJoinOut] = useState<Squad[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    const [friends, outgoingFriends, squads, incoming, outgoing] = await Promise.all([
      fetchPendingRequests(user.id),
      fetchOutgoingFriendRequests(user.id),
      fetchPendingSquadInvites(user.id),
      fetchIncomingSquadJoinRequests(user.id),
      fetchOutgoingSquadJoinRequests(),
    ]);
    setFriendIn(friends);
    setFriendOut(outgoingFriends);
    setSquadInvites(squads);
    setSquadJoinIn(incoming);
    setSquadJoinOut(outgoing);
    setLoading(false);
    onChanged?.();
  }, [user, onChanged]);

  /** Every answer runs through here: one busy row at a time, and a refusal says why. */
  const answer = useCallback(
    async (key: string, action: () => Promise<SquadActionResult | boolean | unknown>) => {
      setBusyKey(key);
      setActionError('');
      const result = await action();
      if (result && typeof result === 'object' && 'ok' in result && !(result as SquadActionResult).ok) {
        setActionError((result as SquadActionResult).error ?? 'That did not work. Try again.');
      } else if (result === false) {
        setActionError('That did not work. Try again.');
      }
      await reload();
      setBusyKey(null);
    },
    [reload],
  );

  useEffect(() => {
    void reload();
    void dismissFriendRequestNotification();
    void dismissRoomInviteNotification();
  }, [reload]);

  useEffect(() => {
    const onSync = () => {
      void reload();
    };
    window.addEventListener(PRIVATE_HUB_SYNC_EVENT, onSync);
    return () => window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, onSync);
  }, [reload]);

  const receivedCount = friendIn.length + squadInvites.length + squadJoinIn.length;
  const sentCount = friendOut.length + squadJoinOut.length;

  return (
    <div className="hub pb-4">
      <div className="mb-3 flex items-center gap-1">
        <button type="button" className="hub-nav-back -ml-2" onClick={onClose} aria-label="Back to Private Hub">
          <ChevronLeft size={26} strokeWidth={2.2} />
        </button>
        <h2 className="text-[22px] font-bold tracking-tight">Requests</h2>
      </div>

      <div className="hub-segmented mb-4" role="tablist" aria-label="Requests">
        <button type="button" role="tab" aria-selected={tab === 'received'} onClick={() => setTab('received')}>
          Received
          {receivedCount > 0 && <span className="hub-count is-alert !h-[18px] !min-w-[18px] !text-[11px]">{receivedCount}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'sent'} onClick={() => setTab('sent')}>
          Sent
          {sentCount > 0 && <span className="text-content-muted tabular-nums">{sentCount}</span>}
        </button>
      </div>

      {actionError && <div className="hub-banner is-error" role="alert">{actionError}</div>}

      {loading ? (
        <div className="hub-group">
          <div className="hub-row is-compact justify-center gap-2 text-[14px] text-content-muted" role="status">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </div>
        </div>
      ) : tab === 'received' ? (
        receivedCount === 0 ? (
          <div className="hub-group">
            <HubEmpty icon={<Check size={24} />} title="You’re all caught up" text="Friend requests, room invites and requests to join your rooms show up here." />
          </div>
        ) : (
          <>
            {squadJoinIn.length > 0 && (
              <HubSection title="Asking to join your rooms">
                <div className="hub-group">
                  {squadJoinIn.map((req) => {
                    const key = `join:${req.squad_id}:${req.user_id}`;
                    const name = req.requester?.display_name ?? 'Someone';
                    return (
                      <RequestRow
                        key={key}
                        leading={
                          <button type="button" className="shrink-0 rounded-full" onClick={() => req.requester && onOpenProfile(req.requester.id)} aria-label={`View ${name}'s profile`}>
                            <HubAvatar url={req.requester?.avatar_url} name={name} backer={req.requester?.is_backer === true} />
                          </button>
                        }
                      >
                        <span className="block text-[15px] leading-snug">
                          <strong className="font-semibold">{name}</strong> wants to join <strong className="font-semibold">{req.squad.description || '🔥'} {req.squad.name}</strong>
                        </span>
                        <span className="hub-row-subtitle block">{formatHubTime(req.joined_at)}</span>
                        <Choices
                          primary="Approve"
                          secondary="Decline"
                          busy={busyKey === key}
                          onPrimary={() => void answer(key, () => acceptSquadJoinRequest(req.squad_id, req.user_id))}
                          onSecondary={() => void answer(key, () => declineSquadJoinRequest(req.squad_id, req.user_id))}
                        />
                      </RequestRow>
                    );
                  })}
                </div>
              </HubSection>
            )}

            {squadInvites.length > 0 && (
              <HubSection title="Room invites">
                <div className="hub-group">
                  {squadInvites.map((invite) => {
                    const squad = invite.squads;
                    if (!squad) return null;
                    const key = `invite:${invite.squad_id}`;
                    return (
                      <RequestRow key={key} leading={<span className="hub-room-tile" aria-hidden>{squad.description || '🔥'}</span>}>
                        <span className="block text-[15px] leading-snug">
                          You’re invited to <strong className="font-semibold">{squad.name}</strong>
                        </span>
                        {squad.bar_hours ? <span className="hub-row-subtitle block">{squad.bar_hours}h a day</span> : null}
                        <Choices
                          primary="Join"
                          secondary="Decline"
                          busy={busyKey === key}
                          onPrimary={() => void answer(key, () => acceptSquadInvite(invite.squad_id))}
                          onSecondary={() => void answer(key, () => (user ? rejectSquadInvite(invite.squad_id, user.id) : Promise.resolve(false)))}
                        />
                      </RequestRow>
                    );
                  })}
                </div>
              </HubSection>
            )}

            {friendIn.length > 0 && (
              <HubSection title="Friend requests">
                <div className="hub-group">
                  {friendIn.map((req) => {
                    const key = `friend:${req.id}`;
                    return (
                      <RequestRow
                        key={key}
                        leading={
                          <button type="button" className="shrink-0 rounded-full" onClick={() => onOpenProfile(req.requester.id)} aria-label={`View ${req.requester.display_name}'s profile`}>
                            <HubAvatar url={req.requester.avatar_url} name={req.requester.display_name} backer={req.requester.is_backer === true} />
                          </button>
                        }
                      >
                        <span className="hub-row-title">
                          <span className="hub-truncate flex-1">{req.requester.display_name}</span>
                          <span className="hub-row-time">{formatHubTime(req.created_at)}</span>
                        </span>
                        <span className="hub-row-subtitle block">@{req.requester.username}</span>
                        {req.request_message && (
                          <span className="mt-1.5 block rounded-[10px] bg-[var(--bg-fill)] px-3 py-2 text-[14px] leading-snug text-content-primary">
                            {req.request_message}
                          </span>
                        )}
                        <Choices
                          primary="Accept"
                          secondary="Decline"
                          busy={busyKey === key}
                          onPrimary={() => void answer(key, () => acceptFriendRequest(req.id))}
                          onSecondary={() => void answer(key, () => rejectFriendRequest(req.id))}
                        />
                      </RequestRow>
                    );
                  })}
                </div>
              </HubSection>
            )}
          </>
        )
      ) : sentCount === 0 ? (
        <div className="hub-group">
          <HubEmpty icon={<Check size={24} />} title="Nothing pending" text="Requests you send to friends and rooms wait here until they answer." />
        </div>
      ) : (
        <>
          {squadJoinOut.length > 0 && (
            <HubSection title="Rooms you asked to join">
              <div className="hub-group">
                {squadJoinOut.map((squad) => {
                  const key = `out:${squad.id}`;
                  return (
                    <div key={key} className="hub-row">
                      <span className="hub-room-tile" aria-hidden>{squad.description || '🔥'}</span>
                      <span className="hub-row-main">
                        <span className="hub-row-title"><span className="hub-truncate">{squad.name}</span></span>
                        <span className="hub-row-subtitle block">Waiting for an admin</span>
                      </span>
                      <button
                        type="button"
                        className="hub-pill-button is-quiet"
                        disabled={busyKey === key}
                        onClick={() => void answer(key, () => (user ? cancelOutgoingSquadJoinRequest(squad.id, user.id) : Promise.resolve(false)))}
                      >
                        {busyKey === key ? <Loader2 size={14} className="animate-spin" /> : 'Withdraw'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </HubSection>
          )}

          {friendOut.length > 0 && (
            <HubSection title="Friend requests">
              <div className="hub-group">
                {friendOut.map((req) => (
                  <button key={req.id} type="button" className="hub-row" onClick={() => onOpenProfile(req.receiver.id)}>
                    <HubAvatar url={req.receiver.avatar_url} name={req.receiver.display_name} backer={req.receiver.is_backer === true} />
                    <span className="hub-row-main">
                      <span className="hub-row-title"><span className="hub-truncate">{req.receiver.display_name}</span></span>
                      <span className="hub-row-subtitle block">Sent {formatHubTime(req.created_at)}</span>
                    </span>
                    <span className="hub-chip">Pending</span>
                  </button>
                ))}
              </div>
            </HubSection>
          )}
        </>
      )}
    </div>
  );
}
