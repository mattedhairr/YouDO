import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import Toggle from '../Toggle';
import { fetchSupportSettings, isValidUpiId, saveSupportSettings, type SupportSettings } from '../../lib/supportSettings';

/** Admin Hub → Controls: what Settings → Support YouDO shows to everyone. */
export default function SupportSettingsAdmin() {
  const [saved, setSaved] = useState<SupportSettings | null>(null);
  const [draft, setDraft] = useState<SupportSettings | null>(null);
  const [state, setState] = useState<'loading' | 'missing' | 'ready'>('loading');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSupportSettings().then((next) => {
      if (cancelled) return;
      setSaved(next);
      setDraft(next);
      setState(next ? 'ready' : 'missing');
    });
    return () => { cancelled = true; };
  }, []);

  const set = (patch: Partial<SupportSettings>) => {
    if (draft) setDraft({ ...draft, ...patch });
    setMessage(null);
  };
  const upiValid = !!draft && isValidUpiId(draft.upiId);
  const changed = !!draft && !!saved && JSON.stringify({ ...draft, upiId: draft.upiId.trim() }) !== JSON.stringify(saved);

  const save = async () => {
    if (!draft || !upiValid || working) return;
    setWorking(true);
    setMessage(null);
    try {
      const next = await saveSupportSettings(draft);
      setSaved(next);
      setDraft(next);
      setMessage({ error: false, text: 'Saved. Everyone on this version sees it the next time Support opens.' });
    } catch (cause) {
      setMessage({ error: true, text: cause instanceof Error ? cause.message : 'Could not save.' });
    } finally {
      setWorking(false);
    }
  };

  const row = (title: string, hint: string, checked: boolean, onChange: () => void) => (
    <div className="flex items-center justify-between gap-3 border-t border-subtle/50 px-5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-content-primary">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-content-muted">{hint}</span>
      </span>
      <Toggle checked={checked} onChange={onChange} label={title} disabled={working} />
    </div>
  );

  return (
    <section className="mb-5 overflow-hidden rounded-[24px] border border-subtle bg-surface shadow-sm" aria-label="Support settings">
      <div className="px-5 pb-3 pt-5">
        <p className="text-[13px] font-bold text-content-primary">Support settings</p>
        <p className="mt-1 text-[11px] text-content-muted">What everyone sees in Settings → Support YouDO</p>
      </div>
      {state === 'loading' && <p role="status" className="border-t border-subtle/50 px-5 py-4 text-[11px] text-content-muted">Loading…</p>}
      {state === 'missing' && (
        <p role="alert" className="border-t border-subtle/50 px-5 py-4 text-[11px] leading-relaxed text-content-secondary">
          Support settings are not connected yet. Run <code>supabase/support_settings.sql</code> in the SQL editor, then reopen Admin Hub.
        </p>
      )}
      {state === 'ready' && draft && <>
        {row('Show Support YouDO', 'Off hides the whole option in Settings', draft.supportEnabled, () => set({ supportEnabled: !draft.supportEnabled }))}
        <label className="block border-t border-subtle/50 px-5 py-3">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-content-muted">UPI ID</span>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-subtle bg-base px-3 font-mono text-[13.5px] text-content-primary outline-none focus:border-primary"
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
        {row('Show QR code', 'Made from the UPI ID, so it always matches', draft.qrEnabled, () => set({ qrEnabled: !draft.qrEnabled }))}
        {row('Accept badge claims', 'Off stops new Founding Backer claims on every version. Badges already given stay.', draft.claimsEnabled, () => set({ claimsEnabled: !draft.claimsEnabled }))}
        <div className="border-t border-subtle/50 px-5 pb-5 pt-4">
          <button
            type="button"
            disabled={!changed || !upiValid || working}
            onClick={() => void save()}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-[13.5px] font-bold text-on-primary disabled:opacity-40"
          >
            <Check size={15} /> {working ? 'Saving…' : 'Save'}
          </button>
          {message && <p role={message.error ? 'alert' : 'status'} className={`mt-2 text-[11px] leading-relaxed ${message.error ? 'text-error' : 'text-secondary'}`}>{message.text}</p>}
          <p className="mt-2 text-[10.5px] leading-relaxed text-content-muted">Phones on 8.3.1 or older keep their built-in UPI ID and QR until they update.</p>
        </div>
      </>}
    </section>
  );
}
