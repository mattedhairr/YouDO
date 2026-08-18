import type { TaskSession } from '../types';
import { daysBetweenLocalISO, localISODate, shiftLocalISO } from './dates';
import { isCountableSession, MIN_COUNTABLE_MS, splitSessionByLocalDate } from './sessionStats';

export const DEFAULT_STREAK_BAR_HOURS = 1;
export const MIN_STREAK_BAR_HOURS = 0.5;
export const MAX_STREAK_BAR_HOURS = 10;
export const REVIVE_WINDOW_DAYS = 2;

export type HeatmapDay = {
  date: string;
  focusMs: number;
  dayName: string;
};

export type StreakWalkOpts = {
  thresholdMs?: number;
  barEffectiveFrom?: string;
  bridgeDates?: Iterable<string>;
};

export type StreakReviveSnapshot = {
  previousStreak: number;
  brokenOn: string;
  windowEnds: string;
  backlogTaskIds: string[];
  revivedOn?: string | null;
};

export type StreakMeta = {
  bestStreak: number;
  barHours: number;
  barEffectiveFrom: string;
  revive: StreakReviveSnapshot | null;
};

export type StreakView = {
  current: number;
  best: number;
  brokenDays: number;
  revive: {
    active: boolean;
    eligible: boolean;
    remainingTasks: number;
    remainingIds: string[];
    daysLeft: number;
    previousStreak: number;
  } | null;
};

export function sessionLocalDate(s: TaskSession): string {
  return localISODate(new Date(s.startTime));
}

export function netFocusByLocalDate(sessions: TaskSession[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    if (!isCountableSession(s) || s.netFocusMs <= 0) continue;
    const date = sessionLocalDate(s);
    byDate.set(date, (byDate.get(date) ?? 0) + s.netFocusMs);
  }
  return byDate;
}

/** Net focus per local calendar day, splitting sittings that cross midnight. */
export function netFocusByLocalDateOverlapping(sessions: TaskSession[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    if (!isCountableSession(s)) continue;
    for (const slice of splitSessionByLocalDate(s)) {
      if (slice.netFocusMs <= 0) continue;
      byDate.set(slice.date, (byDate.get(slice.date) ?? 0) + slice.netFocusMs);
    }
  }
  return byDate;
}

export function clampStreakBarHours(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_STREAK_BAR_HOURS;
  const stepped = Math.round(hours * 2) / 2;
  return Math.min(MAX_STREAK_BAR_HOURS, Math.max(MIN_STREAK_BAR_HOURS, stepped));
}

export function streakBarMs(hours: number): number {
  return clampStreakBarHours(hours) * 3_600_000;
}

export function defaultStreakMeta(todayISO: string): StreakMeta {
  return {
    bestStreak: 0,
    barHours: DEFAULT_STREAK_BAR_HOURS,
    barEffectiveFrom: todayISO,
    revive: null,
  };
}

export function dayQualifies(ms: number, date: string, opts?: StreakWalkOpts): boolean {
  if (!opts?.thresholdMs) return ms > 0;
  const from = opts.barEffectiveFrom;
  const bar = !from || date >= from ? opts.thresholdMs : MIN_COUNTABLE_MS;
  return ms >= bar;
}

function bridgeSet(opts?: StreakWalkOpts): Set<string> {
  return new Set(opts?.bridgeDates ?? []);
}

function reviveBridges(revive: StreakReviveSnapshot | null): string[] {
  if (!revive?.revivedOn) return [];
  const dates: string[] = [];
  let cursor = revive.brokenOn;
  while (cursor < revive.revivedOn) {
    dates.push(cursor);
    cursor = shiftLocalISO(cursor, 1);
  }
  return dates;
}

/**
 * Consecutive local days with countable / threshold focus, ending today or yesterday.
 * Bridge dates are skipped (missed day after a revive) and do not increment the count.
 */
export function currentFocusStreak(
  byDate: Map<string, number>,
  todayISO: string,
  opts?: StreakWalkOpts,
): number {
  const bridges = bridgeSet(opts);
  const todayQ = dayQualifies(byDate.get(todayISO) ?? 0, todayISO, opts);
  let cursor = todayQ ? todayISO : shiftLocalISO(todayISO, -1);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    if (bridges.has(cursor)) {
      cursor = shiftLocalISO(cursor, -1);
      continue;
    }
    if (!dayQualifies(byDate.get(cursor) ?? 0, cursor, opts)) break;
    streak++;
    cursor = shiftLocalISO(cursor, -1);
  }
  return streak;
}

export function lastQualifyingDate(
  byDate: Map<string, number>,
  todayISO: string,
  opts?: StreakWalkOpts,
): string | null {
  let cursor = todayISO;
  for (let i = 0; i < 365; i++) {
    if (dayQualifies(byDate.get(cursor) ?? 0, cursor, opts)) return cursor;
    cursor = shiftLocalISO(cursor, -1);
  }
  return null;
}

function firstQualifyingInWindow(
  byDate: Map<string, number>,
  revive: StreakReviveSnapshot,
  todayISO: string,
  opts?: StreakWalkOpts,
): string | null {
  let cursor = shiftLocalISO(revive.brokenOn, 1);
  while (cursor <= revive.windowEnds && cursor <= todayISO) {
    if (dayQualifies(byDate.get(cursor) ?? 0, cursor, opts)) return cursor;
    cursor = shiftLocalISO(cursor, 1);
  }
  return null;
}

function remainingSnapshotTasks(
  ids: string[],
  isTaskStillOpen: (id: string) => boolean,
): number {
  return ids.filter((id) => isTaskStillOpen(id)).length;
}

