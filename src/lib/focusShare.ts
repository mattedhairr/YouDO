import type { ActiveSession } from '../types';

/**
 * What this device tells its rooms, kept apart from focusStatus.ts so the
 * first screen can work out a session's share without loading the rest.
 */
export type FocusState = 'idle' | 'focusing' | 'paused';

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
