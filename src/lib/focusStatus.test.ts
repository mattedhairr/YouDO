import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }));

import {
  FOCUS_STATUS_MAX_AGE_MS,
  announcedAfter,
  createFocusShareQueue,
  focusElapsedMs,
  focusShareFromSession,
  focusShareKey,
  isLiveFocus,
  parseFocusAnnounced,
  shouldShareFocus,
  type FocusAnnounced,
  type FocusShare,
  type FocusState,
  type FocusStatus,
} from './focusStatus';
import type { ActiveSession } from '../types';
import { formatClock } from '../components/hub/hubTime';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const MIN = 60_000;

function session(over: Partial<ActiveSession> = {}): ActiveSession {
  return {
    taskId: 't1',
    startTime: NOW - 30 * MIN,
    pausedDuration: 0,
    isPaused: false,
    lastHeartbeat: NOW,
    pauses: [],
    wallClockStart: '11:30',
    ...over,
  };
}

function status(over: Partial<FocusStatus> = {}): FocusStatus {
  return {
    userId: 'u1',
    state: 'focusing',
    startedAt: new Date(NOW - 30 * MIN).toISOString(),
    pausedMs: 0,
    updatedAt: new Date(NOW - 30 * MIN).toISOString(),
    ...over,
  };
}

describe('what a session shares with room-mates', () => {
  it('shares idle without a session, never a task', () => {
    expect(focusShareFromSession(null)).toEqual({ state: 'idle', startedAt: null, pausedMs: 0 });
    expect(JSON.stringify(focusShareFromSession(session()))).not.toContain('t1');
  });

  it('shares focusing and paused with the start time', () => {
    expect(focusShareFromSession(session()).state).toBe('focusing');
    expect(focusShareFromSession(session({ isPaused: true })).state).toBe('paused');
    expect(focusShareFromSession(session()).startedAt).toBe(new Date(NOW - 30 * MIN).toISOString());
  });

  it('only changes its key on start, pause, resume or stop — not on heartbeats', () => {
    const base = focusShareKey(focusShareFromSession(session()));
    expect(focusShareKey(focusShareFromSession(session({ lastHeartbeat: NOW + 30_000 })))).toBe(base);
    expect(focusShareKey(focusShareFromSession(session({ pausedDuration: 400 })))).toBe(base);
    expect(focusShareKey(focusShareFromSession(session({ isPaused: true })))).not.toBe(base);
    expect(focusShareKey(focusShareFromSession(session({ pausedDuration: 5 * MIN })))).not.toBe(base);
    expect(focusShareKey(focusShareFromSession(null))).not.toBe(base);
  });
});

describe('reading a room-mate’s focus', () => {
  it('counts focused time without pauses', () => {
    expect(focusElapsedMs(status({ pausedMs: 5 * MIN }), NOW)).toBe(25 * MIN);
  });

  it('stops the clock where the pause began', () => {
    const paused = status({ state: 'paused', pausedMs: 0, updatedAt: new Date(NOW - 10 * MIN).toISOString() });
    expect(focusElapsedMs(paused, NOW)).toBe(20 * MIN);
    expect(focusElapsedMs(paused, NOW + 60 * MIN)).toBe(20 * MIN);
  });

  it('treats idle and stale sessions as not live', () => {
    expect(focusElapsedMs(status({ state: 'idle', startedAt: null }), NOW)).toBe(0);
    expect(isLiveFocus(status(), NOW)).toBe(true);
    expect(isLiveFocus(status({ state: 'idle' }), NOW)).toBe(false);
    expect(isLiveFocus(status({ startedAt: new Date(NOW - FOCUS_STATUS_MAX_AGE_MS - MIN).toISOString() }), NOW)).toBe(false);
  });

  it('formats the live clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(24 * MIN + 2_000)).toBe('24:02');
    expect(formatClock(102 * MIN + 7_000)).toBe('1:42:07');
  });
});