export function weekHeatmap(byDate: Map<string, number>, todayISO: string): HeatmapDay[] {
  const days: HeatmapDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = shiftLocalISO(todayISO, -i);
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    days.push({
      date,
      focusMs: byDate.get(date) ?? 0,
      dayName: dt.toLocaleDateString(undefined, { weekday: 'narrow' }),
    });
  }
  return days;
}

export function walkOptsFromMeta(meta: StreakMeta): StreakWalkOpts {
  return {
    thresholdMs: streakBarMs(meta.barHours),
    barEffectiveFrom: meta.barEffectiveFrom,
    bridgeDates: reviveBridges(meta.revive),
  };
}

function viewFrom(
  byDate: Map<string, number>,
  todayISO: string,
  meta: StreakMeta,
  isTaskStillOpen: (id: string) => boolean,
): StreakView {
  const opts = walkOptsFromMeta(meta);
  const current = currentFocusStreak(byDate, todayISO, opts);
  const revive = meta.revive;
  const inWindow = !!revive && todayISO <= revive.windowEnds && !revive.revivedOn;
  const eligible = !!revive && revive.backlogTaskIds.length > 0;
  const remainingIds = revive ? revive.backlogTaskIds.filter((id) => isTaskStillOpen(id)) : [];
  const daysLeft = revive && inWindow ? Math.max(1, daysBetweenLocalISO(todayISO, revive.windowEnds) + 1) : 0;
  const brokenDays =
    current > 0 || !revive?.brokenOn ? 0 : Math.max(1, daysBetweenLocalISO(revive.brokenOn, todayISO));

  const reviveView = (
    remainingIds: string[],
    extra: { active: boolean; eligible: boolean; daysLeft: number; previousStreak: number },
  ) => ({
    remainingTasks: remainingIds.length,
    remainingIds,
    ...extra,
  });

  return {
    current,
    best: Math.max(meta.bestStreak, current, revive?.previousStreak ?? 0),
    brokenDays,
    revive:
      revive && (inWindow || !!revive.revivedOn)
        ? reviveView(remainingIds, {
            active: inWindow && eligible,
            eligible,
            daysLeft,
            previousStreak: revive.previousStreak,
          })
        : current === 0 && brokenDays > 0
          ? reviveView([], {
              active: false,
              eligible: false,
              daysLeft: 0,
              previousStreak: revive?.previousStreak ?? 0,
            })
          : null,
  };
}

/**
 * Lazy miss detection + revive evaluation. Call on app open / glance, not at midnight.
 * A miss is visible only after yesterday failed the bar (today still has yesterday-grace while the miss day is "today").
 */
export function reconcileStreakMeta(input: {
  todayISO: string;
  byDate: Map<string, number>;
  meta: StreakMeta;
  openBacklogIds: string[];
  isTaskStillOpen: (id: string) => boolean;
}): { meta: StreakMeta; status: StreakView } {
  const barHours = clampStreakBarHours(input.meta.barHours);
  let meta: StreakMeta = {
    ...input.meta,
    barHours,
    barEffectiveFrom: input.meta.barEffectiveFrom || input.todayISO,
  };

  const yesterday = shiftLocalISO(input.todayISO, -1);
  const optsNow = () => walkOptsFromMeta(meta);
  const yesterdayMissed = !dayQualifies(input.byDate.get(yesterday) ?? 0, yesterday, optsNow());

  if (yesterdayMissed) {
    const lastQ = lastQualifyingDate(input.byDate, shiftLocalISO(yesterday, -1), optsNow());
    if (lastQ) {
      const brokenOn = shiftLocalISO(lastQ, 1);
      const windowEnds = shiftLocalISO(brokenOn, REVIVE_WINDOW_DAYS);
      const sameBreak = meta.revive?.brokenOn === brokenOn;
      if (!sameBreak) {
        const previousStreak = currentFocusStreak(input.byDate, lastQ, {
          ...optsNow(),
          bridgeDates: [],
        });
        const stillInWindow = input.todayISO <= windowEnds;
        meta = {
          ...meta,
          revive: {
            previousStreak,
            brokenOn,
            windowEnds,
            backlogTaskIds: stillInWindow ? [...input.openBacklogIds] : [],
            revivedOn: null,
          },
        };
      }
    } else if (meta.revive && !meta.revive.revivedOn && input.todayISO > meta.revive.windowEnds) {
      meta = { ...meta, revive: { ...meta.revive, backlogTaskIds: [] } };
    }
  }

  const revive = meta.revive;
  if (revive && !revive.revivedOn && revive.backlogTaskIds.length > 0 && input.todayISO <= revive.windowEnds) {
    const remaining = remainingSnapshotTasks(revive.backlogTaskIds, input.isTaskStillOpen);
    const qual = firstQualifyingInWindow(input.byDate, revive, input.todayISO, walkOptsFromMeta(meta));
    if (remaining === 0 && qual) {
      meta = { ...meta, revive: { ...revive, revivedOn: qual } };
    }
  }

  const current = currentFocusStreak(input.byDate, input.todayISO, walkOptsFromMeta(meta));
  const bestStreak = Math.max(meta.bestStreak, current, meta.revive?.previousStreak ?? 0);
  meta = { ...meta, bestStreak };
  return { meta, status: viewFrom(input.byDate, input.todayISO, meta, input.isTaskStillOpen) };
}

export function applyStreakBarHours(meta: StreakMeta, hours: number, todayISO: string): StreakMeta {
  const barHours = clampStreakBarHours(hours);
  if (barHours === meta.barHours) return { ...meta, barHours };
  return {
    ...meta,
    barHours,
    barEffectiveFrom: todayISO,
  };
}
