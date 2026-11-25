import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import Overlay from '../Overlay';
import { HubAvatar } from '../hub/HubParts';
import { acceptFriendRequest, sendFriendRequest } from '../../lib/profiles';
import { fetchRoomMembers, filterRoomMembers, roomMemberAction, type RoomMember } from '../../lib/roomMembers';
import { hapticSuccess } from '../../lib/haptics';

/**
 * An exam hashtag room's members: friends first, then the most active. Add a
 * friend, accept their request, or message a friend; tap anyone for their
 * profile card. Only Board members are listed (the server decides).
 */
export default function RoomMembersSheet({ open, roomId, roomLabel, userId, onClose, onProfile, onMessage }: {
  open: boolean;
  roomId: string;
  roomLabel: string;
  userId: string;
  onClose: () => void;
  onProfile?: (id: string) => void;
  onMessage?: (id: string) => void;
}) {
  const [members, setMembers] = useState<RoomMember[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    let live = true;
    setMembers(null);
    setError('');
    setStatus('');
    setSearch('');
    fetchRoomMembers(roomId)
      .then((result) => { if (live) { setMembers(result.members); setTotal(result.total); } })
      .catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : 'Could not load the members.'); });
    return () => { live = false; };
  }, [open, roomId]);

  const shown = useMemo(() => filterRoomMembers(members ?? [], search), [members, search]);
  const relate = (id: string, relation: RoomMember['relation']) =>
    setMembers((current) => current?.map((member) => (member.id === id ? { ...member, relation, requestId: undefined } : member)) ?? null);

  const addFriend = async (member: RoomMember) => {
    setBusyId(member.id);
    setStatus('');
    const result = await sendFriendRequest(userId, member.id, '');
    if (result.ok) { relate(member.id, 'requested'); hapticSuccess(); }
    else setStatus(result.error ?? 'Could not send the request.');
    setBusyId(null);
  };
  const accept = async (member: RoomMember) => {
    if (!member.requestId) return;
    setBusyId(member.id);
    setStatus('');
    if (await acceptFriendRequest(member.requestId)) { relate(member.id, 'friend'); hapticSuccess(); }
    else setStatus('Could not accept the request. Try again.');
    setBusyId(null);
  };

  const action = (member: RoomMember) => {
    const busy = busyId === member.id;
    switch (roomMemberAction(member, Boolean(onMessage))) {
      case 'you': return <span className="room-members-note">You</span>;
      case 'message': return <button type="button" className="room-members-btn is-quiet" onClick={() => onMessage?.(member.id)}>Message</button>;
      case 'friend': return <span className="room-members-note">Friend</span>;
      case 'requested': return <span className="room-members-btn is-muted" aria-disabled="true">Requested</span>;
      case 'accept': return <button type="button" className="room-members-btn" disabled={busy} onClick={() => void accept(member)}>Accept</button>;
      case 'add': return <button type="button" className="room-members-btn" disabled={busy} onClick={() => void addFriend(member)}>Add friend</button>;
      default: return <span className="room-members-note">Can’t add yet</span>;
    }
  };

  const subtitle = (member: RoomMember) => {
    const handle = member.username ? `@${member.username}` : 'No @username yet';
    if (member.relation === 'friend') return `${handle} · friend`;
    if (member.relation === 'incoming') return `${handle} · wants to be friends`;
    return handle;
  };

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <section className="room-members" aria-label={`Members of #${roomLabel}`}>
        <div className="room-members-head">
          <div>
            <h2><span aria-hidden>#</span>{roomLabel}</h2>
            <p>{members ? `${total} member${total === 1 ? '' : 's'}` : 'Loading…'}</p>
          </div>
          <button type="button" className="room-members-close" onClick={onClose} aria-label="Close members"><X size={16} /></button>
        </div>
        <label className="room-members-search">
          <Search size={15} aria-hidden />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or @username" aria-label="Search members" />
        </label>
        <div className="room-members-scroll">
          {error ? <p className="room-members-empty" role="alert">{error}</p>
            : !members ? <p className="room-members-empty">Loading members…</p>
              : shown.length === 0 ? <p className="room-members-empty">{search ? 'Nobody matches that.' : 'Nobody here yet.'}</p>
                : (
                  <ul className="room-members-list">
                    {shown.map((member) => (
                      <li key={member.id}>
                        <button type="button" className="room-members-person" onClick={() => onProfile?.(member.id)} disabled={!onProfile || member.relation === 'self'} aria-label={`${member.name}, open profile`}>
                          <HubAvatar url={member.avatarUrl} name={member.name} backer={member.backer} />
                          <span className="room-members-text">
                            <strong>{member.name}</strong>
                            <span>{subtitle(member)}</span>
                          </span>
                        </button>
                        {action(member)}
                      </li>
                    ))}
                  </ul>
                )}
          {status && <p className="room-members-status" role="status">{status}</p>}
          <p className="room-members-foot">Friends first, then the most active. Tap anyone for their profile card.</p>
        </div>
      </section>
    </Overlay>
  );
}
