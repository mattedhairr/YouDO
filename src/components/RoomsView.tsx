import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, Compass, Globe, Loader2, Lock, Plus, UsersRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  ROOM_MEMBER_LIMIT,
  cancelOutgoingSquadJoinRequest,
  fetchDiscoverableSquads,
  fetchMyRoomSummaries,
  fetchOutgoingSquadJoinRequests,
  normalizeSquadPrivacy,
  requestJoinSquad,
  roomMemberLimit,
  type RoomSummary,
  type Squad,
} from '../lib/squads';
import { PRIVATE_HUB_SYNC_EVENT } from '../lib/privateHubSync';
import { fetchSquadUnreadCounts } from '../lib/messages';
import { HubAvatarStack, HubEmpty, HubSection } from './hub/HubParts';

interface Props {
  personalPace?: number;
  onOpenRoom: (squadId: string) => void;
  onCreateRoom?: () => void;
  onNotificationsChanged?: () => void;
}

function barLabel(hours?: number | null): string | null {
  return hours != null && hours > 0 ? `${hours}h a day` : null;
}

export default function RoomsView({ onOpenRoom, onCreateRoom, onNotificationsChanged }: Props) {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [discoverRooms, setDiscoverRooms] = useState<Squad[]>([]);
  const [requested, setRequested] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string; error?: boolean } | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});

  const reload = useCallback(async () => {
    if (!user) {
      setRooms([]);
      setDiscoverRooms([]);
      setRequested([]);
      setLoading(false);
      return;
    }
    const [mine, discover, pending] = await Promise.all([
      fetchMyRoomSummaries(user.id),
      fetchDiscoverableSquads(),
      fetchOutgoingSquadJoinRequests(),
    ]);
    setRooms(mine);
    setDiscoverRooms(discover);
    setRequested(pending);
    setLoading(false);
    setUnread(await fetchSquadUnreadCounts(user.id, mine.map((room) => room.squad.id)));
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

  const requestJoin = async (room: Squad) => {
    if (!user) return;
    setBusyId(room.id);
    setNotice(null);
    const res = await requestJoinSquad(room.id, user.id);
    setBusyId(null);
    if (res.ok) {
      setNotice({ id: room.id, text: 'Request sent. The room admin will let you in.' });
      onNotificationsChanged?.();
      void reload();
    } else {
      setNotice({ id: room.id, text: res.error || 'Could not send the request.', error: true });
    }
  };

  const withdraw = async (room: Squad) => {
    if (!user) return;
    setBusyId(room.id);
    const ok = await cancelOutgoingSquadJoinRequest(room.id, user.id);
    setBusyId(null);
    if (ok) {
      onNotificationsChanged?.();
      void reload();
    }
  };

  if (loading) {
    // Keep the page's shape while loading so nothing jumps when rooms arrive.
    return (
      <div className="hub">
        {['Your rooms', 'Discover'].map((title) => (
          <HubSection key={title} title={title}>
            <div className="hub-group">
              <div className="hub-row is-compact justify-center gap-2 text-[14px] text-content-muted" role="status">
                <Loader2 size={15} className="animate-spin" /> Loading…
              </div>
            </div>
          </HubSection>
        ))}
      </div>
    );
  }

  return (
    <div className="hub">
      <HubSection
        title="Your rooms"
        aside={rooms.length > 0 ? `${rooms.length}` : undefined}
        footer={rooms.length > 0 ? `Up to ${ROOM_MEMBER_LIMIT} people per room. Room-mates see each other’s focus time, never what you work on.` : undefined}
      >
        {rooms.length === 0 ? (
          <div className="hub-group">
            <HubEmpty
              icon={<UsersRound size={24} />}
              title="No rooms yet"
              text={`Start a room for up to ${ROOM_MEMBER_LIMIT} people and keep each other on pace.`}
              action={onCreateRoom && (
                <button type="button" className="hub-pill-button is-filled" onClick={onCreateRoom}>
                  <Plus size={16} strokeWidth={2.6} /> New room
                </button>
              )}
            />
          </div>
        ) : (
          <div className="hub-group">
            {rooms.map(({ squad, role, members, pendingRequests }) => {
              const bar = barLabel(squad.bar_hours);
              const isPrivate = normalizeSquadPrivacy(squad.privacy) === 'invite_only';
              const newMessages = unread[squad.id] ?? 0;
              return (
                <button key={squad.id} type="button" className="hub-row" onClick={() => onOpenRoom(squad.id)}>
                  <span className="hub-room-tile" aria-hidden>{squad.description || '🔥'}</span>
                  <span className="hub-row-main">
                    <span className="hub-row-title">
                      <span className="hub-truncate">{squad.name}</span>
                      {isPrivate && <Lock size={12} className="shrink-0 text-content-muted" aria-label="Invite only" />}
                    </span>
                    <span className={`hub-row-subtitle hub-truncate block ${pendingRequests > 0 ? 'text-primary' : newMessages > 0 ? 'is-strong' : ''}`}>
                      {pendingRequests > 0
                        ? `${pendingRequests} ${pendingRequests === 1 ? 'request' : 'requests'} to join`
                        : newMessages > 0
                          ? `${newMessages} new ${newMessages === 1 ? 'message' : 'messages'}`
                          : [role === 'admin' ? 'Admin' : 'Member', `${members.length} of ${roomMemberLimit(squad)}`, bar].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="hub-row-trailing">
                    {pendingRequests > 0 ? (
                      <span className="hub-count is-alert" aria-hidden>{pendingRequests}</span>
                    ) : newMessages > 0 ? (
                      <span className="hub-count" aria-hidden>{newMessages > 99 ? '99+' : newMessages}</span>
                    ) : (
                      <HubAvatarStack people={members} />
                    )}
                    <ChevronRight size={18} className="hub-chevron" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </HubSection>

      {requested.length > 0 && (
        <HubSection title="Waiting for approval" footer="You’ll find the room above once an admin lets you in.">
          <div className="hub-group">
            {requested.map((room) => (
              <div key={room.id} className="hub-row">
                <span className="hub-room-tile" aria-hidden>{room.description || '🔥'}</span>
                <span className="hub-row-main">
                  <span className="hub-row-title"><span className="hub-truncate">{room.name}</span></span>
                  <span className="hub-row-subtitle block">Request sent</span>
                </span>
                <button
                  type="button"
                  className="hub-pill-button is-quiet"
                  disabled={busyId === room.id}
                  onClick={() => void withdraw(room)}
                >
                  {busyId === room.id ? <Loader2 size={14} className="animate-spin" /> : 'Withdraw'}
                </button>
              </div>
            ))}
          </div>
        </HubSection>
      )}

      <HubSection
        title="Discover"
        aside={discoverRooms.length > 0 ? `${discoverRooms.length} open` : undefined}
        footer={discoverRooms.length > 0 ? 'Open rooms. Ask to join and an admin decides. Room-mates see each other’s focus time.' : undefined}
      >
        <div className="hub-group">
          {discoverRooms.length === 0 ? (
            <HubEmpty
              icon={<Compass size={24} />}
              title="Nothing to discover"
              text="Open rooms you can ask to join will appear here."
            />
          ) : (
            discoverRooms.map((room) => {
              const bar = barLabel(room.bar_hours);
              return (
                <div key={room.id} className="hub-row">
                  <span className="hub-room-tile" aria-hidden>{room.description || '🔥'}</span>
                  <span className="hub-row-main">
                    <span className="hub-row-title"><span className="hub-truncate">{room.name}</span></span>
                    <span
                      className={`hub-row-subtitle block ${notice?.id === room.id ? (notice.error ? 'text-error' : 'text-secondary') : ''}`}
                      role={notice?.id === room.id ? 'status' : undefined}
                    >
                      {notice?.id === room.id ? notice.text : (
                        <span className="inline-flex items-center gap-1">
                          <Globe size={12} /> {bar ?? 'Open room'}
                        </span>
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="hub-pill-button"
                    disabled={busyId === room.id}
                    onClick={() => void requestJoin(room)}
                  >
                    {busyId === room.id ? <Loader2 size={14} className="animate-spin" /> : 'Ask to join'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </HubSection>
    </div>
  );
}
