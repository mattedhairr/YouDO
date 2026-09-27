import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AppRelease } from './appUpdate';

const updater = registerPlugin<{
  prepareUpdate(options: { url: string; sha256: string; version: string }): Promise<{ ready: boolean; installAllowed: boolean }>;
  installUpdate(): Promise<{ permissionRequired: boolean }>;
  openInstallSettings(): Promise<void>;
}>('YouDoAppUpdate');
type State = { version: string; phase: 'idle' | 'downloading' | 'ready' | 'permission' | 'verifying'; error: string };
let state: State = { version: '', phase: 'idle', error: '' };
const listeners = new Set<() => void>();
const set = (next: State) => { state = next; listeners.forEach((listener) => listener()); };
export const nativeUpdateState = () => state;
export const supportsNativeUpdate = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('YouDoAppUpdate');
export function subscribeNativeUpdate(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export async function downloadAppUpdate(release: AppRelease) {
  if (!release.apk || state.phase === 'downloading' || state.phase === 'verifying') return;
  set({ version: release.version, phase: 'downloading', error: '' });
  try {
    const result = await updater.prepareUpdate({ ...release.apk, version: release.version });
    set({ version: release.version, phase: result.installAllowed ? 'ready' : 'permission', error: '' });
  } catch (error) {
    set({ version: release.version, phase: 'idle', error: error instanceof Error ? error.message : 'Download failed. Please try again.' });
  }
}
export async function installAppUpdate() {
  if (state.phase !== 'ready' && state.phase !== 'permission') return;
  set({ ...state, phase: 'verifying', error: '' });
  try {
    const result = await updater.installUpdate();
    set({ ...state, phase: result.permissionRequired ? 'permission' : 'ready', error: '' });
  } catch (error) {
    set({ ...state, phase: 'idle', error: error instanceof Error ? error.message : 'Installation could not start. Download again.' });
  }
}
export async function allowAppUpdates() {
  try { await updater.openInstallSettings(); set({ ...state, phase: 'ready', error: '' }); }
  catch { set({ ...state, error: 'Could not open Android settings. Try again or use the release page.' }); }
}
