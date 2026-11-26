import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, ChevronRight, Crown, ImageOff, Lock, Mail, RotateCcw, Search, Trash2, VolumeX, type LucideIcon } from 'lucide-react';
import {
  activeLabel, can, deleteAccounts, fetchPeople, fetchPerson, formatBytes, isMuted, personLabel, removeProfilePhoto, setStaff,
  type AdminPerson, type AdminRole, type PeopleFilter, type PeoplePage, type StaffAction,
} from '../../lib/adminHub';
import { moderateCommunityMember } from '../../lib/community';
import { hapticSuccess, hapticWarn } from '../../lib/haptics';
import { fetchAvatarFacts } from '../../lib/avatarFacts';
import { avatarKind } from '../../lib/profileAvatar';
import type { EmailStart } from './AdminEmail';
import { LargeTitle, NumberStrip } from './AdminUI';

/** One tappable action row, like a contact card's (red for the ones that can't be taken back lightly). */
function ActionRow({ icon: Icon, title, text, tone, disabled, onClick }: {
  icon: LucideIcon; title: string; text?: string; tone?: 'danger' | 'primary'; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className={`yd-row ${tone ? `ah-cell-${tone}` : ''}`} disabled={disabled} onClick={onClick}>
      <span className={`yd-tile ${tone === 'danger' ? 'is-red' : ''}`} aria-hidden><Icon size={16} strokeWidth={2} /></span>
      <span className="yd-row-main"><span className="yd-row-title">{title}</span>{text && <span className="yd-row-text">{text}</span>}</span>
    </button>
  );
}

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

