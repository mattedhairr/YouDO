/**
 * Reminder notifications (General quick tasks with a time), kept out of the
 * first screen's JavaScript: App loads this file when reminders change.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Task } from '../types';
import { ensureNotificationChannels, getNotificationPreferences, NOTIFICATION_CHANNELS, notificationAccentColor, stringToNotificationId } from './notifications';
import { reminderAlarms } from './reminders';

const REMINDER_IDS_KEY = 'youdo-reminder-notification-ids-v1';
let lastReminderFingerprint = '';

/**
 * Keeps the next week of reminder notifications scheduled on the phone:
 * replaces the earlier set whenever reminders change. Notifications switched
 * off in Settings schedule nothing.
 */
export async function scheduleReminderNotifications(reminders: Task[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const enabled = getNotificationPreferences().enabled;
  const alarms = enabled ? reminderAlarms(reminders, new Date()) : [];
  const fingerprint = alarms.map((a) => `${a.key}@${a.at.getTime()}:${a.title}`).join('|');
  if (fingerprint === lastReminderFingerprint) return;
  try {
    await ensureNotificationChannels();
    let previous: number[] = [];
    try {
      previous = JSON.parse(localStorage.getItem(REMINDER_IDS_KEY) || '[]');
    } catch {
      previous = [];
    }
    if (previous.length) await LocalNotifications.cancel({ notifications: previous.map((id) => ({ id })) });
    const notifications = alarms.map((a) => ({
      id: stringToNotificationId(`reminder:${a.key}`, 60000, 30000),
      title: a.title,
      body: 'Reminder · tick it in YouDO when done',
      iconColor: notificationAccentColor(),
      schedule: { at: a.at, allowWhileIdle: true },
      channelId: NOTIFICATION_CHANNELS.REMINDERS,
      extra: { type: 'reminder', route: 'today' },
    }));
    if (notifications.length) await LocalNotifications.schedule({ notifications });
    localStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(notifications.map((n) => n.id)));
    lastReminderFingerprint = fingerprint;
  } catch (err) {
    console.warn('Could not schedule reminders:', err);
  }
}
