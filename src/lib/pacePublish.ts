import { todayISO } from './dates';
import { currentFocusStreak, netFocusByLocalDateOverlapping, walkOptsFromMeta, type StreakMeta } from './focusTrends';
import { paceWindowTotals, type PacePrefs } from './paceBoard';
import { deletePaceRow, upsertPaceRow } from './paceCloud';
import type { TaskSession } from '../types';

export async function syncPublicPaceRow(input: {
  userId: string;
  prefs: PacePrefs;
  sessions: TaskSession[];
  streakMeta: StreakMeta;
}): Promise<{ ok: boolean; missingTable?: boolean; skipped?: boolean }> {
  if (!input.prefs.optedIn) return { ok: true, skipped: true };
  const displayName = input.prefs.displayName.trim();
  if (!displayName) return { ok: true, skipped: true };
  const today = todayISO();
  const totals = paceWindowTotals(input.sessions, today);
  const byDate = netFocusByLocalDateOverlapping(input.sessions);
  const streak = currentFocusStreak(byDate, today, walkOptsFromMeta(input.streakMeta));
  return upsertPaceRow({
    userId: input.userId,
    displayName,
    examLabel: input.prefs.examLabel.trim(),
    todayMs: totals.todayMs,
    weekMs: totals.weekMs,
    monthMs: totals.monthMs,
    streak,
    barHours: input.streakMeta.barHours,
  });
}

export async function withdrawPublicPace(userId: string) {
  return deletePaceRow(userId);
}
