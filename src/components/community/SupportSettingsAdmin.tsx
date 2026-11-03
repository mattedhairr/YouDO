import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import Toggle from '../Toggle';
import { fetchSupportSettings, isSupportPaused, isValidUpiId, saveSupportSettings, supportSettingsFor, upiPayUri } from '../../lib/supportSettings';
import { qrDrawing } from '../../lib/upiQr';

interface Draft {
  upiId: string;
  paused: boolean;
}

/** Admin Hub → Controls → Support YouDO: where payments go, and pausing support. */
export default function SupportSettingsAdmin() {
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [state, setState] = useState<'loading' | 'missing' | 'ready'>('loading');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSupportSettings().then((next) => {
      if (cancelled) return;
      const loaded = next && { upiId: next.upiId, paused: isSupportPaused(next) };
      setSaved(loaded);
      setDraft(loaded);
      setState(loaded ? 'ready' : 'missing');
    });
    return () => { cancelled = true; };
  }, []);

  const set = (patch: Partial<Draft>) => {
    if (draft) setDraft({ ...draft, ...patch });
    setMessage(null);
  };
  const upiValid = !!draft && isValidUpiId(draft.upiId);
  const changed = !!draft && !!saved && (draft.upiId.trim() !== saved.upiId || draft.paused !== saved.paused);
  const qr = useMemo(() => (draft && isValidUpiId(draft.upiId) ? qrDrawing(upiPayUri(draft.upiId.trim())) : null), [draft]);

  const save = async () => {
    if (!draft || !upiValid || working) return;
    setWorking(true);
    setMessage(null);
    try {
      const next = await saveSupportSettings(supportSettingsFor(draft.upiId, draft.paused));
      const loaded = { upiId: next.upiId, paused: isSupportPaused(next) };
      setSaved(loaded);
      setDraft(loaded);
      setMessage({ error: false, text: 'Saved. Everyone sees it the next time Support opens.' });
    } catch (cause) {
      setMessage({ error: true, text: cause instanceof Error ? cause.message : 'Could not save.' });
    } finally {
      setWorking(false);
    }
  };

  if (state === 'loading') return <p role="status" className="yd-note">Loading…</p>;
  if (state === 'missing' || !draft) {
    return (
      <p role="alert" className="yd-note">
        Support settings could not be loaded. Check your connection and that <code>supabase/support_settings.sql</code> has been run, then reopen Admin Hub.
      </p>
    );
  }

  return (
    <>
      <section className="yd-section" aria-label="Pause support">
        <h3 className="yd-heading">Status</h3>
        <div className="yd-card">
          <div className="yd-row">
            <span className="yd-row-main">
              <span className="yd-row-title">Pause support</span>
              <span className="yd-row-text">Hides the UPI ID and QR code and stops new badge claims. People see that support is temporarily paused.</span>
            </span>
            <Toggle checked={draft.paused} onChange={() => set({ paused: !draft.paused })} label="Pause support" disabled={working} />
          </div>
        </div>
      </section>

      <section className="yd-section" aria-label="Where payments go">
        <h3 className="yd-heading">Where payments go</h3>
        <div className="yd-card">
          <label className="yd-block block">
            <span className="yd-label">UPI ID</span>
            <input
              className="yd-field font-mono"
              value={draft.upiId}
              maxLength={321}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              placeholder="name@bank"
              aria-invalid={!upiValid}
              onChange={(event) => set({ upiId: event.target.value })}
            />
            {!upiValid && <span className="mt-1.5 block text-[11px] text-error">Enter a UPI ID like name@bank</span>}
          </label>
          {qr && (
            <div className="yd-row">
              <span className="yd-qr">
                <svg viewBox={qr.viewBox} role="img" aria-label={`UPI QR code for ${draft.upiId.trim()}`} shapeRendering="crispEdges">
                  <path d={qr.path} stroke="currentColor" strokeWidth={1} fill="none" />
                </svg>
              </span>
              <span className="yd-row-main">
                <span className="yd-row-title">Check before saving</span>
                <span className="yd-row-text">Scan this with your UPI app. It should open “Pay to” this ID.</span>
              </span>
            </div>
          )}
        </div>
      </section>

      <button type="button" className="yd-button" disabled={!changed || !upiValid || working} onClick={() => void save()}>
        <Check size={15} /> {working ? 'Saving…' : 'Save'}
      </button>
      {message && <p role={message.error ? 'alert' : 'status'} className={`yd-note ${message.error ? '!text-error' : '!text-secondary'}`}>{message.text}</p>}
      <p className="yd-note">Phones on 8.3.1 or older keep their built-in UPI ID and QR until they update, but new badge claims stop on every version while paused.</p>
    </>
  );
}