export function PeopleList({ role, onOpen, onEmail }: { role: AdminRole; onOpen: (id: string) => void; onEmail: () => void }) {
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

  const choices: [PeopleFilter, string, number | undefined][] = [
    ['all', 'Everyone', page?.counts.all], ['staff', 'Staff', page?.counts.staff], ['muted', 'Muted', page?.counts.muted],
    ['banned', 'Banned', page?.counts.banned],
    ...(owner ? [['never_started', 'Never started', undefined], ['junk', 'Cleanup', undefined]] as [PeopleFilter, string, undefined][] : []),
  ];

  return (
    <div className="ah-page">
      <LargeTitle title="People" subtitle={page ? `${page.counts.all} ${page.counts.all === 1 ? 'account' : 'accounts'}` : ' '} />
      <label className="ah-search">
        <Search size={16} aria-hidden />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={owner ? 'Name, @username or email' : 'Name or @username'}
          aria-label="Search people" type="search" autoComplete="off" />
      </label>
      <div className="yd-card my-3.5"><button type="button" className="yd-row w-full" onClick={onEmail}>
        <span className="yd-tile" aria-hidden><Mail size={16} strokeWidth={2} /></span>
        <span className="yd-row-main"><span className="yd-row-title">Email</span><span className="yd-row-text">Write to everyone{owner ? ', backers' : ''} or a few people</span></span>
        <ChevronRight size={17} className="ah-chev" aria-hidden />
      </button></div>
      <div className="ah-filter">
        <label>Showing{' '}
          <select value={filter} onChange={(event) => setFilter(event.target.value as PeopleFilter)} aria-label="Show">
            {choices.map(([key, label, count]) => <option key={key} value={key}>{label}{count !== undefined ? ` (${count})` : ''}</option>)}
          </select>
        </label>
        <span>Recent first</span>
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
              <ChevronRight size={17} className="ah-chev" aria-hidden />
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

export function PersonPage({ id, role, selfId, onChanged, onDeleted, onEmail, onLoaded }: {
  id: string;
  role: AdminRole;
  selfId: string;
  onEmail: (start: EmailStart) => void;
  /** Their name, once loaded, for the back button of a page opened from the card. */
  onLoaded?: (label: string) => void;
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
  const loaded = useRef(onLoaded);
  useEffect(() => { loaded.current = onLoaded; });

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
    fetchPerson(id).then((next) => { if (!cancelled) { setPerson(next); loaded.current?.(personLabel(next)); } })
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

  const first = person.name?.split(/\s+/)[0];
  const canModerate = !staff && !itsMe;
  return (
    <div className="ah-page">
      <div className="ah-hero">
        <Avatar person={person} big photo={photo} />
        <h2>{personLabel(person)}<Tags person={person} /></h2>
        <p>{[person.username && person.name ? `@${person.username}` : '', person.hashtag ? `#${person.hashtag}` : '', person.backer ? 'Founding Backer' : ''].filter(Boolean).join(' · ') || 'No exam room'}</p>
      </div>
      <NumberStrip label="At a glance" items={[
        { value: person.onBoard ? hours(person.boardWeekMs) : 'Off', label: person.onBoard ? 'Board, week' : 'Board' },
        { value: person.rooms, label: person.rooms === 1 ? 'Room' : 'Rooms' },
        ...(owner ? [{ value: person.friends ?? 0, label: person.friends === 1 ? 'Friend' : 'Friends' }] : []),
        // Community messages are deleted 7 days after they disappear, so this is only the last ~8 days.
        { value: person.messages, label: person.reported ? `Msgs · ${person.reported} reported` : 'Msgs, 8 days' },
      ]} />

      <section className="yd-section mt-5">
        <h3 className="yd-heading">Details</h3>
        <div className="yd-card">
          <dl className="ah-person-facts">
            <div><dt>Joined</dt><dd>{day(person.joined)}</dd></div>
            <div><dt>Last active</dt><dd>{person.lastActive ? activeLabel(person.lastActive) : 'Never'}</dd></div>
            {owner && (
              <div><dt>Email</dt><dd>
                <span className="truncate">{showEmail ? email : maskedEmail || '—'}</span>
                {email && <button type="button" className="ah-person-show" onClick={() => setShowEmail((value) => !value)}>{showEmail ? 'Hide' : 'Show'}</button>}
              </dd></div>
            )}
            {owner && <div><dt>Email confirmed</dt><dd className={person.confirmed ? 'is-good' : 'is-warn'}>{person.confirmed ? 'Yes' : 'Not yet'}</dd></div>}
            {owner && <div><dt>Saved data</dt><dd>{person.backupBytes ? `${formatBytes(person.backupBytes)} · ${activeLabel(person.backupUpdated)}` : 'Nothing'}</dd></div>}
          </dl>
          {person.note && <p className="ah-person-note"><b>Last moderation note</b>{person.note}</p>}
          <ActionRow icon={Mail} tone="primary" title={`Email ${itsMe ? 'yourself' : first ?? 'them'}`}
            onClick={() => onEmail({ audience: 'people', kind: 'note', people: [{ id: person.id, label: personLabel(person) }] })} />
        </div>
      </section>

      {canModerate && (
        <section className="yd-section">
          <h3 className="yd-heading">Community</h3>
          <div className="yd-card">
            {person.bannedAt || muted ? (
              <ActionRow icon={RotateCcw} tone="primary" disabled={busy} title="Restore"
                text={person.bannedAt ? `Banned since ${day(person.bannedAt)}` : `Muted until ${new Date(person.mutedUntil!).toLocaleString()}`}
                onClick={() => void moderate('restore')} />
            ) : (
              <>
                <ActionRow icon={VolumeX} disabled={busy} title="Mute for 24 hours" onClick={() => void moderate('mute_24h')} />
                <ActionRow icon={VolumeX} disabled={busy} title="Mute for 7 days" onClick={() => void moderate('mute_7d')} />
                {confirm === 'ban' ? (
                  <div className="ah-confirm-row">
                    <p>A ban removes their messages and hides them from the Board and the room. They can ask for a review.</p>
                    <div className="ah-choices">
                      <button type="button" className="ah-btn" onClick={() => setConfirm(null)}>Cancel</button>
                      <button type="button" className="ah-btn is-danger" disabled={busy} onClick={() => void moderate('ban')}>Ban</button>
                    </div>
                  </div>
                ) : <ActionRow icon={Ban} tone="danger" disabled={busy} title="Ban…" onClick={() => setConfirm('ban')} />}
              </>
            )}
            {photo && <ActionRow icon={ImageOff} disabled={busy} title="Remove photo" text="Back to their emoji" onClick={() => void takeDownPhoto()} />}
          </div>
          <p className="yd-note">Muted people can read but not post. Their own plans and focus stay untouched.</p>
        </section>
      )}

      {owner && person.role !== 'owner' && !itsMe && (
        <section className="yd-section">
          <h3 className="yd-heading">Only you</h3>
          <div className="yd-card">
            {!staff && (confirm === 'promote' ? (
              <div className="ah-confirm-row">
                <p>Admins can moderate, run hashtags and quotes, and look people up. They can’t see emails, money or growth, or delete anything.</p>
                <div className="ah-choices">
                  <button type="button" className="ah-btn" onClick={() => setConfirm(null)}>Cancel</button>
                  <button type="button" className="ah-btn is-primary" disabled={busy} onClick={() => void staffChange('promote')}>Make admin</button>
                </div>
              </div>
            ) : <ActionRow icon={Crown} disabled={busy} title="Make admin…" onClick={() => setConfirm('promote')} />)}
            {staff && <ActionRow icon={Crown} disabled={busy} title={person.badgeVisible ? 'Hide their Admin badge' : 'Show their Admin badge'} onClick={() => void staffChange(person.badgeVisible ? 'hide_badge' : 'show_badge')} />}
            {staff && <ActionRow icon={Crown} tone="danger" disabled={busy} title="Remove admin" text="To mute, ban or delete an admin, remove them first" onClick={() => void staffChange('demote')} />}
            {!staff && !person.backer && (confirm === 'delete' ? (
              <div className="ah-confirm-row">
                <p><b className="text-error">Delete {personLabel(person)} for good?</b> Their account and everything saved with it on the server go: cloud backup, Board, rooms they own, messages. Their phone keeps its own copy. This can’t be undone.</p>
                <input className="yd-field mb-2.5" value={typed} onChange={(event) => setTyped(event.target.value)}
                  placeholder={`Type ${person.username ? `@${confirmWord}` : confirmWord}`} aria-label="Type to confirm" autoComplete="off" />
                <div className="ah-choices">
                  <button type="button" className="ah-btn" onClick={() => setConfirm(null)}>Cancel</button>
                  <button type="button" className="ah-btn is-danger" disabled={busy || typed.trim().replace(/^@/, '') !== confirmWord} onClick={() => void remove()}>Delete</button>
                </div>
              </div>
            ) : <ActionRow icon={Trash2} tone="danger" disabled={busy} title="Delete account…" onClick={() => { setConfirm('delete'); setTyped(''); }} />)}
          </div>
        </section>
      )}

      {!owner && (
        <p className="ah-lock mt-1"><Lock size={14} className="mt-0.5 shrink-0" aria-hidden />Only the owner can see emails, change roles or delete accounts.</p>
      )}
      {status && <p role="status" className="ah-status">{status}</p>}
    </div>
  );
}
