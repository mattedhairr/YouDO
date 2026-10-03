import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronRight, MessageSquare, Plus, Send, X } from 'lucide-react';
import {
  chooseCommunityHashtag,
  fetchCommunityHashtags,
  requestCommunityHashtag,
  type CommunityHashtagContext,
  type CommunityHashtagRequest,
} from '../../lib/communityHashtags';
import Overlay from '../Overlay';

interface Props {
  boardEnabled: boolean;
  onBeforeChoose: () => Promise<void>;
  onContextChange?: (context: CommunityHashtagContext) => void;
}

const EMPTY_CONTEXT: CommunityHashtagContext = { hashtags: [], requests: [] };

export default function CommunityHashtagProfileField({ boardEnabled, onBeforeChoose, onContextChange }: Props) {
  const [context, setContext] = useState<CommunityHashtagContext>(EMPTY_CONTEXT);
  const [panel, setPanel] = useState<'choose' | 'request' | null>(null);
  const [exam, setExam] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [chatRequest, setChatRequest] = useState<CommunityHashtagRequest | null>(null);
  const [userReply, setUserReply] = useState('');
  const [replySuccess, setReplySuccess] = useState('');

  const refresh = useCallback(async () => {
    const next = await fetchCommunityHashtags();
    setContext(next);
    onContextChange?.(next);
  }, [onContextChange]);

  useEffect(() => {
    let cancelled = false;
    void fetchCommunityHashtags().then((next) => {
      if (cancelled) return;
      setContext(next);
      onContextChange?.(next);
    }).catch(() => { /* The field remains available for a later retry. */ });
    return () => { cancelled = true; };
  }, [onContextChange]);

  const ensureBoard = () => {
    if (boardEnabled) return true;
    setError('Turn on “Appear on the board” first.');
    return false;
  };

  const choose = async (id?: string) => {
    if (busy || (id && !ensureBoard())) return;
    setBusy(true); setError('');
    try {
      if (id) await onBeforeChoose();
      await chooseCommunityHashtag(id);
      await refresh();
      setPanel(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your exam hashtag.');
    } finally { setBusy(false); }
  };

  const request = async () => {
    if (!ensureBoard() || exam.trim().length < 2 || busy) return;
    setBusy(true); setError('');
    try {
      await onBeforeChoose();
      await requestCommunityHashtag(exam, details);
      await refresh();
      setExam(''); setDetails('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your request.');
    } finally { setBusy(false); }
  };

  const sendReply = async (targetRequest: CommunityHashtagRequest) => {
    if (busy || userReply.trim().length < 2) return;
    setBusy(true); setError('');
    try {
      await requestCommunityHashtag(targetRequest.examName, userReply.trim());
      await refresh();
      setReplySuccess('Reply sent to the admin!');
      setTimeout(() => {
        setChatRequest(null);
        setReplySuccess('');
        setUserReply('');
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send reply.');
    } finally {
      setBusy(false);
    }
  };

  return <>
    <div className="mt-1 flex items-center justify-between">
      <div className="flex-1 min-w-0 pr-4">
        <span className="block text-[12px] font-semibold text-content-primary">Exam community</span>
        <strong className="block mt-0.5 text-[11px] text-content-secondary font-medium truncate">
          {context.mine ? `#${context.mine.label}` : 'Choose an approved hashtag'}
        </strong>
        <small className="block mt-1 text-[10.5px] leading-relaxed text-content-muted">
          {context.mine ? 'Shown on your Board profile and leaderboard.' : 'All exam chats are readable; choose one to post there.'}
        </small>
      </div>
      <button 
        type="button" 
        onClick={() => { setError(''); setPanel('choose'); }}
        className="h-8 rounded-lg border border-subtle bg-surface px-3 text-[11px] font-semibold text-content-secondary hover:text-content-primary shrink-0"
      >
        {context.mine ? 'Change' : 'Choose'}
      </button>
    </div>

    <Overlay open={panel !== null} onClose={() => setPanel(null)} align="bottom">
      <section className="bg-base rounded-t-[28px] p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-8px_40px_rgba(0,0,0,0.12)]">
        
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-subtle" />
        
        <header className="flex items-center justify-between pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-content-muted">PUBLIC PROFILE</p>
            <h3 className="text-[18px] font-bold text-content-primary tracking-tight">
              {panel === 'request' ? 'Request an exam hashtag' : 'Choose your exam'}
            </h3>
          </div>
          <button 
            type="button" 
            onClick={() => setPanel(null)} 
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full bg-surface text-content-secondary hover:text-content-primary"
          >
            <X size={17}/>
          </button>
        </header>

        {panel === 'choose' ? <>
          <p className="mb-4 text-[11px] leading-relaxed text-content-secondary bg-surface p-3 rounded-xl border border-subtle">
            All exam rooms are readable. Choose one to post there. If you change hashtags while you still have messages in any exam room, posting in your new room waits until those messages expire (up to 24 hours). General stays open.
          </p>
          
          {context.hashtags.length > 0 ? (
            <div className="overflow-hidden rounded-[14px] border border-subtle bg-surface divide-y divide-subtle mb-4">
              {context.mine && (
                <button type="button" disabled={busy} onClick={() => void choose()} className="flex w-full items-center justify-between p-3 text-left hover:bg-surface/50">
                  <div>
                    <span className="block text-[12.5px] font-semibold text-content-primary">No exam hashtag</span>
                    <small className="block mt-0.5 text-[10.5px] text-content-muted">Use General chat only</small>
                  </div>
                </button>
              )}
              {context.hashtags.map((tag) => (
                <button type="button" disabled={busy} key={tag.id} onClick={() => void choose(tag.id)} className="flex w-full items-center justify-between p-3 text-left hover:bg-surface/50">
                  <span className="text-[12.5px] font-semibold text-content-primary">#{tag.label}</span>
                  {context.mine?.id === tag.id ? (
                    <Check size={16} className="text-primary" />
                  ) : (
                    <small className="text-[10.5px] text-content-muted">{tag.memberCount} member{tag.memberCount === 1 ? '' : 's'}</small>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-center text-[11px] text-content-muted p-4 border border-dashed border-subtle rounded-[14px]">No exam hashtags have been approved yet.</p>
          )}

          <button 
            type="button" 
            onClick={() => { setError(''); setPanel('request'); }}
            className="flex w-full items-center justify-center gap-1.5 h-11 rounded-[12px] bg-surface border border-subtle text-[12px] font-semibold text-content-secondary hover:text-content-primary"
          >
            <Plus size={14}/> My exam is not listed
          </button>
        </> : <>
          {context.requests.length > 0 && (
            <div className="mb-4 space-y-2">
              {context.requests.map((item) => (
                <div
                  className={`p-3 rounded-xl border ${
                    item.status === 'waiting'
                      ? 'border-warning/30 bg-warning/10'
                      : item.status === 'declined'
                      ? 'border-error/30 bg-error-soft'
                      : 'border-subtle bg-surface'
                  }`}
                  key={item.id}
                >
                  <div className="flex items-center justify-between mb-1">
                    <strong
                      className={`text-[10.5px] font-bold uppercase tracking-wider ${
                        item.status === 'waiting'
                          ? 'text-warning'
                          : item.status === 'declined'
                          ? 'text-error'
                          : 'text-primary'
                      }`}
                    >
                      {item.status === 'waiting'
                        ? 'Admin replied'
                        : item.status === 'declined'
                        ? 'Not approved'
                        : 'Request sent'}
                    </strong>
                    <span className="text-[11px] font-semibold text-content-primary">
                      #{item.examName}
                    </span>
                  </div>

                  {item.adminResponse && (
                    <div className="mt-1.5 pt-1.5 border-t border-subtle/40">
                      <p className="text-[11px] leading-relaxed text-content-secondary">
                        <span className="font-semibold text-content-primary">Admin: </span>
                        {item.adminResponse}
                      </p>
                    </div>
                  )}

                  {item.adminResponse && item.status === 'waiting' && (
                    <button
                      type="button"
                      onClick={() => {
                        setChatRequest(item);
                        setUserReply('');
                        setReplySuccess('');
                      }}
                      className="mt-2.5 w-full flex items-center justify-center gap-1.5 h-9 rounded-lg bg-surface border border-secondary/30 text-secondary text-[11px] font-semibold hover:bg-secondary-soft/20 transition active:scale-[0.98]"
                    >
                      <MessageSquare size={13} />
                      <span>Open Support Chat &amp; Reply</span>
                      <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          
          <div className="space-y-3 mb-4">
            <label className="block">
              <span className="block text-[11px] font-semibold text-content-primary mb-1">Exam name</span>
              <input value={exam} onChange={(event) => setExam(event.target.value)} maxLength={50} placeholder="e.g. GATE, NEET PG, UPSC CSE" className="w-full h-11 px-3 text-[12px] bg-surface border border-subtle rounded-xl outline-none focus:border-primary transition-colors" />
            </label>
            <label className="block">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[11px] font-semibold text-content-primary">Helpful context</span>
                <span className="text-[10px] text-content-muted">optional</span>
              </div>
              <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={240} rows={3} placeholder="Branch, stage, or anything the admin should know" className="w-full p-3 text-[12px] bg-surface border border-subtle rounded-xl outline-none focus:border-primary transition-colors resize-none" />
            </label>
          </div>

          <button 
            type="button" 
            disabled={busy || exam.trim().length < 2} 
            onClick={() => void request()}
            className="w-full h-11 flex items-center justify-center rounded-[12px] bg-primary text-on-primary text-[12.5px] font-bold disabled:opacity-50"
          >
            {busy ? 'Sending...' : 'Send request'}
          </button>
        </>}
        {error && <p role="alert" className="mt-3 text-center text-[11px] font-medium text-error">{error}</p>}
      </section>
    </Overlay>

    {/* User Support Chat Reply Modal */}
    {chatRequest && (
      <Overlay open={Boolean(chatRequest)} onClose={() => setChatRequest(null)} align="bottom">
        <div className="w-full max-w-[480px] max-h-[85vh] flex flex-col rounded-t-[28px] bg-elevated border-t border-subtle p-5 shadow-2xl text-content-primary">
          <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-border-subtle" />

          <header className="flex items-center justify-between pb-3 border-b border-subtle">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Hashtag Support</p>
              <h3 className="text-[17px] font-bold text-content-primary">#{chatRequest.examName}</h3>
            </div>
            <button 
              type="button" 
              onClick={() => setChatRequest(null)} 
              aria-label="Close"
              className="grid size-8 place-items-center rounded-full bg-surface text-content-secondary hover:text-content-primary"
            >
              <X size={16}/>
            </button>
          </header>

          <div className="my-3 flex-1 overflow-y-auto space-y-3 pr-1 max-h-[42vh]">
            <div className="flex flex-col items-start gap-1">
              <span className="text-[10px] text-content-muted pl-1">Your request</span>
              <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-surface border border-subtle p-3 text-xs leading-relaxed text-content-primary">
                <p className="font-bold text-primary">#{chatRequest.examName}</p>
                {chatRequest.details && <p className="mt-1 text-content-secondary">{chatRequest.details}</p>}
              </div>
            </div>

            {chatRequest.adminResponse && (
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] text-secondary pr-1 font-bold">Admin message</span>
                <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-secondary-soft border border-secondary/25 p-3 text-xs leading-relaxed text-content-primary text-left">
                  <p>{chatRequest.adminResponse}</p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-subtle pt-3 space-y-2.5">
            <label className="block">
              <span className="block text-[10.5px] font-semibold text-content-primary mb-1">
                Reply to admin
              </span>
              <textarea
                value={userReply}
                onChange={(e) => setUserReply(e.target.value)}
                maxLength={240}
                rows={3}
                placeholder="Explain what exam this is, which syllabus/branch, or answer the admin's question..."
                className="w-full resize-none rounded-xl border border-subtle bg-base p-2.5 text-xs text-content-primary placeholder:text-content-muted outline-none focus:border-primary"
              />
            </label>

            {replySuccess && (
              <p role="status" className="text-center text-[11px] font-semibold text-success animate-fade-in">
                {replySuccess}
              </p>
            )}

            <button
              type="button"
              disabled={busy || userReply.trim().length < 2}
              onClick={() => void sendReply(chatRequest)}
              className="w-full h-11 flex items-center justify-center gap-1.5 rounded-[12px] bg-primary text-on-primary text-[12.5px] font-bold disabled:opacity-50 transition active:scale-95"
            >
              <Send size={14} />
              <span>{busy ? 'Sending...' : 'Send reply to admin'}</span>
            </button>
          </div>
        </div>
      </Overlay>
    )}
  </>;
}
