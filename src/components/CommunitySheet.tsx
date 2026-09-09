import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, Check, ChevronDown, Flag, Gauge, Heart, MessageCircle, RefreshCw, Reply, Send, ShieldCheck, UserRoundCheck, UserRoundX, X } from 'lucide-react';
import type { PaceRow } from '../lib/paceBoard';
import {
  canSubmitCommunityAppeal,
  communityAppealAvailableAt,
  describeCommunityAudit,
  dismissCommunityReport,
  fetchAdminCommunity,
  fetchCommunityActivity,
  fetchReportedMessages,
  type CommunityActivitySummary,
  fetchCommunityContext,
  fetchCommunityMessages,
  isCommunityMessageActive,
  moderateCommunityMember,
  postCommunityMessage,
  removeCommunityMessage,
  reportCommunityMessage,
  reviewCommunityAppeal,
  saveCommunitySettings,
  submitCommunityAppeal,
  type CommunityAuditEntry,
  type CommunityAppeal,
  type CommunityContext,
  type CommunityMemberState,
  type CommunityMessage,
  type CommunityReport,
} from '../lib/community';
import Overlay from './Overlay';
import Toggle from './Toggle';
import { hapticSuccess, hapticTick, hapticWarn } from '../lib/haptics';

interface Props {
  open: boolean;
  onClose: () => void;
  userId?: string;
  rows: PaceRow[];
  initialContext: CommunityContext;
  startInAdmin?: boolean;
}

const timeLabel = (stamp: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(stamp));

