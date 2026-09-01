import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  LockKeyhole,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { APP_VERSION } from '../lib/version';
import { supabase } from '../lib/supabase';
import {
  clearWorkspaceStorage,
  readLocalWorkspaceSummary,
  readStorageRaw,
  readWorkspaceOwner,
  readWorkspaceUpdatedAt,
  STORAGE_KEYS,
  writeWorkspaceOwner,
} from '../lib/storageKeys';

type GateState = 'checking' | 'ready' | 'legacy' | 'mismatch';

function Brand() {
  return (
    <div className="flex items-center justify-center gap-2" aria-label="YouDO">
      <svg width="38" height="42" viewBox="4 3.5 16 17.5" fill="none" aria-hidden="true">
        <path d="M5 4.5L12 13.25V19.5" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 4.5L12 13.25L9.25 10" stroke="var(--secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[29px] tracking-[-0.06em] text-content-secondary">ou<span className="font-semibold text-content-primary">DO</span></span>
    </div>
  );
}

function readJson(key: string, fallback: unknown): unknown {
  try {
    const raw = readStorageRaw(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function localBackupPayload() {
  return {
    app: 'YouDO',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    updatedAt: readWorkspaceUpdatedAt() || Date.now(),
    tasks: readJson(STORAGE_KEYS.tasks, []),
    goals: readJson(STORAGE_KEYS.goals, []),
    sessionHistory: readJson(STORAGE_KEYS.sessionHistory, {}),
    recentlyDeletedGoals: readJson(STORAGE_KEYS.deletedGoals, []),
    streakMeta: readJson(STORAGE_KEYS.streakMeta, null),
    pacePrefs: readJson(STORAGE_KEYS.pacePrefs, null),
  };
}

function LoadingGate() {
  return (
    <div className="min-h-screen bg-base text-content-primary grid place-items-center px-6">
      <div className="text-center space-y-4">
        <Brand />
        <div className="mx-auto size-5 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
      </div>
    </div>
  );
}

function AuthWelcome() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const summary = useMemo(readLocalWorkspaceSummary, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() || undefined } },
        });
        if (error) throw error;
        if (!data.session) setMessage({ text: 'Account created. Check your email to confirm it, then sign in.' });
      }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Authentication failed.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-base text-content-primary px-5 py-7 overflow-y-auto">
      <div className="mx-auto w-full max-w-sm pb-8">
        <Brand />
        <div className="mt-7 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-semibold">Built for serious aspirants</p>
          <h1 className="mt-2 text-[27px] leading-[1.12] font-semibold">Your preparation deserves a system.</h1>
          <p className="mt-3 text-[13px] leading-relaxed text-content-secondary">Build the blueprint, execute today’s work, and preserve every honest hour.</p>
        </div>

        {mode === 'signin' && summary.hasData && (
          <div className="mt-5 rounded-[14px] border border-secondary/25 bg-secondary-soft p-3 flex gap-3">
            <ShieldCheck size={18} className="text-secondary shrink-0 mt-0.5" />
            <div><p className="text-[12px] font-semibold">Your existing device plan is safe</p><p className="text-[11px] text-content-secondary mt-1">Sign in first; YouDO will ask whether to keep this device plan or restore your cloud copy.</p></div>
          </div>
        )}

        <div className="mt-5 rounded-[20px] border border-subtle bg-elevated p-4 shadow-elevated">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-[12px] bg-base border border-subtle">
            {(['signin', 'signup'] as const).map((value) => (
              <button key={value} type="button" onClick={() => { setMode(value); setMessage(null); }} className={`h-9 rounded-[9px] text-[12px] font-semibold ${mode === value ? 'bg-primary text-on-primary' : 'text-content-secondary'}`}>
                {value === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-4 space-y-3">
            {mode === 'signup' && <label className="block"><span className="text-[10px] uppercase tracking-wider text-content-muted font-semibold">Name</span><div className="relative mt-1.5"><User size={15} className="absolute left-3 top-3.5 text-content-muted" /><input value={fullName} onChange={(event) => setFullName(event.target.value)} required className="w-full h-11 rounded-[11px] border border-subtle bg-base pl-9 pr-3 text-[13px] outline-none focus:border-primary" placeholder="Your name" /></div></label>}
            <label className="block"><span className="text-[10px] uppercase tracking-wider text-content-muted font-semibold">Email</span><div className="relative mt-1.5"><Mail size={15} className="absolute left-3 top-3.5 text-content-muted" /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full h-11 rounded-[11px] border border-subtle bg-base pl-9 pr-3 text-[13px] outline-none focus:border-primary" placeholder="you@example.com" /></div></label>
            <label className="block"><span className="text-[10px] uppercase tracking-wider text-content-muted font-semibold">Password</span><div className="relative mt-1.5"><LockKeyhole size={15} className="absolute left-3 top-3.5 text-content-muted" /><input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 10 : 1} value={password} onChange={(event) => setPassword(event.target.value)} required className="w-full h-11 rounded-[11px] border border-subtle bg-base pl-9 pr-3 text-[13px] outline-none focus:border-primary" placeholder={mode === 'signup' ? 'At least 10 characters' : 'Your password'} /></div></label>
            {message && <div className={`rounded-[11px] px-3 py-2.5 text-[11px] ${message.error ? 'bg-error-soft text-error' : 'bg-secondary-soft text-secondary'}`}>{message.text}</div>}
            <button disabled={busy} className="w-full h-12 rounded-[12px] bg-primary text-on-primary text-[13px] font-semibold disabled:opacity-60 flex items-center justify-center gap-2">{busy ? <span className="size-4 rounded-full border-2 border-current/25 border-t-current animate-spin" /> : mode === 'signin' ? 'Open my workspace' : 'Create my workspace'} {!busy && <ArrowRight size={16} />}</button>
          </form>
        </div>

        <p className="mt-4 text-center text-[10.5px] text-content-muted leading-relaxed">Once signed in, YouDO continues working through temporary network loss and syncs when you reconnect.</p>
      </div>
    </div>
  );
}

function WorkspaceChoice({
  mismatch,
  remoteAvailable,
  onUseDevice,
  onRestore,
  onStartEmpty,
  onCancel,
  busy,
  error,
}: {
  mismatch: boolean;
  remoteAvailable: boolean;
  onUseDevice: () => void;
  onRestore: () => void;
  onStartEmpty: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  const summary = useMemo(readLocalWorkspaceSummary, []);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  return (
    <div className="min-h-screen bg-base text-content-primary px-5 py-8 grid place-items-center">
      <div className="w-full max-w-sm rounded-[22px] border border-subtle bg-elevated p-5 shadow-elevated">
        <div className="size-12 rounded-[15px] bg-primary-soft text-primary grid place-items-center"><Cloud size={21} /></div>
        <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">Workspace safety check</p>
        <h1 className="mt-1.5 text-[22px] font-semibold leading-tight">{mismatch ? 'Another account used this device' : 'Choose your starting copy'}</h1>
        <p className="mt-2 text-[12px] leading-relaxed text-content-secondary">
          {mismatch
            ? 'The cached workspace belongs to a different account. YouDO will never mix it into this account.'
            : `This device contains ${summary.goals} goals, ${summary.tasks} task cards and ${summary.sessions} session records.`}
        </p>
        {summary.activeSession && (
          <p className="mt-3 rounded-[11px] border border-primary/25 bg-primary-soft px-3 py-2.5 text-[11px] font-medium text-primary">
            A focus session is still stored on this device. Sign back into its account or keep this device plan; YouDO will not erase it here.
          </p>
        )}

        <div className="mt-5 space-y-2.5">
          {!mismatch && <button disabled={busy} onClick={onUseDevice} className="w-full rounded-[14px] border border-primary/30 bg-primary-soft p-3.5 text-left disabled:opacity-60"><span className="flex items-center gap-2 text-[13px] font-semibold"><ShieldCheck size={16} className="text-primary" /> Keep this device plan</span><span className="block mt-1 text-[11px] text-content-secondary">Securely replaces this account’s cloud workspace with the plan on this device.</span></button>}
          {remoteAvailable && <button disabled={busy || summary.activeSession} onClick={onRestore} className="w-full rounded-[14px] border border-subtle bg-surface p-3.5 text-left disabled:opacity-40"><span className="flex items-center gap-2 text-[13px] font-semibold"><Cloud size={16} className="text-secondary" /> Restore cloud workspace</span><span className="block mt-1 text-[11px] text-content-secondary">Clears this device cache, then downloads the signed-in account's copy.</span></button>}
          {!remoteAvailable && mismatch && <button disabled={busy || summary.activeSession} onClick={() => setConfirmEmpty(true)} className="w-full rounded-[14px] border border-primary/30 bg-primary-soft p-3.5 text-left disabled:opacity-40"><span className="flex items-center gap-2 text-[13px] font-semibold"><CheckCircle2 size={16} className="text-primary" /> Start this account clean</span><span className="block mt-1 text-[11px] text-content-secondary">Removes the other account's device cache and opens an empty workspace.</span></button>}
          {!mismatch && <button disabled={busy || summary.activeSession} onClick={() => setConfirmEmpty(true)} className="w-full h-10 text-[11px] text-content-muted disabled:opacity-40">Start empty instead</button>}
        </div>
        {confirmEmpty && (
          <div className="mt-3 rounded-[12px] border border-error/25 bg-error-soft p-3">
            <p className="text-[11px] font-semibold text-error">Clear the device workspace and replace this account’s cloud copy with an empty one?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={busy} onClick={onStartEmpty} className="flex-1 h-9 rounded-[9px] bg-error text-white text-[11px] font-semibold disabled:opacity-50">Clear and start</button>
              <button type="button" disabled={busy} onClick={() => setConfirmEmpty(false)} className="flex-1 h-9 rounded-[9px] bg-surface text-content-secondary text-[11px] font-semibold">Cancel</button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 rounded-[11px] bg-error-soft px-3 py-2.5 text-[11px] text-error">{error}</p>}
        {busy && <p className="mt-3 text-[11px] text-content-muted">Securing your workspace…</p>}
        <button disabled={busy} onClick={onCancel} className="mt-3 w-full h-10 rounded-[11px] border border-subtle text-[11px] text-content-secondary">Sign out</button>
      </div>
    </div>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, signOut, updateCloudBackup, fetchCloudBackup } = useAuth();
  useTheme();
  const [gate, setGate] = useState<GateState>('checking');
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (loading || !user) {
      setGate('checking');
      return () => { cancelled = true; };
    }

    const inspect = async () => {
      const owner = readWorkspaceOwner();
      const summary = readLocalWorkspaceSummary();
      if (owner === user.id) {
        if (!cancelled) setGate('ready');
        return;
      }
      if (owner && owner !== user.id) {
        const remote = await fetchCloudBackup();
        if (!cancelled) { setRemoteAvailable(Boolean(remote)); setGate('mismatch'); }
        return;
      }
      if (summary.hasData) {
        const remote = await fetchCloudBackup();
        if (!cancelled) { setRemoteAvailable(Boolean(remote)); setGate('legacy'); }
        return;
      }
      writeWorkspaceOwner(user.id);
      if (!cancelled) setGate('ready');
    };
    void inspect();
    return () => { cancelled = true; };
  }, [loading, user, fetchCloudBackup]);

  if (loading) return <LoadingGate />;
  if (!user) return <AuthWelcome />;
  if (gate === 'checking') return <LoadingGate />;
  if (gate === 'ready') return <>{children}</>;

  const replaceCloud = async (payload: unknown, beforeOpen?: () => void): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const result = await updateCloudBackup(payload);
    if (!result.ok) {
      setError(result.error || 'Could not secure this workspace.');
      setBusy(false);
      return false;
    }
    beforeOpen?.();
    writeWorkspaceOwner(user.id);
    setBusy(false);
    setGate('ready');
    return true;
  };

  const startEmpty = () => replaceCloud({
    app: 'YouDO', version: APP_VERSION, exportedAt: new Date().toISOString(), updatedAt: Date.now(),
    tasks: [], goals: [], sessionHistory: {}, recentlyDeletedGoals: [], streakMeta: null, pacePrefs: null,
  }, () => clearWorkspaceStorage());

  return (
    <WorkspaceChoice
      mismatch={gate === 'mismatch'}
      remoteAvailable={remoteAvailable}
      busy={busy}
      error={error}
      onUseDevice={() => void replaceCloud(localBackupPayload())}
      onRestore={() => { clearWorkspaceStorage(); writeWorkspaceOwner(user.id); setGate('ready'); }}
      onStartEmpty={() => void startEmpty()}
      onCancel={() => void signOut({ clearWorkspace: false })}
    />
  );
}
