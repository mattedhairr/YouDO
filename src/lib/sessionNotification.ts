import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { ActiveSession } from '../types';

interface YouDoSessionNotificationPlugin {
  sync(options: { paused: boolean; title: string; sessionJson: string }): Promise<void>;
  clear(): Promise<void>;
  getSession(): Promise<{ session?: ActiveSession }>;
  addListener(
    eventName: 'sessionUpdated',
    listener: (event: { session: ActiveSession }) => void,
  ): Promise<PluginListenerHandle>;
}

const YouDoSessionNotification = registerPlugin<YouDoSessionNotificationPlugin>('YouDoSessionNotification', {
  web: () =>
    ({
      async sync() {},
      async clear() {},
      async getSession() {
        return {};
      },
      async addListener() {
        return { remove: async () => {} };
      },
    }) as YouDoSessionNotificationPlugin,
});

function native(): boolean {
  return Capacitor.isNativePlatform();
}

export async function syncSessionNotification(
  session: ActiveSession | null,
  taskTitle?: string,
): Promise<void> {
  if (!native()) return;
  try {
    if (!session) {
      await YouDoSessionNotification.clear();
      return;
    }
    await YouDoSessionNotification.sync({
      paused: session.isPaused,
      title: taskTitle?.trim() || 'Sitting in progress',
      sessionJson: JSON.stringify(session),
    });
  } catch {
    /* ignore */
  }
}

export async function pullNativeSession(): Promise<ActiveSession | null> {
  if (!native()) return null;
  try {
    const result = await YouDoSessionNotification.getSession();
    return result.session ?? null;
  } catch {
    return null;
  }
}

export async function attachSessionNotificationActions(
  onSession: (session: ActiveSession) => void,
): Promise<PluginListenerHandle | undefined> {
  if (!native()) return undefined;
  return YouDoSessionNotification.addListener('sessionUpdated', (event) => {
    if (event?.session) onSession(event.session);
  });
}
