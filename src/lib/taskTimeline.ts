import type { Task, TaskSession } from '../types';
import { todayISO } from './dates';
import { isTaskComplete } from './goalTree';
import { isCountableSession, isManualSession, sessionOverlapsLocalDate } from './sessionStats';

export type TaskOccurrenceKind = 'scheduled' | 'failed' | 'backlog-completed';
export type TaskCompletionMode = 'process' | 'manual' | 'mixed' | null;

export interface TaskOccurrence {
  date: string;
  kind: TaskOccurrenceKind;
  /** Whether the card should use the completed/faded treatment in Plan. */
  resolved: boolean;
  /** Whether it counts as completed on this specific date for daily stats. */
  completedOnDate: boolean;
}

export function taskTimelineDates(task: Task): string[] {
  const dates = new Set<string>();
  if (task.targetDate) dates.add(task.targetDate);
  if (task.originalTargetDate) dates.add(task.originalTargetDate);
  task.pastFailedNativeDates?.forEach((date) => dates.add(date));
  return [...dates];
}

/** Interpret one task snapshot as a date-specific Plan occurrence. */
export function taskOccurrenceOnDate(
  task: Task,
  date: string,
  today = todayISO(),
): TaskOccurrence | null {
  const recordedFailure =
    task.originalTargetDate === date || task.pastFailedNativeDates?.includes(date) === true;
  if (recordedFailure) {
    return {
      date,
      kind: 'failed',
      resolved: isTaskComplete(task),
      completedOnDate: false,
    };
  }

  if (task.targetDate !== date) return null;

  if (task.originalTargetDate && task.originalTargetDate !== date) {
    if (!isTaskComplete(task)) return null;
    return { date, kind: 'backlog-completed', resolved: true, completedOnDate: true };
  }

  if (!isTaskComplete(task) && date < today) {
    return { date, kind: 'failed', resolved: false, completedOnDate: false };
  }

  const complete = isTaskComplete(task);
  return { date, kind: 'scheduled', resolved: complete, completedOnDate: complete };
}

function sessionsOnDate(rows: TaskSession[], date: string): TaskSession[] {
  return rows.filter((session) => Boolean(sessionOverlapsLocalDate(session, date)));
}

/**
 * Determine how a dated completion happened. Explicit manual rows support
 * mixed process/manual completion; legacy cards are inferred conservatively.
 */
export function taskCompletionModeOnDate(
  task: Task,
  date: string,
  rows: TaskSession[],
): TaskCompletionMode {
  const occurrence = taskOccurrenceOnDate(task, date);
  if (!occurrence?.completedOnDate) return null;

  const relevant = sessionsOnDate(rows, date);
  const manualRows = relevant.filter(isManualSession);
  const processRows = relevant.filter((row) => !isManualSession(row) && isCountableSession(row));
  const hasProcessCompletion = processRows.some(
    (row) => row.completed === true || (row.completedStepIndices?.length ?? 0) > 0,
  );

  let hasManualCompletion = manualRows.length > 0;
  if (!hasManualCompletion) {
    if (task.steps.length === 0) {
      hasManualCompletion = !hasProcessCompletion;
    } else {
      const processCovered = new Set<number>();
      let processMarkedWholeTask = false;
      for (const row of processRows) {
        row.completedStepIndices?.forEach((index) => processCovered.add(index));
        if (row.completed === true && (row.completedStepIndices?.length ?? 0) === 0) {
          processMarkedWholeTask = true;
        }
      }
      hasManualCompletion = !processMarkedWholeTask && processCovered.size < task.progress;
    }
  }

  if (hasProcessCompletion && hasManualCompletion) return 'mixed';
  if (hasManualCompletion) return 'manual';
  if (hasProcessCompletion) return 'process';
  return null;
}
