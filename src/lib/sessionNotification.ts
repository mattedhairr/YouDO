import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { ActiveSession } from '../types';
import { parseSavedSession } from './sessionPersistence';

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
): Promise<boolean> {
  if (!native()) return true;
  try {
    if (!session) {
      await YouDoSessionNotification.clear();
      return true;
    }
    await YouDoSessionNotification.sync({
      paused: session.isPaused,
      title: taskTitle?.trim() || 'Sitting in progress',
      sessionJson: JSON.stringify(session),
    });
    return true;
  } catch {
    return false;
  }
}

export async function pullNativeSession(): Promise<{ ok: boolean; session: ActiveSession | null }> {
  if (!native()) return { ok: true, session: null };
  try {
    const result = await YouDoSessionNotification.getSession();
    return { ok: true, session: parseSavedSession(result.session ? JSON.stringify(result.session) : null) };
  } catch {
    return { ok: false, session: null };
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
