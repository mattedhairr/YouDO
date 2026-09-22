import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Lock, Plus, X } from 'lucide-react';
import {
  chooseCommunityHashtag,
  fetchCommunityHashtags,
  requestCommunityHashtag,
  type CommunityHashtagContext,
} from '../../lib/communityHashtags';
import Overlay from '../Overlay';

interface Props {
  selectedId?: string;
  onSelect: (id?: string) => void;
  onMembershipChange: (id?: string) => void;
}

export default function CommunityHashtagBar({selectedId,onSelect,onMembershipChange}:Props) {
  const [context,setContext]=useState<CommunityHashtagContext>({hashtags:[],requests:[]});
  const [panel,setPanel]=useState<'choose'|'request'|null>(null);
  const [exam,setExam]=useState('');
  const [details,setDetails]=useState('');
  const [expanded,setExpanded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    try { const next=await fetchCommunityHashtags();setContext(next);onMembershipChange(next.mine?.id); }
    catch(e){setError(e instanceof Error?e.message:'Could not load exam hashtags.');}
  },[onMembershipChange]);
  useEffect(()=>{void refresh();},[refresh]);

  const choose=async(id:string)=>{
    setBusy(true);setError('');
    try{await chooseCommunityHashtag(id);await refresh();onSelect(id);setExpanded(false);setPanel(null);}
    catch(e){setError(e instanceof Error?e.message:'Could not save your exam.');}
    finally{setBusy(false);}
  };
  const request=async()=>{
    if(exam.trim().length<2)return;
    setBusy(true);setError('');
    try{await requestCommunityHashtag(exam,details);await refresh();setExam('');setDetails('');setPanel(null);}
    catch(e){setError(e instanceof Error?e.message:'Could not send your request.');}
    finally{setBusy(false);}
  };
  const tap=(id:string)=>{
    if(!context.mine){setPanel('choose');return;}
    onSelect(selectedId===id?undefined:id);setExpanded(false);
  };
  const selectedLabel=context.hashtags.find(tag=>tag.id===selectedId)?.label;
  return <>
    {!expanded?<div className="c-hashtag-collapsed"><button type="button" onClick={()=>setExpanded(true)} aria-expanded="false" aria-label={`Open exam chats. Current: ${selectedLabel?`#${selectedLabel}`:'General'}`}><span>{selectedLabel?`#${selectedLabel}`:'General'}</span><ChevronUp size={13}/></button></div>
    :<div className="c-hashtag-rail" aria-label="Exam chat filters">
      <button type="button" className="c-hashtag-collapse" onClick={()=>setExpanded(false)} aria-label="Collapse exam chats"><ChevronDown size={13}/></button>
      <button type="button" className={!selectedId?'is-active':''} aria-pressed={!selectedId} onClick={()=>{onSelect(undefined);setExpanded(false);}}>General</button>
      {context.hashtags.map(tag=><button type="button" key={tag.id} aria-pressed={selectedId===tag.id} className={selectedId===tag.id?'is-active':''} onClick={()=>tap(tag.id)}>
        {!context.mine&&<Lock size={9}/>}#{tag.label}{context.mine?.id===tag.id&&<Check size={10}/>}<small>{tag.memberCount}</small>
      </button>)}
      <button type="button" className="c-hashtag-request" onClick={()=>{setError('');setPanel('request');}}><Plus size={11}/> Request</button>
    </div>}
    {error&&!panel&&<p className="c-hashtag-inline-error">{error}</p>}
    <Overlay open={panel!==null} onClose={()=>setPanel(null)} align="bottom">
      <section className="c-hashtag-sheet">
        <header><div><span>EXAM CHAT</span><h3>{panel==='choose'?'Choose your exam':'Request a hashtag'}</h3></div><button type="button" onClick={()=>setPanel(null)} aria-label="Close"><X size={17}/></button></header>
        {panel==='choose'?<>
          <p className="c-hashtag-help">Add one approved exam to your Community profile. You can then open any exam feed.</p>
          <div className="c-hashtag-choices">{context.hashtags.map(tag=><button type="button" disabled={busy} key={tag.id} onClick={()=>void choose(tag.id)}>#{tag.label}<small>{tag.memberCount} member{tag.memberCount===1?'':'s'}</small></button>)}</div>
          <button type="button" className="c-hashtag-link" onClick={()=>setPanel('request')}>My exam is not listed</button>
        </>:<>
          {context.requests.length>0&&<div className="c-hashtag-request-list">{context.requests.map(item=><div className={`c-hashtag-request-state is-${item.status}`} key={item.id}><strong>{item.status==='waiting'?'Admin replied':item.status==='declined'?'Not approved':'Request sent'}</strong><span>#{item.examName}</span>{item.adminResponse&&<p>{item.adminResponse}</p>}</div>)}</div>}
          <label>Exam name<input value={exam} onChange={e=>setExam(e.target.value)} maxLength={50} placeholder="e.g. GATE, NEET PG, UPSC CSE" /></label>
          <label>Helpful context <small>optional</small><textarea value={details} onChange={e=>setDetails(e.target.value)} maxLength={240} rows={3} placeholder="Branch, stage, or anything the admin should know" /></label>
          <button type="button" className="c-hashtag-submit" disabled={busy||exam.trim().length<2} onClick={()=>void request()}>{busy?'Sending…':'Send request'}</button>
        </>}
        {error&&<p role="alert" className="c-hashtag-sheet-error">{error}</p>}
      </section>
    </Overlay>
  </>;
}
