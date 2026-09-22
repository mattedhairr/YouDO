import { supabase } from './supabase';

export interface CommunityHashtag { id: string; label: string; memberCount: number }
export interface CommunityHashtagRequest {
  id: string; requesterId?: string; examName: string; normalizedExam?: string; details: string;
  status: 'open'|'waiting'|'approved'|'declined'; adminResponse: string; createdAt: string;
}
export interface CommunityHashtagContext {
  hashtags: CommunityHashtag[];
  mine?: Pick<CommunityHashtag,'id'|'label'>;
  requests: CommunityHashtagRequest[];
}

const record = (value: unknown): Record<string,unknown> | undefined => value && typeof value === 'object' ? value as Record<string,unknown> : undefined;
const text = (value: unknown) => typeof value === 'string' ? value : '';

export function parseHashtagContext(value: unknown): CommunityHashtagContext {
  const row=record(value);
  const hashtags=Array.isArray(row?.hashtags) ? row!.hashtags.flatMap(value=>{
    const item=record(value); const id=text(item?.id), label=text(item?.label);
    return id && label ? [{id,label,memberCount:Math.max(0,Number(item?.member_count)||0)}] : [];
  }) : [];
  const mineRow=record(row?.mine); const mineId=text(mineRow?.id), mineLabel=text(mineRow?.label);
  const parseRequest=(value:unknown):CommunityHashtagRequest|undefined=>{
    const requestRow=record(value); const requestId=text(requestRow?.id), examName=text(requestRow?.exam_name);
    const status=text(requestRow?.status);
    return requestId && examName && ['open','waiting','approved','declined'].includes(status) ? {
      id:requestId, examName, details:text(requestRow?.details), status:status as CommunityHashtagRequest['status'],
      adminResponse:text(requestRow?.admin_response), createdAt:text(requestRow?.created_at),
    } : undefined;
  };
  const requests=Array.isArray(row?.requests)
    ? row.requests.flatMap(value=>{const request=parseRequest(value);return request?[request]:[];})
    : (()=>{const request=parseRequest(row?.request);return request?[request]:[];})();
  return {hashtags,mine:mineId&&mineLabel?{id:mineId,label:mineLabel}:undefined,requests};
}

export function parseAdminHashtagRequest(value: unknown): CommunityHashtagRequest | undefined {
  const row=record(value); const id=text(row?.id), requesterId=text(row?.requester_id), examName=text(row?.exam_name);
  const status=text(row?.status);
  if(!id||!requesterId||!examName||!['open','waiting'].includes(status))return undefined;
  return {id,requesterId,examName,normalizedExam:text(row?.normalized_exam),details:text(row?.details),
    status:status as 'open'|'waiting',adminResponse:text(row?.admin_response),createdAt:text(row?.created_at)};
}

export async function fetchCommunityHashtags(): Promise<CommunityHashtagContext> {
  const {data,error}=await supabase.rpc('community_hashtag_context');
  if(error)throw new Error(error.message||'Could not load exam hashtags.');
  return parseHashtagContext(data);
}
export async function chooseCommunityHashtag(id:string): Promise<void> {
  const {error}=await supabase.rpc('set_community_hashtag',{selected_hashtag:id});
  if(error)throw new Error(error.message||'Could not save your exam hashtag.');
}
export async function requestCommunityHashtag(examName:string,details:string): Promise<void> {
  const {error}=await supabase.rpc('request_community_hashtag',{requested_exam:examName,request_details:details});
  if(error)throw new Error(error.message||'Could not send your request.');
}
export async function fetchAdminHashtagRequests(): Promise<CommunityHashtagRequest[]> {
  const {data,error}=await supabase.rpc('admin_community_hashtag_requests');
  if(error)throw new Error(error.message||'Could not load hashtag requests.');
  return (Array.isArray(data)?data:[]).flatMap(value=>{const item=parseAdminHashtagRequest(value);return item?[item]:[];});
}
export async function reviewCommunityHashtagRequest(id:string,decision:'wait'|'create'|'reject',response:string,label=''): Promise<void> {
  const {error}=await supabase.rpc('review_community_hashtag_request',{
    target_request:id,decision,response_note:response,hashtag_label:label||null,
  });
  if(error)throw new Error(error.message||'Could not review this request.');
}
