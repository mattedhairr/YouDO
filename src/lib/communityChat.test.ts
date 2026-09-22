import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),onAuthStateChange:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc,auth:{onAuthStateChange:mocks.onAuthStateChange}}}));
import { chatCacheGeneration, clearChatCache, fetchChatPage, mergeChatPage, parseChatMessage, pendingChatMessage, readChatCache, saveChatCache, sendChatMessage } from './communityChat';
const now=Date.now();
const row={id:'m1',author_id:'a',body:'Revision',sequence:1,created_at:new Date(now).toISOString(),expires_at:new Date(now+86400000).toISOString()};
const authChanged=(event:string, userId?:string)=>mocks.onAuthStateChange.mock.calls[0][0](event,userId?{user:{id:userId}}:null);
beforeEach(()=>{authChanged('SIGNED_IN','a');clearChatCache();mocks.rpc.mockReset();});
describe('chat delivery and cache',()=>{
  it('creates the pending row synchronously without waiting on the network',()=>{
    const pending=pendingChatMessage('a',' Revision ');
    expect(pending).toMatchObject({authorId:'a',body:'Revision',delivery:'pending'});
    expect(pending.id).toMatch(/^[0-9a-f-]{36}$/);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('retries the same identity bound to its originating account',async()=>{
    const pending=pendingChatMessage('a','Revision');
    mocks.rpc.mockResolvedValue({data:{...row,id:pending.id},error:null});
    await sendChatMessage(pending);await sendChatMessage(pending);
    expect(mocks.rpc.mock.calls[0][1]).toEqual(mocks.rpc.mock.calls[1][1]);
    expect(mocks.rpc.mock.calls[0][1].expected_author).toBe('a');
  });
  it('replaces pending with the server result without duplicate rendering',()=>{
    const pending={...pendingChatMessage('a','Revision'),id:row.id};
    const merged=mergeChatPage([pending],[parseChatMessage(row)]);
    expect(merged).toHaveLength(1);expect(merged[0].delivery).toBe('sent');
  });
  it('discards expired and removed cached messages',()=>{
    const message=parseChatMessage(row);
    saveChatCache('a',{messages:[message,{...message,id:'expired',expiresAt:new Date(now-1).toISOString()},{...message,id:'removed',removedAt:new Date(now).toISOString()}],hasOlder:false});
    expect(readChatCache('a').messages.map(m=>m.id)).toEqual(['m1']);
  });
  it('never returns another account conversation',()=>{
    saveChatCache('a',{messages:[parseChatMessage(row)],hasOlder:false});
    expect(readChatCache('b').messages).toEqual([]);
    authChanged('SIGNED_IN','b');saveChatCache('b',{messages:[],hasOlder:false});expect(readChatCache('a').messages).toEqual([]);
  });
  it('uses the protected filtered page only when an exam is selected',async()=>{
    mocks.rpc.mockResolvedValue({data:[],error:null});
    await fetchChatPage(undefined,'gate-id');
    expect(mocks.rpc).toHaveBeenLastCalledWith('community_chat_page_by_hashtag',{before_sequence:null,selected_hashtag:'gate-id'});
    await fetchChatPage(42);
    expect(mocks.rpc).toHaveBeenLastCalledWith('community_chat_page',{before_sequence:42});
  });
  it('keeps General and exam-filtered caches separate',()=>{
    saveChatCache('a',{messages:[parseChatMessage(row)],hasOlder:false},chatCacheGeneration(),'general');
    saveChatCache('a',{messages:[parseChatMessage({...row,id:'gate'})],hasOlder:false},chatCacheGeneration(),'gate');
    expect(readChatCache('a','general').messages.map(message=>message.id)).toEqual(['m1']);
    expect(readChatCache('a','gate').messages.map(message=>message.id)).toEqual(['gate']);
  });
  it('rejects unmount cleanup from a signed-out account',()=>{
    const generation=chatCacheGeneration();
    authChanged('SIGNED_OUT');
    saveChatCache('a',{messages:[parseChatMessage(row)],hasOlder:false},generation);
    expect(readChatCache('a').messages).toEqual([]);
  });
  it('rejects a stale cache writer after access has been revoked',()=>{
    const generation=chatCacheGeneration();
    clearChatCache('a');
    saveChatCache('a',{messages:[parseChatMessage(row)],hasOlder:false},generation);
    expect(readChatCache('a').messages).toEqual([]);
  });
  it('keeps the cache when the same session is announced again',()=>{
    saveChatCache('a',{messages:[parseChatMessage(row)],hasOlder:false});
    authChanged('SIGNED_IN','a');
    expect(readChatCache('a').messages).toHaveLength(1);
  });
  it('keeps pending messages after server-ordered messages even with a slow device clock',()=>{
    const pending=pendingChatMessage('a','New message',undefined,now-3600000);
    expect(mergeChatPage([parseChatMessage(row)],[pending]).map(m=>m.id)).toEqual([row.id,pending.id]);
  });
  it('offers a safe retry instead of leaving interrupted sends stuck',()=>{
    const pending=pendingChatMessage('a','Revision');saveChatCache('a',{messages:[pending],hasOlder:false});
    expect(readChatCache('a').messages[0]).toMatchObject({id:pending.id,delivery:'failed'});
  });
  it('rejects malformed rows before time formatting',()=>{
    expect(()=>parseChatMessage({...row,created_at:'invalid'})).toThrow('unreadable');
    expect(()=>parseChatMessage({...row,sequence:NaN})).toThrow('unreadable');
  });
  it('keeps a bounded ordered window',()=>{
    const messages=Array.from({length:150},(_,n)=>parseChatMessage({...row,id:`m${n}`,sequence:n+1}));
    const window=mergeChatPage([],messages);expect(window).toHaveLength(120);expect(window[0].sequence).toBe(31);
  });
});
