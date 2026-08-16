import type { TaskSession } from '../types';
import { localISODate } from './dates';
import { isCountableSession } from './sessionStats';

export type HeatmapDay = {
  date: string;
  focusMs: number;
  dayName: string;
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

function shiftLocalISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localISODate(dt);
}

/**
 * Consecutive local days with countable focus, ending today or yesterday.
 * Yesterday still counts if today has not started yet.
 */
export function currentFocusStreak(byDate: Map<string, number>, todayISO: string): number {
  const todayMs = byDate.get(todayISO) ?? 0;
  let cursor = todayMs > 0 ? todayISO : shiftLocalISO(todayISO, -1);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    if ((byDate.get(cursor) ?? 0) <= 0) break;
    streak++;
    cursor = shiftLocalISO(cursor, -1);
  }
  return streak;
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
