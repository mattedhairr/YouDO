import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  MessageSquare,
  Send,
  Shield,
  User,
  X,
} from 'lucide-react';
import {
  reviewCommunityHashtagRequest,
  type CommunityHashtagRequest,
} from '../../lib/communityHashtags';
import Overlay from '../Overlay';

interface Props {
  requests: CommunityHashtagRequest[];
  names: Map<string, string>;
  busy: boolean;
  onRefresh: () => Promise<void>;
}

export default function CommunityHashtagAdmin({
  requests,
  names,
  busy,
  onRefresh,
}: Props) {
  const [open, setOpen] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmReject, setConfirmReject] = useState('');
  const [chatRequest, setChatRequest] = useState<CommunityHashtagRequest | null>(null);
  const [chatReply, setChatReply] = useState('');
  const [chatLabel, setChatLabel] = useState('');

  const groups = useMemo(() => {
    const grouped = new Map<string, CommunityHashtagRequest[]>();
    for (const request of requests) {
      const key = request.normalizedExam || request.examName.toLowerCase();
      grouped.set(key, [...(grouped.get(key) || []), request]);
    }
    return [...grouped.entries()];
  }, [requests]);

  if (!groups.length) return null;

  const act = async (
    request: CommunityHashtagRequest,
    decision: 'wait' | 'create' | 'reject',
    customReply?: string,
    customLabel?: string,
  ) => {
    if (working) return;
    setWorking(true);
    setError('');
    const note = customReply !== undefined ? customReply : '';
    const approvedTag = customLabel !== undefined ? customLabel : (label || request.examName);
    try {
      await reviewCommunityHashtagRequest(
        request.id,
        decision,
        note,
        approvedTag.trim().replace(/\s+/g, '-'),
      );
      setConfirmReject('');
      setOpen('');
      setLabel('');
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not review this request.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <div className="admin-hashtag-groups">
        {groups.map(([key, items]) => {
          const expanded = open === key;
          const first = items[0];
          return (
            <article key={key} className="rounded-2xl border border-subtle bg-elevated overflow-hidden shadow-sm mb-3">
              <button
                type="button"
                className="admin-hashtag-summary"
                onClick={() => {
                  setOpen(expanded ? '' : key);
                  setLabel(first.examName.toUpperCase());
                  setError('');
                  setConfirmReject('');
                }}
              >
                <span className="admin-hashtag-icon">
                  <Hash size={14} />
                </span>
                <span>
                  <strong>{first.examName}</strong>
                  <small>
                    {items.length} request{items.length === 1 ? '' : 's'} ·{' '}
                    {items.filter((item) => item.status === 'waiting').length} admin replied
                  </small>
                </span>
                <ChevronDown size={15} className={expanded ? 'is-open' : ''} />
              </button>

              {expanded && (
                <div className="p-3.5 border-t border-subtle space-y-3.5">
                  {/* People list */}
                  <div className="space-y-2.5">
                    {items.map((item) => {
                      const requesterName =
                        names.get(item.requesterId || '') || 'Board member';
                      return (
                        <div
                          className="rounded-xl border border-subtle bg-surface p-3 space-y-2.5"
                          key={item.id}
                        >
                          {/* Top Row: User info & Status */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary font-bold text-xs">
                                <User size={13} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[12px] font-semibold text-content-primary truncate">
                                  {requesterName}
                                </p>
                                <p className="text-[9.5px] text-content-muted">
                                  Requested #{item.examName} ·{' '}
                                  {new Date(item.createdAt).toLocaleDateString([], {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                  item.status === 'waiting'
                                    ? 'bg-warning/15 text-warning border border-warning/25'
                                    : item.details.startsWith('[Reply]')
                                    ? 'bg-secondary-soft text-secondary border border-secondary/25'
                                    : 'bg-primary-soft text-primary border border-primary/20'
                                }`}
                              >
                                {item.status === 'waiting'
                                  ? 'Waiting on user'
                                  : item.details.startsWith('[Reply]')
                                  ? 'User replied'
                                  : 'Awaiting review'}
                              </span>

                              {confirmReject === item.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={busy || working}
                                    onClick={() => void act(item, 'reject')}
                                    className="rounded-md bg-error px-2 py-0.5 text-[9.5px] font-bold text-white"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmReject('')}
                                    className="rounded-md bg-base px-2 py-0.5 text-[9.5px] text-content-muted"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmReject(item.id)}
                                  className="text-[10px] font-semibold text-error hover:underline px-1 py-0.5"
                                >
                                  Reject
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Requester details note */}
                          {item.details && (
                            <div className="rounded-lg bg-base/60 border border-subtle/50 px-2.5 py-1.5 text-[11px] text-content-secondary">
                              <span className="font-semibold text-content-primary text-[9.5px] uppercase tracking-wider block mb-0.5">
                                {item.details.startsWith('[Reply]') ? 'Requester Reply' : 'Context'}
                              </span>
                              {item.details.startsWith('[Reply]')
                                ? item.details.replace(/^\[Reply\]\s*/, '')
                                : item.details}
                            </div>
                          )}

                          {/* Clickable Support / Chat Section */}
                          <button
                            type="button"
                            onClick={() => {
                              setChatRequest(item);
                              setChatReply('');
                              setChatLabel((label || item.examName).toUpperCase());
                            }}
                            className="w-full flex items-center justify-between gap-2.5 rounded-xl border border-secondary/25 bg-secondary-soft/20 p-2.5 text-left transition hover:bg-secondary-soft/30 hover:border-secondary/40 active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-on-secondary">
                                <MessageSquare size={13} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
                                    Support Chat
                                  </span>
                                  {(item.adminResponse || item.details.startsWith('[Reply]')) && (
                                    <span className="size-1.5 rounded-full bg-secondary" />
                                  )}
                                </div>
                                <p className="truncate text-[11px] text-content-secondary mt-0.5">
                                  {item.details.startsWith('[Reply]')
                                    ? `Requester replied: ${item.details.replace(/^\[Reply\]\s*/, '')}`
                                    : item.adminResponse
                                    ? `Last reply: ${item.adminResponse}`
                                    : 'Click to open chat & reply…'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-[10.5px] font-bold text-secondary shrink-0 pl-1">
                              <span>Open Chat</span>
                              <ChevronRight size={13} />
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Inline Approval & Reply Form */}
                  <div className="space-y-3 pt-2 border-t border-subtle">
                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-content-muted mb-1">
                        Approved label
                      </label>
                      <input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        maxLength={24}
                        placeholder="e.g. ASB, UPSC-CSE"
                        className="w-full h-10 px-3 rounded-xl border border-subtle bg-base text-xs text-content-primary outline-none focus:border-primary font-semibold"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busy || working || label.trim().length < 2}
                        onClick={() => void act(first, 'create')}
                        className="flex-1 min-h-10 rounded-xl bg-primary text-on-primary text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition active:scale-95"
                      >
                        <Check size={13} />
                        <span>
                          Approve #{(label.trim() || first.examName).replace(/\s+/g, '-')}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={busy || working}
                        onClick={() => {
                          setChatRequest(first);
                          setChatReply('');
                          setChatLabel((label || first.examName).toUpperCase());
                        }}
                        className="min-h-10 px-4 rounded-xl bg-secondary-soft border border-secondary/25 text-secondary text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition active:scale-95"
                      >
                        <MessageSquare size={13} />
                        <span>Support Chat &amp; Notes</span>
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p role="alert" className="text-center text-[10.5px] text-error font-medium">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Support Chat Bottom Sheet Modal */}
      {chatRequest && (
        <Overlay
          open={Boolean(chatRequest)}
          onClose={() => setChatRequest(null)}
          align="bottom"
        >
          <div className="w-full max-w-[480px] max-h-[85vh] flex flex-col rounded-t-[28px] bg-elevated border-t border-subtle p-4 shadow-2xl text-content-primary">
            {/* Grab Handle */}
            <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-border-subtle" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-subtle">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9.5px] font-bold uppercase tracking-widest text-secondary">
                    Hashtag Support
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                      chatRequest.status === 'waiting'
                        ? 'bg-warning/20 text-warning border border-warning/30'
                        : 'bg-primary-soft text-primary border border-primary/25'
                    }`}
                  >
                    {chatRequest.status === 'waiting' ? 'Waiting on user reply' : 'Needs review'}
                  </span>
                </div>
                <h3 className="text-base font-bold text-content-primary truncate mt-0.5">
                  #{chatRequest.examName}
                </h3>
                <p className="text-[10.5px] text-content-muted">
                  Requester: {names.get(chatRequest.requesterId || '') || 'Board member'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChatRequest(null)}
                aria-label="Close"
                className="grid size-8 place-items-center rounded-full bg-surface text-content-muted hover:text-content-primary transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Chat Messages Body */}
            <div className="my-3 flex-1 overflow-y-auto space-y-3 pr-1 max-h-[42vh]">
              {/* Message 1: User Request */}
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-1.5 text-[10px] text-content-muted pl-1">
                  <User size={11} />
                  <span className="font-semibold">
                    {names.get(chatRequest.requesterId || '') || 'Requester'}
                  </span>
                  <span>·</span>
                  <time>
                    {new Date(chatRequest.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-surface border border-subtle p-3 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Requested Exam
                  </p>
                  <p className="text-[13px] font-semibold text-content-primary mt-0.5">
                    #{chatRequest.examName}
                  </p>
                  {chatRequest.details ? (
                    <div className="text-[11.5px] text-content-secondary leading-relaxed mt-1.5 border-t border-subtle/60 pt-1.5">
                      {chatRequest.details.startsWith('[Reply]') ? (
                        <>
                          <span className="text-[9.5px] font-bold uppercase tracking-wider text-secondary block mb-0.5">
                            Requester Follow-up
                          </span>
                          <p>{chatRequest.details.replace(/^\[Reply\]\s*/, '')}</p>
                        </>
                      ) : (
                        <p>{chatRequest.details}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10.5px] text-content-muted italic mt-1">
                      No additional details provided.
                    </p>
                  )}
                </div>
              </div>

              {/* Message 2: Admin Reply (if exists) */}
              {chatRequest.adminResponse && (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-secondary pr-1">
                    <Shield size={11} />
                    <span className="font-bold">You (Admin)</span>
                    <span>·</span>
                    <span>Sent</span>
                  </div>
                  <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-secondary-soft border border-secondary/25 p-3 shadow-sm text-left">
                    <p className="text-[12px] text-content-primary leading-relaxed">
                      {chatRequest.adminResponse}
                    </p>
                    <div className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-secondary font-medium">
                      <Clock size={10} />
                      <span>
                        {chatRequest.status === 'waiting'
                          ? 'Waiting for requester to answer'
                          : 'Active'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Status helper note */}
              {chatRequest.status === 'waiting' && (
                <div className="rounded-xl border border-warning/20 bg-warning/10 p-2.5 text-center">
                  <p className="text-[10.5px] text-warning font-medium">
                    ⏳ Awaiting user response. Once the user replies in their app, their answer will appear here.
                  </p>
                </div>
              )}
            </div>

            {/* Chat Reply Composer & Quick Actions */}
            <div className="border-t border-subtle pt-3 space-y-2.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-content-muted mb-1">
                  {chatRequest.adminResponse ? 'Send another reply / note' : 'Write reply to requester'}
                </label>
                <div className="relative">
                  <textarea
                    value={chatReply}
                    onChange={(e) => setChatReply(e.target.value)}
                    maxLength={240}
                    rows={2}
                    placeholder="Ask for clarification or explain status to this user..."
                    className="w-full resize-none rounded-xl border border-subtle bg-base p-2.5 text-xs text-content-primary placeholder:text-content-muted outline-none focus:border-secondary"
                  />
                  <span className="absolute bottom-2 right-2 text-[9px] text-content-muted">
                    {chatReply.trim().length}/240
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || working || chatReply.trim().length < 5}
                  onClick={async () => {
                    await act(chatRequest, 'wait', chatReply);
                    setChatRequest(null);
                  }}
                  className="flex-1 min-h-10 rounded-xl bg-secondary text-on-secondary text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition active:scale-95"
                >
                  <Send size={13} />
                  <span>Send reply (Ask to wait)</span>
                </button>

                <button
                  type="button"
                  disabled={busy || working}
                  onClick={async () => {
                    await act(
                      chatRequest,
                      'create',
                      chatReply,
                      chatLabel || chatRequest.examName,
                    );
                    setChatRequest(null);
                  }}
                  className="min-h-10 px-3.5 rounded-xl bg-primary text-on-primary text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition active:scale-95"
                >
                  <Check size={13} />
                  <span>
                    Approve #
                    {(chatLabel || chatRequest.examName).replace(/\s+/g, '-')}
                  </span>
                </button>
              </div>

              {error && (
                <p role="alert" className="text-center text-[10.5px] text-error font-medium">
                  {error}
                </p>
              )}
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
