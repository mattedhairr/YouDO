import { supabase } from './supabase';
import { STORAGE_KEYS } from './storageKeys';
import type { FocusShare, FocusState } from './focusShare';

/** What room-mates see: whether you are focusing, and for how long. Never the task. */
export interface FocusStatus {
  userId: string;
  state: FocusState;
  startedAt: string | null;
  pausedMs: number;
  updatedAt: string;
}

export { focusShareFromSession, focusShareKey, type FocusShare, type FocusState } from './focusShare';

/** Focused time so far for a live status (0 when idle). */
export function focusElapsedMs(status: Pick<FocusStatus, 'state' | 'startedAt' | 'pausedMs' | 'updatedAt'>, now = Date.now()): number {
  if (status.state === 'idle' || !status.startedAt) return 0;
  const started = Date.parse(status.startedAt);
  // While paused, the clock stops where the pause began (the last update).
  const end = status.state === 'paused' ? Date.parse(status.updatedAt) : now;
  return Math.max(0, end - started - status.pausedMs);
}

/** A status older than this is treated as stale (the app was killed mid-session). */
export const FOCUS_STATUS_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function isLiveFocus(status: FocusStatus, now = Date.now()): boolean {
  if (status.state === 'idle' || !status.startedAt) return false;
  return now - Date.parse(status.startedAt) < FOCUS_STATUS_MAX_AGE_MS;
}

/**
 * Whether your own room status shows a session that has already ended: it is
 * live (focusing or paused), yet a sitting with that very start is recorded in
 * your history, which syncs from every device. A session whose "idle" never
 * reached the server (an older version could lose it) stays stuck that way
 * until it expires; a device with no session of its own clears it. A session
 * still running elsewhere has no sitting yet, so it is never cleared.
 */
export function isEndedOwnStatus(status: FocusStatus | undefined, sittingStarts: ReadonlySet<number>, now = Date.now()): boolean {
  if (!status || !status.startedAt || !isLiveFocus(status, now)) return false;
  return sittingStarts.has(Date.parse(status.startedAt));
}

export async function setFocusStatus(share: FocusShare): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('set_focus_status', {
      next_state: share.state,
      focus_started_at: share.startedAt,
      focus_paused_ms: share.pausedMs,
    });
    return !error;
  } catch {
    return false;
  }
}

function parseStatus(raw: Record<string, unknown>): FocusStatus | null {
  if (typeof raw.user_id !== 'string') return null;
  const state = raw.state === 'focusing' || raw.state === 'paused' ? raw.state : 'idle';
  return {
    userId: raw.user_id,
    state,
    startedAt: typeof raw.started_at === 'string' ? raw.started_at : null,
    pausedMs: Number(raw.paused_ms) || 0,
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : new Date().toISOString(),
  };
}

export async function fetchFocusStatuses(userIds: string[]): Promise<Record<string, FocusStatus>> {
  if (!userIds.length) return {};
  const { data, error } = await supabase.from('focus_status').select('*').in('user_id', userIds);
  if (error || !Array.isArray(data)) return {};
  const out: Record<string, FocusStatus> = {};
  for (const row of data) {
    const status = parseStatus(row as Record<string, unknown>);
    if (status) out[status.userId] = status;
  }
  return out;
}

