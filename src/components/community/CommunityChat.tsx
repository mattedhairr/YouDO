import './community.css';
import '../chat/youDoChat.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Check, ChevronDown, Heart, Lock, Megaphone, MessageSquare, RefreshCw, Reply, Send, ShieldCheck, X } from 'lucide-react';
import { fetchUserCommunityReports, markCommunityUpdatesRead, removeCommunityMessage, reportCommunityMessage, type CommunityContext, type UserCommunityReport } from '../../lib/community';
import { markChatRoomRead } from '../../lib/communityChat';
import { dismissCommunityNotification } from '../../lib/notifications';
import { fetchCommunityRooms, type CommunityHashtagContext, type CommunityHashtagRequest } from '../../lib/communityHashtags';
import { activeChatMessages, chatCacheGeneration, CHAT_HISTORY_LIMIT, CHAT_PAGE_SIZE, clearChatCache, deleteChatMessage, editChatMessage, fetchChatPage, mergeChatPage, pendingChatMessage, readChatCache, saveChatCache, sendChatMessage, type ChatMessage } from '../../lib/communityChat';
import CommunityHashtagBar from './CommunityHashtagBar';
import CommunityHashtagSupportChat from './CommunityHashtagSupportChat';
import Overlay from '../Overlay';
import ChatActionSheet from '../chat/ChatActionSheet';
import { useChatMessageGestures } from '../chat/useChatMessageGestures';
import { STORAGE_KEYS } from '../../lib/storageKeys';
import { hapticTick } from '../../lib/haptics';
import { useStore } from '../../store';

