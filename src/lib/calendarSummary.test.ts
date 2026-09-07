import { describe, expect, it } from 'vitest';
import type { TaskSession } from '../types';
import { calendarFocusSummary } from './calendarSummary';

const minute = 60_000;
function session(start: string, end: string, netFocusMs?: number): TaskSession {
  const startTime = new Date(start).getTime(); const endTime = new Date(end).getTime();
  return { id: start, taskId: 'task', startTime, endTime, netFocusMs: netFocusMs ?? endTime - startTime, pausedDuration: 0, pauses: [], wallClockStart: '', wallClockEnd: '', completed: false, completedStepIndices: [] };
}
describe('compact Calendar focus summary', () => {
  it('splits an overnight session at local midnight without double-counting time', () => {
    const sessions = [session('2026-09-06T23:30:00', '2026-09-07T00:30:00')];
    expect(calendarFocusSummary(sessions, '2026-09-06')).toEqual({ netFocusMs: 30 * minute, count: 1 });
    expect(calendarFocusSummary(sessions, '2026-09-07')).toEqual({ netFocusMs: 30 * minute, count: 1 });
  });
  it('ignores zero-focus manual and sub-threshold sessions', () => {
    const sessions = [session('2026-09-06T10:00:00', '2026-09-06T11:00:00', 10_000), { ...session('2026-09-06T12:00:00', '2026-09-06T12:00:00'), manual: true }];
    expect(calendarFocusSummary(sessions, '2026-09-06')).toEqual({ netFocusMs: 0, count: 0 });
  });
  it('does not carry yesterday’s totals into an empty date', () => {
    const sessions = [session('2026-09-06T10:00:00', '2026-09-06T11:00:00')];
    expect(calendarFocusSummary(sessions, '2026-09-07')).toEqual({ netFocusMs: 0, count: 0 });
  });
});
