import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { formatRemindAt, isGeneralTask, nextOccurrence, reminderAlarms, reminderMeta, remindersFor, repeatLabel, rollReminders, sanitizeRemindAt, sanitizeRepeat } from './reminders';

// 2026-11-27 is a Friday.
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id, title: id, description: '', priority: 'medium', targetDate: '2026-11-27', deadline: null, steps: [], progress: 0, createdAt: 0, order: 0, kind: 'general', ...extra,
});

describe('reminders', () => {
  it('tells general tasks from study ones', () => {
    expect(isGeneralTask(task('a'))).toBe(true);
    expect(isGeneralTask(task('b', { kind: undefined }))).toBe(false);
  });

  it('finds the next day a repeat falls on', () => {
    expect(nextOccurrence({ every: 'daily' }, '2026-11-28')).toBe('2026-11-28');
    expect(nextOccurrence({ every: 'days', days: [1, 3, 5] }, '2026-11-28')).toBe('2026-11-30'); // Sat → Mon
    expect(nextOccurrence({ every: 'days', days: [0] }, '2026-11-28')).toBe('2026-11-29');
  });

  it('keeps a ticked reminder for its day, then removes a one-off and brings a repeat back', () => {
    const done = task('fees', { progress: 1 });
    const gym = task('gym', { progress: 1, repeat: { every: 'days', days: [1, 3, 5] } });
    const call = task('call', { repeat: { every: 'daily' } });
    const open = task('form');
    const study = task('study', { kind: undefined, targetDate: '2026-11-20' });
    const same = [done, gym, call, open, study];
    expect(rollReminders(same, '2026-11-27')).toBe(same);
    const next = rollReminders(same, '2026-11-28');
    expect(next.map((t) => t.id)).toEqual(['gym', 'call', 'form', 'study']);
    expect(next.find((t) => t.id === 'gym')).toMatchObject({ targetDate: '2026-11-30', progress: 0 });
    expect(next.find((t) => t.id === 'call')).toMatchObject({ targetDate: '2026-11-28', progress: 0 });
    expect(next.find((t) => t.id === 'form')?.targetDate).toBe('2026-11-27');
    expect(next.find((t) => t.id === 'study')).toBe(study);
  });

  it('shows today’s reminders, unticked first, and hides future ones', () => {
    const list = remindersFor([task('b', { progress: 1 }), task('a', { remindAt: '18:30' }), task('later', { targetDate: '2026-11-30' }), task('s', { kind: undefined })], '2026-11-27');
    expect(list.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('labels repeats and times in plain words', () => {
    expect(repeatLabel(undefined)).toBe('');
    expect(repeatLabel({ every: 'daily' })).toBe('Daily');
    expect(repeatLabel({ every: 'days', days: [5, 1, 3] })).toBe('Mon Wed Fri');
    expect(repeatLabel({ every: 'days', days: [1, 2, 3, 4, 5] })).toBe('Weekdays');
    expect(repeatLabel({ every: 'days', days: [0] })).toBe('Sundays');
    expect(formatRemindAt('18:30')).toBe('6:30 pm');
    expect(formatRemindAt('00:05')).toBe('12:05 am');
    expect(reminderMeta(task('a', { progress: 1 }), '2026-11-27')).toBe('Done · clears tomorrow');
    expect(reminderMeta(task('a', { targetDate: '2026-11-26', remindAt: '09:00' }), '2026-11-27')).toBe('Since yesterday · 9:00 am');
  });

  it('reads only valid stored rules', () => {
    expect(sanitizeRepeat({ every: 'days', days: [5, 1, 9, 1] })).toEqual({ every: 'days', days: [1, 5] });
    expect(sanitizeRepeat({ every: 'days', days: [] })).toBeUndefined();
    expect(sanitizeRepeat('daily')).toBeUndefined();
    expect(sanitizeRemindAt('24:00')).toBeUndefined();
    expect(sanitizeRemindAt('07:45')).toBe('07:45');
  });
});

describe('reminder notifications', () => {
  const now = new Date('2026-11-27T10:00:00'); // Friday morning
  it('schedules each timed reminder on its days, skipping past times and ticked ones', () => {
    const list = [
      task('gym', { remindAt: '18:30', repeat: { every: 'days', days: [1, 3, 5] } }),
      task('fees', { remindAt: '09:00' }),
      task('call', { remindAt: '20:00', progress: 1, repeat: { every: 'daily' } }),
      task('later', { remindAt: '08:00', targetDate: '2026-11-29' }),
      task('untimed'),
      task('study', { kind: undefined, remindAt: '11:00' }),
    ];
    const alarms = reminderAlarms(list, now, 7).map((a) => `${a.key}@${a.at.getHours()}:${String(a.at.getMinutes()).padStart(2, '0')}`);
    expect(alarms).toEqual([
      'gym:2026-11-27@18:30',
      'call:2026-11-28@20:00',
      'later:2026-11-29@8:00',
      'call:2026-11-29@20:00',
      'gym:2026-11-30@18:30',
      'call:2026-11-30@20:00',
      'call:2026-12-01@20:00',
      'gym:2026-12-02@18:30',
      'call:2026-12-02@20:00',
      'call:2026-12-03@20:00',
    ]);
  });
});
