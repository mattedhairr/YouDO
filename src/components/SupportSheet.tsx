import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Heart, Loader2 } from 'lucide-react';
import Overlay from './Overlay';
import { useAuth } from '../contexts/AuthContext';
import { submitHubBacker } from '../lib/backers';
import { upiPayUri } from '../lib/supportSettings';
import { qrDrawing } from '../lib/upiQr';
import { useSupportSettings } from '../hooks/useSupportSettings';
import { hapticSuccess, hapticTick } from '../lib/haptics';
import { HubSection } from './hub/HubParts';

const PRESET_AMOUNTS = [30, 50, 100, 250] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Optional support for the developer. Payment happens in the supporter's own
 * UPI app (scan or paste the ID): UPI apps decline payments to a personal UPI
 * ID that are started from another app, so there is deliberately no "Pay" link.
 * After paying, the supporter can record the UTR to get the backer badge.
 * The UPI ID, the QR code and the claim form follow the admin's Support settings;
 * the QR is drawn from the UPI ID (a scan-to-pay link), so the two always match.
 */
export default function SupportSheet({ open, onClose }: Props) {
  const { user } = useAuth();
  const username = typeof user?.user_metadata?.username === 'string' ? user.user_metadata.username : null;
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState<number | 'other'>(50);
  const [otherAmount, setOtherAmount] = useState('');
  const [utr, setUtr] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const { upiId, qrEnabled, claimsEnabled } = useSupportSettings(open);
  const qr = useMemo(() => (qrEnabled ? qrDrawing(upiPayUri(upiId)) : null), [qrEnabled, upiId]);

  // Every visit starts clean.
  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setAmount(50);
    setOtherAmount('');
    setUtr('');
    setNote('');
    setSubmitted(false);
    setError('');
  }, [open]);

  if (!open) return null;

  const effectiveAmount = amount === 'other' ? Number(otherAmount) : amount;
  const utrValid = /^[0-9A-Za-z]{12,22}$/.test(utr);
  const canSubmit = utrValid && Number.isFinite(effectiveAmount) && effectiveAmount > 0 && !submitting;

  const copyUpiId = async () => {
    try {
      await navigator.clipboard.writeText(upiId);
      hapticTick();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError('Could not copy. Press and hold the UPI ID to copy it.');
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    const res = await submitHubBacker({
      amount: effectiveAmount,
      utr,
      note: note.trim() || undefined,
      username: username ?? undefined,
    });
    setSubmitting(false);
    if (res.success) {
      hapticSuccess();
      setSubmitted(true);
    } else {
      setError(res.error || 'Could not send it. Try again.');
    }
  };

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="hub hub-sheet" role="dialog" aria-label="Support YouDO">
        <div className="hub-sheet-grabber" aria-hidden />
        <div className="hub-sheet-header">
          <span />
          <h2>Support YouDO</h2>
          <button type="button" className="hub-text-button is-strong is-end" onClick={onClose}>Done</button>
        </div>

        <div className="hub-sheet-body">
          {submitted ? (
            <div className="hub-empty py-10">
              <span className="hub-empty-icon is-success" aria-hidden><Heart size={24} fill="currentColor" /></span>
              <p className="hub-empty-title">Thank you</p>
              <p className="hub-empty-text">
                Your ₹{effectiveAmount} contribution is recorded. Once it is matched with the UPI receipt, the
                Founding Backer badge appears on your profile.
              </p>
            </div>
          ) : (
            <>
              <p className="hub-support-intro">
                YouDO is built by one developer. Support is optional and helps pay for servers and tools.
              </p>

              <HubSection
                title="Pay with any UPI app"
                footer={
                  <>
                    Open GPay, PhonePe or Paytm, choose <strong>Pay to UPI ID</strong> and paste the ID
                    {qr && <>, or scan the code. On this phone, take a screenshot and pick it from the gallery in your UPI app’s scanner</>}.
                  </>
                }
              >
                <div className="hub-group">
                  {qr && (
                    <div className="hub-support-qr">
                      <svg viewBox={qr.viewBox} role="img" aria-label={`UPI QR code for ${upiId}`} shapeRendering="crispEdges">
                        <path d={qr.path} stroke="currentColor" strokeWidth={1} fill="none" />
                      </svg>
                    </div>
                  )}
                  <div className="hub-row is-compact">
                    <span className="hub-row-main">
                      <span className="hub-row-subtitle block">UPI ID</span>
                      <span className="hub-support-upi">{upiId}</span>
                    </span>
                    <button type="button" className={`hub-pill-button ${copied ? 'is-quiet' : 'is-filled'}`} onClick={() => void copyUpiId()}>
                      {copied ? <><Check size={15} strokeWidth={2.6} /> Copied</> : <><Copy size={15} strokeWidth={2.4} /> Copy</>}
                    </button>
                  </div>
                </div>
              </HubSection>

              {!claimsEnabled ? (
                <HubSection title="Founding Backer badge">
                  <div className="hub-group flex items-start gap-3 p-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary" aria-hidden>
                      <Heart size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold text-content-primary">Badge claims are paused</span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-content-secondary">
                        Thank you for supporting YouDO. New Founding Backer claims are closed for now.
                      </span>
                    </span>
                  </div>
                </HubSection>
              ) : (
              <HubSection
                title="Founding Backer badge"
                footer="After paying, add the 12-digit UPI reference (UTR) from your receipt. The admin checks it before the badge appears on your profile."
              >
                {error && <div className="hub-banner is-error mb-2" role="alert">{error}</div>}
                <div className="hub-segmented mb-2" role="radiogroup" aria-label="Amount you paid">
                  {PRESET_AMOUNTS.map((value) => (
                    <button key={value} type="button" role="radio" aria-checked={amount === value} onClick={() => setAmount(value)}>
                      ₹{value}
                    </button>
                  ))}
                  <button type="button" role="radio" aria-checked={amount === 'other'} onClick={() => setAmount('other')}>
                    Other
                  </button>
                </div>
                <div className="hub-group">
                  {amount === 'other' && (
                    <input
                      className="hub-field"
                      inputMode="numeric"
                      placeholder="Amount in ₹"
                      aria-label="Amount you paid in rupees"
                      value={otherAmount}
                      onChange={(e) => setOtherAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    />
                  )}
                  <input
                    className="hub-field font-mono"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="UPI reference (UTR)"
                    aria-label="UPI reference number (UTR)"
                    value={utr}
                    maxLength={22}
                    onChange={(e) => setUtr(e.target.value.replace(/[^0-9A-Za-z]/g, ''))}
                  />
                  <input
                    className="hub-field"
                    placeholder="Note (optional)"
                    aria-label="Note (optional)"
                    value={note}
                    maxLength={100}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <button type="button" className="hub-button mt-3" disabled={!canSubmit} onClick={() => void submit()}>
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : 'Send for verification'}
                </button>
                {username && <p className="hub-section-footer text-center">Credited to @{username}</p>}
              </HubSection>
              )}
            </>
          )}
        </div>
      </div>
    </Overlay>
  );
}
