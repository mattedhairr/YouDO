import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { ActiveSession } from '../types';

const NOTIF_ID = 35001;
const CHANNEL_ID = 'youdo_focus';
const ACTION_PAUSE = 'youdo_pause';
const ACTION_RESUME = 'youdo_resume';
const TYPE_RUNNING = 'youdo_session_running';
const TYPE_PAUSED = 'youdo_session_paused';

let prepared = false;

function native(): boolean {
  return Capacitor.isNativePlatform();
}

async function prepare(): Promise<boolean> {
  if (!native()) return false;
  if (prepared) return true;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const next = await LocalNotifications.requestPermissions();
      if (next.display !== 'granted') return false;
    }
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Focus session',
      description: 'Pause or resume the sitting from the notification shade',
      importance: 2,
      visibility: 1,
      sound: '',
      vibration: false,
      lights: false,
    });
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: TYPE_RUNNING,
          actions: [{ id: ACTION_PAUSE, title: 'Pause' }],
        },
        {
          id: TYPE_PAUSED,
          actions: [{ id: ACTION_RESUME, title: 'Resume' }],
        },
      ],
    });
    prepared = true;
    return true;
  } catch {
    return false;
  }
}

async function clearNotification(): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
    await LocalNotifications.removeDeliveredNotificationsById({ ids: [NOTIF_ID] });
  } catch {
    /* ignore */
  }
}

export async function syncSessionNotification(
  session: ActiveSession | null,
  taskTitle?: string,
): Promise<void> {
  if (!native()) return;
  if (!session) {
    await clearNotification();
    return;
  }
  const ok = await prepare();
  if (!ok) return;

  const title = session.isPaused ? 'Paused' : 'Focus';
  const body = taskTitle?.trim() || 'Sitting in progress';
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIF_ID,
          title,
          body,
          channelId: CHANNEL_ID,
          ongoing: true,
          autoCancel: false,
          extra: { youdo: 'session' },
          actionTypeId: session.isPaused ? TYPE_PAUSED : TYPE_RUNNING,
          smallIcon: 'ic_stat_youdo',
          iconColor: '#C4A574',
          sound: '',
          schedule: { at: new Date(Date.now() + 50) },
        },
      ],
    });
  } catch {
    /* ignore */
  }
}

export async function attachSessionNotificationActions(handlers: {
  onPause: () => void;
  onResume: () => void;
}): Promise<PluginListenerHandle | undefined> {
  if (!native()) return undefined;
  return LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const id = event.actionId;
    if (id === ACTION_PAUSE) handlers.onPause();
    else if (id === ACTION_RESUME) handlers.onResume();
  });
}
