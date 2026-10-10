import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, X } from 'lucide-react';
import {
  fetchCommunityRooms,
  requestCommunityHashtag,
  type CommunityHashtagContext,
  type CommunityHashtagRequest,
} from '../../lib/communityHashtags';
import Overlay from '../Overlay';
import CommunityHashtagSupportChat from './CommunityHashtagSupportChat';

interface Props {
  selectedId?: string;
  onSelect: (id?: string) => void;
  onContextChange: (context: CommunityHashtagContext) => void;
}

export default function CommunityHashtagBar({selectedId,onSelect,onContextChange}:Props) {
  const selectedRef=useRef(selectedId);
  selectedRef.current=selectedId;
  const [context,setContext]=useState<CommunityHashtagContext>({hashtags:[],requests:[]});
  const [panel,setPanel]=useState<'request'|'explore'|null>(null);
  const [chatRequest, setChatRequest] = useState<CommunityHashtagRequest | null>(null);
  const [exam,setExam]=useState('');
  const [details,setDetails]=useState('');
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

  let secondTabTag = context.hashtags.find(t => t.id === context.mine?.id);
  if (selectedId && selectedId !== context.mine?.id) {
    secondTabTag = context.hashtags.find(t => t.id === selectedId) || secondTabTag;
  }

  const hasWaitingRequests = context.requests.some(r => r.status === 'waiting');

  const otherUnreadCount = context.hashtags.reduce((acc, tag) => {
    if (tag.id !== secondTabTag?.id) {
      return acc + (context.roomUnread?.[tag.id] ?? 0);
    }
    return acc;
  }, 0);

  return (
    <nav className="px-3 pb-2 pt-1" aria-label="Chat rooms">
      <div className="flex items-center gap-1 p-1 rounded-[16px] bg-surface border border-subtle w-full relative z-0">
        {/* Sliding Background */}
        <div 
          className="absolute left-1 top-1 bottom-1 rounded-xl bg-elevated border border-subtle shadow-[0_2px_8px_color-mix(in_srgb,var(--text-primary)_4%,transparent)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] -z-10"
          style={{
            width: secondTabTag ? 'calc((100% - 44px) / 2)' : 'calc(100% - 44px)',
            transform: !selectedId ? 'translateX(0)' : 'translateX(calc(100% + 4px))',
          }}
        />

        {/* General Room */}
        <button
          type="button"
          className={`flex-1 h-9 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-200 ${
            !selectedId ? 'text-content-primary' : 'text-content-secondary hover:text-content-primary'
          }`}
          aria-pressed={!selectedId}
          onClick={() => tap(undefined)}
        >
          <span>General</span>
          {!!context.roomUnread?.general && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${!selectedId ? 'bg-primary text-on-primary' : 'bg-base text-content-muted'}`}>
              {context.roomUnread.general > 99 ? '99+' : context.roomUnread.general}
            </span>
          )}
        </button>

        {/* Second Tab (Mine or Selected) */}
        {secondTabTag && (
          <button
            type="button"
            className={`flex-1 h-9 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-200 ${
              selectedId === secondTabTag.id
                ? context.mine?.id === secondTabTag.id ? 'text-primary' : 'text-content-primary'
                : 'text-content-secondary hover:text-content-primary'
            }`}
            aria-pressed={selectedId === secondTabTag.id}
            onClick={() => tap(secondTabTag.id)}
          >
            <span className="opacity-50 font-bold">#</span>
            <span className="truncate max-w-[110px]">{secondTabTag.label}</span>
            {!!context.roomUnread?.[secondTabTag.id] && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${selectedId === secondTabTag.id ? 'bg-primary text-on-primary' : 'bg-base text-content-muted'}`}>
                {context.roomUnread[secondTabTag.id] > 99 ? '99+' : context.roomUnread[secondTabTag.id]}
              </span>
            )}
          </button>
        )}

        {/* Explore / More button */}
        <button
          type="button"
          onClick={() => { setError(''); setPanel('explore'); }}
          className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors relative ${panel === 'explore' ? 'bg-elevated border border-subtle text-content-primary shadow-sm' : 'text-content-muted hover:text-content-primary'}`}
          aria-label="Explore other rooms"
        >
          <ChevronDown size={16} />
          {hasWaitingRequests ? (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-surface animate-pulse" aria-hidden="true" />
          ) : otherUnreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-secondary border-2 border-surface" aria-hidden="true" />
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

            {/* User Hashtag Requests Section */}
            {context.requests.length > 0 && (
              <div className="mt-2 mb-3 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                    <MessageSquare size={12} />
                    Your Hashtag Requests
                  </span>
                  <span className="text-[9.5px] font-semibold text-content-muted">
                    {context.requests.length} sent
                  </span>
                </div>
                <div className="space-y-2">
                  {context.requests.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border ${
                        item.status === 'waiting'
                          ? 'border-warning/35 bg-warning/10 shadow-sm'
                          : item.status === 'declined'
                          ? 'border-error/25 bg-error-soft/30'
                          : 'border-subtle bg-surface'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-content-primary text-[12.5px]">
                          #{item.examName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            item.status === 'waiting'
                              ? 'bg-warning/20 text-warning border border-warning/30'
                              : item.status === 'declined'
                              ? 'bg-error-soft text-error'
                              : 'bg-primary-soft text-primary'
                          }`}
                        >
                          {item.status === 'waiting'
                            ? 'Admin replied'
                            : item.status === 'declined'
                            ? 'Not approved'
                            : 'Pending review'}
                        </span>
                      </div>

                      {item.adminResponse ? (
                        <p className="text-[11px] leading-relaxed text-content-secondary mt-1 bg-elevated/60 p-2 rounded-lg border border-subtle/50">
                          <strong className="text-secondary font-semibold">Admin: </strong>
                          {item.adminResponse}
                        </p>
                      ) : item.details ? (
                        <p className="text-[10.5px] text-content-muted truncate mt-0.5">
                          {item.details}
                        </p>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setChatRequest(item)}
                        className={`mt-2 w-full flex items-center justify-center gap-1.5 h-8.5 rounded-lg text-[11px] font-semibold transition active:scale-[0.98] ${
                          item.status === 'waiting'
                            ? 'bg-secondary text-on-secondary shadow-sm font-bold'
                            : 'bg-surface border border-subtle text-content-secondary hover:text-content-primary'
                        }`}
                      >
                        <MessageSquare size={13} />
                        <span>
                          {item.status === 'waiting'
                            ? 'Open Support Chat & Reply'
                            : 'Open Support Chat'}
                        </span>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                <div className="c-hashtag-request-list mb-3">
                  {context.requests.map((item) => (
                    <div className={`c-hashtag-request-state is-${item.status}`} key={item.id}>
                      <div className="flex items-center justify-between w-full">
                        <strong>{item.status === 'waiting' ? 'Admin replied' : item.status === 'declined' ? 'Not approved' : 'Request sent'}</strong>
                        <span>#{item.examName}</span>
                      </div>
                      {item.adminResponse && <p>{item.adminResponse}</p>}
                      <button
                        type="button"
                        onClick={() => setChatRequest(item)}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 h-8 rounded-lg bg-surface border border-secondary/30 text-secondary text-[11px] font-semibold hover:bg-secondary-soft/20 transition"
                      >
                        <MessageSquare size={12} />
                        <span>Open Support Chat &amp; Reply</span>
                        <ChevronRight size={12} />
                      </button>
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

      {/* Support Chat Drawer */}
      {chatRequest && (
        <CommunityHashtagSupportChat
          request={chatRequest}
          onClose={() => setChatRequest(null)}
          onSuccess={refresh}
        />
      )}
    </nav>
  );
}
