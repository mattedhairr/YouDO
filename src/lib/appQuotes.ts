import { supabase } from './supabase';

export interface AppQuote { id?: string; text: string; author: string }
export interface AdminAppQuote extends AppQuote { id: string; active: boolean; sortOrder: number; updatedAt: string }

export const FALLBACK_APP_QUOTES: AppQuote[] = [
  { text: 'Your plan is a promise. Give it evidence today.', author: 'YouDO' },
  { text: 'One day, the deadline will be today. Prepare while preparation is still a choice.', author: 'YouDO' },
  { text: 'You do not need a perfect day. You need an honest start.', author: 'YouDO' },
  { text: 'While you negotiate with the next hour, someone else is using theirs.', author: 'YouDO' },
  { text: 'The deadline does not care whether you felt ready.', author: 'YouDO' },
  { text: 'You once begged for this chance. Do not treat it like an ordinary day.', author: 'YouDO' },
  { text: 'Do the difficult part before you negotiate with it.', author: 'YouDO' },
  { text: 'This ordinary hour may be the one your result remembers.', author: 'YouDO' },
  { text: 'Rest on purpose. Return with purpose.', author: 'YouDO' },
  { text: 'Every hour you postpone returns in the exam hall as a question you cannot answer.', author: 'YouDO' },
  { text: 'Your ambition deserves more than your spare attention.', author: 'YouDO' },
  { text: 'Someone with fewer advantages is making better use of this same hour.', author: 'YouDO' },
  { text: 'Discipline is keeping the next small promise.', author: 'YouDO' },
  { text: 'The gap between you and them is being built in quiet hours like this one.', author: 'YouDO' },
  { text: 'Protect your attention. It is building your future.', author: 'YouDO' },
  { text: 'You are spending a day you will never be given again.', author: 'YouDO' },
  { text: 'Your dream has already cost you comfort. Make that sacrifice mean something.', author: 'YouDO' },
  { text: 'Someone made your opportunity possible. Do not spend it carelessly.', author: 'YouDO' },
  { text: 'Nothing hurts like meeting the life you could have built.', author: 'YouDO' },
  { text: 'The worst result is knowing you had the time and watched yourself waste it.', author: 'YouDO' },
];

const CACHE_KEY = 'youdo-managed-quotes-v1';
const record = (value: unknown): Record<string,unknown> | undefined => value && typeof value === 'object' ? value as Record<string,unknown> : undefined;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function parseQuote(value: unknown): AppQuote | undefined {
  const row=record(value); const quoteText=text(row?.quote_text), author=text(row?.author);
  if(quoteText.length<10||quoteText.length>180||author.length<2||author.length>40)return undefined;
  const id=text(row?.id);
  return {id:id||undefined,text:quoteText,author};
}

export function parseAppQuotes(value: unknown): AppQuote[] {
  return Array.isArray(value) ? value.flatMap(item=>{const quote=parseQuote(item);return quote?[quote]:[];}) : [];
}

export function parseAdminAppQuotes(value: unknown): AdminAppQuote[] {
  if(!Array.isArray(value))return [];
  return value.flatMap(item=>{
    const row=record(item);const quote=parseQuote(item);
    if(!quote?.id)return [];
    return [{...quote,id:quote.id,active:row?.active===true,sortOrder:Number(row?.sort_order)||0,updatedAt:text(row?.updated_at)}];
  });
}

export function loadCachedAppQuotes(): AppQuote[] | null {
  if(typeof localStorage==='undefined')return null;
  try {
    const raw=localStorage.getItem(CACHE_KEY);
    if(raw===null)return null;
    const parsed=JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parseAppQuotes(parsed.map(item=>{
      const row=record(item);return {id:row?.id,quote_text:row?.text,author:row?.author};
    })) : null;
  } catch { return null; }
}

function cacheQuotes(quotes: AppQuote[]) {
  if(typeof localStorage==='undefined')return;
  try { localStorage.setItem(CACHE_KEY,JSON.stringify(quotes)); } catch { /* Offline fallback still works. */ }
}

const announceUpdate=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('youdo-quotes-updated'));};

export async function fetchAppQuotes(): Promise<AppQuote[]> {
  const {data,error}=await supabase.rpc('active_app_quotes');
  if(error)throw new Error(error.message||'Could not load quotes.');
  const quotes=parseAppQuotes(data);cacheQuotes(quotes);return quotes;
}

export async function fetchAdminAppQuotes(): Promise<AdminAppQuote[]> {
  const {data,error}=await supabase.rpc('admin_app_quotes');
  if(error)throw new Error(error.message||'Could not load managed quotes.');
  return parseAdminAppQuotes(data);
}

export async function saveAppQuote(input:{id?:string;text:string;author:string;active:boolean}):Promise<void>{
  const {error}=await supabase.rpc('save_app_quote',{target_id:input.id||null,quote_text:input.text,quote_author:input.author,quote_active:input.active});
  if(error)throw new Error(error.message||'Could not save the quote.');
  announceUpdate();
}

export async function deleteAppQuote(id:string):Promise<void>{
  const {error}=await supabase.rpc('delete_app_quote',{target_id:id});
  if(error)throw new Error(error.message||'Could not delete the quote.');
  announceUpdate();
}