/** Live updates for a room's members; RLS decides which rows arrive. */
export function subscribeFocusStatuses(userIds: string[], onChange: (status: FocusStatus) => void): () => void {
  if (!userIds.length) return () => {};
  const channel = supabase
    .channel(`focus-status:${[...userIds].sort().join(',').slice(0, 180)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'focus_status', filter: `user_id=in.(${userIds.join(',')})` },
      (payload) => {
        const status = parseStatus((payload.new ?? {}) as Record<string, unknown>);
        if (status) onChange(status);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * The session this device last told the room about (its own running one),
 * per account. Kept across restarts, so a stop whose "idle" failed to send is
 * still reported the next time the app opens.
 */
export interface FocusAnnounced {
  userId: string;
  startedAt: string;
}

/**
 * Whether this device should tell the room about `share`. A device speaks
 * only for its own session: it shares a running one, and says "idle" only when
 * a session it announced has ended. A device with no session of its own stays
 * quiet, so opening YouDO on the phone can't cancel a session running on the
 * website, and signing in can't either.
 */
export function shouldShareFocus(share: FocusShare, announced: FocusAnnounced | null, userId: string): boolean {
  if (share.state !== 'idle') return true;
  return announced !== null && announced.userId === userId;
}

/** What to remember once `share` has reached the room. */
export function announcedAfter(share: FocusShare, userId: string): FocusAnnounced | null {
  return share.state === 'idle' || !share.startedAt ? null : { userId, startedAt: share.startedAt };
}

export function parseFocusAnnounced(raw: unknown): FocusAnnounced | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return typeof row.userId === 'string' && row.userId && typeof row.startedAt === 'string' && row.startedAt
    ? { userId: row.userId, startedAt: row.startedAt }
    : null;
}

export function readFocusAnnounced(): FocusAnnounced | null {
  try {
    return parseFocusAnnounced(JSON.parse(localStorage.getItem(STORAGE_KEYS.focusAnnounced) ?? 'null'));
  } catch {
    return null;
  }
}

export function saveFocusAnnounced(next: FocusAnnounced | null): void {
  try {
    if (next) localStorage.setItem(STORAGE_KEYS.focusAnnounced, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEYS.focusAnnounced);
  } catch {
    /* Restricted storage: this visit still shares; a later "idle" may be skipped. */
  }
}

export interface FocusShareJob {
  share: FocusShare;
  userId: string;
  /** Sent even with no session announced here (clearing an ended session, see isEndedOwnStatus). */
  force?: boolean;
  /** False once the account changed: the job is dropped. */
  current: () => boolean;
  /** The share reached the room, or there was nothing for this device to say. */
  done: () => void;
}

export interface FocusShareDeps {
  send: (share: FocusShare) => Promise<boolean>;
  readAnnounced: () => FocusAnnounced | null;
  saveAnnounced: (next: FocusAnnounced | null) => void;
}

/**
 * Sends a device's status one write at a time, in order. Two writes in flight
 * at once could reach the server in either order: a "focusing" sent when the
 * app came back, landing after the "idle" of a stop made right then, left you
 * focusing in every room (and on your widget) with nothing to correct it. A
 * change made while a write is in flight waits for it, and only the newest
 * waiting change is sent, so the room always ends on this device's latest
 * state. Whether this device should speak is decided just before sending, so
 * an "idle" right after a start still goes out once the start has landed.
 */
export function createFocusShareQueue(deps: FocusShareDeps = {
  send: setFocusStatus,
  readAnnounced: readFocusAnnounced,
  saveAnnounced: saveFocusAnnounced,
}): (job: FocusShareJob) => Promise<void> {
  let waiting: FocusShareJob | null = null;
  let busy = false;
  let idle: Promise<void> = Promise.resolve();
  const drain = async () => {
    try {
      while (waiting) {
        const job = waiting;
        waiting = null;
        if (!job.current()) continue;
        if (!job.force && !shouldShareFocus(job.share, deps.readAnnounced(), job.userId)) {
          // No session of ours to report: leave the room's status to the device that has one.
          job.done();
          continue;
        }
        const ok = await deps.send(job.share).catch(() => false);
        if (!ok || !job.current()) continue;
        deps.saveAnnounced(announcedAfter(job.share, job.userId));
        job.done();
      }
    } finally {
      busy = false;
    }
  };
  // The promise settles once nothing is waiting.
  return (job) => {
    waiting = job;
    if (!busy) {
      busy = true;
      idle = drain();
    }
    return idle;
  };
}
