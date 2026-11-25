import { useEffect, useState } from 'react';
import { ChevronRight, Heart, Mail } from 'lucide-react';
import { backerTotals, fetchBackers, type Backer } from '../../lib/adminEmail';
import { formatRupees } from '../../../supabase/functions/_shared/emailTemplate.ts';
import { HubAvatar } from '../hub/HubParts';
import type { EmailStart } from './AdminEmail';

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * Owner → Backers: everyone with the Founding Backer badge, what each gave
 * (approved claims added up) and whether they were thanked by email. Claims
 * still waiting are reviewed in the same sheet as before.
 */
export default function AdminBackers({ pendingClaims, onReviewClaims, onEmail, onOpenPerson }: {
  pendingClaims: number;
  onReviewClaims: () => void;
  onEmail: (start: EmailStart) => void;
  onOpenPerson: (id: string) => void;
}) {
  const [backers, setBackers] = useState<Backer[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetchBackers().then(setBackers).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load backers.'));
  }, []);

  const totals = backers ? backerTotals(backers) : null;
  const label = (backer: Backer) => backer.name ?? (backer.username ? `@${backer.username}` : 'No name yet');

  return (
    <div className="ah-page">
      {pendingClaims > 0 && (
        <div className="yd-card mb-3"><button type="button" className="yd-row w-full" onClick={onReviewClaims}>
          <span className="yd-tile" aria-hidden><Heart size={18} strokeWidth={1.8} /></span>
          <span className="yd-row-main"><span className="yd-row-title">{pendingClaims} {pendingClaims === 1 ? 'claim' : 'claims'} waiting</span>
            <span className="yd-row-text">Check them against your UPI app, then approve</span></span>
          <ChevronRight size={17} className="shrink-0 text-content-muted" aria-hidden />
        </button></div>
      )}
      {error && <p role="status" className="ah-status text-error">{error}</p>}
      {!backers && !error && <p className="ah-empty">Loading backers…</p>}
      {totals && (
        <div className="ah-tiles">
          <div className="ah-tile"><strong>{formatRupees(totals.total)}</strong><span>given in all</span></div>
          <div className="ah-tile"><strong>{totals.count}</strong><span>{totals.count === 1 ? 'backer' : 'backers'}</span>{totals.average > 0 && <small>{formatRupees(totals.average)} on average</small>}</div>
        </div>
      )}
      {backers && backers.length === 0 && <p className="ah-empty">No backers yet. Approved claims appear here.</p>}
      {backers && backers.length > 0 && (
        <section className="yd-section">
          <h3 className="yd-heading">Founding Backers</h3>
          <div className="yd-card">
            {backers.map((backer) => (
              <div key={backer.id}>
                <button type="button" className="yd-row !min-h-[60px] w-full" aria-expanded={open === backer.id} onClick={() => setOpen(open === backer.id ? null : backer.id)}>
                  <HubAvatar url={backer.avatarUrl} name={label(backer)} size="sm" backer />
                  <span className="yd-row-main">
                    <span className="yd-row-title truncate">{label(backer)}</span>
                    <span className="yd-row-text truncate">
                      {[backer.username ? `@${backer.username}` : '', backer.since ? `since ${day(backer.since)}` : 'badge given by hand', backer.claims > 1 ? `${backer.claims} claims` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="ah-backer-amount">
                    <b>{backer.total > 0 ? formatRupees(backer.total) : '—'}</b>
                    {backer.thankedAt ? <small className="is-thanked">thanked</small> : backer.stopped ? <small>email off</small> : null}
                  </span>
                </button>
                {open === backer.id && (
                  <div className="ah-actions px-3.5 pb-3">
                    <button type="button" className="ah-btn" onClick={() => onOpenPerson(backer.id)}>Open card</button>
                    <button type="button" className="ah-btn is-primary" disabled={backer.stopped || !backer.confirmed}
                      onClick={() => onEmail({ audience: 'people', kind: 'thanks', people: [{ id: backer.id, label: label(backer) }] })}>
                      <Mail size={14} /> {backer.thankedAt ? 'Thank again' : 'Thank by email'}
                    </button>
                    {(backer.stopped || !backer.confirmed) && <p className="ah-note w-full">{backer.stopped ? 'They turned YouDO emails off.' : 'Their email isn’t confirmed.'}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="ah-btn is-primary is-wide mt-3 w-full" onClick={() => onEmail({ audience: 'backers', kind: 'thanks' })}>
            <Heart size={15} /> Thank {totals && totals.count > 1 ? 'all of them' : 'them'} by email
          </button>
          {totals && totals.unthanked > 0 && totals.unthanked < totals.count && <p className="yd-note">{totals.unthanked} not thanked yet: tap one to thank only them.</p>}
        </section>
      )}
    </div>
  );
}
