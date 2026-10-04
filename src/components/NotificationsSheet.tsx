import { useEffect, useState } from 'react';
import { X, Check, XCircle, UsersRound } from 'lucide-react';
import Overlay from './Overlay';
import { fetchPendingRequests, acceptFriendRequest, rejectFriendRequest, type FriendRequest } from '../lib/profiles';
import { fetchPendingSquadInvites, acceptSquadInvite, rejectSquadInvite } from '../lib/squads';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
    onFriendAccepted?: () => void;
}

export default function NotificationsSheet({ open, onClose, onOpenProfile, onFriendAccepted }: Props) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [squadInvites, setSquadInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      setLoading(true);
      Promise.all([
        fetchPendingRequests(user.id),
        fetchPendingSquadInvites(user.id)
      ]).then(([friends, squads]) => {
        setRequests(friends);
        setSquadInvites(squads);
        setLoading(false);
      });
    }
  }, [open, user]);

  if (!open) return null;

  const handleAcceptFriend = async (id: string) => {
    const ok = await acceptFriendRequest(id);
    if (ok) {
      setRequests(prev => prev.filter(r => r.id !== id));
        if (onFriendAccepted) onFriendAccepted();
    }
  };

  const handleRejectFriend = async (id: string) => {
    const ok = await rejectFriendRequest(id);
    if (ok) {
      setRequests(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleAcceptSquad = async (squadId: string) => {
    if (!user) return;
    const ok = await acceptSquadInvite(squadId, user.id);
    if (ok) {
      setSquadInvites(prev => prev.filter(s => s.squad_id !== squadId));
    }
  };

  const handleRejectSquad = async (squadId: string) => {
    if (!user) return;
    const ok = await rejectSquadInvite(squadId, user.id);
    if (ok) {
      setSquadInvites(prev => prev.filter(s => s.squad_id !== squadId));
    }
  };

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="bg-[var(--bg-surface)] w-full max-w-sm mx-auto rounded-[24px] flex flex-col max-h-[80vh] sm:my-auto mb-4">
        {/* Header */}
        <div className="flex justify-between items-center p-4 pb-2 border-b border-subtle">
          <div className="w-10" />
          <h2 className="text-[14px] font-bold text-content-primary">Pending Requests</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-content-secondary hover:text-content-primary rounded-full hover:bg-elevated transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="py-8 flex justify-center">
              <span className="text-[12px] text-content-muted">Loading...</span>
            </div>
          ) : requests.length === 0 && squadInvites.length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center text-center text-content-muted border border-dashed border-subtle rounded-2xl bg-elevated/30">
              <Check size={24} className="mb-2 opacity-50" />
              <p className="text-[13px] font-medium text-content-primary">All caught up</p>
              <p className="text-[11px] mt-1 max-w-[200px]">You have no pending friend or squad requests.</p>
            </div>
          ) : (
            <>
              {/* Friend Requests */}
              {requests.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-3 px-1">Friend Requests</h3>
                  <div className="space-y-2">
                    {requests.map(req => (
                      <div key={req.id} className="bg-elevated border border-subtle rounded-xl p-3 flex items-center justify-between">
                        <div 
                          className="flex items-center gap-3 cursor-pointer group"
                          onClick={() => onOpenProfile(req.requester.id)}
                        >
                          <div className="w-9 h-9 rounded-full bg-primary-soft text-primary font-bold flex items-center justify-center text-sm border border-primary/20">
                            {req.requester.avatar_url || '🎓'}
                          </div>
                          <div>
                            <p className="text-[13px] font-bold text-content-primary group-hover:text-primary transition-colors">
                              {req.requester.display_name}
                            </p>
                            <p className="text-[11px] text-content-secondary">@{req.requester.username}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button 
                            onClick={() => handleRejectFriend(req.id)}
                            className="h-8 w-8 rounded-lg flex items-center justify-center bg-surface border border-subtle text-content-muted hover:text-error hover:border-error/30 hover:bg-error-soft transition-colors"
                          >
                            <XCircle size={16} />
                          </button>
                          <button 
                            onClick={() => handleAcceptFriend(req.id)}
                            className="h-8 px-3 rounded-lg flex items-center justify-center bg-primary text-on-primary text-[12px] font-bold hover:brightness-110 transition-all"
                          >
                            Accept
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Squad Invites */}
              {squadInvites.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-3 px-1 mt-6">Squad Invites</h3>
                  <div className="space-y-2">
                    {squadInvites.map(invite => {
                      const squad = invite.squads;
                      if (!squad) return null;
                      
                      return (
                        <div key={invite.squad_id} className="bg-elevated border border-subtle rounded-xl p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-surface border border-subtle text-content-primary font-bold flex items-center justify-center text-sm">
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
                              onClick={() => handleRejectSquad(invite.squad_id)}
                              className="h-8 w-8 rounded-lg flex items-center justify-center bg-surface border border-subtle text-content-muted hover:text-error hover:border-error/30 hover:bg-error-soft transition-colors"
                            >
                              <XCircle size={16} />
                            </button>
                            <button 
                              onClick={() => handleAcceptSquad(invite.squad_id)}
                              className="h-8 px-3 rounded-lg flex items-center justify-center bg-primary text-on-primary text-[12px] font-bold hover:brightness-110 transition-all"
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
