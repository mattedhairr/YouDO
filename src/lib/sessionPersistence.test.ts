import { describe, expect, it, vi } from 'vitest';
import type { ActiveSession } from '../types';
import { finalizeSession } from './sessionStats';
import { createSessionJournal, nativeSessionIsFinished, persistSessionRecord, selectNativeSession } from './sessionPersistence';
import { STORAGE_KEYS } from './storageKeys';
import { mergeSessionHistories } from './syncMerge';

const active: ActiveSession = { taskId: 'dpp-1', startTime: 1_000_000, pausedDuration: 0, isPaused: false, lastHeartbeat: 1_000_000, pauses: [], wallClockStart: '10:00 AM' };
const session = finalizeSession(active, active.startTime + 98 * 60_000, { completed: true, completedStepIndices: [0] })!;

describe('focus persistence safeguards', () => {
  it('does not overwrite a newer saved pause with an older notification snapshot',()=>{
    const paused={...active,isPaused:true,pauseStart:active.startTime+60_000,lastHeartbeat:active.startTime+60_000};
    expect(selectNativeSession(paused,active,{})).toBe(paused);
  });
  it('accepts a newer notification action for the same sitting',()=>{
    const paused={...active,isPaused:true,pauseStart:active.startTime+60_000,lastHeartbeat:active.startTime+60_000};
    expect(selectNativeSession(active,paused,{})).toBe(paused);
  });
  it('never revives a recorded sitting or displaces a different active sitting',()=>{
    expect(selectNativeSession(null,active,{'dpp-1':[session]})).toBeNull();
    const other={...active,taskId:'another'};
    expect(selectNativeSession(other,active,{})).toBe(other);
  });
  function memoryStorage(seed: Record<string,string>={}) {
    const data=new Map(Object.entries(seed));
    return { getItem:(key:string)=>data.get(key)??null, setItem:vi.fn((key:string,value:string)=>{data.set(key,value);}) };
  }
  it('writes a start or pause before accepting the next timer state',()=>{
    const storage=memoryStorage();const journal=createSessionJournal(storage);
    journal.write(active);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.activeSession)!)).toEqual(active);
    journal.write({...active,isPaused:true,pauseStart:active.startTime+60_000});
    expect(journal.read()?.isPaused).toBe(true);
  });
  it('keeps the saved session when storage rejects a pause',()=>{
    const storage=memoryStorage();const journal=createSessionJournal(storage);journal.write(active);
    storage.setItem.mockImplementationOnce(()=>{throw new Error('QuotaExceeded');});
    expect(()=>journal.write({...active,isPaused:true})).toThrow('QuotaExceeded');
    expect(journal.read()).toEqual(active);
  });
  it('refuses a stale timer write after another tab has changed the session',()=>{
    const storage=memoryStorage();const journal=createSessionJournal(storage);journal.write(active);
    storage.setItem(STORAGE_KEYS.activeSession,'null');
    expect(()=>journal.write(active)).toThrow('another window');
    expect(storage.getItem(STORAGE_KEYS.activeSession)).toBe('null');
    expect(journal.read()).toBeNull();
  });
  it('refuses writes after the device workspace changes accounts',()=>{
    const storage=memoryStorage({[STORAGE_KEYS.workspaceOwner]:'account-a'});
    const journal=createSessionJournal(storage);
    storage.setItem(STORAGE_KEYS.workspaceOwner,'account-b');
    expect(()=>journal.write(active)).toThrow('account');
    expect(storage.getItem(STORAGE_KEYS.activeSession)).toBeNull();
  });
  it('does not erase malformed saved timers during hydration',()=>{
    const storage=memoryStorage({[STORAGE_KEYS.activeSession]:'{"taskId":"broken"}'});
    const journal=createSessionJournal(storage);
    expect(()=>journal.read()).toThrow('unreadable');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('persists a 98 minute sitting before returning the new history without mutating the old one', () => {
    const before = {};
    const setItem = vi.fn();
    const next = persistSessionRecord(before, session, { setItem });
    expect(session.netFocusMs).toBe(5_880_000);
    expect(next['dpp-1'][0].manual).not.toBe(true);
    expect(JSON.parse(setItem.mock.calls[0][1])).toEqual(next);
    expect(before).toEqual({});
  });
  it('propagates storage failure rather than claiming the session was saved', () => {
    const before = {};
    expect(() => persistSessionRecord(before, session, { setItem: () => { throw new Error('QuotaExceeded'); } })).toThrow('QuotaExceeded');
    expect(before).toEqual({});
  });
  it('rejects native replay of a finished sitting but allows a genuinely new sitting', () => {
    const history = { 'dpp-1': [session] };
    expect(nativeSessionIsFinished(active, history)).toBe(true);
    expect(nativeSessionIsFinished({ ...active, startTime: active.startTime + 99 * 60_000 }, history)).toBe(false);
  });
  it('preserves a legacy-format focus record when combining with a completed task device without history', () => {
    const next = mergeSessionHistories({}, { 'dpp-1': [session] });
    expect(next['dpp-1'][0].netFocusMs).toBe(5_880_000);
    expect(mergeSessionHistories(next, next)['dpp-1']).toHaveLength(1);
  });
});
