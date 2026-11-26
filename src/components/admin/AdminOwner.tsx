import { useEffect, useState } from 'react';
import { BadgeCheck, Check, ChevronRight, Crown, Eraser, Heart, LineChart, Search, type LucideIcon } from 'lucide-react';
import { fetchPeople, formatBytes, personLabel, type AdminPerson, type GrowthReport } from '../../lib/adminHub';
import {
  accountTotals, arrivalsReadout, biggestDrop, cleanupLine, DEFAULT_CLEANUP_FILTERS, deleteChosenAccounts, fetchCleanupList, fetchReleaseDownloads, FREE_DATABASE_BYTES,
  growthFunnel, isCounted, peopleReadout, usualDay, type CleanupFilters, type CleanupKind, type CleanupList, type CleanupSignIn, type Readout, type ReleaseDownloads,
} from '../../lib/adminGrowth';
import { hapticWarn } from '../../lib/haptics';
import SupportSettingsAdmin from '../community/SupportSettingsAdmin';
import type { AdminHubData } from './useAdminHubData';
import type { OwnerPage } from './adminHubShared';
import { LargeTitle, NumberStrip, Segmented } from './AdminUI';

function Cell({ icon: Icon, tone, title, text, value, onClick }: {
  icon: LucideIcon; tone?: 'red' | 'green' | 'amber' | 'grey'; title: string; text?: string; value?: string; onClick: () => void;
}) {
  return (
    <button type="button" className="yd-row" onClick={onClick}>
      <span className={`yd-tile ${tone ? `is-${tone}` : ''}`} aria-hidden><Icon size={16} strokeWidth={2} /></span>
      <span className="yd-row-main"><span className="yd-row-title">{title}</span>{text && <span className="yd-row-text">{text}</span>}</span>
      {value && <span className="ah-value">{value}</span>}
      <ChevronRight size={17} className="ah-chev" aria-hidden />
    </button>
  );
}

const shortDay = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const longDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** One readout per chart: this week until a bar is tapped, then that bar. */
function ReadoutHead({ readout, span, onClear }: { readout: Readout; span: string; onClear: () => void }) {
  return (
    <div aria-live="polite">
      <div className="ah-ro-top">
        <span className="ah-when">{readout.when}</span>
        {readout.picked
          ? <button type="button" className="ah-ro-chip is-clear" onClick={onClear}>✕ This week</button>
          : <span className="ah-ro-chip">{span}</span>}
      </div>
      <p className="ah-big">{readout.value ?? '–'}<em>{readout.unit}</em></p>
      {readout.change && <span className={`ah-cmp is-${readout.change.trend}`}>{readout.change.label}</span>}
      {readout.facts.length > 0 && (
        <div className="ah-facts">
          {readout.facts.map((fact) => (
            <div key={fact.label}><b>{fact.value}</b><span>{fact.key && <i className={`ah-key is-${fact.key}`} aria-hidden />}{fact.label}</span></div>
          ))}
        </div>
      )}
      {readout.note && <p className="ah-note mt-2">{readout.note}</p>}
    </div>
  );
}

/** A stacked bar: the main part (signed in, confirmed) below the rest. */
function Bar({ total, main, peak, flat, tone, label, picked, onClick }: {
  total: number; main: number; peak: number; flat?: boolean; tone: 'is-week' | ''; label: string; picked: boolean; onClick: () => void;
}) {
  const height = flat ? 0 : Math.max(total ? 4 : 0, (total / peak) * 100);
  const mainShare = total ? (main / total) * 100 : 0;
  return (
    <button type="button" className={`ah-bar ${tone} ${picked ? 'is-picked' : ''} ${flat ? 'is-flat' : ''}`} onClick={onClick} aria-label={label} aria-pressed={picked}>
      <span style={{ height: flat ? undefined : `${height}%` }}><i className="is-rest" /><i className="is-main" style={{ height: `${mainShare}%` }} /></span>
    </button>
  );
}

type Chart = 'people' | 'arrivals';

