import { localISODate, shiftLocalISO } from './dates';
import { netFocusByLocalDateOverlapping } from './focusTrends';
import type { TaskSession } from '../types';

export const PACE_BOARD_MIN_OPT_IN = 10;

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

export function rankedIds(rows: PaceRow[], window: PaceWindow): string[] {
  return [...rows]
    .sort((a, b) => {
      const d = windowMs(b, window) - windowMs(a, window);
      if (d !== 0) return d;
      return a.displayName.localeCompare(b.displayName);
    })
    .map((r) => r.userId);
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
