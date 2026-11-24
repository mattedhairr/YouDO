import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Lock, Search } from 'lucide-react';
import {
  activeLabel, can, deleteAccounts, fetchPeople, fetchPerson, formatBytes, isMuted, personLabel, removeProfilePhoto, setStaff,
  type AdminPerson, type AdminRole, type PeopleFilter, type PeoplePage, type StaffAction,
} from '../../lib/adminHub';
import { moderateCommunityMember } from '../../lib/community';
import { hapticSuccess, hapticWarn } from '../../lib/haptics';
import { fetchAvatarFacts } from '../../lib/avatarFacts';
import { avatarKind } from '../../lib/profileAvatar';

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const hours = (ms: number) => { const minutes = Math.round(ms / 60000); return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; };

function Tags({ person }: { person: AdminPerson }) {
  return <>
    {person.role === 'owner' && <span className="ah-tag">Owner</span>}
    {person.role === 'admin' && <span className="ah-tag">Admin</span>}
    {person.bannedAt && <span className="ah-tag is-banned">Banned</span>}
    {!person.bannedAt && isMuted(person) && <span className="ah-tag is-muted">Muted</span>}
  </>;
}

function Avatar({ person, big = false, photo }: { person: AdminPerson; big?: boolean; photo?: string }) {
  const letter = (person.name ?? person.username ?? '?').replace('@', '').charAt(0).toUpperCase() || '?';
  if (photo) return <span className={`ah-avatar ${big ? 'is-big' : ''} overflow-hidden`} aria-hidden><img src={photo} alt="" className="size-full object-cover" /></span>;
  return <span className={`ah-avatar ${big ? 'is-big' : ''}`} aria-hidden>{letter}</span>;
}

function summary(person: AdminPerson, owner: boolean): string {
  const parts = [person.username ? `@${person.username}` : owner ? `Signed up ${day(person.joined)}` : ''];
  parts.push(person.lastActive ? `active ${activeLabel(person.lastActive)}` : 'never active');
  if (person.rooms) parts.push(`${person.rooms} room${person.rooms === 1 ? '' : 's'}`);
  else if (person.onBoard) parts.push('Board');
  if (owner && person.junk) parts.push(person.junk === 'unconfirmed' ? 'never confirmed' : 'nothing saved');
  return parts.filter(Boolean).join(' · ');
}

