import { useState, useSyncExternalStore } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { useSessionStore, useStore } from '../store';
import type { AppRelease } from '../lib/appUpdate';
import { allowAppUpdates, downloadAppUpdate, installAppUpdate, nativeUpdateState, subscribeNativeUpdate, supportsNativeUpdate } from '../lib/nativeUpdate';
import { checkWebUpdate, refreshWebApp, subscribeWebUpdate, webUpdateReady } from '../lib/webUpdate';

export default function UpdateAction({ release }: { release: AppRelease | null }) {
  const { activeSession, sessionStorageError } = useSessionStore();
  const { workspaceStorageError } = useStore();
  const state = useSyncExternalStore(subscribeNativeUpdate, nativeUpdateState);
  const webReady = useSyncExternalStore(subscribeWebUpdate, webUpdateReady);
  const [webStatus, setWebStatus] = useState('');
  const isWeb = !Capacitor.isNativePlatform();
  const native = !!release?.apk && supportsNativeUpdate();
  const phase = state.version === release?.version ? state.phase : 'idle';
  const busy = state.phase === 'downloading' || state.phase === 'verifying';
  const restartBlocked = (isWeb && webReady || native && phase === 'ready')
    && !!(activeSession || sessionStorageError || workspaceStorageError);
  const viewRelease = async () => {
    if (!release) return;
    try { await Browser.open({ url: release.url, toolbarColor: '#171612' }); }
    catch { window.open(release.url, '_blank', 'noopener,noreferrer'); }
  };
  const act = async () => {
    if (restartBlocked) return;
    if (isWeb) {
      if (webReady) { refreshWebApp(); return; }
      setWebStatus('Checking the website update…');
      try {
        const ready = await checkWebUpdate();
        setWebStatus(ready ? 'Ready to refresh.' : 'The website update will appear here when it is ready. Your sign-in and saved data stay on this device.');
      } catch { setWebStatus('Reconnect and try again.'); }
    } else if (!native) await viewRelease();
    else if (phase === 'permission') await allowAppUpdates();
    else if (phase === 'ready') await installAppUpdate();
    else if (release) await downloadAppUpdate(release);
  };
  const label = isWeb ? (webReady ? 'Refresh app' : 'Check website update')
    : !native ? 'View update' : phase === 'downloading' ? 'Downloading…'
      : phase === 'verifying' ? 'Verifying…' : phase === 'permission' ? 'Allow YouDO updates'
        : phase === 'ready' ? 'Install update' : 'Download update';
  return <div className="min-w-0">
    <button type="button" disabled={busy || restartBlocked} onClick={() => void act()} className="min-h-10 w-full px-3 rounded-[11px] bg-primary text-on-primary text-[12px] font-semibold disabled:opacity-50">{label}</button>
    {restartBlocked && <p role="status" className="mt-2 text-[11px] text-content-secondary">Finish the current sitting and resolve any device save errors before restarting YouDO.</p>}
    {native && phase === 'permission' && <p className="mt-2 text-[11px] text-content-secondary">Allow updates from YouDO in Android settings, then return and tap Install update.</p>}
    {native && phase === 'ready' && <p className="mt-2 text-[11px] text-content-secondary">Android will ask you to confirm. Your app data stays in place.</p>}
    {state.version === release?.version && state.error && <p role="status" className="mt-2 text-[11px] text-error">{state.error}</p>}
    {isWeb && webStatus && !webReady && <p role="status" className="mt-2 text-[11px] text-content-secondary">{webStatus}</p>}
    {native && state.error && <button type="button" onClick={() => void viewRelease()} className="mt-2 text-[11px] underline">Open release page</button>}
  </div>;
}
