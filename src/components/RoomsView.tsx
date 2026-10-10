import { useState, useEffect, useCallback } from 'react';
import { Lock, UsersRound, DoorOpen, Loader2, Clock, X, Globe } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchDiscoverableSquads,
  fetchMySquads,
  fetchOutgoingSquadJoinRequests,
  cancelOutgoingSquadJoinRequest,
  requestJoinSquad,
  normalizeSquadPrivacy,
  type Squad,
} from '../lib/squads';
import { PRIVATE_HUB_SYNC_EVENT } from '../lib/privateHubSync';

interface Props {
  personalPace?: number;
  onOpenRoom: (squadId: string) => void;
  onNotificationsChanged?: () => void;
}

export default function RoomsView({ onOpenRoom, onNotificationsChanged }: Props) {
  const { user } = useAuth();
  const [myRooms, setMyRooms] = useState<Squad[]>([]);
  const [discoverRooms, setDiscoverRooms] = useState<Squad[]>([]);
  const [pendingJoinRooms, setPendingJoinRooms] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinBusyId, setJoinBusyId] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<{ id: string; text: string; error?: boolean } | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setMyRooms([]);
      setDiscoverRooms([]);
      setPendingJoinRooms([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [mine, discover, pending] = await Promise.all([
      fetchMySquads(user.id),
      fetchDiscoverableSquads(),
      fetchOutgoingSquadJoinRequests(),
    ]);
    setMyRooms(mine);
    setDiscoverRooms(discover);
    setPendingJoinRooms(pending);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void reload();
    const handleSync = () => {
      void reload();
    };
    window.addEventListener(PRIVATE_HUB_SYNC_EVENT, handleSync);
    return () => {
      window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, handleSync);
    };
  }, [reload]);

  const handleRequestJoin = async (room: Squad) => {
    if (!user) return;
    setJoinBusyId(room.id);
    setJoinMessage(null);
    const res = await requestJoinSquad(room.id, user.id);
    setJoinBusyId(null);
    if (res.ok) {
      setJoinMessage({ id: room.id, text: 'Request sent — waiting for the squad admin.' });
      onNotificationsChanged?.();
      void reload();
    } else {
      setJoinMessage({ id: room.id, text: res.error || 'Request failed.', error: true });
    }
  };

  const handleCancelRequest = async (room: Squad) => {
    if (!user) return;
    setJoinBusyId(room.id);
    const ok = await cancelOutgoingSquadJoinRequest(room.id, user.id);
    setJoinBusyId(null);
    if (ok) {
      onNotificationsChanged?.();
      void reload();
    }
  };

  const pendingIds = new Set(pendingJoinRooms.map((r) => r.id));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-2.5 px-1">Your squads</h3>
        {loading ? (
          <p className="text-center text-[12px] text-content-muted py-4">Loading…</p>
        ) : myRooms.length === 0 ? (
          <div className="py-6 px-4 text-center border border-dashed border-subtle rounded-2xl bg-elevated/30">
            <p className="text-[12px] text-content-secondary">Create a room or join one from Discover below.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {myRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => onOpenRoom(room.id)}
                className="w-full text-left bg-elevated border border-primary/25 rounded-[16px] p-4 hover:border-primary/45 transition-colors active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0">{room.description || '🔥'}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[14px] font-bold text-content-primary truncate">{room.name}</p>
                        {normalizeSquadPrivacy(room.privacy) === 'invite_only' ? (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-content-muted bg-surface px-1.5 py-0.5 rounded-md border border-subtle">
                            <Lock size={9} /> Private
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-primary bg-primary-soft px-1.5 py-0.5 rounded-md border border-primary/20">
                            <Globe size={9} /> Public
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-primary font-semibold mt-0.5">Your room · tap to open</p>
                    </div>
                  </div>
                  {room.bar_hours != null && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary border border-primary/20 shrink-0">
                      🎯 {room.bar_hours}h/day
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {pendingJoinRooms.length > 0 && (
        <div>
          <h3 className="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-2.5 px-1">
            Request sent
          </h3>
          <p className="text-[10px] text-content-muted px-1 mb-2 leading-relaxed">
            Waiting for the squad admin to accept. You&apos;ll see the room under Your squads when approved.
          </p>
          <div className="space-y-2">
            {pendingJoinRooms.map((room) => (
              <div
                key={room.id}
                className="bg-elevated border border-secondary/30 rounded-[16px] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0">{room.description || '🔥'}</span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-content-primary truncate">{room.name}</p>
                      <p className="text-[10px] font-semibold text-secondary mt-0.5 flex items-center gap-1">
                        <Clock size={11} /> Request sent
                      </p>
                    </div>
                  </div>
                  {room.bar_hours != null && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary border border-primary/20 shrink-0">
                      🎯 {room.bar_hours}h/day
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={joinBusyId === room.id}
                  onClick={() => void handleCancelRequest(room)}
                  className="mt-3 w-full h-9 rounded-xl text-[11px] font-semibold border border-subtle text-content-secondary flex items-center justify-center gap-1.5"
                >
                  {joinBusyId === room.id ? <Loader2 className="animate-spin" size={14} /> : <X size={14} />}
                  Withdraw request
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3 mb-2 px-1">
          <h3 className="text-[11px] font-bold text-content-muted uppercase tracking-wider">Discover</h3>
          <span className="text-[10px] text-content-muted font-medium">
            {discoverRooms.length} {discoverRooms.length === 1 ? 'squad available' : 'squads available'}
          </span>
        </div>
        <p className="text-[10px] text-content-muted px-1 mb-3 leading-relaxed">
          Public rooms anyone can ask to join. Select a squad to request membership.
        </p>

        {loading ? (
          <p className="text-center text-[12px] text-content-muted py-6">Finding squads…</p>
        ) : discoverRooms.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-center text-content-muted border border-dashed border-subtle rounded-2xl bg-elevated/30 px-4">
            <UsersRound size={24} className="mb-3 opacity-50" />
            <p className="text-[13px] font-medium text-content-primary">No squads to discover</p>
            <p className="text-[11px] mt-1 max-w-[240px] mx-auto leading-relaxed">
              {pendingIds.size > 0
                ? 'You have pending requests above — admins must accept before you can enter.'
                : 'No public squads available to join right now.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {discoverRooms.map((room) => (
              <div
                key={room.id}
                className="bg-elevated border border-subtle rounded-[18px] p-4 transition-all hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-2xl shrink-0">{room.description || '🔥'}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Globe size={12} className="text-content-muted shrink-0" />
                        <h3 className="text-[14px] font-bold text-content-primary truncate">{room.name}</h3>
                      </div>
                      <p className="text-[10px] text-content-muted mt-0.5">Public · request to join</p>
                    </div>
                  </div>
                  {room.bar_hours != null && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border bg-primary-soft text-primary border-primary/20">
                      🎯 {room.bar_hours}h/day
                    </span>
                  )}
                </div>

                {joinMessage?.id === room.id && (
                  <p
                    className={`text-[11px] mb-2.5 px-1 ${joinMessage.error ? 'text-error' : 'text-secondary'}`}
                    role="status"
                  >
                    {joinMessage.text}
                  </p>
                )}

                <button
                  type="button"
                  disabled={joinBusyId === room.id}
                  onClick={() => void handleRequestJoin(room)}
                  className="w-full h-10 rounded-xl text-[12px] font-bold flex items-center justify-center gap-2 bg-primary text-on-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {joinBusyId === room.id ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <DoorOpen size={16} strokeWidth={2.2} />
                  )}
                  Request to join
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
