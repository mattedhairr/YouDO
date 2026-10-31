import { useSyncExternalStore } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import Overlay from './Overlay';
import { useSessionStore, useStore } from '../store';
import {
  allowAppUpdates, closeUpdateInstaller, downloadAppUpdate, installAppUpdate, nativeUpdateState, subscribeNativeUpdate,
} from '../lib/nativeUpdate';
import './updateInstaller.css';

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

function timeLeft(bytes: number, speed: number): string {
  if (speed <= 0 || bytes <= 0) return '';
  const seconds = Math.ceil(bytes / speed);
  return seconds < 60 ? `about ${seconds} s left` : `about ${Math.ceil(seconds / 60)} min left`;
}

const RING = 2 * Math.PI * 60;

function Steps({ at }: { at: 0 | 1 | 2 }) {
  const labels = ['Download', 'Check', 'Install'];
  return (
    <ol className="update-installer-steps" aria-label="Update steps">
      {labels.map((label, i) => (
        <li key={label} className={i < at ? 'is-done' : i === at ? 'is-now' : ''} aria-current={i === at ? 'step' : undefined}>
          {i > 0 && <span className="update-installer-line" aria-hidden />}
          <span className="update-installer-dot">{i < at ? <Check size={12} strokeWidth={3.2} /> : i + 1}</span>
          <span className="update-installer-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The in-app installer: real download progress (bytes from Android), the
 * official-build check, then Android's install prompt. Closing it never stops
 * the download.
 */
export default function UpdateInstaller() {
  const state = useSyncExternalStore(subscribeNativeUpdate, nativeUpdateState);
  const { activeSession, sessionStorageError } = useSessionStore();
  const { workspaceStorageError } = useStore();
  const release = state.release;
  if (!release) return null;
  const sameVersion = state.version === release.version;
  const phase = sameVersion ? state.phase : 'idle';
  const size = release.apk?.size ?? (sameVersion ? state.total : 0);
  const pct = phase === 'downloading' && state.total > 0 ? Math.min(100, (state.received / state.total) * 100)
    : phase === 'checking' || phase === 'ready' || phase === 'permission' || phase === 'verifying' ? 100 : 0;
  const installBlocked = !!(activeSession || sessionStorageError || workspaceStorageError);
  const step: 0 | 1 | 2 = phase === 'checking' ? 1 : phase === 'ready' || phase === 'permission' || phase === 'verifying' ? 2 : 0;
  const done = step === 2;
  const error = sameVersion ? state.error : '';

  return (
    <Overlay open={state.sheetOpen} onClose={closeUpdateInstaller} align="bottom">
      <div className="update-installer sheet-up" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Update to YouDO ${release.version}`}>
        <div className="update-installer-grabber" aria-hidden />
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="update-installer-icon" />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold text-content-primary">YouDO {release.version}</p>
            <p className="text-[12.5px] text-content-secondary">Update{size > 0 ? ` · ${mb(size)}` : ''} · from GitHub</p>
          </div>
        </div>

        {done ? (
          <div className="update-installer-ring">
            <span className="update-installer-done"><Check size={48} strokeWidth={2.4} /></span>
          </div>
        ) : (
          <div className="update-installer-ring" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <svg width="148" height="148" viewBox="0 0 148 148" aria-hidden>
              <circle cx="74" cy="74" r="60" className="update-installer-track" />
              <circle cx="74" cy="74" r="60" className="update-installer-fill" strokeDasharray={RING} strokeDashoffset={RING * (1 - pct / 100)} />
            </svg>
            <div className="update-installer-center">
              <div className="text-[30px] font-bold leading-none tabular-nums text-content-primary">
                {phase === 'downloading' && state.total <= 0 ? mb(state.received) : `${Math.round(pct)}%`}
              </div>
              <div className="mt-1 text-[11px] text-content-muted tabular-nums">
                {phase === 'checking' ? 'Checking the file'
                  : phase === 'downloading' ? (state.total > 0 ? `${(state.received / 1048576).toFixed(1)} of ${mb(state.total)}` : 'Downloading')
                    : 'Not started'}
              </div>
            </div>
          </div>
        )}

        <p className="mt-2.5 min-h-[18px] text-center text-[12.5px] text-content-secondary tabular-nums">
          {phase === 'downloading' && state.speed > 0
            ? [`${mb(state.speed)}/s`, state.total > 0 ? timeLeft(state.total - state.received, state.speed) : ''].filter(Boolean).join(' · ')
            : phase === 'checking'
              ? <><ShieldCheck size={13} className="mr-1 inline -mt-0.5 text-primary" />Making sure it is the official YouDO build</>
              : phase === 'permission'
                ? 'Allow installs from YouDO once in Android settings, then come back.'
                : done
                  ? 'Ready to install. Android asks you to confirm; your goals and progress stay.'
                  : ''}
        </p>

        <Steps at={step} />

        {error && <p role="status" className="mt-3 text-center text-[12px] text-error">{error}</p>}
        {done && installBlocked && (
          <p role="status" className="mt-3 text-center text-[12px] text-content-secondary">Finish the current sitting first; installing restarts YouDO.</p>
        )}

        <div className={`mt-4 grid gap-2 ${done || phase === 'idle' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button type="button" onClick={closeUpdateInstaller} className="update-installer-btn">
            {phase === 'downloading' || phase === 'checking' ? 'Keep using YouDO' : 'Later'}
          </button>
          {phase === 'idle' && (
            <button type="button" onClick={() => void downloadAppUpdate(release)} className="update-installer-btn is-primary">
              {error ? 'Try again' : 'Download'}
            </button>
          )}
          {done && (
            <button
              type="button"
              disabled={phase === 'verifying' || installBlocked}
              onClick={() => void (phase === 'permission' ? allowAppUpdates() : installAppUpdate())}
              className="update-installer-btn is-primary"
            >
              {phase === 'permission' ? 'Allow installs' : phase === 'verifying' ? 'Opening…' : 'Install now'}
            </button>
          )}
        </div>
        {(phase === 'downloading' || phase === 'checking') && (
          <p className="mt-2 text-center text-[11.5px] text-content-muted">The download continues while you work.</p>
        )}
      </div>
    </Overlay>
  );
}
