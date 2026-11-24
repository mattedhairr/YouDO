import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Flag, Heart, MessageCircle, RefreshCw, Reply, Send, ShieldCheck, X } from 'lucide-react';
import type { PaceRow } from '../lib/paceBoard';
import {
  canSubmitCommunityAppeal,
  communityAppealAvailableAt,
  fetchCommunityContext,
  fetchCommunityMessages,
  isCommunityMessageActive,
  postCommunityMessage,
  reportCommunityMessage,
  submitCommunityAppeal,
  type CommunityContext,
  type CommunityMessage,
} from '../lib/community';
import Overlay from './Overlay';
import { hapticSuccess } from '../lib/haptics';
import CommunityChat from './community/CommunityChat';
import { OPEN_COMMUNITY_REPORTS_EVENT } from './community/CommunityChat';
import { clearChatCache } from '../lib/communityChat';
import UserProfileSheet from './UserProfileSheet';
import '../signature.css';

interface Props {
  open: boolean;
  onClose: () => void;
  userId?: string;
  rows: PaceRow[];
  initialContext: CommunityContext;
  onOpenBoardSettings: () => void;
  onProfile?: (id: string) => void;
}

const timeLabel = (stamp: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(stamp));

/** The Board's community room. Moderation lives in the Admin Hub (AdminHubSheet). */
export default function CommunitySheet({ open, onClose, userId, rows, initialContext, onOpenBoardSettings, onProfile }: Props) {
  const [context, setContext] = useState(initialContext);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [expiryClock, setExpiryClock] = useState(() => Date.now());
  const [refreshError, setRefreshError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const refreshId = useRef(0);
  const invalidateRequests = useCallback(() => { refreshId.current++; }, []);
  const [draft, setDraft] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [announcementExpanded, setAnnouncementExpanded] = useState(false);
  const [appealDraft, setAppealDraft] = useState('');
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);
  const handleProfile = onProfile ?? ((id: string) => setSelectedProfileUserId(id));
  const names = useMemo(() => new Map(rows.map((row) => [row.userId, row.displayName])), [rows]);

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
      if (!nextContext.available) return;
      if (!nextContext.canJoin) clearChatCache(userId);
      if (!nextContext.chatV2) {
        const nextMessages = await fetchCommunityMessages();
        if (!current()) return;
        setMessages(nextMessages);
      }
      setRefreshError('');
    } catch (error) {
      if (current()) setRefreshError(error instanceof Error ? error.message : 'Could not refresh. Try again.');
    } finally {
      if (current()) setRefreshing(false);
      window.dispatchEvent(new CustomEvent('youdo-community-refresh-chat'));
    }
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const visibleRefresh = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(visibleRefresh, 30_000);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => { invalidateRequests(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visibleRefresh); };
  }, [open, refresh, invalidateRequests]);

  useEffect(() => {
    if (!open) return;
    const afterRead = () => { void refresh(); };
    window.addEventListener('youdo-community-read', afterRead);
    return () => window.removeEventListener('youdo-community-read', afterRead);
  }, [open, refresh]);

  useEffect(() => {
    setAnnouncementExpanded(false);
  }, [open, context.settings.announcement]);

  useEffect(() => {
    if (!open) return;
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
  }, [expiryClock, messages, open]);

  if (!open) return null;
  const visibleMessages = messages.filter((message) => isCommunityMessageActive(message, expiryClock));
  const replyTarget = replyToId ? visibleMessages.find((message) => message.id === replyToId) : undefined;
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
  const submitAppeal = async () => {
    setBusy(true); setStatus('');
    const result = await submitCommunityAppeal(appealDraft);
    setStatus(result.ok ? 'Your request was sent privately to the admin.' : result.error ?? 'Could not send the request.');
    if (result.ok) { setAppealDraft(''); await refresh(); }
    setBusy(false);
  };

  return <Overlay open={open} onClose={onClose} align="full">
    <div className={`community-shell app-frame mx-auto flex h-full w-full max-w-md flex-col overflow-hidden border-x border-subtle bg-base`}>
      <header className={`flex shrink-0 items-center gap-2 bg-elevated px-3 pt-[max(0.75rem,var(--safe-area-top))] ${context.chatV2 ? 'pb-1' : 'border-b border-subtle pb-3'}`}>
        <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-xl text-content-secondary hover:bg-surface" aria-label="Close community"><ArrowLeft size={19} /></button>
        <span className="grid size-9 place-items-center rounded-xl border border-primary/20 bg-primary-soft text-primary"><MessageCircle size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">Board community</p>
          <h2 className="text-[16px] font-bold text-content-primary truncate">Community</h2>
        </div>
        {context.chatV2 && (
          <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_COMMUNITY_REPORTS_EVENT))} className="grid size-9 place-items-center rounded-xl text-content-muted" aria-label="My reports" title="My reports"><Flag size={15} /></button>
        )}
        <button type="button" disabled={refreshing} onClick={() => void refresh()} className="grid size-9 place-items-center rounded-xl text-content-muted" aria-label="Refresh"><RefreshCw size={15} /></button>
      </header>

      {refreshError && <p role="status" className="mx-4 mt-3 text-[12px] text-error">{refreshError}</p>}

      {!context.available ? <div className="m-4 rounded-2xl border border-dashed border-subtle bg-surface p-6 text-center"><ShieldCheck className="mx-auto text-primary" size={24} /><h3 className="mt-3 text-[14px] font-semibold text-content-primary">Community setup is pending</h3><p className="mt-1 text-[11px] text-content-secondary">Install the protected community database migration to turn this on.</p></div>
      : context.banned && !context.isAdmin ? <main className="min-h-0 flex-1 overflow-y-auto p-4"><div className="rounded-2xl border border-warning/25 bg-warning/8 p-4"><span className="grid size-10 place-items-center rounded-xl bg-warning/10 text-warning"><ShieldCheck size={18} /></span><h3 className="mt-3 text-[15px] font-semibold text-content-primary">Community access restricted</h3><p className="mt-1 text-[11px] leading-relaxed text-content-secondary">Board ranking, acknowledgements, and the community room are paused. Your Goals, Today, Calendar, focus history, sync, and backups still work normally.</p></div>
        {context.appeal?.status === 'open' ? <div className="mt-3 rounded-[14px] border border-primary/20 bg-primary-soft/20 p-3"><p className="text-[11.5px] font-semibold text-content-primary">Review requested</p><p className="mt-1 text-[10.5px] text-content-secondary">An admin will read your note. You can keep using the rest of YouDO while you wait.</p><p className="mt-2 rounded-xl bg-base px-3 py-2 text-[10.5px] leading-relaxed text-content-muted">{context.appeal.message}</p></div>
        : <div className="mt-3 rounded-[14px] border border-subtle bg-surface p-3.5"><p className="text-[12px] font-semibold text-content-primary">Request a review</p>{context.appeal?.status === 'declined' && <div className="mt-2 rounded-xl border border-error/15 bg-error-soft/30 p-2.5"><p className="text-[10px] font-semibold text-error">Previous request declined</p>{context.appeal.adminResponse && <p className="mt-1 text-[10.5px] leading-relaxed text-content-secondary">{context.appeal.adminResponse}</p>}</div>}{canSubmitAppeal ? <><textarea value={appealDraft} onChange={(event) => setAppealDraft(event.target.value)} maxLength={600} rows={4} placeholder="Briefly explain what happened and how you will keep the community respectful." className="mt-3 w-full resize-none rounded-xl border border-subtle bg-base px-3 py-2.5 text-[11.5px] outline-none focus:border-primary" /><div className="mt-2 flex items-center justify-between"><span className="text-[9px] text-content-muted">{appealDraft.trim().length}/600 · private</span><button type="button" onClick={() => void submitAppeal()} disabled={busy || appealDraft.trim().length < 20} className="h-9 rounded-lg bg-primary px-3 text-[10.5px] font-semibold text-on-primary disabled:opacity-40">Send request</button></div></> : <p className="mt-2 text-[10.5px] leading-relaxed text-content-muted">You can submit another request after {new Date(appealAvailableAt).toLocaleDateString()}.</p>}</div>}
        {status && <p role="status" className="mt-3 text-[10.5px] text-primary">{status}</p>}
      </main>
      : !context.canJoin && !context.isAdmin ? <div className="m-4 rounded-2xl border border-subtle bg-surface p-6 text-center"><Heart className="mx-auto text-primary" size={24} /><h3 className="mt-3 text-[14px] font-semibold text-content-primary">Join the Board first</h3><p className="mt-1 text-[11px] text-content-secondary">Only opted-in Board members can react or enter the daily room.</p></div>
      : context.chatV2 && userId
        ? <CommunityChat key={userId} userId={userId} context={context} names={names} onProfile={handleProfile} onOpenBoardSettings={onOpenBoardSettings} />
      : <>
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
                {!mine && (
                  <button
                    type="button"
                    className="community-message-author text-left hover:underline inline-flex items-center gap-1.5"
                    onClick={() => handleProfile(message.authorId)}
                    title={`View ${(names.get(message.authorId) ?? 'Board member')}'s profile`}
                  >
                    <span className="size-3.5 rounded-full bg-primary-soft text-primary text-[8px] font-bold inline-flex items-center justify-center shrink-0 border border-primary/25">
                      {(names.get(message.authorId) ?? 'B').charAt(0).toUpperCase()}
                    </span>
                    <span>{names.get(message.authorId) ?? 'Board member'}</span>
                  </button>
                )}
                {message.replyToId && <div className="community-message-reply">
                  <strong>{repliedTo ? (repliedTo.authorId === userId ? 'You' : names.get(repliedTo.authorId) ?? 'Board member') : 'Earlier message'}</strong>
                  <span>{repliedTo?.body ?? 'This message is no longer available.'}</span>
                </div>}
                <p className="community-message-copy">{message.body}</p>
                <div className="community-message-meta">
                  <time dateTime={message.createdAt}>{message.createdAt.slice(0, 10) < context.dayKey ? `${new Date(message.createdAt).toLocaleDateString()} · ` : ''}{timeLabel(message.createdAt)}</time>
                  <button type="button" onClick={() => startReply(message.id)} aria-label={`Reply to ${mine ? 'your message' : names.get(message.authorId) ?? 'message'}`}><Reply size={11.5} /></button>
                  {!mine && <button type="button" onClick={async () => { if (userId && await reportCommunityMessage(message.id)) setStatus('Reported privately for review.'); }} aria-label="Report message"><Flag size={11} /></button>}
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
      </>}
      {selectedProfileUserId && (
        <UserProfileSheet
          open={Boolean(selectedProfileUserId)}
          userId={selectedProfileUserId}
          boardPreview={rows.find((r) => r.userId === selectedProfileUserId) ?? null}
          onClose={() => setSelectedProfileUserId(null)}
        />
      )}
    </div>
  </Overlay>;
}