export default function CommunitySheet({ open, onClose, userId, rows, initialContext, startInAdmin = false }: Props) {
  const [context, setContext] = useState(initialContext);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [expiryClock, setExpiryClock] = useState(() => Date.now());
  const [activity, setActivity] = useState<CommunityActivitySummary | null>(null);
  const [reportMessages, setReportMessages] = useState<CommunityMessage[]>([]);
  const [refreshError, setRefreshError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [adminLoaded, setAdminLoaded] = useState(false);
  const refreshId = useRef(0);
  const invalidateRequests = useCallback(() => { refreshId.current++; }, []);
  const [adminTab, setAdminTab] = useState<'review' | 'controls' | 'history'>('review');
  const [savingFeature, setSavingFeature] = useState(false);
  const featureBusy = useRef(false);
  const mode = startInAdmin ? 'admin' : 'room';
  const [draft, setDraft] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [appeals, setAppeals] = useState<CommunityAppeal[]>([]);
  const [members, setMembers] = useState<CommunityMemberState[]>([]);
  const [audit, setAudit] = useState<CommunityAuditEntry[]>([]);
  const [announcement, setAnnouncement] = useState(initialContext.settings.announcement);
  const [announcementExpanded, setAnnouncementExpanded] = useState(false);
  const announcementDirty = useRef(false);
  const [pendingBan, setPendingBan] = useState<string | null>(null);
  const [appealDraft, setAppealDraft] = useState('');
  const [reviewingAppeal, setReviewingAppeal] = useState<string | null>(null);
  const [appealResponse, setAppealResponse] = useState('');
  const names = useMemo(() => new Map(rows.map((row) => [row.userId, row.displayName])), [rows]);
  const visibleAudit = useMemo(() => {
    let keptLegacySettings = false;
    return audit.filter((entry) => {
      if (entry.action !== 'settings.updated') return true;
      if (keptLegacySettings) return false;
      keptLegacySettings = true;
      return true;
    }).slice(0, 12);
  }, [audit]);
  const legacySettingsCount = useMemo(() => audit.filter((entry) => entry.action === 'settings.updated').length, [audit]);

  const refresh = useCallback(async () => {
    if (!open || !userId) return;
    const request = ++refreshId.current;
    const current = () => request === refreshId.current;
    setRefreshing(true);
    try {
    const nextContext = await fetchCommunityContext(userId);
    if (!current()) return;
    if (nextContext.error) throw new Error(nextContext.error);
    setContext(nextContext);
    if (!announcementDirty.current) setAnnouncement(nextContext.settings.announcement);
    if (!nextContext.available) return;
    if (mode === 'room') {
      const nextMessages = await fetchCommunityMessages();
      if (!current()) return;
      setMessages(nextMessages);
    }
    if (mode === 'admin' && nextContext.isAdmin) {
      const [admin, nextActivity] = await Promise.all([fetchAdminCommunity(nextContext.dayKey), fetchCommunityActivity()]);
      const reported = await fetchReportedMessages(admin.reports.map((report) => report.messageId));
      if (!current()) return;
      setReportMessages(reported);
      setActivity(nextActivity);
      setReports(admin.reports); setMembers(admin.members); setAppeals(admin.appeals); setAudit(admin.audit);
      setAdminLoaded(true);
    }
    setRefreshError('');
    } catch (error) {
      if (current()) setRefreshError(error instanceof Error ? error.message : 'Could not refresh. Try again.');
    } finally {
      if (current()) setRefreshing(false);
    }
  }, [open, userId, mode]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const visibleRefresh = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(visibleRefresh, 30_000);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => { invalidateRequests(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visibleRefresh); };
  }, [open, refresh, startInAdmin, invalidateRequests]);

  useEffect(() => {
    setAnnouncementExpanded(false);
  }, [open, context.settings.announcement]);

  useEffect(() => {
    if (!open || mode !== 'room') return;
    const now = Date.now();
    const nextExpiry = messages.reduce((nearest, message) => {
      const expiry = Date.parse(message.expiresAt);
      return Number.isFinite(expiry) && expiry > now ? Math.min(nearest, expiry) : nearest;
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(
      () => setExpiryClock(Date.now()),
      Math.min(Math.max(nextExpiry - now + 25, 25), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [expiryClock, messages, mode, open]);

  if (!open) return null;
  const visibleMessages = messages.filter((message) => isCommunityMessageActive(message, expiryClock));
  const replyTarget = replyToId ? visibleMessages.find((message) => message.id === replyToId) : undefined;
  const activeMembers = members.filter((member) => member.banned || (member.mutedUntil && new Date(member.mutedUntil) > new Date()));
  const appealAvailableAt = communityAppealAvailableAt(context.appeal);
  const canSubmitAppeal = canSubmitCommunityAppeal(context.appeal);

  const send = async () => {
    if (!userId || busy) return;
    setBusy(true); setStatus('');
    const result = await postCommunityMessage(userId, draft, replyToId ?? undefined);
    if (result.ok) { hapticSuccess(); setDraft(''); setReplyToId(null); setStatus('Sent'); await refresh(); }
    else setStatus(result.error ?? 'Could not send.');
    setBusy(false);
  };
  const startReply = (messageId: string) => {
    setReplyToId(messageId);
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  const saveSettings = async () => {
    setBusy(true);
    const next = { ...context.settings, announcement: announcement.trim() };
    const ok = await saveCommunitySettings(next);
    setStatus(ok ? 'Community controls saved.' : 'Could not save controls.');
    if (ok) { hapticSuccess(); announcementDirty.current = false; await refresh(); }
    setBusy(false);
  };
  const setFeature = async (key: 'roomEnabled' | 'appreciationsEnabled', value: boolean) => {
    if (featureBusy.current || busy) return;
    featureBusy.current = true;
    setSavingFeature(true);
    setStatus('');
    try {
      const next = { ...context.settings, [key]: value };
      const ok = await saveCommunitySettings(next);
      setStatus(ok ? 'Control saved.' : 'Could not update that control. Try again.');
      if (ok) { hapticTick(); await refresh(); }
    } finally {
      featureBusy.current = false;
      setSavingFeature(false);
    }
  };
  const moderate = async (target: string, action: 'mute_24h' | 'mute_7d' | 'ban' | 'restore') => {
    setBusy(true);
    const ok = await moderateCommunityMember(target, action, 'Board community moderation');
    if (ok) { if (action === 'restore') hapticSuccess(); else hapticWarn(); }
    setStatus(ok ? 'Moderation action recorded.' : 'That action could not be completed.');
    setPendingBan(null); await refresh(); setBusy(false);
  };
  const submitAppeal = async () => {
    setBusy(true); setStatus('');
    const result = await submitCommunityAppeal(appealDraft);
    setStatus(result.ok ? 'Your request was sent privately to the admin.' : result.error ?? 'Could not send the request.');
    if (result.ok) { setAppealDraft(''); await refresh(); }
    setBusy(false);
  };
  const reviewAppeal = async (appeal: CommunityAppeal, decision: 'approve' | 'decline') => {
    setBusy(true); setStatus('');
    const response = appealResponse.trim() || (decision === 'approve' ? 'Your community access has been restored.' : '');
    const result = await reviewCommunityAppeal(appeal.id, decision, response);
    setStatus(result.ok ? (decision === 'approve' ? 'Appeal approved and access restored.' : 'Appeal declined with a private note.') : result.error ?? 'Could not review the appeal.');
    if (result.ok) { setReviewingAppeal(null); setAppealResponse(''); await refresh(); }
    setBusy(false);
  };

  return <Overlay open={open} onClose={onClose} align="full">
    <div className="community-shell app-frame mx-auto flex h-full w-full max-w-md flex-col overflow-hidden border-x border-subtle bg-base">
      <header className="flex shrink-0 items-center gap-2 border-b border-subtle bg-elevated px-3 pb-3 pt-[max(0.75rem,var(--safe-area-top))]">
        <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-xl text-content-secondary hover:bg-surface" aria-label="Close community"><ArrowLeft size={19} /></button>
        <span className="grid size-9 place-items-center rounded-xl border border-primary/20 bg-primary-soft text-primary">{mode === 'admin' ? <Gauge size={17} /> : <MessageCircle size={17} />}</span>
        <div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">Board community</p><h2 className="text-[16px] font-bold text-content-primary">{mode === 'admin' ? 'Community admin' : 'Daily room'}</h2></div>
        <button type="button" disabled={refreshing} onClick={() => void refresh()} className="grid size-9 place-items-center rounded-xl text-content-muted" aria-label="Refresh"><RefreshCw size={15} /></button>
      </header>

      {refreshError && <p role="status" className="mx-4 mt-3 text-[12px] text-error">{refreshError}</p>}

      {!context.available ? <div className="m-4 rounded-2xl border border-dashed border-subtle bg-surface p-6 text-center"><ShieldCheck className="mx-auto text-primary" size={24} /><h3 className="mt-3 text-[14px] font-semibold text-content-primary">Community setup is pending</h3><p className="mt-1 text-[11px] text-content-secondary">Install the protected community database migration to turn this on.</p></div>
      : mode === 'admin' && !context.isAdmin ? <p className="community-empty">Admin access is not available for this account.</p>
      : context.banned && !context.isAdmin ? <main className="min-h-0 flex-1 overflow-y-auto p-4"><div className="rounded-2xl border border-warning/25 bg-warning/8 p-4"><span className="grid size-10 place-items-center rounded-xl bg-warning/10 text-warning"><ShieldCheck size={18} /></span><h3 className="mt-3 text-[15px] font-semibold text-content-primary">Community access restricted</h3><p className="mt-1 text-[11px] leading-relaxed text-content-secondary">Board ranking, acknowledgements, and the community room are paused. Your Goals, Today, Calendar, focus history, sync, and backups still work normally.</p></div>
        {context.appeal?.status === 'open' ? <div className="mt-3 rounded-[14px] border border-primary/20 bg-primary-soft/20 p-3"><p className="text-[11.5px] font-semibold text-content-primary">Review requested</p><p className="mt-1 text-[10.5px] text-content-secondary">An admin will read your note. You can keep using the rest of YouDO while you wait.</p><p className="mt-2 rounded-xl bg-base px-3 py-2 text-[10.5px] leading-relaxed text-content-muted">{context.appeal.message}</p></div>
        : <div className="mt-3 rounded-[14px] border border-subtle bg-surface p-3.5"><p className="text-[12px] font-semibold text-content-primary">Request a review</p>{context.appeal?.status === 'declined' && <div className="mt-2 rounded-xl border border-error/15 bg-error-soft/30 p-2.5"><p className="text-[10px] font-semibold text-error">Previous request declined</p>{context.appeal.adminResponse && <p className="mt-1 text-[10.5px] leading-relaxed text-content-secondary">{context.appeal.adminResponse}</p>}</div>}{canSubmitAppeal ? <><textarea value={appealDraft} onChange={(event) => setAppealDraft(event.target.value)} maxLength={600} rows={4} placeholder="Briefly explain what happened and how you will keep the community respectful." className="mt-3 w-full resize-none rounded-xl border border-subtle bg-base px-3 py-2.5 text-[11.5px] outline-none focus:border-primary" /><div className="mt-2 flex items-center justify-between"><span className="text-[9px] text-content-muted">{appealDraft.trim().length}/600 · private</span><button type="button" onClick={() => void submitAppeal()} disabled={busy || appealDraft.trim().length < 20} className="h-9 rounded-lg bg-primary px-3 text-[10.5px] font-semibold text-on-primary disabled:opacity-40">Send request</button></div></> : <p className="mt-2 text-[10.5px] leading-relaxed text-content-muted">You can submit another request after {new Date(appealAvailableAt).toLocaleDateString()}.</p>}</div>}
        {status && <p role="status" className="mt-3 text-[10.5px] text-primary">{status}</p>}
      </main>
      : !context.canJoin && !context.isAdmin ? <div className="m-4 rounded-2xl border border-subtle bg-surface p-6 text-center"><Heart className="mx-auto text-primary" size={24} /><h3 className="mt-3 text-[14px] font-semibold text-content-primary">Join the Board first</h3><p className="mt-1 text-[11px] text-content-secondary">Only opted-in Board members can react or enter the daily room.</p></div>
      : mode === 'room' ? <>
        <main className="community-room-main min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <details className="community-guidelines">
            <summary><ShieldCheck size={14} /><span>Encourage the effort.</span><span className="community-guidelines-hint">Room rules</span><ChevronDown size={14} /></summary>
            <p>Be respectful. No links, spam, personal details, or discouraging remarks. Every message disappears 24 hours after it is sent; moderation records may be retained.</p>
          </details>
          {context.settings.announcement && <section className={`community-announcement ${announcementExpanded ? 'is-expanded' : ''}`}>
            <p className="community-announcement-label">From YouDO</p>
            <p className="community-announcement-copy">{context.settings.announcement}</p>
            {context.settings.announcement.length > 150 && <button type="button" className="community-announcement-toggle" aria-expanded={announcementExpanded} onClick={() => setAnnouncementExpanded((current) => !current)}>
              <span>{announcementExpanded ? 'Show less' : 'Read full broadcast'}</span><ChevronDown size={13} />
            </button>}
          </section>}
          {!context.settings.roomEnabled ? <div className="rounded-[14px] border border-subtle bg-surface p-5 text-center"><p className="text-[13px] font-semibold text-content-primary">The room is paused</p><p className="mt-1 text-[10.5px] text-content-secondary">Reactions and the focus Board can still work normally.</p></div>
          : visibleMessages.length === 0 ? <div className="rounded-[14px] border border-dashed border-subtle p-7 text-center"><MessageCircle size={20} className="mx-auto text-content-muted" /><p className="mt-2 text-[12px] font-semibold text-content-secondary">Start today with something useful.</p></div>
          : <ol className="community-thread">{visibleMessages.map((message) => {
            const mine = message.authorId === userId;
            if (message.kind === 'kudos') return <li key={message.id} className="community-event" aria-label={`Kudos: ${message.body}`}>
              <Heart size={12} className="fill-current" /><span>{message.body}</span><time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time>
            </li>;
            const repliedTo = message.replyToId ? visibleMessages.find((candidate) => candidate.id === message.replyToId) : undefined;
            return <li key={message.id} className={`community-message-row ${mine ? 'is-mine' : 'is-theirs'}`}>
              <article className="community-message-bubble">
                {!mine && <p className="community-message-author">{names.get(message.authorId) ?? 'Board member'}</p>}
                {message.replyToId && <div className="community-message-reply">
                  <strong>{repliedTo ? (repliedTo.authorId === userId ? 'You' : names.get(repliedTo.authorId) ?? 'Board member') : 'Earlier message'}</strong>
                  <span>{repliedTo?.body ?? 'This message is no longer available.'}</span>
                </div>}
                <p className="community-message-copy">{message.body}</p>
                <div className="community-message-meta">
                  <time dateTime={message.createdAt}>{message.createdAt.slice(0, 10) < context.dayKey ? `${new Date(message.createdAt).toLocaleDateString()} · ` : ''}{timeLabel(message.createdAt)}</time>
                  <button type="button" onClick={() => startReply(message.id)} aria-label={`Reply to ${mine ? 'your message' : names.get(message.authorId) ?? 'message'}`}><Reply size={11.5} /></button>
                  {!mine && <button type="button" onClick={async () => { if (userId && await reportCommunityMessage(message.id, userId)) setStatus('Reported privately for review.'); }} aria-label="Report message"><Flag size={11} /></button>}
                </div>
              </article>
            </li>;
          })}</ol>}
          {visibleMessages.length >= 120 && <p className="community-history-limit">Showing the latest 120 messages.</p>}
        </main>
        <footer className="shrink-0 border-t border-subtle bg-elevated px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {status && <p role="status" className="mb-2 text-[10px] text-primary">{status}</p>}
          {replyToId && <div className="community-composer-reply">
            <div><strong>Replying to {replyTarget ? (replyTarget.authorId === userId ? 'yourself' : names.get(replyTarget.authorId) ?? 'a board member') : 'an earlier message'}</strong><span>{replyTarget?.body ?? 'This message may have expired.'}</span></div>
            <button type="button" onClick={() => setReplyToId(null)} aria-label="Cancel reply"><X size={14} /></button>
          </div>}
          <div className="flex items-end gap-2"><textarea ref={composerRef} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={240} rows={2} disabled={!context.canPost || !context.settings.roomEnabled} placeholder={context.banned ? 'Community access is disabled' : context.mutedUntil ? 'Posting is temporarily paused' : replyToId ? 'Write a reply…' : 'Share a short encouragement…'} className="min-h-[46px] flex-1 resize-none rounded-xl border border-subtle bg-base px-3 py-2.5 text-[12px] text-content-primary outline-none focus:border-primary" /><button type="button" onClick={() => void send()} disabled={!draft.trim() || busy || !context.canPost || !context.settings.roomEnabled} className="grid size-11 place-items-center rounded-xl bg-primary text-on-primary disabled:opacity-40" aria-label="Send"><Send size={17} /></button></div>
          <p className="mt-1 text-right text-[9px] text-content-muted">{draft.length}/240</p>
        </footer>
      </> : <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section className="admin-activity" aria-label="Community pulse">
          <div className="admin-activity-heading"><div><Activity size={14} /><h3>Community pulse</h3></div><span>{activity ? 'Board members' : refreshing ? 'Loading…' : 'Unavailable'}</span></div>
          {activity ? <>
            <div className="admin-activity-values">
              <div><strong>{activity.activeRecently}</strong><span>Active recently</span><small>last 5 min</small></div>
              <div><strong>{activity.visitedToday}</strong><span>Used today</span><small>of {activity.boardMembers} members</small></div>
            </div>
            <details><summary>How pulse works <ChevronDown size={12} /></summary><p>Opted-in Board members using a supported build. Recent activity means the app was open within five minutes; someone may have since left. Used today resets at 00:00 UTC (05:30 in India). Updated {timeLabel(activity.asOf)}.</p></details>
          </> : <p className="px-4 pb-4 text-[12px] text-content-muted">{refreshing ? 'Loading activity…' : 'Activity is unavailable. Refresh to try again.'}</p>}
        </section>
        <nav className="admin-nav" aria-label="Admin sections">{(['review', 'controls', 'history'] as const).map((tab) => <button key={tab} type="button" aria-pressed={adminTab === tab} onClick={() => { setAdminTab(tab); setStatus(''); }}>{tab === 'review' ? 'Review' : tab === 'controls' ? 'Controls' : 'Safety log'}{tab === 'review' && reports.length + appeals.length > 0 && <span>{reports.length + appeals.length}</span>}</button>)}</nav>
        {!adminLoaded && adminTab !== 'controls' && <p role="status" className="community-empty">{refreshError ? 'Moderation records could not be loaded.' : 'Loading moderation records…'}</p>}
        <div hidden={adminTab !== 'controls'}>
        <section className="admin-control-list">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[12px] font-semibold text-content-primary">Community room</p><p className="text-[10px] text-content-muted">Pause messages and automatic notes</p></div><Toggle disabled={busy || savingFeature} checked={context.settings.roomEnabled} onChange={() => void setFeature('roomEnabled', !context.settings.roomEnabled)} label="Toggle community room" /></div>
          <div className="my-3 h-px bg-border-subtle" />
          <div className="flex items-center justify-between gap-3"><div><p className="text-[12px] font-semibold text-content-primary">Kudos</p><p className="text-[10px] text-content-muted">Recognition for the top three</p></div><Toggle disabled={busy || savingFeature} checked={context.settings.appreciationsEnabled} onChange={() => void setFeature('appreciationsEnabled', !context.settings.appreciationsEnabled)} label="Toggle Kudos" /></div>
        </section>
        <section className="mt-4 rounded-[15px] border border-subtle bg-surface p-3.5"><label htmlFor="community-announcement" className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Board broadcast</label><textarea id="community-announcement" value={announcement} onChange={(event) => { announcementDirty.current = true; setAnnouncement(event.target.value); }} rows={4} placeholder="Optional message shown above the community room" className="mt-2 w-full resize-y rounded-xl border border-subtle bg-base px-3 py-2.5 text-[12px] outline-none focus:border-primary" /><p className="mt-1.5 text-[9.5px] leading-relaxed text-content-muted">Long broadcasts stay folded in the room until a member opens them.</p><button type="button" onClick={() => void saveSettings()} disabled={busy || savingFeature || announcement.trim() === context.settings.announcement} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-on-primary"><Check size={14} /> Publish</button></section>
        </div>
        <div hidden={adminTab !== 'review' || !adminLoaded}>
        {appeals.length > 0 && <section className="mt-4"><div className="mb-2 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Appeals</p><h3 className="text-[14px] font-semibold text-content-primary">Private review requests</h3></div><span className="rounded-full bg-secondary-soft px-2 py-1 text-[10px] font-bold text-secondary">{appeals.length}</span></div><div className="space-y-2">{appeals.map((appeal) => { const member = members.find((item) => item.userId === appeal.userId); const name = names.get(appeal.userId) || member?.displayName || appeal.userId.slice(0, 8); const expanded = reviewingAppeal === appeal.id; return <article key={appeal.id} className="rounded-[14px] border border-secondary/20 bg-secondary-soft/15 p-3"><div className="flex items-start gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-secondary" /><div className="min-w-0 flex-1"><p className="text-[11.5px] font-semibold text-content-primary">{name}</p><p className="mt-1 text-[11px] leading-relaxed text-content-secondary">{appeal.message}</p><p className="mt-1.5 text-[9px] text-content-muted">Sent {new Date(appeal.createdAt).toLocaleString()}</p></div></div>{!expanded ? <button type="button" onClick={() => { setReviewingAppeal(appeal.id); setAppealResponse(''); }} className="mt-2 h-8 rounded-lg border border-secondary/25 px-3 text-[10px] font-semibold text-secondary">Review</button> : <div className="mt-3 border-t border-subtle pt-3"><textarea value={appealResponse} onChange={(event) => setAppealResponse(event.target.value)} maxLength={600} rows={3} placeholder="Private note to this user" className="w-full resize-none rounded-xl border border-subtle bg-base px-3 py-2 text-[10.5px] outline-none focus:border-primary" /><div className="mt-2 flex flex-wrap gap-1.5"><button type="button" disabled={busy} onClick={() => void reviewAppeal(appeal, 'approve')} className="rounded-lg bg-secondary px-2.5 py-1.5 text-[10px] font-semibold text-on-secondary">Approve & restore</button><button type="button" disabled={busy || appealResponse.trim().length < 5} onClick={() => void reviewAppeal(appeal, 'decline')} className="rounded-lg bg-error-soft px-2.5 py-1.5 text-[10px] font-semibold text-error disabled:opacity-40">Decline</button><button type="button" onClick={() => setReviewingAppeal(null)} className="px-2 text-[10px] text-content-muted">Cancel</button></div></div>}</article>; })}</div></section>}
        <section className="mt-4"><div className="mb-2 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Report queue</p><h3 className="text-[14px] font-semibold text-content-primary">Needs a decision</h3></div><span className="rounded-full bg-error-soft px-2 py-1 text-[10px] font-bold text-error">{reports.length}</span></div>
          {reports.length === 0 ? <div className="rounded-[14px] border border-dashed border-subtle p-5 text-center text-[11px] text-content-muted">Nothing waiting. Nice and quiet.</div>
          : <div className="space-y-2">{reports.map((report) => { const message = reportMessages.find((item) => item.id === report.messageId); return <article key={report.id} className="rounded-[14px] border border-error/25 bg-error-soft/20 p-3"><div className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-error" /><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-content-primary">{names.get(message?.authorId ?? '') ?? 'Board member'}</p><p className="mt-1 text-[11px] leading-relaxed text-content-secondary">{message?.body ?? 'Message unavailable'}</p></div></div><div className="mt-3 flex flex-wrap gap-1.5"><button type="button" onClick={async () => { await dismissCommunityReport(report.id); await refresh(); }} className="rounded-lg border border-subtle px-2.5 py-1.5 text-[10px] text-content-secondary">Dismiss</button>{message && <><button type="button" onClick={async () => { await removeCommunityMessage(message.id, 'Reported message'); await refresh(); }} className="rounded-lg bg-error-soft px-2.5 py-1.5 text-[10px] font-semibold text-error">Remove</button><button type="button" onClick={() => void moderate(message.authorId, 'mute_24h')} className="rounded-lg bg-primary-soft px-2.5 py-1.5 text-[10px] font-semibold text-primary">Mute 24h</button><button type="button" onClick={() => setPendingBan(message.authorId)} className="rounded-lg border border-error/30 px-2.5 py-1.5 text-[10px] text-error">Ban</button></>}</div>{pendingBan === message?.authorId && <div className="mt-2 rounded-lg border border-error/25 bg-base p-2"><p className="text-[10px] text-content-secondary">Ban this account from community features? Private workspace data is untouched.</p><div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => void moderate(message!.authorId, 'ban')} className="rounded-md bg-error px-2.5 py-1.5 text-[10px] font-bold text-white">Confirm ban</button><button type="button" onClick={() => setPendingBan(null)} className="text-[10px] text-content-muted">Cancel</button></div></div>}</article>; })}</div>}
        </section>
        {activeMembers.length > 0 && <section className="mt-4"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-content-muted">Restrictions</p><div className="overflow-hidden rounded-[14px] border border-subtle bg-surface">{activeMembers.map((member) => <div key={member.userId} className="flex items-center gap-2 border-b border-subtle p-3 last:border-0">{member.banned ? <UserRoundX size={15} className="text-error" /> : <AlertTriangle size={15} className="text-primary" />}<div className="min-w-0 flex-1"><p className="truncate text-[11.5px] font-semibold text-content-primary">{names.get(member.userId) || member.displayName || member.userId.slice(0, 8)}</p><p className="text-[9.5px] text-content-muted">{member.banned ? 'Community banned' : `Muted until ${new Date(member.mutedUntil!).toLocaleString()}`}</p></div><button type="button" disabled={busy} onClick={() => void moderate(member.userId, 'restore')} className="inline-flex items-center gap-1 text-[10px] font-semibold text-secondary"><UserRoundCheck size={13} /> Restore</button></div>)}</div></section>}
        </div>
        <div hidden={adminTab !== 'history' || !adminLoaded}>
        {audit.length === 0 && <p className="community-empty">No moderation actions yet.</p>}
        {audit.length > 0 && <ol className="admin-audit-log">{visibleAudit.map((entry) => {
          const targetName = names.get(entry.targetUserId ?? '') || members.find((member) => member.userId === entry.targetUserId)?.displayName;
          const description = describeCommunityAudit(entry, targetName);
          const detail = entry.action === 'settings.updated' && legacySettingsCount > 1
            ? `${legacySettingsCount} earlier settings changes were recorded without field details.`
            : description.detail;
          return <li key={entry.id}><span className="admin-audit-icon"><ShieldCheck size={13} /></span><div className="min-w-0 flex-1"><div className="admin-audit-title"><p>{description.title}</p><span>{description.category}</span></div><p className="admin-audit-detail">{detail}</p><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></div></li>;
        })}</ol>}
        </div>
        {status && <p role="status" className="community-status">{status}</p>}
        <div className="community-privacy mt-4 flex items-start gap-2 rounded-[13px] border border-secondary/20 bg-secondary-soft/40 p-3"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-secondary" /><p className="text-[10px] leading-relaxed text-content-secondary">Community only. Private workspaces stay private.</p></div>
      </main>}
    </div>
  </Overlay>;
}
