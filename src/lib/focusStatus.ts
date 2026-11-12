import { supabase } from './supabase';
import { STORAGE_KEYS } from './storageKeys';
import type { ActiveSession } from '../types';

export type FocusState = 'idle' | 'focusing' | 'paused';

/** What room-mates see: whether you are focusing, and for how long. Never the task. */
export interface FocusStatus {
  userId: string;
  state: FocusState;
  startedAt: string | null;
  pausedMs: number;
  updatedAt: string;
}

export interface FocusShare {
  state: FocusState;
  startedAt: string | null;
  pausedMs: number;
}

/** The share for the current session, rounded so heartbeats do not cause writes. */
export function focusShareFromSession(session: ActiveSession | null | undefined): FocusShare {
  if (!session) return { state: 'idle', startedAt: null, pausedMs: 0 };
  return {
    state: session.isPaused ? 'paused' : 'focusing',
    startedAt: new Date(session.startTime).toISOString(),
    pausedMs: Math.max(0, Math.round(session.pausedDuration / 1000) * 1000),
  };
}

export function focusShareKey(share: FocusShare): string {
  return `${share.state}|${share.startedAt ?? ''}|${share.pausedMs}`;
}

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
