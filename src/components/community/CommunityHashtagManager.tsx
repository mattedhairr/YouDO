import { useState } from 'react';
import { Check, Hash, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { manageCommunityHashtag, type AdminCommunityHashtag } from '../../lib/communityHashtags';

interface Props {
  hashtags: AdminCommunityHashtag[];
  busy: boolean;
  setupError?: string;
  onRefresh: () => Promise<void>;
}

export default function CommunityHashtagManager({hashtags,busy,setupError='',onRefresh}:Props) {
  const [editing,setEditing]=useState<string|null>(null);
  const [label,setLabel]=useState('');
  const [confirmDelete,setConfirmDelete]=useState<string|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const active=hashtags.filter(tag=>tag.active);
  const removed=hashtags.filter(tag=>!tag.active);

  const startEdit=(tag?:AdminCommunityHashtag)=>{
    setEditing(tag?.id??'new');setLabel(tag?.label??'');setConfirmDelete(null);setError('');
  };
  const act=async(action:'create'|'rename'|'archive'|'restore',tag?:AdminCommunityHashtag)=>{
    if(working)return;
    setWorking(true);setError('');
    try {
      await manageCommunityHashtag(action,tag?.id,action==='create'||action==='rename'?label.trim():undefined);
      setEditing(null);setConfirmDelete(null);setLabel('');
      await onRefresh();
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Could not update this hashtag.');
    } finally { setWorking(false); }
  };
  const editor=(tag?:AdminCommunityHashtag)=><div className="admin-hashtag-manager-editor">
    <label htmlFor={`managed-hashtag-${tag?.id??'new'}`}>{tag?'Rename hashtag':'New hashtag'}</label>
    <div><input id={`managed-hashtag-${tag?.id??'new'}`} value={label} onChange={event=>setLabel(event.target.value)} maxLength={24} placeholder="e.g. GATE, NEET-PG"/>
      <button type="button" disabled={busy||working||label.trim().length<2} onClick={()=>void act(tag?'rename':'create',tag)}><Check size={13}/> Save</button>
      <button type="button" className="is-cancel" onClick={()=>{setEditing(null);setError('');}} aria-label="Cancel hashtag edit"><X size={14}/></button>
    </div>
  </div>;

  return <section className="admin-hashtag-manager" aria-label="Manage exam hashtags">
    <header className="admin-hashtag-manager-heading"><div><p>Exam communities</p><h3>Approved hashtags</h3><small>New hashtags also fulfill matching requests from members.</small></div>
      <button type="button" disabled={Boolean(setupError)||busy||working} onClick={()=>startEdit()}><Plus size={13}/> Add</button>
    </header>
    {setupError&&<p role="alert" className="admin-hashtag-manager-setup">Hashtag management needs the admin database upgrade. Apply it, then refresh.</p>}
    {editing==='new'&&editor()}
    {!setupError&&active.length===0&&<p className="admin-hashtag-manager-empty">No approved hashtags yet.</p>}
    {!setupError&&<ul className="admin-hashtag-manager-list">{active.map(tag=><li key={tag.id}>
      <div className="admin-hashtag-manager-row"><span className="admin-hashtag-manager-icon"><Hash size={14}/></span><div><strong>#{tag.label}</strong><small>{tag.memberCount} member{tag.memberCount===1?'':'s'}</small></div>
        <button type="button" aria-label={`Edit #${tag.label}`} disabled={busy||working} onClick={()=>startEdit(tag)}><Pencil size={14}/></button>
        <button type="button" aria-label={`Delete #${tag.label}`} disabled={busy||working} onClick={()=>{setConfirmDelete(tag.id);setEditing(null);setError('');}}><Trash2 size={14}/></button>
      </div>
      {editing===tag.id&&editor(tag)}
      {confirmDelete===tag.id&&<div className="admin-hashtag-manager-confirm"><p>Delete #{tag.label}? It will disappear from chat and Board profiles. {tag.memberCount} member{tag.memberCount===1?'':'s'} will need to choose another exam. You can restore the hashtag later.</p>
        <div><button type="button" disabled={busy||working} onClick={()=>void act('archive',tag)}>Delete hashtag</button><button type="button" onClick={()=>setConfirmDelete(null)}>Cancel</button></div>
      </div>}
    </li>)}</ul>}
    {!setupError&&removed.length>0&&<details className="admin-hashtag-manager-removed"><summary>Removed hashtags ({removed.length})</summary><ul>{removed.map(tag=><li key={tag.id}><span>#{tag.label}</span><button type="button" disabled={busy||working} onClick={()=>void act('restore',tag)}><RotateCcw size={12}/> Restore</button></li>)}</ul></details>}
    {error&&<p role="alert" className="admin-quotes-error">{error}</p>}
  </section>;
}
