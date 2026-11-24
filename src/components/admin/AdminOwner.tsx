import { useEffect, useState } from 'react';
import { BadgeCheck, ChevronRight, Crown, Database, Heart } from 'lucide-react';
import {
  deleteAccounts, fetchCleanupPreview, fetchPeople, formatBytes, personLabel, returnRate,
  type AdminPerson, type CleanupPreview, type GrowthReport,
} from '../../lib/adminHub';
import { hapticWarn } from '../../lib/haptics';
import SupportSettingsAdmin from '../community/SupportSettingsAdmin';
import type { AdminHubData } from './useAdminHubData';
import type { OwnerPage } from './adminHubShared';

/** Supabase's free plan: the bar shows how much of it is used. */
const FREE_DATABASE_BYTES = 500 * 1024 * 1024;
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function GrowthCard({ growth }: { growth: GrowthReport }) {
  const peak = Math.max(1, ...growth.weeks.map((week) => week.signups));
  const since = returnRate(growth.sinceV8);
  const before = returnRate(growth.beforeV8);
  const v8Index = growth.weeks.findIndex((week) => week.week >= '2026-10-12');
  return (
    <div className="yd-card yd-block">
      <div className="flex items-baseline justify-between"><p className="yd-row-title">Sign-ups per week</p><span className="ah-note">last {growth.weeks.length} weeks</span></div>
      <div className="ah-bars" role="img" aria-label={`Sign-ups per week: ${growth.weeks.map((week) => week.signups).join(', ')}`}>
        {growth.weeks.map((week, index) => (
          <i key={week.week} className={index === growth.weeks.length - 1 ? 'is-now' : ''} style={{ height: `${Math.max(3, (week.signups / peak) * 100)}%` }} title={`${shortDay(week.week)}: ${week.signups}`} />
        ))}
      </div>
      <div className="ah-axis"><span>{growth.weeks[0] ? shortDay(growth.weeks[0].week) : ''}</span>{v8Index > 0 && <span>v8 · 14 Oct</span>}<span>this week</span></div>
      <p className="ah-note mt-3">
        {since === null
          ? 'Too few people have started since v8 to say how many come back.'
          : <>Of those who started since v8, <b className="text-content-primary">{since}%</b> came back after their first day{before !== null ? ` (${before}% before v8)` : ''}. Above 20–25% is worth pushing hard.</>}
      </p>
      <div className="ah-facts !px-0 !pb-0">
        <div><span>Accounts</span>{growth.accounts} · {growth.confirmed} confirmed</div>
        <div><span>Started using it</span>{growth.started}</div>
        <div><span>Active in 7 days</span>{growth.active7d}</div>
        <div><span>Active in 30 days</span>{growth.active30d}</div>
      </div>
    </div>
  );
}

function Cleanup({ onDone }: { onDone: () => void }) {
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const load = () => fetchCleanupPreview().then((next) => { setPreview(next); setError(''); })
    .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load the list.'));
  useEffect(() => { void load(); }, []);

  if (error) return <p className="ah-empty">{error}</p>;
  if (!preview) return <p className="ah-empty">Checking every account…</p>;
  const total = preview.unconfirmed + preview.empty;
  const word = `DELETE ${total}`;

  const run = async () => {
    setBusy(true); setStatus('');
    try {
      const deleted = await deleteAccounts({ mode: 'all', expectedCount: total });
      hapticWarn();
      setStatus(`${deleted} ${deleted === 1 ? 'account' : 'accounts'} deleted.`);
      setTyped('');
      await load();
      onDone();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Nothing was deleted.');
      await load();
    }
    setBusy(false);
  };

  return (
    <div className="ah-page">
      <div className="yd-card">
        <div className="yd-row"><span className="yd-row-main"><span className="yd-row-title">Never confirmed, over 7 days old</span></span><b className="text-content-primary">{preview.unconfirmed}</b></div>
        <div className="yd-row"><span className="yd-row-main"><span className="yd-row-title">Nothing saved, quiet 60+ days</span><span className="yd-row-text">No backup, Board, rooms, friends or messages</span></span><b className="text-content-primary">{preview.empty}</b></div>
      </div>
      <p className="yd-note">Never included: anyone with saved data, staff, backers and you. YouDO works offline, so an account that holds data stays even when it’s quiet.</p>
      {total > 0 && (
        <>
          <h3 className="yd-heading mt-4">Newest first</h3>
          <div className="yd-card">
            {preview.sample.slice(0, 8).map((item, index) => (
              <div key={`${item.createdAt}-${index}`} className="yd-row !min-h-[52px]">
                <span className="yd-row-main">
                  <span className="yd-row-title !text-[13.5px]">Signed up {shortDay(item.createdAt)}</span>
                  <span className="yd-row-text">{item.reason === 'unconfirmed' ? 'never confirmed' : `confirmed · nothing saved · ${item.lastActive ? `last seen ${shortDay(item.lastActive)}` : 'never seen again'}`}</span>
                </span>
              </div>
            ))}
            {total > 8 && <div className="yd-row !min-h-[44px] justify-center"><span className="ah-note">+ {total - 8} more</span></div>}
          </div>
          <div className="ah-danger">
            <h4>Delete {total} {total === 1 ? 'account' : 'accounts'} for good?</h4>
            <p>The rules are checked again at the moment of deleting; if the list changed, nothing goes and it reloads. This can’t be undone.</p>
            <input className="yd-field mt-3" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={`Type ${word}`} aria-label="Type to confirm" autoComplete="off" />
            <button type="button" className="ah-btn is-danger is-wide mt-3 w-full" disabled={busy || typed.trim().toUpperCase() !== word} onClick={() => void run()}>
              {busy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </>
      )}
      {total === 0 && <p className="ah-empty">Nothing to clean up.</p>}
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
      {growth ? <GrowthCard growth={growth} /> : <p className="ah-empty">{data.growthError || 'Loading the numbers…'}</p>}
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
