import { useState } from 'react';
import { Clock, Send, Shield, User, X } from 'lucide-react';
import {
  requestCommunityHashtag,
  type CommunityHashtagRequest,
} from '../../lib/communityHashtags';
import Overlay from '../Overlay';

interface Props {
  request: CommunityHashtagRequest | null;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export default function CommunityHashtagSupportChat({
  request,
  onClose,
  onSuccess,
}: Props) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!request) return null;

  const handleSend = async () => {
    if (busy || reply.trim().length < 2) return;
    setBusy(true);
    setError('');
    const replyPayload = (
      request.status === 'waiting'
        ? `[Reply] ${reply.trim()}`
        : reply.trim()
    ).slice(0, 240);
    try {
      await requestCommunityHashtag(request.examName, replyPayload);
      await onSuccess();
      setSuccess('Reply sent to the admin team!');
      setTimeout(() => {
        setSuccess('');
        setReply('');
        onClose();
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your reply.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay open={Boolean(request)} onClose={onClose} align="bottom">
      <div className="w-full max-w-[480px] max-h-[85vh] flex flex-col rounded-t-[28px] bg-elevated border-t border-subtle p-5 shadow-2xl text-content-primary">
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-border-subtle" />

        <header className="flex items-center justify-between pb-3 border-b border-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
                Hashtag Support
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                  request.status === 'waiting'
                    ? 'bg-warning/20 text-warning border border-warning/30'
                    : request.status === 'declined'
                    ? 'bg-error-soft text-error border border-error/20'
                    : 'bg-primary-soft text-primary border border-primary/20'
                }`}
              >
                {request.status === 'waiting'
                  ? 'Admin replied'
                  : request.status === 'declined'
                  ? 'Not approved'
                  : 'Awaiting review'}
              </span>
            </div>
            <h3 className="text-[17px] font-bold text-content-primary mt-0.5">
              #{request.examName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full bg-surface text-content-secondary hover:text-content-primary transition"
          >
            <X size={16} />
          </button>
        </header>

        <div className="my-3 flex-1 overflow-y-auto space-y-3 pr-1 max-h-[42vh]">
          {/* User Request Bubble */}
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-1 text-[10px] text-content-muted pl-1">
              <User size={11} />
              <span className="font-semibold">Your request</span>
              <span>·</span>
              <time>
                {request.createdAt ? new Date(request.createdAt).toLocaleDateString() : 'Recently'}
              </time>
            </div>
            <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-surface border border-subtle p-3 text-xs leading-relaxed text-content-primary shadow-sm">
              <p className="font-bold text-primary">#{request.examName}</p>
              {request.details ? (
                <div className="mt-1 text-content-secondary border-t border-subtle/40 pt-1">
                  {request.details.startsWith('[Reply]') ? (
                    <>
                      <span className="font-bold text-secondary text-[10px] uppercase tracking-wider block mb-0.5">
                        Your latest response:
                      </span>
                      <p>{request.details.replace(/^\[Reply\]\s*/, '')}</p>
                    </>
                  ) : (
                    <p>{request.details}</p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-content-muted italic text-[11px]">No initial details provided.</p>
              )}
            </div>
          </div>

          {/* Admin Response Bubble */}
          {request.adminResponse && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1 text-[10px] text-secondary pr-1 font-bold">
                <Shield size={11} />
                <span>Admin Moderator</span>
                <span>·</span>
                <span>Replied</span>
              </div>
              <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-secondary-soft border border-secondary/25 p-3 text-xs leading-relaxed text-content-primary text-left shadow-sm">
                <p>{request.adminResponse}</p>
                <div className="mt-1.5 flex items-center justify-end gap-1 text-[9.5px] text-secondary font-medium">
                  <Clock size={10} />
                  <span>
                    {request.status === 'waiting'
                      ? 'Waiting for your reply'
                      : 'Admin note'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {request.status === 'waiting' && !request.adminResponse && (
            <div className="rounded-xl border border-warning/20 bg-warning/10 p-2.5 text-center">
              <p className="text-[10.5px] text-warning font-medium">
                ⏳ The admin team requested more details. Send your reply below.
              </p>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-subtle pt-3 space-y-2.5">
          <label className="block">
            <span className="block text-[10.5px] font-semibold text-content-primary mb-1">
              {request.status === 'waiting' ? 'Reply to admin' : 'Send message / additional details'}
            </span>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={240}
              rows={3}
              placeholder="Explain what exam this is, syllabus, branch, or answer the admin's question..."
              className="w-full resize-none rounded-xl border border-subtle bg-base p-2.5 text-xs text-content-primary placeholder:text-content-muted outline-none focus:border-secondary transition"
            />
            <div className="flex items-center justify-between mt-1 text-[9.5px] text-content-muted">
              <span>{reply.trim().length}/240</span>
              <span>Goes privately to community admins</span>
            </div>
          </label>

          {error && (
            <p role="alert" className="text-center text-[10.5px] font-semibold text-error">
              {error}
            </p>
          )}

          {success && (
            <p role="status" className="text-center text-[11px] font-semibold text-success animate-fade-in">
              {success}
            </p>
          )}

          <button
            type="button"
            disabled={busy || reply.trim().length < 2}
            onClick={() => void handleSend()}
            className="w-full h-11 flex items-center justify-center gap-1.5 rounded-[12px] bg-primary text-on-primary text-[12.5px] font-bold disabled:opacity-40 transition active:scale-95 shadow-sm"
          >
            <Send size={14} />
            <span>{busy ? 'Sending...' : 'Send reply to admin'}</span>
          </button>
        </div>
      </div>
    </Overlay>
  );
}