interface Props { userId: string; context: CommunityContext; names: Map<string,string>; onProfile?: (id: string) => void; onOpenBoardSettings: () => void }
const clock = new Intl.DateTimeFormat(undefined,{ hour:'numeric',minute:'2-digit' });
const MESSAGE_ACTION_WINDOW_MS = 15 * 60 * 1000;
export default function CommunityChat({ userId, context, names, onProfile, onOpenBoardSettings }: Props) {
  const { pacePrefs } = useStore();
  const [selectedHashtag, setSelectedHashtagState] = useState<string | undefined>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.lastCommunityRoom);
      return saved && saved !== 'general' ? saved : undefined;
    } catch {
      return undefined;
    }
  });

  const setSelectedHashtag = useCallback((id?: string) => {
    setSelectedHashtagState(id);
    try {
      localStorage.setItem(STORAGE_KEYS.lastCommunityRoom, id ?? 'general');
    } catch {
      // ignore
    }
  }, []);

  const initial = useMemo(() => readChatCache(userId, `room:${selectedHashtag ?? 'general'}`),[userId, selectedHashtag]);
  const cacheLease = useRef(chatCacheGeneration());
  const [messages,setMessages] = useState(initial.messages);
  const [hasOlder,setHasOlder] = useState(initial.hasOlder);
  const [loading,setLoading] = useState(initial.messages.length===0);
  const [error,setError] = useState('');
  const [draft,setDraft] = useState('');
  const [reply,setReply] = useState<ChatMessage|null>(null);
  const [selected,setSelected] = useState<ChatMessage|null>(null);
  const [editing,setEditing] = useState<ChatMessage|null>(null);
  const [reason,setReason] = useState('');
  const [actionBusy,setActionBusy] = useState(false);
  const [actionError,setActionError] = useState('');
  const [newBelow,setNewBelow] = useState(false);
  const [updateOpen,setUpdateOpen] = useState(false);
  const [roomContext,setRoomContext] = useState<CommunityHashtagContext>({hashtags:[],requests:[]});
  const [reportsOpen, setReportsOpen] = useState(false);
  const [userReports, setUserReports] = useState<UserCommunityReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedChatRequest, setSelectedChatRequest] = useState<CommunityHashtagRequest | null>(null);

  const openReports = useCallback(async () => {
    setReportsOpen(true);
    setLoadingReports(true);
    try {
      const data = await fetchUserCommunityReports(userId);
      setUserReports(data);
    } finally {
      setLoadingReports(false);
    }
  }, [userId]);

  const waitingHashtagRequest = useMemo(
    () => roomContext.requests.find((r) => r.status === 'waiting'),
    [roomContext.requests],
  );

  const roomScope=`room:${selectedHashtag??'general'}`;
  const canWriteRoom =
    roomContext.roomsEnabled === true &&
    (selectedHashtag
      ? selectedHashtag === roomContext.mine?.id && !roomContext.postingUnlockAt
      : pacePrefs.optedIn);
  const currentScope=useRef(roomScope);currentScope.current=roomScope;
  const scroll = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef(initial.scrollTop);
  const composer = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const follow = useRef(initial.scrollTop==null);
  const viewport = useRef({ width: 0, height: 0 });
  const fetching = useRef(false);
  const refreshVersion = useRef(0);
  const inFlight = useRef(new Set<string>());
  const acknowledged = useRef(new Set<string>());
  const updateReading = useRef(false);
  const messagesRef = useRef(messages); messagesRef.current=messages;
  const olderRef=useRef(hasOlder); olderRef.current=hasOlder;
  const restoreAnchor=useRef<{id:string;offset:number;top:number}|null>(null);
  const loadedCount=useRef(Math.max(CHAT_PAGE_SIZE,initial.messages.filter(m=>m.delivery==='sent').length));
  const map=useMemo(()=>new Map(messages.map(m=>[m.id,m])),[messages]);

  const capturePosition=useCallback(()=>{
    const root=scroll.current;
    if(!root || follow.current)return;
    const element=Array.from(root.querySelectorAll<HTMLElement>('[data-message]')).find(node=>node.offsetTop+node.offsetHeight>root.scrollTop);
    restoreAnchor.current={id:element?.dataset.message??'',offset:(element?.offsetTop??root.scrollTop)-root.scrollTop,top:root.scrollTop};
  },[]);
  useLayoutEffect(()=>{
    const root=scroll.current;if(!root)return;
    if(follow.current) root.scrollTop=root.scrollHeight;
    else if(restoreAnchor.current) {
      const anchor=restoreAnchor.current;
      const element=Array.from(root.querySelectorAll<HTMLElement>('[data-message]')).find(node=>node.dataset.message===anchor.id);
      root.scrollTop=element ? element.offsetTop-anchor.offset : anchor.top;
    }
    scrollPosition.current=root.scrollTop;
    restoreAnchor.current=null;
  },[messages]);
  useLayoutEffect(()=>{if(scroll.current && initial.scrollTop!=null){scroll.current.scrollTop=initial.scrollTop;scrollPosition.current=scroll.current.scrollTop;follow.current=scroll.current.scrollHeight-scroll.current.scrollTop-scroll.current.clientHeight<72;}},[initial]);
  useLayoutEffect(()=>{
    const root=scroll.current;if(!root)return;
    const resized=()=>{
      viewport.current={width:root.clientWidth,height:root.clientHeight};
      if(follow.current)root.scrollTop=root.scrollHeight;
      scrollPosition.current=root.scrollTop;
    };
    resized();
    const observer=new ResizeObserver(resized);
    observer.observe(root);
    return()=>observer.disconnect();
  },[]);

  const refresh=useCallback(async()=>{
    if(fetching.current || !context.canJoin)return;
    const version=refreshVersion.current;
    fetching.current=true;
    try {
      const fresh:ChatMessage[]=[];
      let before:number|undefined;
      let full=false;
      for(let n=0;n<Math.ceil(loadedCount.current/CHAT_PAGE_SIZE);n++){
        const page=await fetchChatPage(before,selectedHashtag);
        fresh.push(...page);full=page.length===CHAT_PAGE_SIZE;
        if(!full)break;before=page[page.length-1]?.sequence;
      }
      if(!mounted.current||version!==refreshVersion.current)return;
      capturePosition();
      if(!follow.current && fresh.some(m=>!messagesRef.current.some(old=>old.id===m.id)))setNewBelow(true);
      // Refresh the entire loaded window, so removals and bans leave no ghosts.
      setMessages(current=>mergeChatPage(current.filter(m=>m.delivery!=='sent'),fresh));
      setHasOlder(full && fresh.length<CHAT_HISTORY_LIMIT);setError('');
    } catch(e){if(mounted.current&&version===refreshVersion.current)setError(e instanceof Error?e.message:'Could not refresh chat.');}
    finally{if(version===refreshVersion.current){fetching.current=false;if(mounted.current)setLoading(false);}}
  },[capturePosition,context.canJoin,selectedHashtag]);
  useEffect(()=>{
    mounted.current=true;refreshVersion.current++;fetching.current=false;
    const saved=readChatCache(userId,roomScope);
    messagesRef.current=saved.messages;olderRef.current=saved.hasOlder;
    setMessages(saved.messages);setHasOlder(saved.hasOlder);setLoading(saved.messages.length===0);
    scrollPosition.current=saved.scrollTop;follow.current=saved.scrollTop==null;loadedCount.current=Math.max(CHAT_PAGE_SIZE,saved.messages.filter(m=>m.delivery==='sent').length);
    acknowledged.current.clear();setNewBelow(false);setError('');setDraft('');setReply(null);setEditing(null);setSelected(null);setActionBusy(false);void refresh();void dismissCommunityNotification();
    const onVisible=()=>{if(document.visibilityState==='visible'){void refresh();void dismissCommunityNotification();}};
    const timer=window.setInterval(onVisible,2_000);
    document.addEventListener('visibilitychange',onVisible);window.addEventListener('online',onVisible);
    window.addEventListener('youdo-community-refresh-chat', refresh);
    const generation=cacheLease.current;
    return()=>{
      mounted.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onVisible);
      window.removeEventListener('youdo-community-refresh-chat', refresh);
      saveChatCache(userId,{messages:messagesRef.current,scrollTop:scrollPosition.current,hasOlder:olderRef.current},generation,roomScope);
    };
  },[refresh,userId,roomScope]);
  useEffect(()=>setUpdateOpen(false),[context.settings.announcement,context.settings.announcementUpdatedAt]);
  useEffect(()=>{if(!context.canJoin){clearChatCache(userId);setMessages([]);}},[context.canJoin,userId]);
  useEffect(()=>{
    const nearest=Math.min(...messages.map(message=>Date.parse(message.expiresAt)));
    if(!Number.isFinite(nearest))return;
    const timer=window.setTimeout(()=>setMessages(current=>activeChatMessages(current)),Math.min(2_147_483_647,Math.max(25,nearest-Date.now()+25)));
    return()=>clearTimeout(timer);
  },[messages]);
  useEffect(()=>{
    const root=scroll.current;if(!root || !context.canJoin)return;
    const seen=new Set<string>();let timer:number|undefined;
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        const id=(entry.target as HTMLElement).dataset.message;
        if(id && !acknowledged.current.has(id) && entry.isIntersecting && document.visibilityState==='visible' && map.get(id)?.delivery==='sent')seen.add(id);
      }
      if(seen.size && !timer)timer=window.setTimeout(()=>{
        timer=undefined;
        if(document.visibilityState!=='visible' || !mounted.current){seen.clear();return;}
        const ids=[...seen];seen.clear();
        ids.forEach(id=>acknowledged.current.add(id));
        void markChatRoomRead(ids,selectedHashtag).then(ok=>{if(ok)window.dispatchEvent(new Event('youdo-community-read'));else ids.forEach(id=>acknowledged.current.delete(id));});
      },500);
    },{root,threshold:0.6});
    root.querySelectorAll('[data-message]').forEach(node=>observer.observe(node));
    return()=>{observer.disconnect();if(timer)clearTimeout(timer);};
  },[map,context.canJoin,selectedHashtag]);

  const transmit=async(message:ChatMessage)=>{
    if(inFlight.current.has(message.id)||!canWriteRoom||message.roomId!==selectedHashtag)return;
    const scope=roomScope;
    inFlight.current.add(message.id);
    setMessages(current=>current.map(m=>m.id===message.id?{...m,delivery:'pending',error:undefined}:m));
    try{
      const sent=await sendChatMessage(message);
      if(mounted.current&&currentScope.current===scope){capturePosition();setMessages(current=>mergeChatPage(current,[sent]));}
    }catch(e){if(mounted.current&&currentScope.current===scope)setMessages(current=>current.map(m=>m.id===message.id?{...m,delivery:'failed',error:e instanceof Error?e.message:'Could not send.'}:m));}
    finally{inFlight.current.delete(message.id);}
  };
  const send=()=>{
    if(!draft.trim() || !context.canPost || !canWriteRoom || actionBusy)return;
    setError('');
    if(editing){
      const scope=roomScope;
      setActionBusy(true);
      void editChatMessage(editing.id,draft).then(message=>{if(mounted.current&&currentScope.current===scope){capturePosition();setMessages(current=>mergeChatPage(current,[message]));setEditing(null);setDraft('');}})
        .catch(e=>{if(mounted.current&&currentScope.current===scope)setError(e.message);}).finally(()=>{if(mounted.current&&currentScope.current===scope)setActionBusy(false);});
      return;
    }
    if(messages.filter(m=>m.delivery!=='sent').length>=5){setError('Retry or remove a pending message before sending another.');return;}
    const pending=pendingChatMessage(userId,draft,reply?.id,Date.now(),selectedHashtag);
    follow.current=true;setNewBelow(false);setMessages(current=>mergeChatPage(current,[pending]));setDraft('');setReply(null);
    void transmit(pending);
  };
  const loadOlder=async()=>{
    if(fetching.current)return;
    const oldest=messages.find(m=>m.delivery==='sent');if(!oldest)return;
    const version=refreshVersion.current;
    fetching.current=true;setLoading(true);
    try{
      const page=await fetchChatPage(oldest.sequence,selectedHashtag);if(!mounted.current||version!==refreshVersion.current)return;
      capturePosition();loadedCount.current=Math.min(CHAT_HISTORY_LIMIT,loadedCount.current+CHAT_PAGE_SIZE);
      setMessages(current=>mergeChatPage(current,page));setHasOlder(page.length===CHAT_PAGE_SIZE && loadedCount.current<CHAT_HISTORY_LIMIT);
    }catch(e){if(mounted.current&&version===refreshVersion.current)setError(e instanceof Error?e.message:'Could not load older messages.');}
    finally{if(version===refreshVersion.current){fetching.current=false;if(mounted.current)setLoading(false);}}
  };
  const openActions = useCallback((message: ChatMessage) => {
    setSelected(message);
    setReason('');
    setActionError('');
  }, []);

  const beginReply = useCallback((message: ChatMessage) => {
    if (message.delivery !== 'sent' || !canWriteRoom) return;
    setReply(message);
    setEditing(null);
    setSelected(null);
    requestAnimationFrame(() => composer.current?.focus());
  }, [canWriteRoom]);

  const { getMessageProps } = useChatMessageGestures<ChatMessage>({
    onOpenActions: openActions,
    onDoubleTapReply: beginReply,
  });
  const action=async(kind:'delete'|'report'|'remove')=>{
    if(!selected || actionBusy)return;
    setActionBusy(true);setActionError('');
    try{
      if(kind==='delete'){
        if(selected.delivery==='sent')await deleteChatMessage(selected.id);
      }else if(kind==='remove'){
        const modNote = reason.trim() || 'Removed by moderator';
        if(!await removeCommunityMessage(selected.id, modNote))throw new Error('Could not remove this message.');
      }else if(!await reportCommunityMessage(selected.id))throw new Error('Could not send the report.');
      if(!mounted.current)return;
      if(kind!=='report'){capturePosition();setMessages(current=>current.filter(m=>m.id!==selected.id));}
      setSelected(null);setReason('');setError(kind==='report'?'Report sent privately to moderators. You can track status in My Reports.':'');
    }catch(e){if(mounted.current)setActionError(e instanceof Error?e.message:'Action could not finish.');}
    finally{if(mounted.current)setActionBusy(false);}
  };
  const toggleUpdate=()=>{
    const next=!updateOpen;
    setUpdateOpen(next);
    if(!next || !(context.unread?.updates ?? 0) || updateReading.current)return;
    updateReading.current=true;
    void markCommunityUpdatesRead().then(ok=>{
      if(ok)window.dispatchEvent(new Event('youdo-community-read'));
      else if(mounted.current)setError('The update opened, but its unread marker could not be cleared.');
    }).finally(()=>{updateReading.current=false;});
  };
  const selectedCanModify = !!selected && selected.authorId === userId && selected.kind === 'chat' && selected.delivery === 'sent'
    && (context.isAdmin || Date.now() - Date.parse(selected.createdAt) < MESSAGE_ACTION_WINDOW_MS);

  // Ordered list of room IDs for swipe gesture navigation: [undefined (General), user's hashtag, ...other hashtags]
  const orderedRoomIds = useMemo(() => {
    const list: (string | undefined)[] = [undefined];
    const sorted = [...roomContext.hashtags].sort((a, b) => {
      const aIsMine = roomContext.mine?.id === a.id;
      const bIsMine = roomContext.mine?.id === b.id;
      if (aIsMine && !bIsMine) return -1;
      if (!aIsMine && bIsMine) return 1;
      return 0;
    });
    sorted.forEach((tag) => list.push(tag.id));
    return list;
  }, [roomContext.hashtags, roomContext.mine?.id]);

  const touchStartCoord = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartCoord.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartCoord.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartCoord.current.x;
    const dy = e.changedTouches[0].clientY - touchStartCoord.current.y;
    touchStartCoord.current = null;

    // Must be predominantly horizontal gesture: min 60px horizontal, max 45px vertical
    if (Math.abs(dx) > 60 && Math.abs(dy) < 45) {
      const currentIndex = orderedRoomIds.indexOf(selectedHashtag);
      if (currentIndex === -1) return;

      if (dx < 0 && currentIndex < orderedRoomIds.length - 1) {
        // Swipe left -> next room
        hapticTick();
        setSelectedHashtag(orderedRoomIds[currentIndex + 1]);
      } else if (dx > 0 && currentIndex > 0) {
        // Swipe right -> previous room
        hapticTick();
        setSelectedHashtag(orderedRoomIds[currentIndex - 1]);
      }
    }
  };

  const currentHashtagObj = roomContext.hashtags.find(h => h.id === selectedHashtag);

  return <section className="yd-chat c-chat no-swipe" aria-label="Chat">
    {/* Top Sticky Modern Navigation Bar */}
    <header className="c-chat-top-bar">
      <CommunityHashtagBar
        selectedId={selectedHashtag}
        onSelect={setSelectedHashtag}
        onContextChange={setRoomContext}
      />
    </header>

    <div
      key={selectedHashtag ?? 'general'}
      className="yd-chat-scroll fade-in"
      ref={scroll}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onScroll={() => {
        const root = scroll.current;
        if (root) {
          scrollPosition.current = root.scrollTop;
          if (root.clientWidth === viewport.current.width && root.clientHeight === viewport.current.height) {
            follow.current = root.scrollHeight - root.scrollTop - root.clientHeight < 72;
            if (follow.current) setNewBelow(false);
          }
        }
      }}
    >
      {waitingHashtagRequest && (
        <aside className="mb-2.5 rounded-2xl border border-warning/35 bg-warning/10 p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-warning/20 text-warning mt-0.5">
                <MessageSquare size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-warning truncate">
                  Admin replied to your request · #{waitingHashtagRequest.examName}
                </p>
                {waitingHashtagRequest.adminResponse && (
                  <p className="text-[11.5px] text-content-primary mt-0.5 line-clamp-2">
                    &ldquo;{waitingHashtagRequest.adminResponse}&rdquo;
                  </p>
                )}
                <p className="text-[10px] text-content-muted mt-1">
                  The admin is waiting for your reply before approving this room.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedChatRequest(waitingHashtagRequest)}
              className="shrink-0 px-2.5 py-1.5 rounded-lg bg-secondary text-on-secondary text-[10.5px] font-bold shadow-sm transition active:scale-95 flex items-center gap-1"
            >
              <MessageSquare size={12} />
              <span>Reply</span>
            </button>
          </div>
        </aside>
      )}

      <details className="c-guidance">
        <summary className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <ShieldCheck size={16}/>
            <span className="truncate">A little encouragement goes a long way</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void openReports();
            }}
            className="text-[10px] font-bold text-secondary hover:underline px-2 py-0.5 rounded-md bg-secondary-soft/50 border border-secondary/25 mr-1 shrink-0"
          >
            My Reports
          </button>
        </summary>
        <p>
          Be respectful. No spam, links or personal details. Use replies to keep conversations clear. Chat disappears after 24 hours.
          <button
            type="button"
            onClick={() => void openReports()}
            className="block mt-1.5 text-[10.5px] font-semibold text-secondary hover:underline"
          >
            View status of your submitted reports &rarr;
          </button>
        </p>
      </details>
      {context.settings.announcement && <section className={`c-update-event ${context.unread?.updates?'is-new':''} ${updateOpen?'is-open':''}`}>
        <button type="button" aria-expanded={updateOpen} onClick={toggleUpdate}>
          <span className="c-update-icon"><Megaphone size={15}/></span>
          <span className="c-update-summary"><strong>{context.unread?.updates?'New update':'Latest update'}</strong><small>{context.settings.announcement}</small></span>
          {!!context.unread?.updates && <span className="c-update-new">New</span>}
          <ChevronDown className="c-update-chevron" size={15}/>
        </button>
        {updateOpen && <div className="c-update-body"><p>{context.settings.announcement}</p>{context.settings.announcementUpdatedAt && <time dateTime={context.settings.announcementUpdatedAt}>{new Date(context.settings.announcementUpdatedAt).toLocaleString()}</time>}</div>}
      </section>}
      {hasOlder && <button className="c-text-button c-load" disabled={loading} onClick={()=>void loadOlder()}>{loading?'Loading…':'Earlier messages'}</button>}
      {loading && messages.length===0 ? <div className="c-skeleton" role="status" aria-label="Loading chat"><i/><i/><i/></div>
        : messages.length===0 && !error ? <div className="c-empty"><Heart size={28}/><h3>A quiet room. A shared ambition.</h3><p>{selectedHashtag ? `Welcome to #${currentHashtagObj?.label ?? 'your room'}. Share questions and tips!` : 'Share a useful thought or encourage a fellow aspirant.'}</p></div>:null}
      <ol className="yd-chat-list">{messages.map(message=>{
        const mine=message.authorId===userId;
        const parent=message.replyToId?map.get(message.replyToId):undefined;
        if(message.kind==='kudos')return <li key={message.id} data-message={message.id} className="yd-chat-kudos"><Heart size={13}/>{message.body}</li>;
        const authorName=mine?'You':names.get(message.authorId)??'Board member';
        const staff=context.staffIds.includes(message.authorId);
        return <li key={message.id} data-message={message.id} className={`yd-chat-row ${mine?'is-mine':''} ${message.delivery==='failed'?'is-failed':''}`}>
          <div className="yd-chat-bubble-wrap">
          <div className="yd-chat-cluster">
          <div className="yd-chat-clip" data-yd-chat-anchor={message.id}>
          <article
            className="yd-chat-bubble"
            tabIndex={0}
            aria-label={`${authorName}: ${message.body}`}
            {...getMessageProps(message)}
          >
            {!mine && (
              <div className="yd-chat-author">
                <button type="button" className="text-left" onClick={()=>onProfile?.(message.authorId)} disabled={!onProfile}>{authorName}</button>
                {staff && <span className="yd-chat-admin">Admin</span>}
              </div>
            )}
            {message.replyToId && (
              <blockquote className="yd-chat-quote">
                <strong>{parent?names.get(parent.authorId)??'Board member':'Earlier message'}</strong>
                <span>{parent?.body??'No longer available'}</span>
              </blockquote>
            )}
            <p className="yd-chat-body">{message.body}</p>
            {message.delivery==='failed' && (
              <div className="yd-chat-retry">
                <span>{message.error}</span>
                <button type="button" disabled={!canWriteRoom} onClick={()=>void transmit(message)}><RefreshCw size={14}/> Retry</button>
              </div>
            )}
          </article>
          </div>
          <div className="yd-chat-meta">
            <span>{message.editedAt?'Edited · ':''}<time dateTime={message.createdAt}>{clock.format(new Date(message.createdAt))}</time></span>
            {mine && <span className="yd-chat-meta-status">{message.delivery==='pending'?'Sending…':message.delivery==='failed'?'Not sent':<Check size={11}/>}</span>}
          </div>
          </div>
          </div>
        </li>;
      })}</ol>
      
        {messages.filter(m=>m.delivery==='sent').length>=CHAT_HISTORY_LIMIT && <p className="c-note">Latest 120 messages · 24-hour room</p>}
    </div>
    {newBelow && <button className="c-new" onClick={()=>{follow.current=true;if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;setNewBelow(false);}}>New messages <ArrowDown size={15}/></button>}
    <footer className="yd-chat-composer">
      {error && <p role="status" className="yd-chat-alert">{error} <button type="button" onClick={()=>void refresh()} aria-label="Refresh chat"><RefreshCw size={15}/></button></p>}
      {actionError && <p role="alert" className="yd-chat-alert">{actionError}</p>}
      {(reply || editing) && (
        <div className="yd-chat-reply">
          <Reply size={16} className="shrink-0 text-secondary" />
          <span className="yd-chat-reply-text"><strong>{editing?'Editing your message':'Replying'}</strong>{(editing??reply)?.body}</span>
          <button type="button" className="yd-chat-reply-dismiss" aria-label="Cancel reply or edit" onClick={()=>{setReply(null);if(editing)setDraft('');setEditing(null);}}><X size={18}/></button>
        </div>
      )}
      {!canWriteRoom&&<div className="c-hashtag-readonly" role="status"><Lock size={13}/><div><p>{!roomContext.roomsEnabled?'Room access could not be confirmed.':!selectedHashtag&&!pacePrefs.optedIn?'General is read-only until you join the Public Board in settings.':selectedHashtag===roomContext.mine?.id&&roomContext.postingUnlockAt?`Your earlier hashtag messages expire by ${new Date(roomContext.postingUnlockAt).toLocaleString()}. Posting unlocks after they expire.`:'Read-only room · choose this hashtag in your profile to post.'}</p><button type="button" onClick={onOpenBoardSettings}>Profile settings</button></div></div>}
      <div className="yd-chat-compose-row">
        <textarea
          ref={composer}
          aria-label={editing ? 'Edit message' : 'Message'}
          rows={1}
          maxLength={240}
          value={draft}
          disabled={!context.canPost || !canWriteRoom}
          placeholder={!canWriteRoom ? 'Read-only room…' : context.canPost ? (selectedHashtag ? `Message #${currentHashtagObj?.label ?? 'room'}…` : pacePrefs.optedIn ? 'Share with General room…' : 'Join Public Board to post in General…') : 'Posting is paused for now'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          className="yd-chat-send"
          aria-label={editing ? 'Save edit' : 'Send message'}
          disabled={!draft.trim() || !context.canPost || !canWriteRoom || actionBusy}
          onClick={send}
        >
          {editing ? <Check size={19} /> : <Send size={19} />}
        </button>
      </div>
      <p className="yd-chat-hint">
        <span>
          Hold for options · double-tap to reply
          {!context.isAdmin && ' · you can edit or delete your messages for 15 minutes'}
        </span>
        <span>{draft.length}/240</span>
      </p>
    </footer>
    <ChatActionSheet
      open={!!selected}
      onClose={() => { if (!actionBusy) setSelected(null); }}
      authorName={selected ? (selected.authorId === userId ? 'You' : names.get(selected.authorId) ?? 'Board member') : ''}
      time={selected ? clock.format(new Date(selected.createdAt)) : ''}
      body={selected?.body ?? ''}
      canReply={selected?.delivery === 'sent' && canWriteRoom}
      onReply={() => { if (selected) beginReply(selected); }}
      canCopy={selected?.delivery === 'sent'}
      canEdit={selectedCanModify && canWriteRoom}
      onEdit={() => {
        if (!selected) return;
        setEditing(selected);
        setDraft(selected.body);
        setReply(null);
        setSelected(null);
        requestAnimationFrame(() => composer.current?.focus());
      }}
      canDelete={!!selected && (selected.delivery === 'failed' || selectedCanModify || (context.isAdmin && selected.delivery === 'sent'))}
      deleteLabel={
        selected?.delivery === 'failed'
          ? 'Remove unsent message'
          : context.isAdmin && selected?.authorId !== userId
            ? 'Remove as admin'
            : 'Delete for everyone'
      }
      onDelete={() => void action(context.isAdmin && selected?.authorId !== userId ? 'remove' : 'delete')}
      canReport={!!selected && selected.authorId !== userId && !context.isAdmin}
      onReport={() => void action('report')}
      isAdmin={context.isAdmin && selected?.delivery === 'sent' && selected?.authorId !== userId}
      adminReason={reason}
      onAdminReasonChange={setReason}
      onAdminRemove={() => void action('remove')}
      actionBusy={actionBusy}
      actionError={actionError}
    />
    <Overlay open={reportsOpen} onClose={() => setReportsOpen(false)} align="bottom">
      <div className="w-full max-w-[480px] max-h-[85vh] flex flex-col rounded-t-[28px] bg-elevated border-t border-subtle p-5 shadow-2xl text-content-primary">
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-border-subtle" />
        <header className="flex items-center justify-between pb-3 border-b border-subtle">
          <div>
            <h3 className="text-sm font-bold text-content-primary">Your Reported Messages</h3>
            <p className="text-[11px] text-content-muted">Track review status of messages you flagged</p>
          </div>
          <button
            type="button"
            onClick={() => setReportsOpen(false)}
            className="grid size-8 place-items-center rounded-full bg-surface-muted hover:bg-surface-elevated text-content-muted hover:text-content-primary transition"
            aria-label="Close reports"
          >
            <X size={16} />
          </button>
        </header>

        <div className="overflow-y-auto pt-3 pb-2 space-y-3 min-h-[160px]">
          {loadingReports ? (
            <div className="py-8 text-center text-xs text-content-muted">Loading your reports…</div>
          ) : userReports.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-muted">
              You haven&apos;t reported any messages yet.
            </div>
          ) : (
            userReports.map((rep) => {
              const statusBadge =
                rep.status === 'open' ? (
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider bg-warning/15 text-warning border border-warning/30">
                    Pending Review
                  </span>
                ) : rep.status === 'actioned' ? (
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider bg-success/15 text-success border border-success/30">
                    Resolved · Action Taken
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider bg-surface-muted text-content-muted border border-subtle">
                    Resolved · Dismissed
                  </span>
                );

              return (
                <div key={rep.id} className="p-3 rounded-xl bg-surface-muted border border-subtle space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-content-muted font-medium">
                      Reported {new Date(rep.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {statusBadge}
                  </div>
                  {rep.messageSnippet ? (
                    <blockquote className="text-xs text-content-primary border-l-2 border-secondary/40 pl-2.5 py-0.5 italic line-clamp-2">
                      &ldquo;{rep.messageSnippet}&rdquo;
                    </blockquote>
                  ) : (
                    <p className="text-[11px] text-content-muted italic">
                      (Original message removed or expired)
                    </p>
                  )}
                  <div className="text-[10.5px] text-content-muted flex items-center justify-between pt-0.5">
                    <span>Reason: {rep.reason}</span>
                    {rep.reviewedAt && (
                      <span>
                        Reviewed {new Date(rep.reviewedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Overlay>
    <CommunityHashtagSupportChat
      request={selectedChatRequest}
      onClose={() => setSelectedChatRequest(null)}
      onSuccess={async () => {
        try {
          const next = await fetchCommunityRooms();
          setRoomContext(next);
        } catch {
          // ignore
        }
        await refresh();
      }}
    />
    </section>;
}
