/**
 * Extra focus: time spent on a goal through study quick tasks (cards linked to
 * the goal itself, not to a step of its tree). It is shown on the goal as time
 * only; it never changes the goal's progress.
 */
import type { Task, TaskSession } from '../types';
import { localISODate } from './dates';
import { mondayOfLocalISO } from './paceBoard';
import { isCountableSession } from './sessionStats';

export interface ExtraFocusRow {
  taskId: string;
  title: string;
  /** Local date of the sittings (YYYY-MM-DD). */
  day: string;
  ms: number;
}

export interface ExtraFocus {
  weekMs: number;
  /** This week's quick tasks for the goal, newest day first. */
  rows: ExtraFocusRow[];
}

/** The goal a sitting counts toward as Extra focus, if any. */
function sittingGoal(session: TaskSession, task: Task | undefined): string | undefined {
  if (session.goalNodeId) return undefined;
  return session.goalId ?? (task && !task.goalNodeId ? task.goalId : undefined);
}

export function extraFocusForGoal(goalId: string, history: Record<string, TaskSession[]>, tasks: Task[], today: string): ExtraFocus {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const weekStart = mondayOfLocalISO(today);
  const rows = new Map<string, ExtraFocusRow>();
  let weekMs = 0;
  for (const [taskId, sessions] of Object.entries(history)) {
    const task = byId.get(taskId);
    for (const s of sessions) {
      if (!isCountableSession(s) || sittingGoal(s, task) !== goalId) continue;
      const day = localISODate(new Date(s.startTime));
      if (day < weekStart || day > today) continue;
      weekMs += s.netFocusMs;
      const key = `${taskId}|${day}`;
      const row = rows.get(key) ?? { taskId, title: task?.title ?? 'Quick task', day, ms: 0 };
      row.ms += s.netFocusMs;
      rows.set(key, row);
    }
  }
  return { weekMs, rows: [...rows.values()].sort((a, b) => b.day.localeCompare(a.day) || b.ms - a.ms) };
}
