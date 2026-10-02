import './community.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, Check, ChevronDown, Heart, Lock, Megaphone, RefreshCw, Reply, Send, ShieldCheck, X } from 'lucide-react';
import { markCommunityUpdatesRead, removeCommunityMessage, reportCommunityMessage, type CommunityContext } from '../../lib/community';
import { markChatRoomRead } from '../../lib/communityChat';
import type { CommunityHashtagContext } from '../../lib/communityHashtags';
import { activeChatMessages, chatCacheGeneration, CHAT_HISTORY_LIMIT, CHAT_PAGE_SIZE, clearChatCache, deleteChatMessage, editChatMessage, fetchChatPage, mergeChatPage, pendingChatMessage, readChatCache, saveChatCache, sendChatMessage, type ChatMessage } from '../../lib/communityChat';
import Overlay from '../Overlay';
import CommunityHashtagBar from './CommunityHashtagBar';
import { STORAGE_KEYS } from '../../lib/storageKeys';
import { hapticTick } from '../../lib/haptics';

interface Props { userId: string; context: CommunityContext; names: Map<string,string>; onProfile?: (id: string) => void; onOpenBoardSettings: () => void }
const clock = new Intl.DateTimeFormat(undefined,{ hour:'numeric',minute:'2-digit' });
const MESSAGE_ACTION_WINDOW_MS = 15 * 60 * 1000;
const LONG_PRESS_MS = 460;
const DOUBLE_TAP_MS = 320;
export default function CommunityChat({ userId, context, names, onProfile, onOpenBoardSettings }: Props) {
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
  const roomScope=`room:${selectedHashtag??'general'}`;
  const canWriteRoom=roomContext.roomsEnabled===true && (!selectedHashtag || (selectedHashtag===roomContext.mine?.id && !roomContext.postingUnlockAt));
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
  const pressTimer = useRef<number>();
  const press = useRef<{ id:string;x:number;y:number;triggered:boolean }|null>(null);
  const lastTap = useRef<{ id:string;at:number }|null>(null);
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
    acknowledged.current.clear();setNewBelow(false);setError('');setDraft('');setReply(null);setEditing(null);setSelected(null);setActionBusy(false);void refresh();
    const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};
    const timer=window.setInterval(onVisible,30_000);
    document.addEventListener('visibilitychange',onVisible);window.addEventListener('online',onVisible);
    const generation=cacheLease.current;
    return()=>{
      mounted.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onVisible);
      saveChatCache(userId,{messages:messagesRef.current,scrollTop:scrollPosition.current,hasOlder:olderRef.current},generation,roomScope);
    };
  },[refresh,userId,roomScope]);
  useEffect(()=>()=>{if(pressTimer.current)window.clearTimeout(pressTimer.current);},[]);
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
  const openActions=(message:ChatMessage)=>{setSelected(message);setReason('');setActionError('');};
  const beginReply=(message:ChatMessage)=>{
    if(message.delivery!=='sent'||!canWriteRoom)return;
    setReply(message);setEditing(null);setSelected(null);requestAnimationFrame(()=>composer.current?.focus());
  };
  const cancelPress=()=>{if(pressTimer.current)window.clearTimeout(pressTimer.current);pressTimer.current=undefined;};
  const beginPress=(event:ReactPointerEvent<HTMLElement>,message:ChatMessage)=>{
    if(event.button!==0 || (event.target as HTMLElement).closest('button,input,textarea,a'))return;
    cancelPress();press.current={id:message.id,x:event.clientX,y:event.clientY,triggered:false};
    pressTimer.current=window.setTimeout(()=>{
      if(press.current?.id===message.id){press.current.triggered=true;openActions(message);}
    },LONG_PRESS_MS);
  };
  const movePress=(event:ReactPointerEvent<HTMLElement>)=>{
    const active=press.current;
    if(active && Math.hypot(event.clientX-active.x,event.clientY-active.y)>9){cancelPress();press.current=null;}
  };
  const finishPress=(event:ReactPointerEvent<HTMLElement>,message:ChatMessage)=>{
    const active=press.current;cancelPress();press.current=null;
    if(!active || active.id!==message.id || active.triggered || Math.hypot(event.clientX-active.x,event.clientY-active.y)>9)return;
    if(event.pointerType==='touch' && message.delivery==='sent'){
      const now=Date.now();
      if(lastTap.current?.id===message.id && now-lastTap.current.at<=DOUBLE_TAP_MS){lastTap.current=null;beginReply(message);}
      else lastTap.current={id:message.id,at:now};
    }
  };
  const keyboardActions=(event:ReactKeyboardEvent<HTMLElement>,message:ChatMessage)=>{
    if(event.target!==event.currentTarget)return;
    if(event.key==='Enter' || event.key==='ContextMenu' || (event.shiftKey && event.key==='F10')){event.preventDefault();openActions(message);}
  };
  const action=async(kind:'delete'|'report'|'remove')=>{
    if(!selected || actionBusy)return;
    setActionBusy(true);setActionError('');
    try{
      if(kind==='delete'){
        if(selected.delivery==='sent')await deleteChatMessage(selected.id);
      }else if(kind==='remove'){
        if(!await removeCommunityMessage(selected.id,reason.trim()))throw new Error('Could not remove this message.');
      }else if(!await reportCommunityMessage(selected.id))throw new Error('Could not send the report.');
      if(!mounted.current)return;
      if(kind!=='report'){capturePosition();setMessages(current=>current.filter(m=>m.id!==selected.id));}
      setSelected(null);setReason('');setError(kind==='report'?'Report sent privately to the moderators.':'');
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
  const selectedCanModify=!!selected && selected.authorId===userId && selected.kind==='chat' && selected.delivery==='sent'
    && Date.now()-Date.parse(selected.createdAt)<MESSAGE_ACTION_WINDOW_MS;

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
  const roomDisplayName = selectedHashtag ? `#${currentHashtagObj?.label ?? 'Room'}` : 'General Chat';
  const isUserRoom = selectedHashtag && selectedHashtag === roomContext.mine?.id;

  return <section className="c-chat no-swipe" aria-label="Chat">
    {/* Top Sticky Modern Navigation Bar */}
    <header className="c-chat-top-bar">
      <CommunityHashtagBar
        selectedId={selectedHashtag}
        onSelect={setSelectedHashtag}
        onContextChange={setRoomContext}
      />
      <div className="c-room-info-banner">
        <div className="c-room-info-left">
          <span className="c-room-title">{roomDisplayName}</span>
          {isUserRoom && <span className="c-room-mine-badge">Your exam community</span>}
          {!selectedHashtag && <span className="c-room-general-badge">All board members</span>}
        </div>
        <div className="c-room-info-right">
          <span className="c-room-swipe-hint">Swipe ↔ to change room</span>
        </div>
      </div>
    </header>

    <div
      key={selectedHashtag ?? 'general'}
      className="c-chat-scroll fade-in"
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
      <details className="c-guidance"><summary><ShieldCheck size={16}/> A little encouragement goes a long way</summary><p>Be respectful. No spam, links or personal details. Use replies to keep conversations clear. Chat disappears after 24 hours.</p></details>
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
      <ol className="c-messages">{messages.map(message=>{
        const mine=message.authorId===userId;
        const parent=message.replyToId?map.get(message.replyToId):undefined;
        if(message.kind==='kudos')return <li key={message.id} data-message={message.id} className="c-kudos"><Heart size={13}/>{message.body}</li>;
        const authorName=mine?'You':names.get(message.authorId)??'Board member';
        const staff=context.staffIds.includes(message.authorId);
        return <li key={message.id} data-message={message.id} className={`c-message ${mine?'is-mine':''} ${message.delivery==='failed'?'is-failed':''}`}>
          <article className="c-message-bubble" tabIndex={0} aria-label={`${authorName}: ${message.body}`}
            onPointerDown={event=>beginPress(event,message)} onPointerMove={movePress}
            onPointerUp={event=>finishPress(event,message)} onPointerCancel={()=>{cancelPress();press.current=null;}}
            onContextMenu={event=>{if((event.target as HTMLElement).closest('button,input,textarea,a'))return;event.preventDefault();openActions(message);}}
            onDoubleClick={event=>{if(!(event.target as HTMLElement).closest('button,input,textarea,a'))beginReply(message);}} onKeyDown={event=>keyboardActions(event,message)}>
            <div className="c-author-line"><button className="c-author" onClick={()=>onProfile?.(message.authorId)} disabled={!onProfile}>{authorName}</button>{staff && <span className="c-admin-tag">Admin</span>}</div>
            {message.replyToId && <blockquote><strong>{parent?names.get(parent.authorId)??'Board member':'Earlier message'}</strong><span>{parent?.body??'No longer available'}</span></blockquote>}
            <p>{message.body}</p>
            <div className="c-message-meta"><span>{message.editedAt?'Edited · ':''}<time dateTime={message.createdAt}>{clock.format(new Date(message.createdAt))}</time></span>{mine && <span>{message.delivery==='pending'?'Sending…':message.delivery==='failed'?'Not sent':<Check size={12}/>}</span>}</div>
            {message.delivery==='failed' && <div className="c-retry"><span>{message.error}</span><button disabled={!canWriteRoom} onClick={()=>void transmit(message)}><RefreshCw size={14}/> Retry</button></div>}
          </article>
        </li>;
      })}</ol>
      {messages.filter(m=>m.delivery==='sent').length>=CHAT_HISTORY_LIMIT && <p className="c-note">Latest 120 messages · 24-hour room</p>}
    </div>
    {newBelow && <button className="c-new" onClick={()=>{follow.current=true;if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;setNewBelow(false);}}>New messages <ArrowDown size={15}/></button>}
    <footer className="c-composer">
      {error && <p role="status" className="c-feedback">{error} <button onClick={()=>void refresh()} aria-label="Refresh chat"><RefreshCw size={15}/></button></p>}
      {(reply || editing) && <div className="c-replying"><Reply size={16}/><span><strong>{editing?'Editing your message':'Replying'}</strong>{(editing??reply)?.body}</span><button aria-label="Cancel reply or edit" onClick={()=>{setReply(null);if(editing)setDraft('');setEditing(null);}}><X size={18}/></button></div>}
      {!canWriteRoom&&<div className="c-hashtag-readonly" role="status"><Lock size={13}/><div><p>{!roomContext.roomsEnabled?'Room access could not be confirmed.':selectedHashtag===roomContext.mine?.id&&roomContext.postingUnlockAt?`Your earlier hashtag messages expire by ${new Date(roomContext.postingUnlockAt).toLocaleString()}. Posting unlocks after they expire; General stays open.`:'Read-only room · choose this hashtag in your profile to post.'}</p><button type="button" onClick={onOpenBoardSettings}>Profile settings</button></div></div>}
      <div className="c-composer-row">
        <textarea
          ref={composer}
          aria-label={editing ? 'Edit message' : 'Message'}
          rows={1}
          maxLength={240}
          value={draft}
          disabled={!context.canPost || !canWriteRoom}
          placeholder={!canWriteRoom ? 'Read-only room…' : context.canPost ? (selectedHashtag ? `Message #${currentHashtagObj?.label ?? 'room'}…` : 'Share with General room…') : 'Posting is paused for now'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
        />
        <button
          className="c-primary c-send"
          aria-label={editing ? 'Save edit' : 'Send message'}
          disabled={!draft.trim() || !context.canPost || !canWriteRoom || actionBusy}
          onClick={send}
        >
          {editing ? <Check size={19} /> : <Send size={19} />}
        </button>
      </div>
      <p className="c-composer-note">Hold for options · double-tap to reply<span>{draft.length}/240</span></p>
    </footer>
    {selected && <Overlay open onClose={()=>{if(!actionBusy)setSelected(null);}} align="bottom"><div className="c-action-sheet">
      <h3>Message options</h3><p className="c-action-preview">{selected.body}</p>
      {actionError && <p className="c-feedback" role="alert">{actionError}</p>}
      {selected.delivery==='sent' && canWriteRoom && <button onClick={()=>beginReply(selected)}>Reply</button>}
      {selectedCanModify && canWriteRoom && <button onClick={()=>{setEditing(selected);setDraft(selected.body);setReply(null);setSelected(null);requestAnimationFrame(()=>composer.current?.focus());}}>Edit message</button>}
      {(selected.delivery==='failed' || selectedCanModify) && <button disabled={actionBusy} onClick={()=>void action('delete')}>{selected.delivery==='failed'?'Remove unsent message':'Delete for everyone'}</button>}
      {selected.authorId!==userId && <button disabled={actionBusy} onClick={()=>void action('report')}>Report privately</button>}
      {context.isAdmin && selected.delivery==='sent' && <div className="c-moderation"><label htmlFor="remove-reason">Moderation reason</label><input id="remove-reason" value={reason} maxLength={280} onChange={e=>setReason(e.target.value)} placeholder="Briefly explain the removal"/><button disabled={actionBusy||reason.trim().length<3} onClick={()=>void action('remove')}>Remove as admin</button></div>}
      <button disabled={actionBusy} onClick={()=>setSelected(null)}>Cancel</button>
    </div></Overlay>}
  </section>;
}
