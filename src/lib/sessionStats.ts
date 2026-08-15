import type { ActiveSession, SessionPause, TaskSession } from '../types';
import { formatWallClock } from './format';
import { uid } from './ids';
import { localISODate, nextLocalMidnight } from './dates';

export const MIN_COUNTABLE_MS = 15_000;
export const STALE_HEARTBEAT_MS = 300_000;
export const MAX_CONTINUOUS_FOCUS_MS = 14_400_000;
export const MAX_PLAUSIBLE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export function clampSessionEnd(startTime: number, endAt: number): number {
  if (!Number.isFinite(startTime)) return Date.now();
  if (!Number.isFinite(endAt) || endAt < startTime) return startTime;
  if (endAt - startTime > MAX_PLAUSIBLE_SESSION_MS) return startTime + MAX_PLAUSIBLE_SESSION_MS;
  return endAt;
}

export function isCountableSession(s: { netFocusMs: number }): boolean {
  return s.netFocusMs >= MIN_COUNTABLE_MS;
}

export function isManualSession(s: { manual?: boolean; netFocusMs: number; completedStepIndices?: number[] }): boolean {
  if (s.manual === true) return true;
  return s.netFocusMs < MIN_COUNTABLE_MS && (s.completedStepIndices?.length ?? 0) > 0;
}

/** Instant history row when a step is checked off outside a focus session. */
export function createManualStepSession(
  taskId: string,
  stepIndices: number[],
  opts?: { goalNodeId?: string; completed?: boolean | 'partial' },
): TaskSession {
  const now = Date.now();
  const clock = formatWallClock(now);
  const indices = [...new Set(stepIndices)].filter((i) => i >= 0).sort((a, b) => a - b);
  return {
    id: uid('sess'),
    taskId,
    goalNodeId: opts?.goalNodeId,
    startTime: now,
    endTime: now,
    pausedDuration: 0,
    pauses: [],
    netFocusMs: 0,
    wallClockStart: clock,
    wallClockEnd: clock,
    completed: opts?.completed ?? (indices.length > 0 ? 'partial' : false),
    completedStepIndices: indices,
    manual: true,
  };
}

export function lastResumeAt(session: ActiveSession): number {
  if (session.returnedAt) return session.returnedAt;
  for (let i = session.pauses.length - 1; i >= 0; i--) {
    const end = session.pauses[i].end;
    if (end) return end;
  }
  return session.startTime;
}

export function shouldOfferSessionRecovery(session: ActiveSession, now: number): boolean {
  if (!session.lastHeartbeat) return false;
  return now - session.lastHeartbeat > STALE_HEARTBEAT_MS;
}

/**
 * Cap a forgotten sitting at 4h so sleep / a left-on timer cannot inflate stats.
 * After the user taps Resume ("I kept working"), returnedAt is set and the cap is skipped.
 */
export function safetyCapEnd(session: ActiveSession, endAt: number): number {
  const end = clampSessionEnd(session.startTime, endAt);
  if (session.returnedAt) return end;
  const cap = lastResumeAt(session) + MAX_CONTINUOUS_FOCUS_MS;
  return clampSessionEnd(session.startTime, Math.min(end, cap));
}

/** Heartbeat while the app is in the foreground. Never call this when the clock sample failed. */
export function tickActiveSession(session: ActiveSession, now: number): ActiveSession {
  const lastBeat = session.lastHeartbeat || session.startTime;
  if (now - lastBeat > STALE_HEARTBEAT_MS) {
    return session;
  }
  if (!session.isPaused && now - lastResumeAt(session) >= MAX_CONTINUOUS_FOCUS_MS) {
    const pauseAt = lastResumeAt(session) + MAX_CONTINUOUS_FOCUS_MS;
    return {
      ...session,
      isPaused: true,
      pauseStart: pauseAt,
      lastHeartbeat: now,
      pauses: [...session.pauses, { start: pauseAt, wallClockStart: formatWallClock(pauseAt) }],
    };
  }
  return { ...session, lastHeartbeat: now };
}

/** Phone aside / screen off — keep counting. Closes an open pause so lock time is not lost. */
export function continueAfterInterruption(session: ActiveSession, now: number): ActiveSession {
  let pausedDuration = session.pausedDuration;
  let pauses = session.pauses;
  if (session.isPaused && session.pauseStart) {
    const closeAt = Math.min(now, Math.max(session.pauseStart, session.lastHeartbeat || session.pauseStart));
    const dur = Math.max(0, closeAt - session.pauseStart);
    pausedDuration += dur;
    pauses = session.pauses.map((p, i) =>
      i === session.pauses.length - 1 && !p.end
        ? {
            ...p,
            end: closeAt,
            wallClockEnd: formatWallClock(closeAt),
            durationMs: dur,
          }
        : p,
    );
  }
  return {
    ...session,
    isPaused: false,
    pauseStart: undefined,
    pausedDuration,
    pauses,
    lastHeartbeat: now,
    returnedAt: now,
  };
}

