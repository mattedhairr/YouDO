import { localISODate, shiftLocalISO, todayISO } from './dates';
import { netFocusByLocalDateOverlapping } from './focusTrends';
import type { TaskSession } from '../types';

export const PACE_BOARD_MIN_OPT_IN = 10;
export const PACE_BOARD_TOP_LIMIT = 10;
export const PACE_BOARD_NEARBY_RADIUS = 2;

export const PACE_HONEST_QUOTE =
  'The Board may believe every number you feed it. The exam will believe only what you learned.';

export const PACE_CHEATING_GUIDE = [
  'Start the timer, then give your attention somewhere else.',
  'Let scrolling, calls, meals, and long breaks keep counting.',
  'Mark work complete before you can honestly explain it.',
  'Call passive staring deep focus because the clock was running.',
  'Lower the target, cross it, and pretend the smaller promise was the dream.',
  'Keep polishing the plan so the numbers look serious while the work stays untouched.',
] as const;

export type PaceWindow = 'today' | 'week' | 'month';

export type PacePrefs = {
  optedIn: boolean;
  displayName: string;
  examLabel: string;
  updatedAt?: number;
};

export function defaultPacePrefs(): PacePrefs {
  return { optedIn: false, displayName: '', examLabel: '', updatedAt: 0 };
}

export function sanitizePacePrefs(raw: unknown): PacePrefs {
  const base = defaultPacePrefs();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  return {
    optedIn: o.optedIn === true,
    displayName: typeof o.displayName === 'string' ? o.displayName.slice(0, 40) : '',
    examLabel: typeof o.examLabel === 'string' ? o.examLabel.slice(0, 40) : '',
    updatedAt: typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) ? o.updatedAt : 0,
  };
}

export function mergePacePrefs(local: PacePrefs, remote: PacePrefs | null | undefined): PacePrefs {
  if (!remote) return local;
  const lt = local.updatedAt ?? 0;
  const rt = remote.updatedAt ?? 0;
  return rt > lt ? remote : local;
}

/** Local Monday of the week containing `iso`. */
export function mondayOfLocalISO(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + delta);
  return localISODate(dt);
}

export function monthStartLocalISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function sumFocusInRange(byDate: Map<string, number>, fromISO: string, toISO: string): number {
  let total = 0;
  let cursor = fromISO;
  while (cursor <= toISO) {
    total += byDate.get(cursor) ?? 0;
    cursor = shiftLocalISO(cursor, 1);
  }
  return total;
}

export function paceWindowTotals(
  sessions: TaskSession[],
  todayISO: string,
): { todayMs: number; weekMs: number; monthMs: number } {
  const byDate = netFocusByLocalDateOverlapping(sessions);
  return {
    todayMs: byDate.get(todayISO) ?? 0,
    weekMs: sumFocusInRange(byDate, mondayOfLocalISO(todayISO), todayISO),
    monthMs: sumFocusInRange(byDate, monthStartLocalISO(todayISO), todayISO),
  };
}

export type PaceRow = {
  userId: string;
  displayName: string;
  examLabel: string;
  todayMs: number;
  weekMs: number;
  monthMs: number;
  todayKey?: string;
  weekKey?: string;
  monthKey?: string;
  streak: number;
  barHours: number;
  updatedAt: string;
};

export function paceWindowKeys(anchorISO: string): { todayKey: string; weekKey: string; monthKey: string } {
  return {
    todayKey: anchorISO,
    weekKey: mondayOfLocalISO(anchorISO),
    monthKey: monthStartLocalISO(anchorISO),
  };
}

/** Expired denormalized totals read as zero even if their owner has not reopened the app. */
export function windowMs(row: PaceRow, window: PaceWindow, anchorISO = todayISO()): number {
  const keys = paceWindowKeys(anchorISO);
  if (window === 'today') return row.todayKey && row.todayKey !== keys.todayKey ? 0 : row.todayMs;
  if (window === 'week') return row.weekKey && row.weekKey !== keys.weekKey ? 0 : row.weekMs;
  return row.monthKey && row.monthKey !== keys.monthKey ? 0 : row.monthMs;
}

/** A personal bar represents the full calendar window, not only days elapsed so far. */
export function paceWindowBarDays(window: PaceWindow, anchor = new Date()): number {
  if (window === 'today') return 1;
  if (window === 'week') return 7;
  return new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
}

export function paceWindowBarTargetMs(barHours: number, window: PaceWindow, anchor = new Date()): number {
  const safeHours = Math.max(0, Number.isFinite(barHours) ? barHours : 0);
  return safeHours * paceWindowBarDays(window, anchor) * 60 * 60 * 1000;
}

export function rankedIds(rows: PaceRow[], window: PaceWindow, anchorISO = todayISO()): string[] {
  return rows
    .filter((row) => windowMs(row, window, anchorISO) > 0)
    .sort((a, b) => {
      const d = windowMs(b, window, anchorISO) - windowMs(a, window, anchorISO);
      if (d !== 0) return d;
      // Match server eligibility checks exactly, independent of device locale.
      return a.userId.localeCompare(b.userId);
    })
    .map((r) => r.userId);
}

export type PaceBoardSelection = {
  topIds: string[];
  myRank: number | null;
  nearbyIds: string[];
};

/** Keep the public Board focused without making an aspirant lose their own context. */
export function selectPaceBoardRows(
  orderedIds: string[],
  currentUserId: string | null | undefined,
  topLimit = PACE_BOARD_TOP_LIMIT,
  nearbyRadius = PACE_BOARD_NEARBY_RADIUS,
): PaceBoardSelection {
  const safeTopLimit = Math.max(1, Math.floor(topLimit));
  const safeNearbyRadius = Math.max(0, Math.floor(nearbyRadius));
  const topIds = orderedIds.slice(0, safeTopLimit);
  const myIndex = currentUserId ? orderedIds.indexOf(currentUserId) : -1;
  if (myIndex < 0) return { topIds, myRank: null, nearbyIds: [] };
  if (myIndex < safeTopLimit) return { topIds, myRank: myIndex + 1, nearbyIds: [] };

  const visibleTopIds = new Set(topIds);
  const nearbyIds = [
    ...orderedIds.slice(Math.max(0, myIndex - safeNearbyRadius), myIndex),
    ...orderedIds.slice(myIndex + 1, myIndex + safeNearbyRadius + 1),
  ].filter((id) => !visibleTopIds.has(id));

  return { topIds, myRank: myIndex + 1, nearbyIds };
}

export type RankDelta = 'up' | 'down' | null;

export function rankDeltas(
  currentOrder: string[],
  previousOrder: string[] | null,
): Record<string, RankDelta> {
  const out: Record<string, RankDelta> = {};
  if (!previousOrder || previousOrder.length === 0) return out;
  const prevIndex = new Map(previousOrder.map((id, i) => [id, i]));
  currentOrder.forEach((id, i) => {
    const p = prevIndex.get(id);
    if (p == null) {
      out[id] = null;
      return;
    }
    if (i < p) out[id] = 'up';
    else if (i > p) out[id] = 'down';
    else out[id] = null;
  });
  return out;
}
