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

  const visibleTags = context.hashtags.filter(tag => tag.id === context.mine?.id || tag.id === selectedId);
  const otherUnreadCount = context.hashtags.reduce((acc, tag) => {
    if (tag.id !== context.mine?.id && tag.id !== selectedId) {
      return acc + (context.roomUnread?.[tag.id] ?? 0);
    }
    return acc;
  }, 0);

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

        {/* Visible Hashtag Rooms (Mine + Selected) */}
        {visibleTags.map((tag) => {
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

        {/* Explore Hashtags button */}
        <button
          type="button"
          className="c-room-tab c-room-tab-request"
          onClick={() => { setError(''); setPanel('explore'); }}
          aria-label="Explore other rooms"
        >
          <ChevronDown size={14} />
          <span>More</span>
          {otherUnreadCount > 0 && (
            <span className="c-room-tab-badge ml-1" aria-label={`${otherUnreadCount} unread in other rooms`}>
              {otherUnreadCount > 99 ? '99+' : otherUnreadCount}
            </span>
          )}
        </button>
      </div>

      {error && !panel && <p className="c-hashtag-inline-error">{error}</p>}

      <Overlay open={panel !== null} onClose={() => setPanel(null)} align="bottom">
        {panel === 'explore' && (
          <section className="c-hashtag-sheet">
            <header>
              <div>
                <span>EXAM CHAT</span>
                <h3>Explore rooms</h3>
              </div>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close"><X size={17} /></button>
            </header>
            <div className="mt-2 flex max-h-[50vh] flex-col gap-2 overflow-y-auto pb-4">
              {context.hashtags.map(tag => {
                const unreadCount = context.roomUnread?.[tag.id] ?? 0;
                return (
                  <button key={tag.id} type="button" onClick={() => { tap(tag.id); setPanel(null); }} className="flex items-center justify-between rounded-xl border border-subtle p-3.5 text-left transition-colors hover:bg-surface">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-content-primary">#{tag.label}</span>
                      {context.mine?.id === tag.id && <span className="rounded-full bg-secondary-soft px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-secondary">Your exam</span>}
                    </div>
                    {unreadCount > 0 && <span className="c-room-tab-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                  </button>
                );
              })}
            </div>
            <button type="button" className="c-hashtag-submit mt-2 w-full" onClick={() => setPanel('request')}>Request a new exam hashtag</button>
          </section>
        )}
        
        {panel === 'request' && (
          <section className="c-hashtag-sheet">
            <header>
              <div>
                <button type="button" onClick={() => setPanel('explore')} className="mr-2 inline-flex items-center text-content-muted" aria-label="Back"><ChevronDown size={17} className="rotate-90" /></button>
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
        )}
      </Overlay>
    </nav>
  );
}
