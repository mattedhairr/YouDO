import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Laptop, LogOut, RefreshCw, Smartphone } from 'lucide-react';
import {
  accountSessionDevice,
  listAccountSessions,
  revokeAccountSession,
  sessionLastSeenLabel,
  type AccountSession,
} from '../lib/accountSessions';

function DeviceIcon({ session }: { session: AccountSession }) {
  const { device } = accountSessionDevice(session.userAgent);
  return device.includes('PC') || device === 'Mac' || device.includes('Linux')
    ? <Laptop size={16} /> : <Smartphone size={16} />;
}

export default function SignedInDevices() {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSessions(await listAccountSessions());
    } catch (reason) {
      setSessions([]);
      setError(reason instanceof Error ? reason.message : 'Could not load signed-in devices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const current = useMemo(() => sessions.find((session) => session.current), [sessions]);
  const remoteCount = sessions.filter((session) => !session.current).length;
  const remoteUnlocked = sessions.some((session) => !session.current && session.canRevoke);

  const revoke = async (sessionId: string) => {
    setRevokingId(sessionId);
    setError('');
    const result = await revokeAccountSession(sessionId);
    setRevokingId(null);
    setConfirmId(null);
    if (!result.ok) {
      setError(result.error ?? 'Could not sign out that device.');
      return;
    }
    setSessions((currentSessions) => currentSessions.filter((session) => session.id !== sessionId));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-content-primary">Signed-in devices</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-content-muted">
            {loading ? 'Checking active sessions…' : error ? 'Setup required' : `${sessions.length} active ${sessions.length === 1 ? 'session' : 'sessions'} · ${remoteCount} elsewhere`}
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh signed-in devices" className="grid size-9 shrink-0 place-items-center rounded-xl border border-subtle bg-surface text-content-secondary disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-error/20 bg-error-soft px-3 py-2 text-[10.5px] leading-relaxed text-error">{error}</p>}

      {!loading && !error && sessions.length === 0 && (
        <p className="rounded-xl border border-subtle bg-surface px-3 py-3 text-[10.5px] text-content-secondary">No active sessions were returned. Refresh or sign in again.</p>
      )}

      <div className="overflow-hidden rounded-xl border border-subtle bg-surface divide-y divide-subtle">
        {sessions.map((session) => {
          const label = accountSessionDevice(session.userAgent);
          const confirming = confirmId === session.id;
          return (
            <div key={session.id} className="p-3">
              <div className="flex items-center gap-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${session.current ? 'bg-secondary-soft text-secondary' : 'bg-primary-soft text-primary'}`}>
                  <DeviceIcon session={session} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-semibold text-content-primary">{label.device}</span>
                    {session.current && <span className="rounded-full bg-secondary-soft px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-secondary">This device</span>}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-content-muted">{label.detail} · {sessionLastSeenLabel(session.lastActiveAt)}</span>
                </span>
                {!session.current && !confirming && (
                  <button type="button" disabled={!session.canRevoke || revokingId !== null} onClick={() => setConfirmId(session.id)} className="h-8 shrink-0 rounded-[10px] border border-subtle px-2.5 text-[10px] font-semibold text-content-secondary disabled:opacity-40">
                    Sign out
                  </button>
                )}
                {session.current && <Check size={15} className="shrink-0 text-secondary" />}
              </div>
              {confirming && (
                <div className="mt-2.5 rounded-xl border border-warning/20 bg-warning/8 p-2.5">
                  <p className="text-[10.5px] leading-relaxed text-content-secondary">Sign out this {label.device.toLowerCase()}? Its saved YouDO workspace is not deleted.</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={revokingId !== null} onClick={() => void revoke(session.id)} className="h-8 flex-1 rounded-[9px] bg-error text-[10.5px] font-semibold text-white disabled:opacity-50">{revokingId === session.id ? 'Signing out…' : 'Sign out device'}</button>
                    <button type="button" disabled={revokingId !== null} onClick={() => setConfirmId(null)} className="h-8 flex-1 rounded-[9px] border border-subtle text-[10.5px] font-semibold text-content-secondary">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loading && !error && remoteCount > 0 && !remoteUnlocked && current && (
        <p className="flex items-start gap-2 px-1 text-[10px] leading-relaxed text-content-muted"><Clock3 size={12} className="mt-0.5 shrink-0" />Remote sign-out unlocks after this device has been signed in for 24 hours.</p>
      )}
      {!loading && !error && remoteUnlocked && (
        <p className="flex items-start gap-2 px-1 text-[10px] leading-relaxed text-content-muted"><LogOut size={12} className="mt-0.5 shrink-0" />Revoked sessions cannot refresh. A device may remain connected until its current access token expires.</p>
      )}
    </div>
  );
}
