import { localISODate, shiftLocalISO } from './dates';
import { netFocusByLocalDateOverlapping } from './focusTrends';
import type { TaskSession } from '../types';

export const PACE_BOARD_MIN_OPT_IN = 10;
export const PACE_BOARD_TOP_LIMIT = 10;
export const PACE_BOARD_NEARBY_RADIUS = 2;

export const PACE_HONEST_QUOTE =
  'The board cannot see a lie. You can. Padding hours cheats the only person who has to sit the exam.';

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
  streak: number;
  barHours: number;
  updatedAt: string;
};

export function windowMs(row: PaceRow, window: PaceWindow): number {
  if (window === 'today') return row.todayMs;
  if (window === 'week') return row.weekMs;
  return row.monthMs;
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

export function rankedIds(rows: PaceRow[], window: PaceWindow): string[] {
  return [...rows]
    .sort((a, b) => {
      const d = windowMs(b, window) - windowMs(a, window);
      if (d !== 0) return d;
      return a.displayName.localeCompare(b.displayName);
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
