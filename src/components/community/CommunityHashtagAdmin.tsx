import { useMemo, useState } from 'react';
import { Check, ChevronDown, Hash, MessageCircle, X } from 'lucide-react';
import { reviewCommunityHashtagRequest, type CommunityHashtagRequest } from '../../lib/communityHashtags';

interface Props { requests: CommunityHashtagRequest[]; names: Map<string,string>; busy: boolean; onRefresh:()=>Promise<void> }

export default function CommunityHashtagAdmin({requests,names,busy,onRefresh}:Props){
  const [open,setOpen]=useState('');
  const [label,setLabel]=useState('');
  const [reply,setReply]=useState('');
  const [error,setError]=useState('');
  const [working,setWorking]=useState(false);
  const [confirmReject,setConfirmReject]=useState('');
  const groups=useMemo(()=>{
    const grouped=new Map<string,CommunityHashtagRequest[]>();
    for(const request of requests){const key=request.normalizedExam||request.examName.toLowerCase();grouped.set(key,[...(grouped.get(key)||[]),request]);}
    return [...grouped.entries()];
  },[requests]);
  if(!groups.length)return null;
  const act=async(request:CommunityHashtagRequest,decision:'wait'|'create'|'reject')=>{
    if(working)return;setWorking(true);setError('');
    try{await reviewCommunityHashtagRequest(request.id,decision,reply,(label||request.examName).trim().replace(/\s+/g,'-'));setConfirmReject('');setOpen('');setLabel('');setReply('');await onRefresh();}
    catch(e){setError(e instanceof Error?e.message:'Could not review this request.');}
    finally{setWorking(false);}
  };
  return <section className="admin-hashtag-requests">
    <div className="admin-hashtag-heading"><div><p>Exam communities</p><h3>Hashtag requests</h3><small>Review matching exams together. Reject only the individual request that needs it.</small></div><span>{requests.length}</span></div>
    <div className="admin-hashtag-groups">{groups.map(([key,items])=>{
      const expanded=open===key;const first=items[0];
      return <article key={key}>
        <button type="button" className="admin-hashtag-summary" onClick={()=>{setOpen(expanded?'':key);setLabel(first.examName.toUpperCase());setReply('');setError('');setConfirmReject('');}}>
          <span className="admin-hashtag-icon"><Hash size={14}/></span><span><strong>{first.examName}</strong><small>{items.length} waiting · {items.filter(item=>item.status==='waiting').length} replied</small></span><ChevronDown size={15} className={expanded?'is-open':''}/>
        </button>
        {expanded&&<div className="admin-hashtag-detail">
          <div className="admin-hashtag-people">{items.map(item=><div className="admin-hashtag-person" key={item.id}><MessageCircle size={12}/><p><strong>{names.get(item.requesterId||'')||'Board member'}</strong>{item.details&&<span>{item.details}</span>}{item.adminResponse&&<em>Last reply: {item.adminResponse}</em>}</p>{confirmReject===item.id?<div className="admin-hashtag-reject-confirm"><span>Reject this request?</span><button type="button" disabled={busy||working} onClick={()=>void act(item,'reject')}><Check size={11}/> Yes</button><button type="button" onClick={()=>setConfirmReject('')}><X size={11}/> No</button></div>:<button type="button" className="admin-hashtag-reject" onClick={()=>setConfirmReject(item.id)}>Reject</button>}</div>)}</div>
          <div className="admin-hashtag-form">
            <label>Approved label<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={24}/></label>
            <label>Private note <small>required for “Ask to wait”; optional when approving or rejecting</small><textarea value={reply} onChange={e=>setReply(e.target.value)} maxLength={240} rows={2}/></label>
          </div>
          <div className="admin-hashtag-actions"><button type="button" disabled={busy||working||label.trim().length<2} onClick={()=>void act(first,'create')}><Check size={12}/> Approve #{(label.trim()||first.examName).replace(/\s+/g,'-')}</button><button type="button" disabled={busy||working||reply.trim().length<5} onClick={()=>void act(first,'wait')}>Ask group to wait</button></div>
          {error&&<p role="alert">{error}</p>}
        </div>}
      </article>;
    })}</div>
  </section>;
}
