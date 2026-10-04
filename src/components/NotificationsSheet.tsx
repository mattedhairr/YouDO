import { useEffect, useState } from 'react';
import { X, Check, XCircle, DoorOpen } from 'lucide-react';
import Overlay from './Overlay';
import { fetchPendingRequests, acceptFriendRequest, rejectFriendRequest, type FriendRequest } from '../lib/profiles';
import {
  fetchPendingSquadInvites,
  fetchOutgoingSquadJoinRequests,
  fetchIncomingSquadJoinRequests,
  acceptSquadInvite,
  rejectSquadInvite,
  acceptSquadJoinRequest,
  declineSquadJoinRequest,
  type IncomingSquadJoinRequest,
  type Squad,
} from '../lib/squads';
import { useAuth } from '../contexts/AuthContext';
import { ProfileAvatarVisual } from '../lib/profileAvatar';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onFriendAccepted?: () => void;
  onSquadChanged?: () => void;
}

export default function NotificationsSheet({
  open,
  onClose,
  onOpenProfile,
  onFriendAccepted,
  onSquadChanged,
}: Props) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [squadInvites, setSquadInvites] = useState<any[]>([]);
  const [squadJoinIncoming, setSquadJoinIncoming] = useState<IncomingSquadJoinRequest[]>([]);
  const [squadJoinOutgoing, setSquadJoinOutgoing] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const [friends, squads, incoming, outgoing] = await Promise.all([
      fetchPendingRequests(user.id),
      fetchPendingSquadInvites(user.id),
      fetchIncomingSquadJoinRequests(user.id),
      fetchOutgoingSquadJoinRequests(),
    ]);
    setRequests(friends);
    setSquadInvites(squads);
    setSquadJoinIncoming(incoming);
    setSquadJoinOutgoing(outgoing);
    setLoading(false);
  };

  useEffect(() => {
    if (open && user) {
      void reload();
    }
  }, [open, user]);

  if (!open) return null;

  const handleAcceptFriend = async (id: string) => {
    const ok = await acceptFriendRequest(id);
    if (ok) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
      onFriendAccepted?.();
    }
  };

  const handleRejectFriend = async (id: string) => {
    const ok = await rejectFriendRequest(id);
    if (ok) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const handleAcceptSquad = async (squadId: string) => {
    if (!user) return;
    const ok = await acceptSquadInvite(squadId, user.id);
    if (ok) {
      setSquadInvites((prev) => prev.filter((s) => s.squad_id !== squadId));
      onSquadChanged?.();
    }
  };

  const handleRejectSquad = async (squadId: string) => {
    if (!user) return;
    const ok = await rejectSquadInvite(squadId, user.id);
    if (ok) {
      setSquadInvites((prev) => prev.filter((s) => s.squad_id !== squadId));
      onSquadChanged?.();
    }
  };

  const handleAcceptJoin = async (req: IncomingSquadJoinRequest) => {
    const ok = await acceptSquadJoinRequest(req.squad_id, req.user_id);
    if (ok) {
      setSquadJoinIncoming((prev) =>
        prev.filter((r) => r.squad_id !== req.squad_id || r.user_id !== req.user_id),
      );
      onSquadChanged?.();
    }
  };

  const handleDeclineJoin = async (req: IncomingSquadJoinRequest) => {
    const ok = await declineSquadJoinRequest(req.squad_id, req.user_id);
    if (ok) {
      setSquadJoinIncoming((prev) =>
        prev.filter((r) => r.squad_id !== req.squad_id || r.user_id !== req.user_id),
      );
      onSquadChanged?.();
    }
  };

  const empty =
    requests.length === 0 &&
    squadInvites.length === 0 &&
    squadJoinIncoming.length === 0 &&
    squadJoinOutgoing.length === 0;

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-sm mx-auto rounded-[24px] flex flex-col max-h-[80vh] sm:my-auto mb-4">
        <div className="flex justify-between items-center p-4 pb-2 border-b border-subtle">
          <div className="w-10" />
          <h2 className="text-[14px] font-bold text-content-primary">Notifications</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="py-8 flex justify-center">
              <span className="text-[12px] text-content-muted">Loading...</span>
            </div>
          ) : empty ? (
            <div className="py-8 flex flex-col items-center justify-center text-center text-content-muted border border-dashed border-subtle rounded-2xl bg-elevated/30">
              <Check size={24} className="mb-2 opacity-50" />
              <p className="text-[13px] font-medium text-content-primary">All caught up</p>
              <p className="text-[11px] mt-1 max-w-[200px]">No pending friend or squad activity.</p>
            </div>
          ) : (
            <>
              {squadJoinIncoming.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-3 px-1">
                    Squad join requests
                  </h3>
                  <div className="space-y-2">
                    {squadJoinIncoming.map((req) => (
                      <div
                        key={`${req.squad_id}-${req.user_id}`}
                        className="bg-elevated border border-primary/20 rounded-xl p-3"
                      >
                        <p className="text-[10px] text-primary font-semibold mb-2">
                          Someone wants to join {req.squad.name}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="flex items-center gap-3 min-w-0 text-left"
                            onClick={() => req.requester && onOpenProfile(req.requester.id)}
                          >
                            <div className="w-9 h-9 rounded-full bg-primary-soft border border-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                              {req.requester ? (
                                <ProfileAvatarVisual
                                  avatarUrl={req.requester.avatar_url}
                                  displayName={req.requester.display_name}
                                  className="text-sm"
                                />
                              ) : (
                                '🎓'
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold text-content-primary truncate">
                                {req.requester?.display_name ?? 'Aspirant'}
                              </p>
                              <p className="text-[11px] text-content-secondary truncate">
                                @{req.requester?.username ?? '…'}
                              </p>
                            </div>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => void handleDeclineJoin(req)}
                              className="h-8 w-8 rounded-lg flex items-center justify-center bg-surface border border-subtle text-content-muted hover:text-error"
                            >
                              <XCircle size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleAcceptJoin(req)}
                              className="h-8 px-3 rounded-lg flex items-center justify-center bg-primary text-on-primary text-[12px] font-bold"
                            >
                              Accept
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {squadJoinOutgoing.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-3 px-1">
                    Your squad requests
                  </h3>
                  <div className="space-y-2">
                    {squadJoinOutgoing.map((squad) => (
                      <div
                        key={squad.id}
                        className="bg-elevated border border-subtle rounded-xl p-3 flex items-center gap-3"
                      >
                        <div className="w-9 h-9 rounded-full bg-surface border border-subtle flex items-center justify-center text-sm">
                          {squad.description || '🔥'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-content-primary truncate">{squad.name}</p>
                          <p className="text-[11px] text-secondary font-medium flex items-center gap-1 mt-0.5">
                            <DoorOpen size={12} /> Request sent · waiting on admin
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {requests.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-3 px-1">
                    Friend requests
                  </h3>
                  <div className="space-y-2">
                    {requests.map((req) => (
                      <div key={req.id} className="bg-elevated border border-subtle rounded-xl p-3 flex items-center justify-between">
                        <button
                          type="button"
                          className="flex items-center gap-3 min-w-0 text-left group"
                          onClick={() => onOpenProfile(req.requester.id)}
                        >
                          <div className="w-9 h-9 rounded-full bg-primary-soft text-primary font-bold flex items-center justify-center text-sm border border-primary/20">
                            {req.requester.avatar_url || '🎓'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-content-primary group-hover:text-primary truncate">
                              {req.requester.display_name}
                            </p>
                            <p className="text-[11px] text-content-secondary">@{req.requester.username}</p>
                            {req.request_message && (
                              <p className="text-[11px] text-content-secondary mt-1 line-clamp-2">
                                “{req.request_message}”
                              </p>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleRejectFriend(req.id)}
                            className="h-8 w-8 rounded-lg flex items-center justify-center bg-surface border border-subtle text-content-muted hover:text-error"
                          >
                            <XCircle size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAcceptFriend(req.id)}
                            className="h-8 px-3 rounded-lg flex items-center justify-center bg-primary text-on-primary text-[12px] font-bold"
                          >
                            Accept
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {squadInvites.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-3 px-1">
                    Squad invites
                  </h3>
                  <div className="space-y-2">
                    {squadInvites.map((invite) => {
                      const squad = invite.squads;
                      if (!squad) return null;
                      return (
                        <div key={invite.squad_id} className="bg-elevated border border-subtle rounded-xl p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-surface border border-subtle flex items-center justify-center text-sm">
                              {squad.description || '🔥'}
                            </div>
                            <div>
                              <p className="text-[13px] font-bold text-content-primary max-w-[140px] truncate">
                                {squad.name}
                              </p>
                              <p className="text-[11px] text-primary">🎯 {squad.bar_hours}h/day</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => void handleRejectSquad(invite.squad_id)}
                              className="h-8 w-8 rounded-lg flex items-center justify-center bg-surface border border-subtle text-content-muted hover:text-error"
                            >
                              <XCircle size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleAcceptSquad(invite.squad_id)}
                              className="h-8 px-3 rounded-lg flex items-center justify-center bg-primary text-on-primary text-[12px] font-bold"
                            >
                              Accept
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Overlay>
  );
}
