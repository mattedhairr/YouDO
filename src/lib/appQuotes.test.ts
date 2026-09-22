import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{rpc:mocks.rpc}}));
import { deleteAppQuote, fetchAdminAppQuotes, parseAdminAppQuotes, parseAppQuotes, saveAppQuote } from './appQuotes';

beforeEach(()=>mocks.rpc.mockReset());

describe('managed app quotes',()=>{
  it('keeps only valid public quote rows',()=>{
    expect(parseAppQuotes([
      {id:'q1',quote_text:'A useful preparation quote.',author:'YouDO'},
      {id:'q2',quote_text:'short',author:'YouDO'},
    ])).toEqual([{id:'q1',text:'A useful preparation quote.',author:'YouDO'}]);
  });

  it('parses protected admin fields',()=>{
    expect(parseAdminAppQuotes([{id:'q1',quote_text:'A useful preparation quote.',author:'YouDO',active:false,sort_order:20,updated_at:'now'}]))
      .toEqual([{id:'q1',text:'A useful preparation quote.',author:'YouDO',active:false,sortOrder:20,updatedAt:'now'}]);
  });

  it('uses protected RPCs for listing, saving, and deletion',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:[{id:'q1',quote_text:'A useful preparation quote.',author:'YouDO',active:true}],error:null});
    await expect(fetchAdminAppQuotes()).resolves.toHaveLength(1);
    mocks.rpc.mockResolvedValueOnce({data:'q1',error:null});
    await saveAppQuote({id:'q1',text:'An edited preparation quote.',author:'YouDO',active:true});
    expect(mocks.rpc).toHaveBeenLastCalledWith('save_app_quote',{target_id:'q1',quote_text:'An edited preparation quote.',quote_author:'YouDO',quote_active:true});
    mocks.rpc.mockResolvedValueOnce({data:null,error:null});
    await deleteAppQuote('q1');
    expect(mocks.rpc).toHaveBeenLastCalledWith('delete_app_quote',{target_id:'q1'});
  });
});
