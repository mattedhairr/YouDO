import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AppRelease } from './appUpdate';

type ProgressEvent = { version: string; received: number; total: number };

const updater = registerPlugin<{
  prepareUpdate(options: { url: string; sha256: string; version: string; size?: number }): Promise<{ ready: boolean; installAllowed: boolean }>;
  installUpdate(): Promise<{ permissionRequired: boolean }>;
  openInstallSettings(): Promise<void>;
  addListener(event: 'downloadProgress', handler: (event: ProgressEvent) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(event: 'downloadChecking', handler: (event: { version: string }) => void): Promise<{ remove: () => Promise<void> }>;
}>('YouDoAppUpdate');

/**
 * `checking`: the download finished and the file is being verified.
 * `verifying`: the saved file is re-checked just before Android installs it.
 */
type Phase = 'idle' | 'downloading' | 'checking' | 'ready' | 'permission' | 'verifying';
type State = {
  version: string;
  phase: Phase;
  error: string;
  /** Real bytes received and expected (0 when the size is unknown). */
  received: number;
  total: number;
  /** Smoothed download speed in bytes per second. */
  speed: number;
  /** The release the installer sheet shows, and whether it is open. */
  release: AppRelease | null;
  sheetOpen: boolean;
};
let state: State = { version: '', phase: 'idle', error: '', received: 0, total: 0, speed: 0, release: null, sheetOpen: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
export const nativeUpdateState = () => state;
export const supportsNativeUpdate = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('YouDoAppUpdate');
export function subscribeNativeUpdate(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

let lastSample: { at: number; received: number } | null = null;
let listening = false;
function listen() {
  if (listening || !supportsNativeUpdate() || typeof updater.addListener !== 'function') return;
  listening = true;
  void updater.addListener('downloadProgress', ({ version, received, total }) => {
    if (version !== state.version || state.phase !== 'downloading') return;
    const now = performance.now();
    let speed = state.speed;
    if (lastSample && now > lastSample.at && received >= lastSample.received) {
      const instant = ((received - lastSample.received) * 1000) / (now - lastSample.at);
      speed = speed ? speed * 0.7 + instant * 0.3 : instant;
    }
    lastSample = { at: now, received };
    set({ received, total: total > 0 ? total : state.total, speed });
  });
  void updater.addListener('downloadChecking', ({ version }) => {
    if (version === state.version && state.phase === 'downloading') set({ phase: 'checking', received: state.total || state.received });
  });
}

export function openUpdateInstaller(release: AppRelease) { set({ release, sheetOpen: true }); }
export function closeUpdateInstaller() { set({ sheetOpen: false }); }

export async function downloadAppUpdate(release: AppRelease) {
  if (!release.apk || state.phase === 'downloading' || state.phase === 'checking' || state.phase === 'verifying') return;
  listen();
  lastSample = null;
  set({ version: release.version, phase: 'downloading', error: '', received: 0, total: release.apk.size ?? 0, speed: 0, release });
  try {
    const result = await updater.prepareUpdate({ ...release.apk, version: release.version });
    set({ version: release.version, phase: result.installAllowed ? 'ready' : 'permission', error: '' });
  } catch (error) {
    set({ version: release.version, phase: 'idle', error: error instanceof Error ? error.message : 'Download failed. Please try again.' });
  }
}
export async function installAppUpdate() {
  if (state.phase !== 'ready' && state.phase !== 'permission') return;
  set({ phase: 'verifying', error: '' });
  try {
    const result = await updater.installUpdate();
    set({ phase: result.permissionRequired ? 'permission' : 'ready', error: '' });
  } catch (error) {
    set({ phase: 'idle', error: error instanceof Error ? error.message : 'Installation could not start. Download again.' });
  }
}
export async function allowAppUpdates() {
  try { await updater.openInstallSettings(); set({ phase: 'ready', error: '' }); }
  catch { set({ error: 'Could not open Android settings. Try again or use the release page.' }); }
}
