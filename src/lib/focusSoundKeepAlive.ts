import { Capacitor, registerPlugin } from '@capacitor/core';

export interface YouDoFocusSoundPlugin {
  keepAlive(options: { on: boolean }): Promise<void>;
  /** An audio file opened with or shared to YouDO: {path, name}, or {} (Android only). */
  takeIncomingSound(): Promise<{ path?: string; name?: string }>;
  clearIncomingSound(): Promise<void>;
  addListener(event: 'incomingSound', listener: () => void): Promise<{ remove: () => Promise<void> }>;
}

export const YouDoFocusSound = registerPlugin<YouDoFocusSoundPlugin>('YouDoFocusSound', {
  web: () => ({ async keepAlive() {} }) as unknown as YouDoFocusSoundPlugin,
});

/**
 * Android: while a focus sound plays with "Keep playing" on, the session
 * notification becomes a media service, so the phone keeps the app (and the
 * sound) running with the screen off. Nothing to do on the web.
 */
export async function setFocusSoundKeepAlive(on: boolean): Promise<void> {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('YouDoFocusSound')) return;
  try {
    await YouDoFocusSound.keepAlive({ on });
  } catch {
    /* Android refused (for example, started from the background): the sound still plays while the app is open. */
  }
}
