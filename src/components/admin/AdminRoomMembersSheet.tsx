import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import Overlay from '../Overlay';
import { HubAvatar } from '../hub/HubParts';
import { fetchAdminRoomMembers, filterAdminRoomMembers, type AdminRoomFilter, type AdminRoomMember } from '../../lib/roomMembers';

const until = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Admin Hub → Hashtag rooms → a room: everyone in it, muted and banned people
 * included and marked. Tapping a person opens their Admin card.
 */
export default function AdminRoomMembersSheet({ room, onClose, onOpenPerson }: {
  room: { id: string; label: string } | null;
  onClose: () => void;
  onOpenPerson: (id: string) => void;
}) {
  const [members, setMembers] = useState<AdminRoomMember[] | null>(null);
  const [counts, setCounts] = useState({ total: 0, muted: 0, banned: 0 });
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AdminRoomFilter>('all');

  useEffect(() => {
    if (!room) return;
    let live = true;
    setMembers(null); setError(''); setSearch(''); setFilter('all');
    fetchAdminRoomMembers(room.id)
      .then((result) => { if (live) { setMembers(result.members); setCounts({ total: result.total, muted: result.muted, banned: result.banned }); } })
      .catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : 'Could not load the members.'); });
    return () => { live = false; };
  }, [room]);

  const shown = useMemo(() => filterAdminRoomMembers(members ?? [], filter, search), [members, filter, search]);
  const summary = [`${counts.total} member${counts.total === 1 ? '' : 's'}`, counts.muted ? `${counts.muted} muted` : '', counts.banned ? `${counts.banned} banned` : ''].filter(Boolean).join(' · ');

  return (
    <Overlay open={Boolean(room)} onClose={onClose} align="bottom">
      <section className="room-members" aria-label={`Members of #${room?.label ?? ''}`}>
        <div className="room-members-head">
          <div>
            <h2><span aria-hidden>#</span>{room?.label}</h2>
            <p>{members ? summary : 'Loading…'}</p>
          </div>
          <button type="button" className="room-members-close" onClick={onClose} aria-label="Close members"><X size={16} /></button>
        </div>
        <label className="room-members-search">
          <Search size={15} aria-hidden />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or @username" aria-label="Search members" />
        </label>
        <div className="ah-chips !mx-0 !px-0" role="group" aria-label="Show">
          {(['all', 'muted', 'banned'] as const).map((item) => (
            <button key={item} type="button" className="ah-chip" aria-pressed={filter === item} onClick={() => setFilter(item)}>
              {item === 'all' ? 'All' : item === 'muted' ? `Muted${counts.muted ? ` · ${counts.muted}` : ''}` : `Banned${counts.banned ? ` · ${counts.banned}` : ''}`}
            </button>
          ))}
        </div>
        <div className="room-members-scroll">
          {error ? <p className="room-members-empty" role="alert">{error}</p>
            : !members ? <p className="room-members-empty">Loading members…</p>
              : shown.length === 0 ? <p className="room-members-empty">{search || filter !== 'all' ? 'Nobody matches that.' : 'Nobody here yet.'}</p>
                : (
                  <ul className="room-members-list">
                    {shown.map((member) => (
                      <li key={member.id}>
                        <button type="button" className="room-members-person" onClick={() => onOpenPerson(member.id)} aria-label={`${member.name}, open their Admin card`}>
                          <HubAvatar url={member.avatarUrl} name={member.name} backer={member.backer} />
                          <span className="room-members-text">
                            <strong>
                              {member.name}
                              {member.staff && <span className="ah-tag">{member.staff === 'owner' ? 'Owner' : 'Admin'}</span>}
                              {member.banned && <span className="ah-tag is-banned">Banned</span>}
                              {!member.banned && member.mutedUntil && <span className="ah-tag is-muted">Muted</span>}
                            </strong>
                            <span>
                              {member.username ? `@${member.username}` : 'No @username yet'}
                              {!member.banned && member.mutedUntil ? ` · until ${until(member.mutedUntil)}` : ''}
                              {!member.onBoard ? ' · not on the Board' : ''}
                            </span>
                          </span>
                          <ChevronRight size={17} className="ml-auto shrink-0 text-content-muted" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
          <p className="room-members-foot">Tap anyone for their Admin card: mute, ban, restore or remove a photo.</p>
        </div>
      </section>
    </Overlay>
  );
}
