import { useEffect, useState } from 'react';
import { BadgeCheck, Check, ChevronRight, Crown, Database, Heart, Search } from 'lucide-react';
import { fetchPeople, formatBytes, personLabel, type AdminPerson, type GrowthReport } from '../../lib/adminHub';
import {
  biggestDrop, cleanupLine, DAY_METRICS, dayDetail, DEFAULT_CLEANUP_FILTERS, deleteChosenAccounts, fetchCleanupList, fetchReleaseDownloads,
  growthFunnel, weekChange, type CleanupFilters, type CleanupKind, type CleanupList, type CleanupSignIn, type DayMetric, type ReleaseDownloads,
} from '../../lib/adminGrowth';
import { hapticWarn } from '../../lib/haptics';
import SupportSettingsAdmin from '../community/SupportSettingsAdmin';
import type { AdminHubData } from './useAdminHubData';
import type { OwnerPage } from './adminHubShared';

/** Supabase's free plan: the bar shows how much of it is used. */
const FREE_DATABASE_BYTES = 500 * 1024 * 1024;
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const longDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function Trend({ now, before }: { now: number; before: number }) {
  const change = weekChange(now, before);
  return <small className={`ah-trend is-${change.trend}`}>{change.trend === 'same' ? 'same as last week' : `${change.label} on last week`}</small>;
}

