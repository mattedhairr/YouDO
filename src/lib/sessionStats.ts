import type { ActiveSession, SessionPause, Task, TaskSession } from '../types';
import { formatDuration, formatWallClock } from './format';
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
  if (session.isPaused) return false;
  if (!session.lastHeartbeat) return false;
  return now - session.lastHeartbeat > STALE_HEARTBEAT_MS;
}

/**
 * Cap a forgotten sitting at 4h from the last real resume so sleep cannot inflate stats.
 * Resume (“I kept working”) only moves the 4h window; it does not remove the cap.
 */
export function safetyCapEnd(session: ActiveSession, endAt: number): number {
  const end = clampSessionEnd(session.startTime, endAt);
  const cap = lastResumeAt(session) + MAX_CONTINUOUS_FOCUS_MS;
  return clampSessionEnd(session.startTime, Math.min(end, cap));
}

/** End time when the user taps Stop (not the reconstruct slider). */
export function resolvePersistEndAt(
  session: ActiveSession,
  now: number,
  opts?: { userEnd?: number; clockIncident?: boolean },
): number {
  if (opts?.userEnd != null) return clampSessionEnd(session.startTime, opts.userEnd);
  const raw = opts?.clockIncident ? session.lastHeartbeat || session.startTime : now;
  return safetyCapEnd(session, raw);
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

/**
 * Phone aside / screen off — keep counting.
 * If the sitting was already paused, stay paused (away time stays pause, not focus).
 */
export function continueAfterInterruption(session: ActiveSession, now: number): ActiveSession {
  if (session.isPaused) {
    return { ...session, lastHeartbeat: now };
  }
  return {
    ...session,
    isPaused: false,
    pauseStart: undefined,
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

export function sanitizeSession(raw: unknown): TaskSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<TaskSession>;
  if (typeof s.startTime !== 'number' || !Number.isFinite(s.startTime)) return null;
  const end = clampSessionEnd(s.startTime, typeof s.endTime === 'number' && Number.isFinite(s.endTime) ? s.endTime : s.startTime);
  const elapsed = Math.max(0, end - s.startTime);
  let net = typeof s.netFocusMs === 'number' && Number.isFinite(s.netFocusMs) ? s.netFocusMs : 0;
  net = Math.max(0, Math.min(net, elapsed, MAX_PLAUSIBLE_SESSION_MS));
  const id = typeof s.id === 'string' && s.id.trim() ? s.id : `sess-${s.startTime}-${s.taskId ?? 'x'}`;
  const taskId = typeof s.taskId === 'string' ? s.taskId : '';
  const pausedDuration =
    typeof s.pausedDuration === 'number' && Number.isFinite(s.pausedDuration)
      ? Math.max(0, Math.min(s.pausedDuration, elapsed))
      : Math.max(0, elapsed - net);
  return {
    id,
    taskId,
    startTime: s.startTime,
    endTime: end,
    pausedDuration,
    pauses: Array.isArray(s.pauses) ? (s.pauses as TaskSession['pauses']) : [],
    netFocusMs: net,
    wallClockStart: typeof s.wallClockStart === 'string' ? s.wallClockStart : '',
    wallClockEnd: typeof s.wallClockEnd === 'string' ? s.wallClockEnd : '',
    completed: s.completed === true || s.completed === 'partial' ? s.completed : false,
    completedStepIndices: Array.isArray(s.completedStepIndices)
      ? s.completedStepIndices.filter((i): i is number => typeof i === 'number')
      : [],
    goalNodeId: typeof s.goalNodeId === 'string' ? s.goalNodeId : undefined,
    manual: s.manual === true,
  };
}

export function sanitizeSessionHistory(raw: unknown): Record<string, TaskSession[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, TaskSession[]> = {};
  for (const [taskId, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const byId = new Map<string, TaskSession>();
    for (const row of list) {
      const s = sanitizeSession(row);
      if (!s) continue;
      const next = { ...s, taskId: s.taskId || taskId };
      byId.set(next.id, next);
    }
    const uniq = [...byId.values()].sort((a, b) => a.startTime - b.startTime);
    if (uniq.length) out[taskId] = uniq;
  }
  return out;
}

/** Drop sittings that ended before `cutoff`. Empty task keys are removed. */
export function pruneSessionHistoryBefore(
  history: Record<string, TaskSession[]>,
  cutoff: number,
): Record<string, TaskSession[]> {
  const out: Record<string, TaskSession[]> = {};
  for (const [taskId, rows] of Object.entries(history)) {
    const kept = rows.filter((s) => (s.endTime || s.startTime) >= cutoff);
    if (kept.length) out[taskId] = kept;
  }
  return out;
}

export const SESSION_HISTORY_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

export function aggregateSessions(sessions: { netFocusMs: number; startTime: number; endTime: number }[]) {
  const counted = sessions.filter(isCountableSession);
  return {
    counted,
    skipped: sessions.length - counted.length,
    netFocusMs: counted.reduce((acc, s) => acc + s.netFocusMs, 0),
    durationMs: counted.reduce((acc, s) => acc + Math.max(0, s.endTime - s.startTime), 0),
  };
}

export type SessionOutcomeTone = 'success' | 'partial' | 'neutral';

export interface SessionSummary {
  short: string;
  taskTitle: string;
  goalPath: string | null;
  pathSegments: string[];
  wallClockRange: string;
  netFocusLabel: string;
  totalDurationLabel: string;
  focusEfficiency: number;
  stepNames: string[];
  hasSteps: boolean;
  outcome: string;
  outcomeTone: SessionOutcomeTone;
  pauseCount: number;
}

function outcomeLabel(completed: TaskSession['completed'], stepCount: number, totalSteps: number): string {
  if (completed === true) {
    return stepCount > 0 && totalSteps > 0 ? 'All steps done' : 'Marked complete';
  }
  if (completed === 'partial' || stepCount > 0) return 'Partial progress';
  return 'Focus only — no steps marked';
}

function outcomeTone(completed: TaskSession['completed'], stepCount: number): SessionOutcomeTone {
  if (completed === true) return 'success';
  if (completed === 'partial' || stepCount > 0) return 'partial';
  return 'neutral';
}

function stepNamesForSession(task: Task | undefined, indices: number[]): string[] {
  if (!task?.steps.length) return [];
  return [...new Set(indices)]
    .filter((i) => i >= 0 && i < task.steps.length)
    .sort((a, b) => a - b)
    .map((i) => task.steps[i]);
}

/** Structured summary for calendar day stats session rows. */
export function buildSessionSummary(
  session: TaskSession,
  task: Task | undefined,
  opts?: { goalPath?: string | null; netFocusMs?: number; durationMs?: number },
): SessionSummary {
  const stepIndices = session.completedStepIndices ?? [];
  const stepNames = stepNamesForSession(task, stepIndices);
  const totalSteps = task?.steps.length ?? 0;
  const netFocusMs = opts?.netFocusMs ?? session.netFocusMs;
  const durationMs = opts?.durationMs ?? Math.max(0, session.endTime - session.startTime);
  const taskTitle = task?.title ?? 'Unknown task';
  const goalPath = opts?.goalPath?.trim() || null;
  const pathSegments = goalPath
    ? goalPath.split('/').map((p) => p.trim()).filter(Boolean)
    : [];
  const focusEfficiency =
    durationMs > 0 ? Math.min(100, Math.round((netFocusMs / durationMs) * 100)) : 0;

  let short: string;
  if (!task) {
    short = outcomeLabel(session.completed, stepNames.length, totalSteps);
  } else if (session.completed === true && (totalSteps === 0 || stepNames.length >= totalSteps)) {
    short = `${taskTitle} — finished`;
  } else if (stepNames.length === 1) {
    short = `${taskTitle} — ${stepNames[0]}`;
  } else if (stepNames.length > 1) {
    short = `${taskTitle} — ${stepNames.length} steps (${stepNames[0]}…)`;
  } else if (session.completed === false) {
    short = `${taskTitle} — focused, no steps logged`;
  } else {
    short = `${taskTitle} — ${outcomeLabel(session.completed, stepNames.length, totalSteps).toLowerCase()}`;
  }

  return {
    short,
    taskTitle,
    goalPath,
    pathSegments,
    wallClockRange: `${session.wallClockStart} – ${session.wallClockEnd}`,
    netFocusLabel: formatDuration(netFocusMs),
    totalDurationLabel: formatDuration(durationMs),
    focusEfficiency,
    stepNames,
    hasSteps: totalSteps > 0,
    outcome: outcomeLabel(session.completed, stepNames.length, totalSteps),
    outcomeTone: outcomeTone(session.completed, stepNames.length),
    pauseCount: session.pauses.length,
  };
}
