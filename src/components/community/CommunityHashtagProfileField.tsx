import { useCallback, useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  chooseCommunityHashtag,
  fetchCommunityHashtags,
  requestCommunityHashtag,
  type CommunityHashtagContext,
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

  return <>
    <div className="settings-hashtag-field">
      <div className="settings-hashtag-copy">
        <span>Exam community</span>
        <strong>{context.mine ? `#${context.mine.label}` : 'Choose an approved hashtag'}</strong>
        <small>{context.mine ? 'Shown on your Board profile and leaderboard.' : 'General chat stays available; choose one to unlock exam chats.'}</small>
      </div>
      <button type="button" onClick={() => { setError(''); setPanel('choose'); }}>
        {context.mine ? 'Change' : 'Choose'}
      </button>
    </div>
    <Overlay open={panel !== null} onClose={() => setPanel(null)} align="bottom">
      <section className="c-hashtag-sheet settings-hashtag-sheet">
        <header><div><span>PUBLIC PROFILE</span><h3>{panel === 'request' ? 'Request an exam hashtag' : 'Choose your exam'}</h3></div><button type="button" onClick={() => setPanel(null)} aria-label="Close"><X size={17}/></button></header>
        {panel === 'choose' ? <>
          <p className="c-hashtag-help">Choose one approved exam for your Board profile and exam chat. You can change or remove it later.</p>
          {context.hashtags.length > 0 ? <div className="c-hashtag-choices">{context.mine && <button type="button" className="c-hashtag-none" disabled={busy} onClick={() => void choose()}>
            <span>No exam hashtag</span><small>Use General chat only</small>
          </button>}{context.hashtags.map((tag) => <button type="button" disabled={busy} key={tag.id} onClick={() => void choose(tag.id)}>
            <span>#{tag.label}</span>{context.mine?.id === tag.id ? <Check size={13}/> : <small>{tag.memberCount} member{tag.memberCount === 1 ? '' : 's'}</small>}
          </button>)}</div> : <p className="settings-hashtag-empty">No exam hashtags have been approved yet.</p>}
          <button type="button" className="c-hashtag-link" onClick={() => { setError(''); setPanel('request'); }}><Plus size={12}/> My exam is not listed</button>
        </> : <>
          {context.requests.length > 0 && <div className="c-hashtag-request-list">{context.requests.map((item) => <div className={`c-hashtag-request-state is-${item.status}`} key={item.id}>
            <strong>{item.status === 'waiting' ? 'Admin replied' : item.status === 'declined' ? 'Not approved' : 'Request sent'}</strong><span>#{item.examName}</span>{item.adminResponse && <p>{item.adminResponse}</p>}
          </div>)}</div>}
          <label>Exam name<input value={exam} onChange={(event) => setExam(event.target.value)} maxLength={50} placeholder="e.g. GATE, NEET PG, UPSC CSE" /></label>
          <label>Helpful context <small>optional</small><textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={240} rows={3} placeholder="Branch, stage, or anything the admin should know" /></label>
          <button type="button" className="c-hashtag-submit" disabled={busy || exam.trim().length < 2} onClick={() => void request()}>{busy ? 'Sending…' : 'Send request'}</button>
        </>}
        {error && <p role="alert" className="c-hashtag-sheet-error">{error}</p>}
      </section>
    </Overlay>
  </>;
}
