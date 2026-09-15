import { describe, expect, it } from 'vitest';
import type { ActiveSession } from '../types';
import { computeNetFocusMs, finalizeSession, lastResumeAt, MAX_CONTINUOUS_FOCUS_MS, pauseOverlapMs, resolvePersistEndAt, sanitizeSession, shouldOfferSessionRecovery, splitSessionByLocalDate, tickActiveSession } from './sessionStats';

const minute = 60_000;
const start = new Date(2026, 8, 14, 20).getTime();
const running: ActiveSession = { taskId: 'study', startTime: start, lastHeartbeat: start, isPaused: false, pausedDuration: 0, pauses: [], wallClockStart: '8:00 PM' };

describe('session integrity at lifecycle boundaries', () => {
  it('keeps a normal phone-aside session running without demanding recovery', () => {
    const end = start + 98 * minute;
    expect(shouldOfferSessionRecovery(running, end)).toBe(false);
    expect(tickActiveSession(running, end).lastHeartbeat).toBe(end);
    expect(finalizeSession(running, end, { completed: true })?.netFocusMs).toBe(98 * minute);
  });
  it('uses the latest explicit resume after an earlier recovery confirmation', () => {
    const session = { ...running, returnedAt: start + 10 * minute, pauses: [{ start: start + 15 * minute, end: start + 30 * minute, wallClockStart: '' }] };
    expect(lastResumeAt(session)).toBe(start + 30 * minute);
  });
  it('pauses a forgotten background session at the same boundary as a foreground session', () => {
    const next = tickActiveSession(running, start + 6 * 60 * minute);
    expect(next.isPaused).toBe(true);
    expect(next.pauseStart).toBe(start + MAX_CONTINUOUS_FOCUS_MS);
    expect(computeNetFocusMs(next, start + 6 * 60 * minute)).toBe(MAX_CONTINUOUS_FOCUS_MS);
  });
  it('bounds reconstruction by the same safety rule as ordinary stopping', () => {
    expect(resolvePersistEndAt(running, start + 8 * 60 * minute, { userEnd: start + 7 * 60 * minute })).toBe(start + MAX_CONTINUOUS_FOCUS_MS);
    expect(resolvePersistEndAt(running, start + 30 * minute, { userEnd: start + 90 * minute })).toBe(start + 30 * minute);
  });
  it('does not subtract pauses that happened after a reconstructed end', () => {
    const session = { ...running, pausedDuration: 10 * minute, pauses: [{ start: start + 30 * minute, end: start + 40 * minute, wallClockStart: '' }] };
    expect(finalizeSession(session, start + 20 * minute, { completed: false }, undefined, { ignoreOpenPause: true })?.netFocusMs).toBe(20 * minute);
  });
  it('counts overlapping pause intervals only once', () => {
    expect(pauseOverlapMs([{ start: start + 10 * minute, end: start + 30 * minute, wallClockStart: '' }, { start: start + 20 * minute, end: start + 40 * minute, wallClockStart: '' }], start, start + 60 * minute)).toBe(30 * minute);
  });
  it('sanitizes malformed pause objects before daily statistics read them', () => {
    const row = sanitizeSession({ ...running, id: 'imported', endTime: start + minute, netFocusMs: minute, pauses: [null, {}, { start: 'bad' }] })!;
    expect(row.pauses).toEqual([]);
    expect(() => splitSessionByLocalDate(row)).not.toThrow();
  });
  it('uses a stable completion identity when the same timer is replayed', () => {
    const first = finalizeSession(running, start + minute, { completed: true })!;
    const replay = finalizeSession(running, start + minute, { completed: true })!;
    expect(replay.id).toBe(first.id);
  });
  it('conserves imported focus totals across dates even with incomplete pause metadata', () => {
    const row = { startTime: start, endTime: start + 8 * 60 * minute, netFocusMs: 2 * 60 * minute, pauses: [{ start, end: start + minute, wallClockStart: '' }] };
    const slices = splitSessionByLocalDate(row);
    expect(slices.reduce((sum, slice) => sum + slice.netFocusMs, 0)).toBe(row.netFocusMs);
    expect(slices.every(slice => slice.netFocusMs >= 0 && slice.netFocusMs <= slice.durationMs)).toBe(true);
  });
  it('preserves legacy aggregate-only paused time', () => {
    expect(computeNetFocusMs({ ...running, pausedDuration: 5 * minute }, start + 20 * minute)).toBe(15 * minute);
  });
});
