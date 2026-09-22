import { useState } from 'react';
import { Check, Pencil, Plus, Quote, Trash2, X } from 'lucide-react';
import { deleteAppQuote, saveAppQuote, type AdminAppQuote } from '../../lib/appQuotes';

interface Props { quotes: AdminAppQuote[]; busy: boolean; setupError?: string; onRefresh: () => Promise<void> }
type Draft = { id?: string; text: string; author: string; active: boolean };
const EMPTY_DRAFT: Draft = { text: '', author: 'YouDO', active: true };

export default function CommunityQuoteAdmin({quotes,busy,setupError='',onRefresh}:Props){
  const [draft,setDraft]=useState<Draft|null>(null);
  const [working,setWorking]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState('');
  const [error,setError]=useState('');

  const edit=(quote:AdminAppQuote)=>{setDraft({id:quote.id,text:quote.text,author:quote.author,active:quote.active});setConfirmDelete('');setError('');};
  const save=async()=>{
    if(!draft||working)return;setWorking(true);setError('');
    try{await saveAppQuote(draft);setDraft(null);await onRefresh();}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not save the quote.');}
    finally{setWorking(false);}
  };
  const remove=async(id:string)=>{
    if(working)return;setWorking(true);setError('');
    try{await deleteAppQuote(id);setConfirmDelete('');if(draft?.id===id)setDraft(null);await onRefresh();}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not delete the quote.');}
    finally{setWorking(false);}
  };

  return <section className="admin-quotes">
    <header className="admin-quotes-heading"><div><p>App header</p><h3>Motivational quotes</h3><small>Active quotes are selected randomly and cached for offline use.</small></div><button type="button" disabled={Boolean(setupError)} onClick={()=>{setDraft({...EMPTY_DRAFT});setConfirmDelete('');setError('');}}><Plus size={13}/> Add</button></header>
    {setupError&&<p role="alert" className="admin-quotes-setup">Managed quotes are not connected yet. Apply the quote migration, then refresh.</p>}
    {draft&&<div className="admin-quote-editor">
      <div className="admin-quote-editor-title"><strong>{draft.id?'Edit quote':'New quote'}</strong><button type="button" onClick={()=>setDraft(null)} aria-label="Close quote editor"><X size={14}/></button></div>
      <label>Quote<textarea rows={3} maxLength={180} value={draft.text} onChange={event=>setDraft({...draft,text:event.target.value})} placeholder="Write a short, original line…"/><small>{draft.text.trim().length}/180</small></label>
      <label>Author<input maxLength={40} value={draft.author} onChange={event=>setDraft({...draft,author:event.target.value})}/></label>
      <label className="admin-quote-active"><input type="checkbox" checked={draft.active} onChange={event=>setDraft({...draft,active:event.target.checked})}/><span>Show this quote in the app</span></label>
      <button type="button" className="admin-quote-save" disabled={busy||working||draft.text.trim().length<10||draft.author.trim().length<2} onClick={()=>void save()}><Check size={13}/>{working?'Saving…':'Save quote'}</button>
    </div>}
    {!setupError&&quotes.length===0&&!draft?<div className="admin-quotes-empty"><Quote size={18}/><strong>No managed quotes</strong><span>Add one to replace the bundled offline collection.</span></div>
    :<ol className="admin-quote-list">{quotes.map(quote=><li key={quote.id} className={quote.active?'':'is-inactive'}>
      <Quote size={13}/><div><p>“{quote.text}”</p><span>{quote.author} · {quote.active?'Active':'Hidden'}</span></div>
      <div className="admin-quote-buttons"><button type="button" onClick={()=>edit(quote)} aria-label={`Edit quote by ${quote.author}`}><Pencil size={12}/></button><button type="button" onClick={()=>setConfirmDelete(quote.id)} aria-label={`Delete quote by ${quote.author}`}><Trash2 size={12}/></button></div>
      {confirmDelete===quote.id&&<div className="admin-quote-delete"><span>Delete permanently?</span><button type="button" disabled={busy||working} onClick={()=>void remove(quote.id)}>Delete</button><button type="button" onClick={()=>setConfirmDelete('')}>Cancel</button></div>}
    </li>)}</ol>}
    {error&&<p role="alert" className="admin-quotes-error">{error}</p>}
  </section>;
}