export function PeopleList({ role, onOpen }: { role: AdminRole; onOpen: (id: string) => void }) {
  const owner = can(role, 'emails');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [page, setPage] = useState<PeoplePage | null>(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);

  const load = useCallback(async (offset: number) => {
    const id = ++request.current;
    try {
      const next = await fetchPeople(search, filter, offset);
      if (id !== request.current) return;
      setPage((previous) => (offset && previous ? { ...next, people: [...previous.people, ...next.people] } : next));
      setError('');
    } catch (caught) {
      if (id === request.current) setError(caught instanceof Error ? caught.message : 'Could not load people.');
    }
  }, [search, filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(0), search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const chips: [PeopleFilter, string, number | undefined][] = [
    ['all', 'Everyone', page?.counts.all], ['staff', 'Staff', page?.counts.staff], ['muted', 'Muted', page?.counts.muted],
    ['banned', 'Banned', page?.counts.banned],
    ...(owner ? [['never_started', 'Never started', undefined], ['junk', 'Cleanup', undefined]] as [PeopleFilter, string, undefined][] : []),
  ];

  return (
    <div className="ah-page">
      <label className="ah-search">
        <Search size={16} aria-hidden />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={owner ? 'Name, @username or email' : 'Name or @username'}
          aria-label="Search people" type="search" autoComplete="off" />
      </label>
      <div className="ah-chips" role="group" aria-label="Show">
        {chips.map(([key, label, count]) => (
          <button key={key} type="button" className="ah-chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}{count !== undefined ? ` ${count}` : ''}
          </button>
        ))}
      </div>
      {error && <p role="status" className="ah-status text-error">{error}</p>}
      {!page && !error && <p className="ah-empty">Loading people…</p>}
      {page && page.people.length === 0 && <p className="ah-empty">No one matches.</p>}
      {page && page.people.length > 0 && (
        <div className="yd-card">
          {page.people.map((person) => (
            <button key={person.id} type="button" className="yd-row !min-h-[58px]" onClick={() => onOpen(person.id)}>
              <Avatar person={person} />
              <span className="yd-row-main">
                <span className="yd-row-title truncate">{personLabel(person)}<Tags person={person} /></span>
                <span className="yd-row-text truncate">{summary(person, owner)}</span>
              </span>
              <ChevronRight size={17} className="shrink-0 text-content-muted" aria-hidden />
            </button>
          ))}
        </div>
      )}
      {page && page.people.length < page.total && (
        <button type="button" className="ah-btn is-ghost is-wide mt-3" disabled={loadingMore}
          onClick={async () => { setLoadingMore(true); await load(page.people.length); setLoadingMore(false); }}>
          {loadingMore ? 'Loading…' : `Show more (${page.total - page.people.length})`}
        </button>
      )}
    </div>
  );
}

export function PersonPage({ id, role, selfId, onChanged, onDeleted }: {
  id: string;
  role: AdminRole;
  selfId: string;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const owner = can(role, 'staff');
  const [person, setPerson] = useState<AdminPerson | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [confirm, setConfirm] = useState<'ban' | 'promote' | 'delete' | null>(null);
  const [typed, setTyped] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();

  useEffect(() => {
    let live = true;
    fetchAvatarFacts([id]).then((facts) => {
      const url = facts.get(id)?.avatarUrl;
      if (live) setPhoto(avatarKind(url) === 'photo' ? url : undefined);
    }).catch(() => {});
    return () => { live = false; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetchPerson(id).then((next) => { if (!cancelled) setPerson(next); })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not open this person.'); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <p className="ah-empty">{error}</p>;
  if (!person) return <p className="ah-empty">Opening…</p>;

  const staff = Boolean(person.role);
  const itsMe = person.id === selfId;
  const muted = isMuted(person);

  const moderate = async (action: 'mute_24h' | 'mute_7d' | 'ban' | 'restore') => {
    setBusy(true); setStatus('');
    const ok = await moderateCommunityMember(person.id, action, 'Admin Hub');
    if (ok) { if (action === 'restore') hapticSuccess(); else hapticWarn(); }
    setStatus(ok ? ({ mute_24h: 'Muted for 24 hours.', mute_7d: 'Muted for 7 days.', ban: 'Banned from the community.', restore: 'Restored.' })[action] : 'That did not work. Try again.');
    if (ok) { setPerson(await fetchPerson(person.id).catch(() => person)); onChanged(); }
    setConfirm(null); setBusy(false);
  };

  const staffChange = async (action: StaffAction) => {
    setBusy(true); setStatus('');
    try {
      setPerson(await setStaff(person.id, action));
      hapticSuccess();
      setStatus({ promote: 'They are an admin now.', demote: 'They are a member again.', show_badge: 'Badge shown.', hide_badge: 'Badge hidden.' }[action]);
      onChanged();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Could not change the role.');
    }
    setConfirm(null); setBusy(false);
  };

  const takeDownPhoto = async () => {
    setBusy(true); setStatus('');
    try {
      await removeProfilePhoto(person.id);
      hapticWarn();
      setPhoto(undefined);
      setStatus('Photo removed. They are back to their emoji.');
      onChanged();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Could not remove the photo.');
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true); setStatus('');
    try {
      await deleteAccounts({ mode: 'one', target: person.id, typed: typed.trim().replace(/^@/, '') });
      hapticWarn();
      onDeleted();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Nothing was deleted.');
      setBusy(false);
    }
  };

  const confirmWord = person.username ?? 'DELETE';
  const email = person.email ?? '';
  const maskedEmail = email.replace(/^(.)[^@]*(@.*)$/, '$1••••$2');

  return (
    <div className="ah-page">
      <div className="yd-card">
        <div className="yd-row">
          <Avatar person={person} big photo={photo} />
          <span className="yd-row-main">
            <span className="yd-row-title !text-[17px]">{personLabel(person)}<Tags person={person} /></span>
            <span className="yd-row-text">{[person.username && person.name ? `@${person.username}` : '', person.hashtag ? `#${person.hashtag}` : ''].filter(Boolean).join(' · ') || 'No exam room'}</span>
          </span>
        </div>
        <div className="ah-facts">
          <div><span>Joined</span>{day(person.joined)}</div>
          <div><span>Last active</span>{person.lastActive ? activeLabel(person.lastActive) : 'never'}</div>
          {owner && <div className="col-span-2"><span>Email</span>{showEmail ? email : maskedEmail}
            {email && <button type="button" className="ml-2 text-[12px] font-bold text-primary" onClick={() => setShowEmail((value) => !value)}>{showEmail ? 'Hide' : 'Show'}</button>}</div>}
          {owner && <div><span>Email confirmed</span>{person.confirmed ? 'Yes' : 'No'}</div>}
          {owner && <div><span>Saved data</span>{person.backupBytes ? `${formatBytes(person.backupBytes)} · ${activeLabel(person.backupUpdated)}` : 'Nothing'}</div>}
          <div><span>Board</span>{person.onBoard ? `On · ${hours(person.boardWeekMs)} this week` : 'Off'}</div>
          <div><span>Rooms</span>{person.rooms}</div>
          {owner && <div><span>Friends</span>{person.friends ?? 0}</div>}
          <div><span>Messages</span>{person.messages} · {person.reported} reported</div>
          {person.note && <div className="col-span-2"><span>Last moderation note</span>{person.note}</div>}
        </div>
      </div>

      {!staff && !itsMe && (
        <section className="yd-section mt-4">
          <h3 className="yd-heading">Community</h3>
          <div className="yd-card yd-block">
            {person.bannedAt || muted ? (
              <div className="ah-actions">
                <p className="ah-note mb-1 w-full">{person.bannedAt ? `Banned since ${day(person.bannedAt)}.` : `Muted until ${new Date(person.mutedUntil!).toLocaleString()}.`}</p>
                <button type="button" className="ah-btn is-primary" disabled={busy} onClick={() => void moderate('restore')}>Restore</button>
              </div>
            ) : (
              <div className="ah-actions">
                {photo && <button type="button" className="ah-btn" disabled={busy} onClick={() => void takeDownPhoto()}>Remove photo</button>}
                <button type="button" className="ah-btn" disabled={busy} onClick={() => void moderate('mute_24h')}>Mute 24 h</button>
                <button type="button" className="ah-btn" disabled={busy} onClick={() => void moderate('mute_7d')}>Mute 7 days</button>
                {confirm === 'ban'
                  ? <button type="button" className="ah-btn is-danger" disabled={busy} onClick={() => void moderate('ban')}>Confirm ban</button>
                  : <button type="button" className="ah-btn is-danger" disabled={busy} onClick={() => setConfirm('ban')}>Ban…</button>}
              </div>
            )}
            <p className="ah-note mt-2">Muted people can read but not post. A ban removes their messages and hides them from the Board and the room; they can ask for a review. Their own plans and focus stay untouched.</p>
          </div>
        </section>
      )}

      {owner && person.role !== 'owner' && !itsMe && (
        <section className="yd-section mt-4">
          <h3 className="yd-heading">Staff · only you</h3>
          <div className="yd-card yd-block">
            <div className="ah-actions">
              {!staff && (confirm === 'promote'
                ? <button type="button" className="ah-btn is-primary" disabled={busy} onClick={() => void staffChange('promote')}>Yes, make admin</button>
                : <button type="button" className="ah-btn is-primary" disabled={busy} onClick={() => setConfirm('promote')}>Make admin…</button>)}
              {staff && <button type="button" className="ah-btn" disabled={busy} onClick={() => void staffChange(person.badgeVisible ? 'hide_badge' : 'show_badge')}>{person.badgeVisible ? 'Hide badge' : 'Show badge'}</button>}
              {staff && <button type="button" className="ah-btn is-danger" disabled={busy} onClick={() => void staffChange('demote')}>Remove admin</button>}
            </div>
            <p className="ah-note mt-2">{staff
              ? 'To mute, ban or delete an admin, remove them as admin first.'
              : 'Admins can moderate, run hashtags and quotes, and look people up. They can’t see emails, money or growth, or delete anything.'}</p>
          </div>
        </section>
      )}

      {owner && !staff && !itsMe && !person.backer && (
        <section className="yd-section mt-4">
          <h3 className="yd-heading">Account · only you</h3>
          {confirm !== 'delete'
            ? <div className="yd-card yd-block"><button type="button" className="ah-btn is-danger" disabled={busy} onClick={() => { setConfirm('delete'); setTyped(''); }}>Delete account…</button></div>
            : (
              <div className="ah-danger">
                <h4>Delete {personLabel(person)} for good?</h4>
                <p>Their account and everything saved with it on the server go: cloud backup, Board, rooms they own, messages. Their phone keeps its own copy. This can’t be undone.</p>
                <input className="yd-field mt-3" value={typed} onChange={(event) => setTyped(event.target.value)}
                  placeholder={`Type ${person.username ? `@${confirmWord}` : confirmWord}`} aria-label="Type to confirm" autoComplete="off" />
                <div className="ah-actions mt-3">
                  <button type="button" className="ah-btn is-ghost is-wide" onClick={() => setConfirm(null)}>Cancel</button>
                  <button type="button" className="ah-btn is-danger is-wide" disabled={busy || typed.trim().replace(/^@/, '') !== confirmWord} onClick={() => void remove()}>Delete</button>
                </div>
              </div>
            )}
        </section>
      )}

      {!owner && (
        <p className="ah-lock mt-4"><Lock size={14} className="mt-0.5 shrink-0" aria-hidden />Only the owner can see emails, change roles or delete accounts.</p>
      )}
      {status && <p role="status" className="ah-status">{status}</p>}
    </div>
  );
}