function Growth({ growth }: { growth: GrowthReport }) {
  const [metric, setMetric] = useState<DayMetric>('opened');
  const [picked, setPicked] = useState(growth.days.length - 1);
  const [downloads, setDownloads] = useState<ReleaseDownloads[] | null>(null);
  const [downloadsError, setDownloadsError] = useState('');
  useEffect(() => {
    let live = true;
    fetchReleaseDownloads().then((next) => { if (live) setDownloads(next); })
      .catch((caught) => { if (live) setDownloadsError(caught instanceof Error ? caught.message : 'Could not load downloads.'); });
    return () => { live = false; };
  }, []);

  const counting = Boolean(growth.opensSince);
  const { thisWeek, lastWeek } = growth;
  const values = growth.days.map((day) => day[metric]);
  const peak = Math.max(1, ...values);
  const day = growth.days[picked] ?? growth.days[growth.days.length - 1];
  const steps = growthFunnel(growth);
  const drop = biggestDrop(steps);
  const first = steps[0]?.count || 1;
  return (
    <>
      <h3 className="yd-heading">This week</h3>
      <div className="ah-tiles">
        <div className="ah-tile"><strong>{counting ? thisWeek.opened : '–'}</strong><span>Opened YouDO</span>{counting ? <Trend now={thisWeek.opened} before={lastWeek.opened} /> : <small>counting starts with v9</small>}</div>
        <div className="ah-tile"><strong>{thisWeek.newAccounts}</strong><span>New accounts</span><Trend now={thisWeek.newAccounts} before={lastWeek.newAccounts} /></div>
        <div className="ah-tile"><strong>{counting ? thisWeek.withoutAccount : '–'}</strong><span>Without an account</span><small>phones, no sign-in</small></div>
        <div className="ah-tile"><strong>{counting ? thisWeek.regulars : '–'}</strong><span>Regulars</span>{counting ? <Trend now={thisWeek.regulars} before={lastWeek.regulars} /> : <small>opened it on 3+ days</small>}</div>
      </div>

      {growth.days.length > 0 && day && (
        <div className="yd-card yd-block">
          <div className="flex items-baseline justify-between"><p className="yd-row-title">Every day</p><span className="ah-note">last {growth.days.length} days</span></div>
          <div className="ah-seg" role="group" aria-label="Show">
            {DAY_METRICS.map((item) => (
              <button key={item.id} type="button" aria-pressed={metric === item.id} onClick={() => setMetric(item.id)}>{item.label}</button>
            ))}
          </div>
          <div className="ah-day-tip" aria-live="polite">
            <b>{longDay(day.day)}</b>
            {dayDetail(day).map((line) => <span key={line}>{line}</span>)}
          </div>
          <div className="ah-days">
            {growth.days.map((item, index) => (
              <button key={item.day} type="button" className={index === picked ? 'is-picked' : ''} onClick={() => setPicked(index)}
                aria-label={`${longDay(item.day)}: ${item[metric]}`} aria-pressed={index === picked}>
                <i style={{ height: `${Math.max(3, (item[metric] / peak) * 100)}%` }} />
              </button>
            ))}
          </div>
          <div className="ah-axis"><span>{shortDay(growth.days[0].day)}</span><span>{shortDay(growth.days[Math.floor(growth.days.length / 2)].day)}</span><span>today</span></div>
          <p className="ah-note mt-2">
            {metric === 'opened' ? (counting ? `Each phone counts once a day, from ${shortDay(growth.opensSince ?? '')}. Tap a day to see it.` : 'Counting starts once people install v9. Tap a day to see it.')
              : metric === 'studied' ? 'Board members who ran a focus session that day. Tap a day to see it.'
                : 'Sign-ups that day, deleted accounts included. Tap a day to see it.'}
          </p>
        </div>
      )}

      <div className="yd-card yd-block mt-3">
        <p className="yd-row-title">From sign-up to habit</p>
        <div className="ah-funnel">
          {steps.map((step) => (
            <div key={step.label}>
              <div className="ah-funnel-top"><span>{step.label}</span><span>{step.count}{step.percent !== undefined && <em> · {step.percent}%</em>}</span></div>
              <div className="ah-meter"><i style={{ width: `${Math.max(1, (step.count / first) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
        <p className="ah-note mt-2">
          {drop ? `Most people stop between “${drop.from.toLowerCase()}” and “${drop.to.toLowerCase()}” (${drop.lost}).` : 'Too few people yet to see where they stop.'}
          {growth.deleted.count > 0 ? ` Includes ${growth.deleted.count} deleted ${growth.deleted.count === 1 ? 'account' : 'accounts'}, so cleanups never change it.` : ''}
        </p>
      </div>

      <div className="yd-card yd-block mt-3">
        <p className="yd-row-title">Downloads</p>
        {downloads === null ? <p className="ah-note mt-2">{downloadsError || 'Asking GitHub…'}</p> : (
          <div className="ah-list">
            {downloads.slice(0, 4).map((release) => (
              <div key={release.version}><span>v{release.version}{release.publishedAt ? ` · ${shortDay(release.publishedAt)}` : ''}</span><b>{release.downloads}</b></div>
            ))}
          </div>
        )}
        <p className="ah-note mt-2">From GitHub: the website, in-app updates and Orion Store. APKs posted in Telegram aren’t counted (Telegram shows views on the post). Each update counts again.</p>
      </div>
    </>
  );
}

const KINDS: { id: CleanupKind; label: string }[] = [{ id: 'both', label: 'Both' }, { id: 'unconfirmed', label: 'Never confirmed' }, { id: 'empty', label: 'Nothing saved' }];
const AGES = [7, 30, 90];
const SIGN_INS: { id: CleanupSignIn; label: string }[] = [{ id: 'any', label: 'any' }, { id: 'never', label: 'never' }, { id: '60', label: '60+ days ago' }, { id: '180', label: '180+ days ago' }];

function Cleanup({ onDone }: { onDone: () => void }) {
  const [filters, setFilters] = useState<CleanupFilters>(DEFAULT_CLEANUP_FILTERS);
  const [search, setSearch] = useState('');
  const [list, setList] = useState<CleanupList | null>(null);
  const [error, setError] = useState('');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => (current.search === search ? current : { ...current, search })), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let live = true;
    fetchCleanupList(filters)
      .then((next) => {
        if (!live) return;
        setList(next); setError('');
        setTicked((current) => new Set(next.accounts.filter((account) => current.has(account.id)).map((account) => account.id)));
      })
      .catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : 'Could not load the list.'); });
    return () => { live = false; };
  }, [filters, reload]);

  if (error) return <p className="ah-empty">{error}</p>;
  if (!list) return <p className="ah-empty">Checking every account…</p>;
  const set = (change: Partial<CleanupFilters>) => setFilters((current) => ({ ...current, ...change }));
  const toggle = (id: string) => setTicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allTicked = list.accounts.length > 0 && list.accounts.every((account) => ticked.has(account.id));
  const count = ticked.size;
  const word = `DELETE ${count}`;

  const run = async () => {
    setBusy(true); setStatus('');
    try {
      const result = await deleteChosenAccounts([...ticked]);
      hapticWarn();
      setStatus(`${result.deleted} ${result.deleted === 1 ? 'account' : 'accounts'} deleted.${result.skipped ? ` ${result.skipped} no longer qualified and stayed.` : ''}`);
      setTicked(new Set()); setTyped('');
      onDone();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Nothing was deleted.');
    }
    setReload((value) => value + 1);
    setBusy(false);
  };

  return (
    <div className="ah-page">
      <p className="ah-label">Which accounts</p>
      <div className="ah-chips">
        {KINDS.map((kind) => (
          <button key={kind.id} type="button" className="ah-chip" aria-pressed={filters.kind === kind.id} onClick={() => set({ kind: kind.id })}>
            {kind.label}{kind.id === 'unconfirmed' ? ` · ${list.unconfirmed}` : kind.id === 'empty' ? ` · ${list.empty}` : ` · ${list.unconfirmed + list.empty}`}
          </button>
        ))}
      </div>
      <p className="ah-label">Signed up</p>
      <div className="ah-chips">
        {AGES.map((days) => (
          <button key={days} type="button" className="ah-chip" aria-pressed={filters.signedUpDays === days} onClick={() => set({ signedUpDays: days })}>over {days} days ago</button>
        ))}
      </div>
      <p className="ah-label">Last sign-in</p>
      <div className="ah-chips">
        {SIGN_INS.map((item) => (
          <button key={item.id} type="button" className="ah-chip" aria-pressed={filters.signIn === item.id} onClick={() => set({ signIn: item.id })}>{item.label}</button>
        ))}
      </div>
      <label className="ah-search">
        <Search size={15} aria-hidden />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email or @username" aria-label="Search accounts" />
      </label>

      {list.accounts.length === 0 ? <p className="ah-empty">{list.unconfirmed + list.empty ? 'Nothing matches these filters.' : 'Nothing to clean up.'}</p> : (
        <>
          <div className="ah-tickbar">
            <span><b>{count}</b> of {list.matching} ticked</span>
            <button type="button" onClick={() => setTicked(allTicked ? new Set() : new Set(list.accounts.map((account) => account.id)))}>
              {allTicked ? 'Untick all' : `Tick all ${list.accounts.length}`}
            </button>
          </div>
          <div className="yd-card">
            {list.accounts.map((account) => (
              <button key={account.id} type="button" className="yd-row !min-h-[56px] !items-start" role="checkbox" aria-checked={ticked.has(account.id)} onClick={() => toggle(account.id)}>
                <span className={`ah-tick ${ticked.has(account.id) ? 'is-on' : ''}`} aria-hidden>{ticked.has(account.id) && <Check size={13} strokeWidth={3} />}</span>
                <span className="yd-row-main">
                  <span className="yd-row-title !text-[13.5px] break-all">{account.email ?? (account.username ? `@${account.username}` : 'No email')}</span>
                  <span className="yd-row-text">{cleanupLine(account, shortDay)}</span>
                </span>
              </button>
            ))}
          </div>
          {list.matching > list.accounts.length && <p className="ah-note mt-2">Showing the newest {list.accounts.length}. Narrow the filters to see the rest.</p>}
        </>
      )}

      <p className="yd-note">Never listed: anyone with saved data, staff, backers and you. Deleting removes the account and everything linked to it: backup and its copies, Board row, hashtag, friends, messages, rooms and photo. The activity log keeps its lines without the name, and Growth keeps them as anonymous counts.</p>
      {count > 0 && (
        <div className="ah-danger">
          <h4>Delete {count} {count === 1 ? 'account' : 'accounts'} for good?</h4>
          <p>Each is checked again at the moment of deleting; one that no longer qualifies stays. This can’t be undone.</p>
          <input className="yd-field mt-3" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={`Type ${word}`} aria-label="Type to confirm" autoComplete="off" />
          <button type="button" className="ah-btn is-danger is-wide mt-3 w-full" disabled={busy || typed.trim().toUpperCase() !== word} onClick={() => void run()}>
            {busy ? 'Deleting…' : `Delete ${count}`}
          </button>
        </div>
      )}
      {status && <p role="status" className="ah-status">{status}</p>}
    </div>
  );
}

function Staff({ onOpenPerson }: { onOpenPerson: (id: string) => void }) {
  const [staff, setStaff] = useState<AdminPerson[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchPeople('', 'staff', 0, 50).then((page) => setStaff(page.people)).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load staff.'));
  }, []);
  if (error) return <p className="ah-empty">{error}</p>;
  if (!staff) return <p className="ah-empty">Loading…</p>;
  return (
    <div className="ah-page">
      <div className="yd-card">
        {staff.map((person) => (
          <button key={person.id} type="button" className="yd-row" onClick={() => onOpenPerson(person.id)}>
            <span className="yd-tile" aria-hidden><Crown size={18} /></span>
            <span className="yd-row-main">
              <span className="yd-row-title">{personLabel(person)}</span>
              <span className="yd-row-text">{person.role === 'owner' ? 'Owner' : `Admin · badge ${person.badgeVisible ? 'shown' : 'hidden'}`}</span>
            </span>
            <ChevronRight size={17} className="text-content-muted" aria-hidden />
          </button>
        ))}
      </div>
      <p className="yd-note">To add an admin, open them in People and tap Make admin. Ownership changes only in Supabase, so a lost phone can’t hand YouDO to someone else.</p>
    </div>
  );
}

export default function AdminOwner({ data, page, onPage, onOpenPerson, onOpenBackers, onRefresh }: {
  data: AdminHubData;
  page: OwnerPage | null;
  onPage: (page: OwnerPage) => void;
  onOpenPerson: (id: string) => void;
  onOpenBackers: () => void;
  onRefresh: () => Promise<void>;
}) {
  if (page === 'cleanup') return <Cleanup onDone={() => void onRefresh()} />;
  if (page === 'staff') return <Staff onOpenPerson={onOpenPerson} />;
  if (page === 'support') return <div className="ah-page"><SupportSettingsAdmin /></div>;

  const growth = data.growth;
  const cleanup = growth ? growth.cleanup.unconfirmed + growth.cleanup.empty : 0;
  const used = growth ? Math.min(100, (growth.databaseBytes / FREE_DATABASE_BYTES) * 100) : 0;
  return (
    <div className="ah-page">
      {growth ? <Growth growth={growth} /> : <p className="ah-empty">{data.growthError || 'Loading the numbers…'}</p>}
      <section className="yd-section mt-4">
        <h3 className="yd-heading">Accounts</h3>
        <div className="yd-card">
          <button type="button" className="yd-row" onClick={() => onPage('cleanup')}>
            <span className="yd-tile" aria-hidden><Database size={18} /></span>
            <span className="yd-row-main"><span className="yd-row-title">Account cleanup</span>
              <span className={`yd-row-text ${cleanup ? 'is-on' : ''}`}>{growth ? (cleanup ? `${cleanup} unconfirmed or empty` : 'Nothing to clean up') : 'Unconfirmed and empty accounts'}</span></span>
            <ChevronRight size={17} className="text-content-muted" aria-hidden />
          </button>
          <button type="button" className="yd-row" onClick={() => onPage('staff')}>
            <span className="yd-tile" aria-hidden><Crown size={18} /></span>
            <span className="yd-row-main"><span className="yd-row-title">Staff</span><span className="yd-row-text">You and your admins</span></span>
            <ChevronRight size={17} className="text-content-muted" aria-hidden />
          </button>
        </div>
      </section>
      <section className="yd-section">
        <h3 className="yd-heading">Money</h3>
        <div className="yd-card">
          <button type="button" className="yd-row" onClick={() => onPage('support')}>
            <span className="yd-tile" aria-hidden><Heart size={18} /></span>
            <span className="yd-row-main"><span className="yd-row-title">Support YouDO</span><span className="yd-row-text">UPI ID, QR code and claims</span></span>
            <ChevronRight size={17} className="text-content-muted" aria-hidden />
          </button>
          <button type="button" className="yd-row" onClick={onOpenBackers}>
            <span className="yd-tile" aria-hidden><BadgeCheck size={18} /></span>
            <span className="yd-row-main"><span className="yd-row-title">Backer claims</span>
              <span className={`yd-row-text ${data.pendingBackers ? 'is-on' : ''}`}>{data.pendingBackers ? `${data.pendingBackers} waiting` : 'None waiting'}</span></span>
            <ChevronRight size={17} className="text-content-muted" aria-hidden />
          </button>
        </div>
      </section>
      {growth && (
        <section className="yd-section">
          <h3 className="yd-heading">Server</h3>
          <div className="yd-card yd-block">
            <p className="yd-row-title">Database · {formatBytes(growth.databaseBytes)} of 500 MB</p>
            <div className="ah-meter"><i style={{ width: `${Math.max(1, used)}%` }} /></div>
            {growth.largestTables.length > 0 && (
              <p className="ah-note mt-2">Largest: {growth.largestTables.slice(0, 3).map((table) => `${table.name.replace(/_/g, ' ')} ${formatBytes(table.bytes)}`).join(' · ')}</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
