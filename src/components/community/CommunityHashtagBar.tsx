import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Lock, Plus, X } from 'lucide-react';
import {
  fetchCommunityRooms,
  requestCommunityHashtag,
  type CommunityHashtagContext,
} from '../../lib/communityHashtags';
import Overlay from '../Overlay';

interface Props {
  selectedId?: string;
  onSelect: (id?: string) => void;
  onContextChange: (context: CommunityHashtagContext) => void;
}

export default function CommunityHashtagBar({selectedId,onSelect,onContextChange}:Props) {
  const selectedRef=useRef(selectedId);
  selectedRef.current=selectedId;
  const [context,setContext]=useState<CommunityHashtagContext>({hashtags:[],requests:[]});
  const [panel,setPanel]=useState<'request'|null>(null);
  const [exam,setExam]=useState('');
  const [details,setDetails]=useState('');
  const [expanded,setExpanded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    try { const next=await fetchCommunityRooms();setContext(next);onContextChange(next);setError('');
      const current=selectedRef.current;
      if(current&&!next.hashtags.some(tag=>tag.id===current))onSelect(undefined);
    }
    catch(e){onContextChange({hashtags:[],requests:[],roomsEnabled:false});setError(e instanceof Error?e.message:'Could not load exam hashtags.');}
  },[onContextChange,onSelect]);
  useEffect(()=>{
    void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30_000);
    const visible=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('youdo-community-read',visible);window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);
    return ()=>{window.clearInterval(timer);window.removeEventListener('youdo-community-read',visible);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);};
  },[refresh]);

  const request = async () => {
    if (exam.trim().length < 2) return;
    setBusy(true); setError('');
    try {
      await requestCommunityHashtag(exam, details);
      await refresh();
      setExam(''); setDetails(''); setPanel(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your request.');
    } finally {
      setBusy(false);
    }
  };

  const tap = (id?: string) => {
    onSelect(id);
  };

  // Reorder hashtags so user's assigned hashtag is immediately after General
  const sortedHashtags = [ ...context.hashtags ].sort((a, b) => {
    const aIsMine = context.mine?.id === a.id;
    const bIsMine = context.mine?.id === b.id;
    if (aIsMine && !bIsMine) return -1;
    if (!aIsMine && bIsMine) return 1;
    return 0;
  });

  return (
    <nav className="c-room-nav" aria-label="Chat rooms">
      <div className="c-room-track">
        {/* General Room */}
        <button
          type="button"
          className={`c-room-tab ${!selectedId ? 'is-active' : ''}`}
          aria-pressed={!selectedId}
          onClick={() => tap(undefined)}
        >
          <span className="c-room-tab-label">General</span>
          {!!context.roomUnread?.general && (
            <span className="c-room-tab-badge" aria-label={`${context.roomUnread.general} unread`}>
              {context.roomUnread.general > 99 ? '99+' : context.roomUnread.general}
            </span>
          )}
        </button>

        {/* Hashtag Rooms (User's room is first immediately after General) */}
        {sortedHashtags.map((tag) => {
          const isSelected = selectedId === tag.id;
          const isMine = context.mine?.id === tag.id;
          const isLocked = !isMine || !!context.postingUnlockAt;
          const unreadCount = context.roomUnread?.[tag.id] ?? 0;

          return (
            <button
              type="button"
              key={tag.id}
              aria-pressed={isSelected}
              className={`c-room-tab ${isSelected ? 'is-active' : ''} ${isMine ? 'is-mine-tab' : ''}`}
              onClick={() => tap(tag.id)}
            >
              {isLocked && <Lock size={10} className="c-room-tab-lock" />}
              <span className="c-room-tab-hash">#</span>
              <span className="c-room-tab-label">{tag.label}</span>
              {unreadCount > 0 && (
                <span className="c-room-tab-badge" aria-label={`${unreadCount} unread`}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Request Hashtag button */}
        <button
          type="button"
          className="c-room-tab c-room-tab-request"
          onClick={() => { setError(''); setPanel('request'); }}
          aria-label="Request a hashtag"
        >
          <Plus size={12} />
          <span>Request</span>
        </button>
      </div>

      {error && !panel && <p className="c-hashtag-inline-error">{error}</p>}

      <Overlay open={panel !== null} onClose={() => setPanel(null)} align="bottom">
        <section className="c-hashtag-sheet">
          <header>
            <div>
              <span>EXAM CHAT</span>
              <h3>Request a hashtag</h3>
            </div>
            <button type="button" onClick={() => setPanel(null)} aria-label="Close"><X size={17} /></button>
          </header>
          <>
            {context.requests.length > 0 && (
              <div className="c-hashtag-request-list">
                {context.requests.map((item) => (
                  <div className={`c-hashtag-request-state is-${item.status}`} key={item.id}>
                    <strong>{item.status === 'waiting' ? 'Admin replied' : item.status === 'declined' ? 'Not approved' : 'Request sent'}</strong>
                    <span>#{item.examName}</span>
                    {item.adminResponse && <p>{item.adminResponse}</p>}
                  </div>
                ))}
              </div>
            )}
            <label>Exam name<input value={exam} onChange={(e) => setExam(e.target.value)} maxLength={50} placeholder="e.g. GATE, NEET PG, UPSC CSE" /></label>
            <label>Helpful context <small>optional</small><textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={240} rows={3} placeholder="Branch, stage, or anything the admin should know" /></label>
            <button type="button" className="c-hashtag-submit" disabled={busy || exam.trim().length < 2} onClick={() => void request()}>{busy ? 'Sending…' : 'Send request'}</button>
          </>
          {error && <p role="alert" className="c-hashtag-sheet-error">{error}</p>}
        </section>
      </Overlay>
    </nav>
  );
}
