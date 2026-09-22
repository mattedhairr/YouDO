import { useMemo, useState } from 'react';
import { Hash, MessageCircle } from 'lucide-react';
import { reviewCommunityHashtagRequest, type CommunityHashtagRequest } from '../../lib/communityHashtags';

interface Props { requests: CommunityHashtagRequest[]; names: Map<string,string>; busy: boolean; onRefresh:()=>Promise<void> }

export default function CommunityHashtagAdmin({requests,names,busy,onRefresh}:Props){
  const [open,setOpen]=useState('');
  const [label,setLabel]=useState('');
  const [reply,setReply]=useState('');
  const [error,setError]=useState('');
  const [working,setWorking]=useState(false);
  const groups=useMemo(()=>{
    const grouped=new Map<string,CommunityHashtagRequest[]>();
    for(const request of requests){const key=request.normalizedExam||request.examName.toLowerCase();grouped.set(key,[...(grouped.get(key)||[]),request]);}
    return [...grouped.entries()];
  },[requests]);
  if(!groups.length)return null;
  const act=async(request:CommunityHashtagRequest,decision:'wait'|'create')=>{
    if(working)return;setWorking(true);setError('');
    try{await reviewCommunityHashtagRequest(request.id,decision,reply,(label||request.examName).trim().replace(/\s+/g,'-'));setOpen('');setLabel('');setReply('');await onRefresh();}
    catch(e){setError(e instanceof Error?e.message:'Could not review this request.');}
    finally{setWorking(false);}
  };
  return <section className="admin-hashtag-requests">
    <div className="admin-hashtag-heading"><div><p>Exam hashtags</p><h3>Requested communities</h3></div><span>{requests.length}</span></div>
    <div className="admin-hashtag-groups">{groups.map(([key,items])=>{
      const expanded=open===key;const first=items[0];
      return <article key={key}>
        <button type="button" className="admin-hashtag-summary" onClick={()=>{setOpen(expanded?'':key);setLabel(first.examName.toUpperCase());setReply('');setError('');}}>
          <Hash size={14}/><span><strong>{first.examName}</strong><small>{items.length} request{items.length===1?'':'s'}</small></span><b>{expanded?'−':'+'}</b>
        </button>
        {expanded&&<div className="admin-hashtag-detail">
          {items.map(item=><div className="admin-hashtag-person" key={item.id}><MessageCircle size={12}/><p><strong>{names.get(item.requesterId||'')||'Board member'}</strong>{item.details&&<span>{item.details}</span>}{item.adminResponse&&<em>Waiting: {item.adminResponse}</em>}</p></div>)}
          <label>Hashtag label<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={24}/></label>
          <label>Private reply <small>required only when asking them to wait</small><textarea value={reply} onChange={e=>setReply(e.target.value)} maxLength={240} rows={2}/></label>
          <div className="admin-hashtag-actions"><button type="button" disabled={busy||working||label.trim().length<2} onClick={()=>void act(first,'create')}>Create #{(label.trim()||first.examName).replace(/\s+/g,'-')}</button><button type="button" disabled={busy||working||reply.trim().length<5} onClick={()=>void act(first,'wait')}>Reply to group</button></div>
          {error&&<p role="alert">{error}</p>}
        </div>}
      </article>;
    })}</div>
  </section>;
}