export function computePausedMs(session: ActiveSession, now: number, ignoreOpenPause = false): number {
  const end = clampSessionEnd(session.startTime, now);
  const open =
    !ignoreOpenPause && session.isPaused && session.pauseStart ? Math.max(0, end - session.pauseStart) : 0;
  return Math.max(0, session.pausedDuration + open);
}

export function computeNetFocusMs(session: ActiveSession, now: number, ignoreOpenPause = false): number {
  const end = clampSessionEnd(session.startTime, now);
  const elapsed = end - session.startTime;
  const paused = Math.min(elapsed, computePausedMs(session, end, ignoreOpenPause));
  return Math.max(0, elapsed - paused);
}

export function closeOpenPause(session: ActiveSession, now: number): ActiveSession['pauses'] {
  if (!session.isPaused || !session.pauseStart) return session.pauses;
  return session.pauses.map((p, i) =>
    i === session.pauses.length - 1 && !p.end
      ? {
          ...p,
          end: now,
          wallClockEnd: formatWallClock(now),
          durationMs: Math.max(0, now - p.start),
        }
      : p,
  );
}

export function finalizeSession(
  prev: ActiveSession,
  endAt: number,
  outcome: { completed: boolean | 'partial'; completedStepIndices?: number[] },
  goalNodeId?: string,
  opts?: { ignoreOpenPause?: boolean },
): TaskSession | null {
  const end = clampSessionEnd(prev.startTime, endAt);
  const ignoreOpen = opts?.ignoreOpenPause === true;
  const elapsed = end - prev.startTime;
  const pausedDuration = Math.min(elapsed, computePausedMs(prev, end, ignoreOpen));
  const netFocusMs = Math.max(0, elapsed - pausedDuration);

  if (netFocusMs < MIN_COUNTABLE_MS && elapsed < MIN_COUNTABLE_MS) {
    return null;
  }

  const pauses = ignoreOpen
    ? prev.pauses.filter((p) => p.end && p.end <= end)
    : closeOpenPause(prev, end);

  return {
    id: uid('sess'),
    taskId: prev.taskId,
    goalNodeId,
    startTime: prev.startTime,
    endTime: end,
    pausedDuration,
    pauses,
    netFocusMs,
    wallClockStart: prev.wallClockStart,
    wallClockEnd: formatWallClock(end),
    completed: outcome.completed,
    completedStepIndices: outcome.completedStepIndices ?? [],
  };
}

export function pauseOverlapMs(pauses: SessionPause[] | undefined, a: number, b: number): number {
  if (!pauses?.length || b <= a) return 0;
  let n = 0;
  for (const p of pauses) {
    if (p.start == null) continue;
    const pe = p.end ?? b;
    const start = Math.max(a, p.start);
    const stop = Math.min(b, pe);
    if (stop > start) n += stop - start;
  }
  return n;
}

export interface SessionDaySlice {
  date: string;
  durationMs: number;
  netFocusMs: number;
}

export function splitSessionByLocalDate(s: {
  startTime: number;
  endTime: number;
  pauses?: SessionPause[];
  netFocusMs: number;
}): SessionDaySlice[] {
  const start = s.startTime;
  const end = clampSessionEnd(start, s.endTime);
  if (end <= start) {
    return [{ date: localISODate(new Date(start)), durationMs: 0, netFocusMs: 0 }];
  }

  const totalWall = end - start;
  const slices: SessionDaySlice[] = [];
  let cursor = start;
  const usePauses = (s.pauses?.length ?? 0) > 0;

  while (cursor < end) {
    const sliceEnd = Math.min(end, nextLocalMidnight(cursor));
    const durationMs = sliceEnd - cursor;
    const netFocusMs = usePauses
      ? Math.max(0, durationMs - pauseOverlapMs(s.pauses, cursor, sliceEnd))
      : Math.round(s.netFocusMs * (durationMs / totalWall));
    slices.push({
      date: localISODate(new Date(cursor)),
      durationMs,
      netFocusMs,
    });
    cursor = sliceEnd;
  }
  return slices;
}

export function sessionOverlapsLocalDate(
  s: { startTime: number; endTime: number; pauses?: SessionPause[]; netFocusMs: number },
  date: string,
): SessionDaySlice | undefined {
  return splitSessionByLocalDate(s).find((sl) => sl.date === date);
}

export function aggregateSessions(sessions: { netFocusMs: number; startTime: number; endTime: number }[]) {
  const counted = sessions.filter(isCountableSession);
  return {
    counted,
    skipped: sessions.length - counted.length,
    netFocusMs: counted.reduce((acc, s) => acc + s.netFocusMs, 0),
    durationMs: counted.reduce((acc, s) => acc + Math.max(0, s.endTime - s.startTime), 0),
  };
}
