/**
 * General quick tasks ("reminders"): life tasks that are not study. They are
 * ticked done (never timed), never count in study stats, and may repeat.
 * A ticked one stays crossed out for the rest of its day; the next day it is
 * gone, or, when it repeats, back on its next day.
 */
import type { ReminderRepeat, Task } from '../types';
import { daysBetweenLocalISO, shiftLocalISO } from './dates';
import { isTaskComplete } from './goalTree';

export const isGeneralTask = (task: Pick<Task, 'kind'>): boolean => task.kind === 'general';

const weekday = (iso: string) => new Date(iso + 'T12:00:00').getDay();

/** True when a repeating reminder falls on `iso`. */
export function repeatsOn(repeat: ReminderRepeat, iso: string): boolean {
  if (repeat.every === 'daily') return true;
  return repeat.days.includes(weekday(iso));
}

/** The first day on or after `from` that the reminder falls on (within two weeks; else `from`). */
export function nextOccurrence(repeat: ReminderRepeat, from: string): string {
  for (let i = 0; i < 14; i++) {
    const day = shiftLocalISO(from, i);
    if (repeatsOn(repeat, day)) return day;
  }
  return from;
}

/**
 * Moves reminders on to `today`: a ticked one-off from an earlier day is
 * removed; a repeating one (ticked or missed) comes back unticked on its next
 * day; an unticked one-off stays until it is ticked. Returns the same array
 * when nothing changes, so callers can skip a save.
 */
export function rollReminders(tasks: Task[], today: string): Task[] {
  let changed = false;
  const out: Task[] = [];
  for (const task of tasks) {
    if (!isGeneralTask(task) || !task.targetDate || task.targetDate >= today) {
      out.push(task);
      continue;
    }
    if (task.repeat) {
      out.push({ ...task, targetDate: nextOccurrence(task.repeat, today), progress: 0 });
      changed = true;
      continue;
    }
    if (isTaskComplete(task)) {
      changed = true;
      continue;
    }
    out.push(task);
  }
  return changed ? out : tasks;
}

/** Reminders to show on `today`: due today or earlier (unticked one-offs wait until ticked). */
export function remindersFor(tasks: Task[], today: string): Task[] {
  return tasks
    .filter((t) => isGeneralTask(t) && (!t.targetDate || t.targetDate <= today))
    .sort((a, b) => Number(isTaskComplete(a)) - Number(isTaskComplete(b)) || (a.remindAt ?? '99').localeCompare(b.remindAt ?? '99') || a.order - b.order);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Daily", "Mon Wed Fri", "Weekdays", "Sundays"; empty for a one-off. */
export function repeatLabel(repeat: ReminderRepeat | undefined): string {
  if (!repeat) return '';
  if (repeat.every === 'daily') return 'Daily';
  const days = [...new Set(repeat.days)].filter((d) => d >= 0 && d < 7).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (days.length === 7) return 'Daily';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Weekdays';
  if (days.length === 1) return `${FULL_DAY_NAMES[days[0]]}s`;
  return days.map((d) => DAY_NAMES[d]).join(' ');
}

/** "6:30 pm" from "18:30". */
export function formatRemindAt(hhmm: string | undefined): string {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** The small line under a reminder: when it is, or that it is done for today. */
export function reminderMeta(task: Task, today: string): string {
  if (isTaskComplete(task)) return task.repeat ? 'Done · back on its next day' : 'Done · clears tomorrow';
  const parts: string[] = [];
  if (task.targetDate && task.targetDate < today) {
    const days = daysBetweenLocalISO(task.targetDate, today);
    parts.push(days === 1 ? 'Since yesterday' : `Since ${days} days ago`);
  }
  const at = formatRemindAt(task.remindAt);
  if (at) parts.push(at);
  return parts.join(' · ');
}

/** Reads a stored repeat rule (sync and backups may carry anything). */
export function sanitizeRepeat(raw: unknown): ReminderRepeat | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { every?: unknown; days?: unknown };
  if (r.every === 'daily') return { every: 'daily' };
  if (r.every === 'days' && Array.isArray(r.days)) {
    const days = [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d < 7))].sort();
    return days.length ? { every: 'days', days } : undefined;
  }
  return undefined;
}

export const sanitizeRemindAt = (raw: unknown): string | undefined =>
  typeof raw === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : undefined;

export interface ReminderAlarm {
  /** Stable per reminder and day, so a reschedule replaces rather than duplicates. */
  key: string;
  at: Date;
  title: string;
}

/**
 * The reminder notifications for the next `days` days: each reminder with a
 * time, on each day it falls on (a one-off: its own day, or today while still
 * open), never for a time already past or one already ticked today.
 */
export function reminderAlarms(reminders: Task[], now: Date, days = 7): ReminderAlarm[] {
  const out: ReminderAlarm[] = [];
  const today = shiftLocalISO(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, 0);
  for (const r of reminders) {
    const at = sanitizeRemindAt(r.remindAt);
    if (!isGeneralTask(r) || !at) continue;
    const [h, m] = at.split(':').map(Number);
    for (let i = 0; i < days; i++) {
      const day = shiftLocalISO(today, i);
      const onDay = r.repeat
        ? repeatsOn(r.repeat, day) && (!r.targetDate || day >= r.targetDate)
        : day === (r.targetDate && r.targetDate > today ? r.targetDate : today);
      if (!onDay) continue;
      if (day === (r.targetDate ?? today) && isTaskComplete(r)) continue;
      const when = new Date(day + 'T00:00:00');
      when.setHours(h, m, 0, 0);
      if (when.getTime() <= now.getTime()) continue;
      out.push({ key: `${r.id}:${day}`, at: when, title: r.title });
      if (!r.repeat) break;
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 60);
}