export function GrowthPage({ growth }: { growth: GrowthReport }) {
  const [chart, setChart] = useState<Chart>('people');
  const [day, setDay] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [downloads, setDownloads] = useState<ReleaseDownloads[] | null>(null);
  const [downloadsError, setDownloadsError] = useState('');
  useEffect(() => {
    let live = true;
    fetchReleaseDownloads().then((next) => { if (live) setDownloads(next); })
      .catch((caught) => { if (live) setDownloadsError(caught instanceof Error ? caught.message : 'Could not load downloads.'); });
    return () => { live = false; };
  }, []);

  const { days, weeks, opensSince } = growth;
  const people = peopleReadout(growth, day, longDay);
  const arrivals = arrivalsReadout(growth, week, shortDay);
  const usual = usualDay(days, opensSince);
  const dayPeak = Math.max(1, usual ?? 0, ...days.filter((item) => isCounted(item, opensSince)).map((item) => item.opened));
  const weekPeak = Math.max(1, ...weeks.map((item) => item.signups));
  const steps = growthFunnel(growth);
  const drop = biggestDrop(steps);
  return (
    <div className="ah-page">
      <LargeTitle title="Growth" subtitle={opensSince ? `India time · counting since ${shortDay(opensSince)}` : 'India time · counting starts with v9'} />
      <Segmented<Chart> label="Chart" value={chart} onChange={setChart}
        options={[{ id: 'people', label: 'People using YouDO' }, { id: 'arrivals', label: 'New people' }]} />
      {chart === 'people' ? (
        <div className="yd-card yd-block">
          <ReadoutHead readout={people} span={`last ${days.length} days`} onClear={() => setDay(null)} />
          {days.length > 0 && (
            <>
              <div className="ah-bars is-days">
                {days.map((item, index) => {
                  const counted = isCounted(item, opensSince);
                  return (
                    <Bar key={item.day} total={item.opened} main={item.signedIn} peak={dayPeak} flat={!counted}
                      tone={day === null && index >= days.length - 7 ? 'is-week' : ''} picked={day === index}
                      label={`${longDay(item.day)}: ${counted ? `${item.opened} people` : 'not counted'}`}
                      onClick={() => setDay(day === index ? null : index)} />
                  );
                })}
                {usual !== null && <div className="ah-usual" style={{ bottom: `${(usual / dayPeak) * 100}%` }}><span>usual day {usual}</span></div>}
              </div>
              <div className="ah-axis"><span>{shortDay(days[0].day)}</span><span>{shortDay(days[Math.floor(days.length / 2)].day)}</span><span>today</span></div>
            </>
          )}
          {day === null && <p className="ah-note mt-2">Tap a day to compare it with a usual day.</p>}
        </div>
      ) : (
        <div className="yd-card yd-block">
          <ReadoutHead readout={arrivals} span={`last ${weeks.length} weeks`} onClear={() => setWeek(null)} />
          {weeks.length > 0 && (
            <>
              <div className="ah-bars is-weeks">
                {weeks.map((item, index) => (
                  <Bar key={item.week} total={item.signups} main={item.confirmed} peak={weekPeak}
                    tone={week === null && index === weeks.length - 1 ? 'is-week' : ''} picked={week === index}
                    label={`Week of ${shortDay(item.week)}: ${item.signups} new accounts`}
                    onClick={() => setWeek(week === index ? null : index)} />
                ))}
              </div>
              <div className="ah-axis"><span>{shortDay(weeks[0].week)}</span><span>{shortDay(weeks[Math.floor(weeks.length / 2)].week)}</span><span>this week</span></div>
            </>
          )}
          {week === null && <p className="ah-note mt-2">Tap a week to see it. Deleted accounts still count in the week they signed up.</p>}
        </div>
      )}

      <section className="yd-section mt-5">
        <h3 className="yd-heading">From sign-up to habit</h3>
        <div className="yd-card">
          {steps.map((step) => (
            <div key={step.label} className="yd-row">
              <span className="yd-row-main"><span className="yd-row-title">{step.label}</span></span>
              <span className="ah-value">{step.count}{step.percent !== undefined ? ` · ${step.percent}%` : ''}</span>
            </div>
          ))}
        </div>
        <p className="yd-note">
          {drop ? `Most people stop between “${drop.from.toLowerCase()}” and “${drop.to.toLowerCase()}” (${drop.lost}).` : 'Too few people yet to see where they stop.'}
          {growth.deleted.count > 0 ? ` Includes ${growth.deleted.count} deleted ${growth.deleted.count === 1 ? 'account' : 'accounts'}, so cleanups never change it.` : ''}
        </p>
      </section>

      <section className="yd-section">
        <h3 className="yd-heading">Downloads</h3>
        <div className="yd-card">
          {downloads === null ? <p className="ah-empty !py-5">{downloadsError || 'Asking GitHub…'}</p> : downloads.slice(0, 4).map((release) => (
            <div key={release.version} className="yd-row">
              <span className="yd-row-main"><span className="yd-row-title">v{release.version}{release.publishedAt ? ` · ${shortDay(release.publishedAt)}` : ''}</span></span>
              <span className="ah-value">{release.downloads}</span>
            </div>
          ))}
        </div>
        <p className="yd-note">From GitHub: the website, in-app updates and Orion Store. APKs posted in Telegram aren’t counted. Each update counts again.</p>
      </section>
    </div>
  );
}

const KINDS: { id: CleanupKind; label: string }[] = [{ id: 'both', label: 'Both' }, { id: 'unconfirmed', label: 'Never confirmed' }, { id: 'empty', label: 'Nothing saved' }];
const AGES = [7, 30, 90];
const SIGN_INS: { id: CleanupSignIn; label: string }[] = [{ id: 'any', label: 'any' }, { id: 'never', label: 'never' }, { id: '60', label: '60+ days ago' }, { id: '180', label: '180+ days ago' }];

/** How many accounts there are right now, at the top of Owner → Accounts. */
function AccountTotals({ growth }: { growth: GrowthReport }) {
  return <NumberStrip label="Accounts" items={accountTotals(growth).tiles} />;
}