describe('a device speaks only for its own session', () => {
  const idle: FocusShare = { state: 'idle', startedAt: null, pausedMs: 0 };
  const focusing: FocusShare = { state: 'focusing', startedAt: '2026-11-12T09:58:00.000Z', pausedMs: 0 };
  const paused: FocusShare = { ...focusing, state: 'paused', pausedMs: 60000 };

  it('opening the phone with no session does not cancel a session on the website', () => {
    // The phone never announced a session: it stays quiet.
    expect(shouldShareFocus(idle, null, 'me')).toBe(false);
  });

  it('signing in on a device with no session stays quiet too, even after another account used it', () => {
    expect(shouldShareFocus(idle, { userId: 'someone-else', startedAt: focusing.startedAt! }, 'me')).toBe(false);
  });

  it('a running or paused session here is always shared', () => {
    expect(shouldShareFocus(focusing, null, 'me')).toBe(true);
    expect(shouldShareFocus(paused, null, 'me')).toBe(true);
  });

  it('stopping a session this device announced says idle, even after a restart', () => {
    const announced = announcedAfter(focusing, 'me');
    expect(announced).toEqual({ userId: 'me', startedAt: focusing.startedAt });
    // Kept in storage: the same answer after the app restarts.
    expect(shouldShareFocus(idle, parseFocusAnnounced(JSON.parse(JSON.stringify(announced))), 'me')).toBe(true);
  });

  it('forgets the session once idle has gone out', () => {
    expect(announcedAfter(idle, 'me')).toBeNull();
    expect(announcedAfter(paused, 'me')).toEqual({ userId: 'me', startedAt: paused.startedAt });
  });

  it('ignores a broken stored record', () => {
    expect(parseFocusAnnounced(null)).toBeNull();
    expect(parseFocusAnnounced({ userId: '', startedAt: 'x' })).toBeNull();
    expect(parseFocusAnnounced({ userId: 'me' })).toBeNull();
    expect(parseFocusAnnounced('nope')).toBeNull();
  });
});

describe('status writes go out one at a time, newest last', () => {
  const focusing: FocusShare = { state: 'focusing', startedAt: '2026-11-13T08:00:00.000Z', pausedMs: 0 };
  const paused: FocusShare = { state: 'paused', startedAt: focusing.startedAt, pausedMs: 0 };
  const idle: FocusShare = { state: 'idle', startedAt: null, pausedMs: 0 };

  /** A fake server: each write lands only when the test lets it. */
  function setup(initial: FocusAnnounced | null = null) {
    const landed: FocusState[] = [];
    const pending: Array<(ok: boolean) => void> = [];
    let announced = initial;
    const push = createFocusShareQueue({
      send: (share) => new Promise<boolean>((resolve) => pending.push((ok) => {
        if (ok) landed.push(share.state);
        resolve(ok);
      })),
      readAnnounced: () => announced,
      saveAnnounced: (next) => { announced = next; },
    });
    const done: string[] = [];
    const job = (share: FocusShare, userId = 'u1', current = () => true) =>
      push({ share, userId, current, done: () => done.push(share.state) });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    return { landed, pending, done, job, flush, announced: () => announced };
  }

  it('a stop made while "focusing" is still on its way lands last', async () => {
    const t = setup({ userId: 'u1', startedAt: focusing.startedAt! });
    void t.job(focusing); // coming back to the app
    void t.job(idle); // Stop, right away
    expect(t.pending).toHaveLength(1); // the stop waits for the write in flight
    t.pending[0](true);
    await t.flush();
    expect(t.pending).toHaveLength(2);
    t.pending[1](true);
    await t.flush();
    expect(t.landed).toEqual(['focusing', 'idle']);
    expect(t.announced()).toBeNull();
  });

  it('a stop right after a start still says idle once the start has landed', async () => {
    const t = setup(null);
    void t.job(focusing);
    void t.job(idle);
    t.pending[0](true);
    await t.flush();
    t.pending[1](true);
    await t.flush();
    expect(t.landed).toEqual(['focusing', 'idle']);
    expect(t.done).toEqual(['focusing', 'idle']);
  });

  it('only the newest waiting change is sent', async () => {
    const t = setup({ userId: 'u1', startedAt: focusing.startedAt! });
    void t.job(focusing);
    void t.job(paused);
    void t.job(idle);
    t.pending[0](true);
    await t.flush();
    t.pending[1](true);
    await t.flush();
    expect(t.landed).toEqual(['focusing', 'idle']);
    expect(t.pending).toHaveLength(2);
  });

  it('a failed write is not marked sent, so it is tried again later', async () => {
    const t = setup({ userId: 'u1', startedAt: focusing.startedAt! });
    void t.job(idle);
    t.pending[0](false);
    await t.flush();
    expect(t.done).toEqual([]);
    expect(t.announced()).not.toBeNull();
    void t.job(idle);
    t.pending[1](true);
    await t.flush();
    expect(t.landed).toEqual(['idle']);
  });

  it('a device with no session of its own still says nothing', async () => {
    const t = setup(null);
    await t.job(idle);
    expect(t.pending).toHaveLength(0);
    expect(t.done).toEqual(['idle']);
  });

  it('drops a change meant for an account that signed out meanwhile', async () => {
    const t = setup(null);
    let signedIn = true;
    void t.job(focusing, 'u1', () => signedIn);
    void t.job(focusing, 'u1', () => signedIn);
    signedIn = false;
    t.pending[0](true);
    await t.flush();
    expect(t.pending).toHaveLength(1);
    expect(t.done).toEqual([]);
  });
});
