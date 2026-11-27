import { useState } from 'react';
import { BadgeCheck, ChevronRight, MoreHorizontal } from 'lucide-react';
import {
  dismissCommunityReport, moderateCommunityMember, removeCommunityMessage, reviewCommunityAppeal,
  type CommunityAppeal,
} from '../../lib/community';
import { hapticSuccess, hapticWarn } from '../../lib/haptics';
import { can } from '../../lib/adminHub';
import CommunityHashtagAdmin from '../community/CommunityHashtagAdmin';
import type { AdminHubData } from './useAdminHubData';
import { queueCounts, type QueueFilter } from './adminHubShared';
import { AllCaughtUp, LargeTitle, Segmented } from './AdminUI';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Inbox (was Queue): everything that waits for a decision, one card each with two clear choices. */
export default function AdminQueue({ data, filter, onFilter, onRefresh, onOpenBackers, onOpenPerson }: {
  data: AdminHubData;
  filter: QueueFilter;
  onFilter: (next: QueueFilter) => void;
  onRefresh: () => Promise<void>;
  onOpenBackers: () => void;
  onOpenPerson: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [more, setMore] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const counts = queueCounts(data);
  const owner = can(data.role, 'money');
  const parts: [QueueFilter, string, number][] = [
    ['reports', 'Reports', counts.reports], ['hashtags', 'Requests', counts.hashtags], ['appeals', 'Appeals', counts.appeals],
    ...(owner ? [['backers', 'Claims', counts.backers] as [QueueFilter, string, number]] : []),
  ];
  // Only the kinds that have something waiting get a segment; a picked kind that empties falls back to All.
  const options = [{ id: 'all' as QueueFilter, label: `All ${counts.all}` }, ...parts.filter(([, , count]) => count > 0).map(([id, label, count]) => ({ id, label: `${label} ${count}` }))];
  const current = options.some((option) => option.id === filter) ? filter : 'all';
  const show = (part: QueueFilter) => current === 'all' || current === part;
  const nameOf = (id?: string) => (id && data.names.get(id)) || 'A member';

  const run = async (work: () => Promise<boolean>, done: string, failed: string, warn = false) => {
    setBusy(true); setStatus('');
    const ok = await work().catch(() => false);
    if (ok) { if (warn) hapticWarn(); else hapticSuccess(); }
    setStatus(ok ? done : failed);
    setConfirmBan(null); setMore(null);
    await onRefresh();
    setBusy(false);
  };

  const reviewAppeal = (appeal: CommunityAppeal, decision: 'approve' | 'decline') => run(async () => {
    const response = note.trim() || (decision === 'approve' ? 'Your community access has been restored.' : '');
    const result = await reviewCommunityAppeal(appeal.id, decision, response);
    if (result.ok) { setReviewing(null); setNote(''); }
    return result.ok;
  }, decision === 'approve' ? 'Restored.' : 'Declined with your note.', 'Could not review the appeal.');

  return (
    <div className="ah-page">
      <LargeTitle title="Inbox" subtitle={counts.all ? `${counts.all} waiting` : 'Nothing waiting'} />
      {counts.all > 0 && options.length > 2 && <Segmented label="Show" options={options} value={current} onChange={onFilter} />}

      {counts.all === 0 && <AllCaughtUp text="Reports, hashtag requests, appeals and backer claims land here." />}

      {show('reports') && data.reports.map((report) => {
        if (data.reports.findIndex((item) => item.messageId === report.messageId) !== data.reports.indexOf(report)) return null;
        const message = data.reportMessages.find((item) => item.id === report.messageId);
        const room = message?.roomId ? `#${data.hashtags.find((tag) => tag.id === message.roomId)?.label ?? 'archived room'}` : 'General';
        const times = data.reports.filter((item) => item.messageId === report.messageId).length;
        const closeAll = async () => {
          let ok = true;
          for (const item of data.reports.filter((entry) => entry.messageId === report.messageId)) ok = (await dismissCommunityReport(item.id)) && ok;
          return ok;
        };
        return (
          <article key={report.id} className="yd-card ah-item">
            <div className="ah-item-top"><span>{times > 1 ? `Reported ${times} times` : 'Reported'} · {room} · {when(report.createdAt)}</span><b>{report.reason}</b></div>
            <p className="ah-quote">{message ? `“${message.body}”` : 'The message is no longer there.'}</p>
            {message && <p className="ah-note mb-2.5">By <button type="button" className="font-semibold text-primary" onClick={() => onOpenPerson(message.authorId)}>{nameOf(message.authorId)}</button></p>}
            <div className="ah-choices">
              {message && <button type="button" className="ah-btn is-danger" disabled={busy}
                onClick={() => void run(async () => { const removed = await removeCommunityMessage(message.id, 'Reported message'); await closeAll(); return removed; }, 'Message removed.', 'Could not remove it.', true)}>Remove</button>}
              <button type="button" className="ah-btn" disabled={busy} onClick={() => void run(closeAll, 'Kept. Report closed.', 'Could not close the report.')}>Keep</button>
              {message && <button type="button" className="ah-btn ah-more" aria-label="More choices" aria-expanded={more === report.id} onClick={() => { setMore(more === report.id ? null : report.id); setConfirmBan(null); }}><MoreHorizontal size={17} /></button>}
            </div>
            {message && more === report.id && (
              <div className="ah-choices ah-more-list">
                <button type="button" className="ah-btn" disabled={busy}
                  onClick={() => void run(async () => { const removed = await removeCommunityMessage(message.id, 'Reported message'); await closeAll(); return removed && await moderateCommunityMember(message.authorId, 'mute_7d', 'Reported message'); }, 'Removed, and muted for 7 days.', 'Could not finish that.', true)}>Remove + mute 7 days</button>
                {confirmBan === report.id
                  ? <button type="button" className="ah-btn is-danger" disabled={busy} onClick={() => void run(() => moderateCommunityMember(message.authorId, 'ban', 'Reported message'), 'Banned. Their messages are gone.', 'Could not ban.', true)}>Confirm ban</button>
                  : <button type="button" className="ah-btn is-danger" disabled={busy} onClick={() => setConfirmBan(report.id)}>Ban…</button>}
              </div>
            )}
          </article>
        );
      })}

      {show('appeals') && data.appeals.map((appeal) => (
        <article key={appeal.id} className="yd-card ah-item">
          <div className="ah-item-top">
            <span>Appeal · <button type="button" className="font-semibold text-primary" onClick={() => onOpenPerson(appeal.userId)}>{nameOf(appeal.userId)}</button></span>
            <span>{when(appeal.createdAt)}</span>
          </div>
          <p className="ah-quote">“{appeal.message}”</p>
          {reviewing === appeal.id && (
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={600} rows={3}
              placeholder="A private note to them (needed to decline)" className="yd-field mb-2.5 !h-auto py-2.5" />
          )}
          <div className="ah-choices">
            {reviewing === appeal.id
              ? <button type="button" className="ah-btn is-danger" disabled={busy || note.trim().length < 5} onClick={() => void reviewAppeal(appeal, 'decline')}>Decline with note</button>
              : <button type="button" className="ah-btn" onClick={() => { setReviewing(appeal.id); setNote(''); }}>Decline…</button>}
            <button type="button" className="ah-btn is-primary" disabled={busy} onClick={() => void reviewAppeal(appeal, 'approve')}>Restore</button>
          </div>
        </article>
      ))}

      {show('hashtags') && data.hashtagRequests.length > 0 && (
        <section className="yd-section mt-1">
          {current === 'all' && <h3 className="yd-heading">Hashtag requests</h3>}
          <CommunityHashtagAdmin requests={data.hashtagRequests} names={data.names} busy={busy} onRefresh={onRefresh} />
        </section>
      )}

      {show('backers') && counts.backers > 0 && (
        <section className="yd-section">
          {current === 'all' && <h3 className="yd-heading">Backer claims</h3>}
          <div className="yd-card">
            <button type="button" className="yd-row" onClick={onOpenBackers}>
              <span className="yd-tile" aria-hidden><BadgeCheck size={16} /></span>
              <span className="yd-row-main">
                <span className="yd-row-title">{counts.backers} {counts.backers === 1 ? 'claim' : 'claims'} to check</span>
                <span className="yd-row-text">Match each one against your UPI app</span>
              </span>
              <ChevronRight size={17} className="ah-chev" aria-hidden />
            </button>
          </div>
        </section>
      )}

      {status && <p role="status" className="ah-status">{status}</p>}
    </div>
  );
}
