import { useState, useSyncExternalStore } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { useSessionStore, useStore } from '../store';
import type { AppRelease } from '../lib/appUpdate';
import { downloadAppUpdate, nativeUpdateState, openUpdateInstaller, subscribeNativeUpdate, supportsNativeUpdate } from '../lib/nativeUpdate';
import { checkWebUpdate, refreshWebApp, subscribeWebUpdate, webUpdateReady } from '../lib/webUpdate';

/** Real download progress from Android; tapping it reopens the installer. */
function ProgressBar({ received, total, checking, onOpen }: { received: number; total: number; checking: boolean; onOpen: () => void }) {
  const pct = checking ? 100 : total > 0 ? Math.min(100, (received / total) * 100) : 0;
  return (
    <button type="button" onClick={onOpen} className="mt-3 block w-full text-left" aria-label="Show update progress">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-content-muted">{checking ? 'Checking the file…' : 'Downloading…'}</p>
        <p className="text-[10px] font-semibold text-content-secondary tabular-nums">
          {checking || total > 0 ? `${Math.round(pct)}%` : `${(received / 1048576).toFixed(1)} MB`}
        </p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface border border-subtle">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%`, transition: 'width 0.25s linear' }} />
      </div>
    </button>
  );
}

export default function UpdateAction({ release }: { release: AppRelease | null }) {
  const { activeSession, sessionStorageError } = useSessionStore();
  const { workspaceStorageError } = useStore();
  const state = useSyncExternalStore(subscribeNativeUpdate, nativeUpdateState);
  const webReady = useSyncExternalStore(subscribeWebUpdate, webUpdateReady);
  const [webStatus, setWebStatus] = useState('');
  const isWeb = !Capacitor.isNativePlatform();
  const native = !!release?.apk && supportsNativeUpdate();
  const phase = state.version === release?.version ? state.phase : 'idle';
  const busy = state.phase === 'downloading' || state.phase === 'checking' || state.phase === 'verifying';
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
    else if (release) {
      // The installer sheet shows the real progress and the install step.
      openUpdateInstaller(release);
      if (phase === 'idle') await downloadAppUpdate(release);
    }
  };
  const label = isWeb ? (webReady ? 'Refresh app' : 'Check website update')
    : !native ? 'View update' : phase === 'downloading' ? 'Downloading…' : phase === 'checking' ? 'Checking…'
      : phase === 'verifying' ? 'Opening installer…' : phase === 'permission' || phase === 'ready' ? 'Install update' : 'Download update';

  return <div className="min-w-0">
    <button
      type="button"
      disabled={(busy && phase !== 'downloading' && phase !== 'checking') || restartBlocked}
      onClick={() => void act()}
      className="min-h-10 w-full px-3 rounded-[11px] bg-primary text-on-primary text-[12px] font-semibold disabled:opacity-50"
    >
      {label}
    </button>

    {/* Download / verify progress bar */}
    {native && release && (phase === 'downloading' || phase === 'checking') && (
      <ProgressBar received={state.received} total={state.total} checking={phase === 'checking'} onOpen={() => openUpdateInstaller(release)} />
    )}

    {restartBlocked && <p role="status" className="mt-2 text-[11px] text-content-secondary">Finish the current sitting and resolve any device save errors before restarting YouDO.</p>}
    {state.version === release?.version && state.error && <p role="status" className="mt-2 text-[11px] text-error">{state.error}</p>}
    {isWeb && webStatus && !webReady && <p role="status" className="mt-2 text-[11px] text-content-secondary">{webStatus}</p>}
    {native && state.error && <button type="button" onClick={() => void viewRelease()} className="mt-2 text-[11px] underline">Open release page</button>}
  </div>;
}
