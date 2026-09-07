import { describe, expect, it, vi } from 'vitest';
import type { ActiveSession } from '../types';
import { finalizeSession } from './sessionStats';
import { nativeSessionIsFinished, persistSessionRecord } from './sessionPersistence';
import { mergeSessionHistories } from './syncMerge';

const active: ActiveSession = { taskId: 'dpp-1', startTime: 1_000_000, pausedDuration: 0, isPaused: false, lastHeartbeat: 1_000_000, pauses: [], wallClockStart: '10:00 AM' };
const session = finalizeSession(active, active.startTime + 98 * 60_000, { completed: true, completedStepIndices: [0] })!;

describe('focus persistence safeguards', () => {
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
