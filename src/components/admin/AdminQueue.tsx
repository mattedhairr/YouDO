import { useState } from 'react';
import { BadgeCheck, ChevronRight } from 'lucide-react';
import {
  dismissCommunityReport, moderateCommunityMember, removeCommunityMessage, reviewCommunityAppeal,
  type CommunityAppeal,
} from '../../lib/community';
import { hapticSuccess, hapticWarn } from '../../lib/haptics';
import { can } from '../../lib/adminHub';
import CommunityHashtagAdmin from '../community/CommunityHashtagAdmin';
import type { AdminHubData } from './useAdminHubData';
import { queueCounts, type QueueFilter } from './adminHubShared';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

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
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const counts = queueCounts(data);
  const show = (part: QueueFilter) => filter === 'all' || filter === part;
  const nameOf = (id?: string) => (id && data.names.get(id)) || 'A member';

  const run = async (work: () => Promise<boolean>, done: string, failed: string, warn = false) => {
    setBusy(true); setStatus('');
    const ok = await work().catch(() => false);
    if (ok) { if (warn) hapticWarn(); else hapticSuccess(); }
    setStatus(ok ? done : failed);
    setConfirmBan(null);
    await onRefresh();
    setBusy(false);
  };

  const reviewAppeal = (appeal: CommunityAppeal, decision: 'approve' | 'decline') => run(async () => {
    const response = note.trim() || (decision === 'approve' ? 'Your community access has been restored.' : '');
    const result = await reviewCommunityAppeal(appeal.id, decision, response);
    if (result.ok) { setReviewing(null); setNote(''); }
    return result.ok;
  }, decision === 'approve' ? 'Restored.' : 'Declined with your note.', 'Could not review the appeal.');

  const chips: [QueueFilter, string, number][] = [
    ['all', 'All', counts.all], ['reports', 'Reports', counts.reports], ['hashtags', 'Hashtags', counts.hashtags],
    ['appeals', 'Appeals', counts.appeals],
    ...(can(data.role, 'money') ? [['backers', 'Backers', counts.backers] as [QueueFilter, string, number]] : []),
  ];

  return (
    <div className="ah-page">
      <div className="ah-chips" role="group" aria-label="Show">
        {chips.map(([key, label, count]) => (
          <button key={key} type="button" className="ah-chip" aria-pressed={filter === key} onClick={() => onFilter(key)}>
            {label} {count}
          </button>
        ))}
      </div>

      {counts.all === 0 && <p className="ah-empty">Nothing waiting. Nice and quiet.</p>}

      {show('reports') && data.reports.map((report) => {
        const message = data.reportMessages.find((item) => item.id === report.messageId);
        const room = message?.roomId ? `#${data.hashtags.find((tag) => tag.id === message.roomId)?.label ?? 'archived room'}` : 'General';
        const sameMessage = data.reports.filter((item) => item.messageId === report.messageId).length;
        if (data.reports.findIndex((item) => item.messageId === report.messageId) !== data.reports.indexOf(report)) return null;
        return (
          <article key={report.id} className="yd-card ah-item">
            <div className="ah-item-head"><span className="ah-kind is-report">Report</span>{room} · {sameMessage > 1 ? `reported by ${sameMessage}` : report.reason} · {when(report.createdAt)}</div>
            <p className="ah-item-body">{message ? `“${message.body}”` : 'The message is no longer there.'}</p>
            {message && (
              <p className="ah-item-meta">
                By <button type="button" className="font-bold text-content-primary" onClick={() => onOpenPerson(message.authorId)}>{nameOf(message.authorId)}</button>
              </p>
            )}
            <div className="ah-actions">
              {message && <button type="button" className="ah-btn is-danger" disabled={busy}
                onClick={() => void run(async () => {
                  const removed = await removeCommunityMessage(message.id, 'Reported message');
                  for (const item of data.reports.filter((entry) => entry.messageId === report.messageId)) await dismissCommunityReport(item.id);
                  return removed;
                }, 'Message removed.', 'Could not remove it.', true)}>Remove</button>}
              {message && <button type="button" className="ah-btn" disabled={busy}
                onClick={() => void run(async () => {
                  const removed = await removeCommunityMessage(message.id, 'Reported message');
                  for (const item of data.reports.filter((entry) => entry.messageId === report.messageId)) await dismissCommunityReport(item.id);
                  return removed && await moderateCommunityMember(message.authorId, 'mute_7d', 'Reported message');
                }, 'Removed, and muted for 7 days.', 'Could not finish that.', true)}>Remove + mute 7 d</button>}
              {message && (confirmBan === report.id
                ? <button type="button" className="ah-btn is-danger" disabled={busy}
                    onClick={() => void run(() => moderateCommunityMember(message.authorId, 'ban', 'Reported message'), 'Banned. Their messages are gone.', 'Could not ban.', true)}>Confirm ban</button>
                : <button type="button" className="ah-btn is-ghost" disabled={busy} onClick={() => setConfirmBan(report.id)}>Ban…</button>)}
              <button type="button" className="ah-btn is-ghost" disabled={busy}
                onClick={() => void run(async () => {
                  let ok = true;
                  for (const item of data.reports.filter((entry) => entry.messageId === report.messageId)) ok = (await dismissCommunityReport(item.id)) && ok;
                  return ok;
                }, 'Kept. Report closed.', 'Could not close the report.')}>Keep it</button>
            </div>
          </article>
        );
      })}

      {show('appeals') && data.appeals.map((appeal) => (
        <article key={appeal.id} className="yd-card ah-item">
          <div className="ah-item-head"><span className="ah-kind is-muted">Appeal</span>
            <button type="button" className="font-semibold text-content-secondary" onClick={() => onOpenPerson(appeal.userId)}>{nameOf(appeal.userId)}</button> · {when(appeal.createdAt)}
          </div>
          <p className="ah-item-body">“{appeal.message}”</p>
          {reviewing === appeal.id && (
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={600} rows={3}
              placeholder="A private note to them (needed to decline)" className="yd-field mb-2 !h-auto py-2.5" />
          )}
          <div className="ah-actions">
            <button type="button" className="ah-btn is-primary" disabled={busy} onClick={() => void reviewAppeal(appeal, 'approve')}>Restore</button>
            {reviewing === appeal.id
              ? <button type="button" className="ah-btn is-danger" disabled={busy || note.trim().length < 5} onClick={() => void reviewAppeal(appeal, 'decline')}>Decline with note</button>
              : <button type="button" className="ah-btn is-ghost" onClick={() => { setReviewing(appeal.id); setNote(''); }}>Decline…</button>}
          </div>
        </article>
      ))}

      {show('hashtags') && data.hashtagRequests.length > 0 && (
        <section className="yd-section mt-1">
          {filter === 'all' && <h3 className="yd-heading">Hashtag requests</h3>}
          <CommunityHashtagAdmin requests={data.hashtagRequests} names={data.names} busy={busy} onRefresh={onRefresh} />
        </section>
      )}

      {show('backers') && counts.backers > 0 && (
        <div className="yd-card">
          <button type="button" className="yd-row" onClick={onOpenBackers}>
            <span className="yd-tile" aria-hidden><BadgeCheck size={19} /></span>
            <span className="yd-row-main">
              <span className="yd-row-title">Backer claims</span>
              <span className="yd-row-text">{counts.backers} waiting · check them against your UPI app</span>
            </span>
            <ChevronRight size={17} className="text-content-muted" aria-hidden />
          </button>
        </div>
      )}

      {status && <p role="status" className="ah-status">{status}</p>}
    </div>
  );
}
