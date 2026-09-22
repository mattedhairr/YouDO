import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc}}));
import { fetchAdminHashtagRequests, parseAdminHashtagRequest, parseHashtagContext, requestCommunityHashtag, reviewCommunityHashtagRequest } from './communityHashtags';

beforeEach(()=>mocks.rpc.mockReset());

describe('community hashtag contracts',()=>{
  it('parses compact member context without trusting malformed rows',()=>{
    expect(parseHashtagContext({
      hashtags:[{id:'gate',label:'GATE',member_count:4},{id:null,label:'Bad'}],
      mine:{id:'gate',label:'GATE'},
      request:{id:'r1',exam_name:'ESE',details:'Civil',status:'waiting',admin_response:'Two more requests needed',created_at:'2026-09-22T00:00:00Z'},
    })).toEqual({
      hashtags:[{id:'gate',label:'GATE',memberCount:4}],mine:{id:'gate',label:'GATE'},
      requests:[{id:'r1',examName:'ESE',details:'Civil',status:'waiting',adminResponse:'Two more requests needed',createdAt:'2026-09-22T00:00:00Z'}],
    });
  });
  it('parses every request and falls back to the legacy singular response',()=>{
    expect(parseHashtagContext({hashtags:[],requests:[
      {id:'r2',exam_name:'NEET',status:'open',created_at:'new'},
      {id:'r1',exam_name:'GATE',status:'declined',admin_response:'Use the existing tag',created_at:'old'},
    ]}).requests).toHaveLength(2);
    expect(parseHashtagContext({hashtags:[],request:{id:'r1',exam_name:'GATE',status:'open'}}).requests)
      .toMatchObject([{id:'r1',examName:'GATE'}]);
  });
  it('drops unreadable admin request rows',()=>{
    expect(parseAdminHashtagRequest({id:'r1',requester_id:'u1',exam_name:'GATE',normalized_exam:'gate',details:'',status:'open',admin_response:'',created_at:'now'}))
      .toMatchObject({id:'r1',requesterId:'u1',examName:'GATE'});
    expect(parseAdminHashtagRequest({id:'r2',status:'approved'})).toBeUndefined();
  });
  it('uses protected RPCs for member and admin operations',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:null,error:null});
    await requestCommunityHashtag('GATE','CS');
    expect(mocks.rpc).toHaveBeenCalledWith('request_community_hashtag',{requested_exam:'GATE',request_details:'CS'});
    mocks.rpc.mockResolvedValueOnce({data:[{id:'r1',requester_id:'u1',exam_name:'GATE',status:'open'}],error:null});
    await expect(fetchAdminHashtagRequests()).resolves.toHaveLength(1);
    mocks.rpc.mockResolvedValueOnce({data:null,error:null});
    await reviewCommunityHashtagRequest('r1','reject','','');
    expect(mocks.rpc).toHaveBeenLastCalledWith('review_community_hashtag_request',{
      target_request:'r1',decision:'reject',response_note:'',hashtag_label:null,
    });
  });
});