function Cleanup({ growth, onDone }: { growth: GrowthReport | null; onDone: () => void }) {
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

  // How many there are now, shown straight away and again after a delete (Growth refreshes then).
  const now = growth ? <p className="ah-note mb-3">{growth.accounts} {growth.accounts === 1 ? 'account' : 'accounts'} now · {growth.confirmed} confirmed</p> : null;
  if (error) return <div className="ah-page">{now}<p className="ah-empty">{error}</p></div>;
  if (!list) return <div className="ah-page">{now}<p className="ah-empty">Checking every account…</p></div>;
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
      {now}
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
            <span className="yd-tile" aria-hidden><Crown size={16} /></span>
            <span className="yd-row-main">
              <span className="yd-row-title">{personLabel(person)}</span>
              <span className="yd-row-text">{person.role === 'owner' ? 'Owner' : `Admin · badge ${person.badgeVisible ? 'shown' : 'hidden'}`}</span>
            </span>
            <ChevronRight size={17} className="ah-chev" aria-hidden />
          </button>
        ))}
      </div>
      <p className="yd-note">To add an admin, open them in People and tap Make admin. Ownership changes only in Supabase, so a lost phone can’t hand YouDO to someone else.</p>
    </div>
  );
}

export default function AdminOwner({ data, page, onPage, onOpenPerson, onRefresh }: {
  data: AdminHubData;
  page: OwnerPage | null;
  onPage: (page: OwnerPage) => void;
  onOpenPerson: (id: string) => void;
  onRefresh: () => Promise<void>;
}) {
  if (page === 'cleanup') return <Cleanup growth={data.growth} onDone={() => void onRefresh()} />;
  if (page === 'staff') return <Staff onOpenPerson={onOpenPerson} />;
  if (page === 'support') return <div className="ah-page"><SupportSettingsAdmin /></div>;
  if (page === 'growth') return data.growth ? <GrowthPage growth={data.growth} /> : <p className="ah-empty">{data.growthError || 'Loading the numbers…'}</p>;

  const growth = data.growth;
  const cleanup = growth ? growth.cleanup.unconfirmed + growth.cleanup.empty : 0;
  const used = growth ? Math.min(100, (growth.databaseBytes / FREE_DATABASE_BYTES) * 100) : 0;
  const week = growth ? peopleReadout(growth, null, longDay) : null;
  const lastDays = growth ? growth.days.slice(-7) : [];
  const sparkPeak = Math.max(1, ...lastDays.map((item) => item.opened));
  return (
    <div className="ah-page">
      <LargeTitle title="Owner" subtitle="Only you see this" />
      {!growth ? <p className="ah-empty">{data.growthError || 'Loading the numbers…'}</p> : (
        <div className="yd-card">
          <div>
          <div className="ah-headline">
            <b>{week?.value ?? '–'}</b><span>{week?.unit ?? ''} this week</span>
            {week?.change && <em className={`is-${week.change.trend}`}>{week.change.label}</em>}
          </div>
          {lastDays.length > 0 && (
            <div className="ah-spark" aria-hidden>
              {lastDays.map((item, index) => <i key={item.day} className={index === lastDays.length - 1 ? 'is-now' : undefined} style={{ height: `${Math.max(4, (item.opened / sparkPeak) * 100)}%` }} />)}
            </div>
          )}
          </div>
          <Cell icon={LineChart} tone="green" title="Growth" value="Charts and funnel" onClick={() => onPage('growth')} />
        </div>
      )}
      <section className="yd-section mt-5">
        <h3 className="yd-heading">Accounts</h3>
        <div className="yd-card">
          {growth && <AccountTotals growth={growth} />}
          <Cell icon={Eraser} tone="grey" title="Account cleanup" value={growth ? (cleanup ? `${cleanup} to look at` : 'Nothing to clean') : undefined} onClick={() => onPage('cleanup')} />
          <Cell icon={Crown} title="Staff" value="You and your admins" onClick={() => onPage('staff')} />
        </div>
      </section>
      <section className="yd-section">
        <h3 className="yd-heading">Money</h3>
        <div className="yd-card">
          <Cell icon={BadgeCheck} tone="red" title="Backers" value={data.pendingBackers ? `${data.pendingBackers} ${data.pendingBackers === 1 ? 'claim' : 'claims'} waiting` : undefined}
            text={data.pendingBackers ? undefined : 'Who backed YouDO, thank-yous'} onClick={() => onPage('backers')} />
          <Cell icon={Heart} tone="green" title="Support YouDO" text="UPI ID, QR code and claims" onClick={() => onPage('support')} />
        </div>
      </section>
      {growth && (
        <section className="yd-section">
          <h3 className="yd-heading">Server</h3>
          <div className="yd-card yd-block">
            <div className="flex items-center justify-between gap-3"><span className="yd-row-title">Database</span><span className="ah-value">{formatBytes(growth.databaseBytes)} of 500 MB</span></div>
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
