import type { TaskSession } from '../types';
import { isCountableSession, sessionOverlapsLocalDate } from './sessionStats';

export function calendarFocusSummary(sessions: TaskSession[], date: string) {
  let netFocusMs = 0;
  let count = 0;
  for (const session of sessions) {
    if (!isCountableSession(session)) continue;
    const slice = sessionOverlapsLocalDate(session, date);
    if (!slice || slice.netFocusMs <= 0) continue;
    netFocusMs += slice.netFocusMs;
    count++;
  }
  return { netFocusMs, count };
}
