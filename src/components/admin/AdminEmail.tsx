import { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Pause, Pencil, Search, Send, X } from 'lucide-react';
import { can, fetchPeople, personLabel, type AdminRole } from '../../lib/adminHub';
import {
  createEmailSend, deleteTemplate, fetchBackers, fetchEmailOverview, fetchSelfName, fetchSendDetail, fetchEmailReach, fetchTemplates, previewRecipient, saveTemplate, sendNextEmails, sendStatus, sendTestEmail,
  type Backer, type EmailAudience, type EmailOverview, type EmailProgress, type EmailSendDetail, type EmailSendSummary, type EmailTemplate, type RecipientStatus,
} from '../../lib/adminEmail';
import { EMAIL_CODES, EMAIL_FIXED, aiTemplatePrompt } from '../../lib/emailHelp';
import { EMAIL_KINDS, emailProblem, formatRupees, OFFERED_KINDS, PREVIEW_STOP_URL, renderEmail, type EmailKind } from '../../../supabase/functions/_shared/emailTemplate.ts';
import { hapticSuccess, hapticWarn } from '../../lib/haptics';

/** How the Email page opens: from People (blank), a person's card, or Backers. */
export interface EmailStart {
  audience: EmailAudience;
  kind: EmailKind;
  people?: { id: string; label: string }[];
}

/** What is being written. `base` is the text it started from (a template or the built-in one), to know whether it was changed. */
type Draft = {
  kind: EmailKind; audience: EmailAudience; people: { id: string; label: string }[]; subject: string; body: string;
  templateId?: string; base?: { subject: string; body: string };
};

const DRAFT_KEY = 'youdo-admin-email-draft-v1';
const readDraft = (): Draft | null => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null; } catch { return null; }
};
const writeDraft = (draft: Draft | null) => {
  try { if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); else localStorage.removeItem(DRAFT_KEY); } catch { /* private mode */ }
};
const fresh = (kind: EmailKind, audience: EmailAudience, people: Draft['people'] = []): Draft => {
  const text = { subject: EMAIL_KINDS[kind].subject, body: EMAIL_KINDS[kind].body };
  return { kind, audience, people, ...text, base: text };
};
/** Nothing written yet beyond the text it started from. */
const untouched = (draft: Draft) => {
  const base = draft.base ?? { subject: EMAIL_KINDS[draft.kind].subject, body: EMAIL_KINDS[draft.kind].body };
  return draft.subject === base.subject && draft.body === base.body;
};
const offered = (kind: EmailKind): EmailKind => (OFFERED_KINDS.includes(kind) ? kind : 'note');
const fromTemplate = (draft: Draft, template: EmailTemplate): Draft => ({
  ...draft, kind: offered(template.kind), subject: template.subject, body: template.body, templateId: template.id,
  base: { subject: template.subject, body: template.body },
});
const audienceLabel = (item: Pick<EmailSendSummary, 'audience' | 'total'>) =>
  item.audience === 'people' ? (item.total === 1 ? 'One person' : `${item.total} picked people`) : item.audience === 'backers' ? 'Backers' : 'Everyone';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Admin Hub → People → Email: write once, send to everyone, backers or a few
 * people, from YouDO's Gmail with the YouDO template. One send goes out about
 * one a second while this screen is open; the list below keeps each one and
 * can send the rest later (Gmail allows about 450 a day).
 */
export default function AdminEmail({ role, selfId, start }: { role: AdminRole; selfId: string; start?: EmailStart }) {
  const owner = can(role, 'money');
  const [overview, setOverview] = useState<EmailOverview | null>(null);
  const [draft, setDraft] = useState<Draft>(() => {
    if (start) return fresh(start.kind, start.audience, start.people ?? []);
    const saved = readDraft();
    return saved && (owner || (saved.audience !== 'backers' && saved.kind !== 'thanks')) ? { ...saved, kind: offered(saved.kind) } : fresh('note', 'everyone');
  });
  const [reach, setReach] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState<{ id: string; subject: string; progress: EmailProgress } | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [replacing, setReplacing] = useState<EmailTemplate | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [openSend, setOpenSend] = useState<string | null>(null);
  const [backers, setBackers] = useState<Backer[] | null>(null);
  const [allSends, setAllSends] = useState(false);
  const stop = useRef(false);
  const alive = useRef(true);

  const reload = () => fetchEmailOverview().then(setOverview).catch((error) => setStatus(error instanceof Error ? error.message : 'Could not open Email.'));
  const reloadTemplates = () => fetchTemplates().then((list) => { if (alive.current) setTemplates(list); });
  useEffect(() => {
    // Set on every mount: React may mount, unmount and mount again (Strict Mode), and a stale "gone" would drop results.
    alive.current = true;
    void reload();
    void reloadTemplates();
    return () => { alive.current = false; stop.current = true; };
  }, []);
  // Opened from Backers: start from the owner's own thank-you template once it has loaded.
  useEffect(() => {
    if (!templates || start?.kind !== 'thanks') return;
    const thanks = templates.find((template) => template.kind === 'thanks');
    if (thanks) setDraft((current) => (untouched(current) && !current.templateId ? fromTemplate(current, thanks) : current));
  }, [templates, start?.kind]);
  useEffect(() => { if (!start) writeDraft(untouched(draft) && draft.audience === 'everyone' ? null : draft); }, [draft, start]);
  useEffect(() => {
    if (draft.audience !== 'people') { setReach(null); return; }
    let live = true;
    fetchEmailReach(draft.people.map((person) => person.id)).then((count) => { if (live) setReach(count); }).catch(() => { if (live) setReach(null); });
    return () => { live = false; };
  }, [draft.audience, draft.people]);

  const edit = (patch: Partial<Draft>) => { setDraft((current) => ({ ...current, ...patch })); setConfirming(false); };
  // A template replaces the words; once something was written, it asks first.
  const startFrom = (template: EmailTemplate) => {
    if (untouched(draft) || !draft.body.trim()) { setDraft((current) => fromTemplate(current, template)); setReplacing(null); }
    else setReplacing(template);
    setConfirming(false);
  };
  const saveAsTemplate = async (name: string | null) => {
    setBusy(true); setStatus('');
    try {
      const current = templates?.find((template) => template.id === draft.templateId);
      const id = await saveTemplate({ id: name === null ? current?.id : undefined, name: name ?? current?.name ?? 'Template', kind: draft.kind, subject: draft.subject, body: draft.body });
      setDraft((value) => ({ ...value, templateId: id, base: { subject: value.subject, body: value.body } }));
      setStatus(name === null ? `Template “${current?.name}” updated.` : `Saved as template “${name}”.`);
      setNaming(null);
      hapticSuccess();
      await reloadTemplates();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save the template.'); }
    setBusy(false);
  };

  const left = overview ? Math.max(0, overview.limit - overview.sentToday) : 0;
  const count = draft.audience === 'everyone' ? overview?.everyone ?? 0 : draft.audience === 'backers' ? overview?.backers ?? 0 : reach ?? 0;
  const problem = emailProblem(draft.subject, draft.body)
    ?? (draft.audience === 'people' && !draft.people.length ? 'Pick at least one person.' : null)
    ?? (overview && count === 0 ? 'No one here can get email yet.' : null);
  // The preview is the email exactly as one real person gets it (previewRecipient): never made-up names or amounts.
  const wantBackers = preview && owner && (draft.kind === 'thanks' || draft.audience === 'backers');
  useEffect(() => {
    if (wantBackers && backers === null) fetchBackers().then(setBackers).catch(() => setBackers([]));
  }, [wantBackers, backers]);
  const [self, setSelf] = useState<{ name?: string; signer?: string } | null>(null);
  useEffect(() => {
    if (preview && self === null) fetchSelfName(selfId).then(setSelf).catch(() => setSelf({}));
  }, [preview, self, selfId]);
  const shown = useMemo(() => previewRecipient({
    audience: draft.audience,
    picked: draft.people,
    backers,
    self: { id: selfId, name: self?.name },
  }), [draft.audience, draft.people, backers, selfId, self?.name]);
  const rendered = useMemo(() => (preview
    ? renderEmail({ kind: draft.kind, subject: draft.subject || '(No subject yet)', body: draft.body, name: shown.name, amount: draft.kind === 'thanks' ? shown.amount : undefined, signer: self?.signer, unsubscribeUrl: PREVIEW_STOP_URL })
    : null), [preview, draft, shown, self?.signer]);

  const run = async (id: string, subject: string, total: number) => {
    stop.current = false;
    let progress: EmailProgress = { total, sent: 0, failed: 0, waiting: total, leftToday: left };
    setRunning({ id, subject, progress });
    while (!stop.current && alive.current) {
      try {
        const next = await sendNextEmails(id);
        progress = next;
        if (alive.current) setRunning({ id, subject, progress });
        if (!next.ok) { setStatus(next.error ?? 'Sending stopped.'); hapticWarn(); break; }
        if (next.waiting === 0) { setStatus(`Sent to ${next.sent}${next.failed ? `; ${next.failed} didn’t arrive` : ''}.`); hapticSuccess(); break; }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Sending stopped.');
        break;
      }
    }
    if (!alive.current) return;
    if (stop.current && progress.waiting) setStatus(`Paused. ${progress.waiting} still to send: tap Send the rest below when you’re ready.`);
    setRunning(null);
    await reload();
  };

  const send = async () => {
    if (problem || busy) return;
    setBusy(true); setStatus('');
    try {
      const created = await createEmailSend({ ...draft, people: draft.people.map((person) => person.id) });
      writeDraft(null);
      setDraft(fresh('note', 'everyone'));
      setConfirming(false);
      setPreview(false);
      setBusy(false);
      await run(created.id, draft.subject, created.total);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not send.');
      setBusy(false);
    }
  };

  const test = async () => {
    const issue = emailProblem(draft.subject, draft.body);
    if (issue) { setStatus(issue); return; }
    setBusy(true); setStatus('');
    try { setStatus(`Test sent to ${await sendTestEmail(draft.kind, draft.subject, draft.body)}. Check the inbox (and Promotions).`); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'The test was not sent.'); }
    setBusy(false);
  };

  const audiences: [EmailAudience, string][] = [
    ['everyone', `Everyone${overview ? ` ${overview.everyone}` : ''}`],
    ...(owner ? [['backers', `Backers${overview?.backers !== undefined ? ` ${overview.backers}` : ''}`]] as [EmailAudience, string][] : []),
    ['people', 'Pick people'],
  ];
  const kinds = OFFERED_KINDS.filter((kind) => owner || kind !== 'thanks');
  const current = templates?.find((template) => template.id === draft.templateId);

  if (openSend) {
    const summary = overview?.sends.find((item) => item.id === openSend);
    return (
      <SendDetail id={openSend} running={running?.id === openSend ? running.progress : null}
        canSendRest={Boolean(summary && (summary.sentBy === selfId || owner)) && !running && left > 0}
        restNote={!summary || running ? '' : !(summary.sentBy === selfId || owner) ? 'Only who wrote it, or the owner, can send the rest.' : left < 1 ? `Today’s ${overview?.limit ?? 450} are used up. Send the rest when the count refills (within 24 hours).` : ''}
        onSendRest={(detail) => { setOpenSend(null); void run(detail.id, detail.subject, detail.recipients.length); }}
        onClose={() => setOpenSend(null)} />
    );
  }

  if (managing) {
    return <TemplateManager templates={templates ?? []} onClose={() => setManaging(false)} onChanged={() => reloadTemplates()} />;
  }

  return (
    <div className="ah-page">
      {overview && (
        <div className="ah-mail-quota" aria-label={`${left} of ${overview.limit} emails left today`}>
          <span><b>{left}</b> of {overview.limit} left today</span>
          <i aria-hidden><i style={{ width: `${Math.min(100, (overview.sentToday / Math.max(1, overview.limit)) * 100)}%` }} /></i>
          {overview.stopped > 0 && <small>{overview.stopped} {overview.stopped === 1 ? 'person' : 'people'} turned email off</small>}
        </div>
      )}

      {running && (
        <section className="yd-card ah-mail-running" aria-live="polite"><div className="yd-block">
          <p className="ah-mail-running-title">Sending “{running.subject}”</p>
          <div className="ah-meter" aria-hidden><i style={{ width: `${((running.progress.sent + running.progress.failed) / Math.max(1, running.progress.total)) * 100}%` }} /></div>
          <p className="ah-note mt-2">{sendStatus(running.progress, true)} · about one a second. Keep this screen open; closing it pauses, and you can send the rest later.</p>
          <button type="button" className="ah-btn is-ghost mt-3" onClick={() => { stop.current = true; }}><Pause size={14} /> Pause</button>
        </div></section>
      )}

      <section className="yd-section">
        <h3 className="yd-heading">Write</h3>
        <div className="yd-card">
          {templates && (templates.length > 0 || owner) && (
            <div className="yd-block">
              <div className="flex items-center justify-between">
                <p className="yd-label !mb-0">Start from</p>
                {owner && <button type="button" className="ah-mail-link" onClick={() => setManaging(true)}><Pencil size={12} /> Edit templates</button>}
              </div>
              {templates.length > 0 ? (
                <div className="ah-chips !mb-0 mt-2" role="group" aria-label="Start from a template">
                  {templates.map((template) => (
                    <button key={template.id} type="button" className="ah-chip" aria-pressed={draft.templateId === template.id} onClick={() => startFrom(template)}>{template.name}</button>
                  ))}
                </div>
              ) : <p className="ah-note mt-2">No templates yet. Write one and tap Save as template.</p>}
              {replacing && (
                <div role="alertdialog" aria-labelledby="ah-mail-replace" className="ah-mail-confirm">
                  <h4 id="ah-mail-replace">Replace what you wrote with “{replacing.name}”?</h4>
                  <div className="ah-actions mt-3">
                    <button type="button" className="ah-btn is-ghost is-wide" onClick={() => setReplacing(null)}>Keep mine</button>
                    <button type="button" className="ah-btn is-primary is-wide" onClick={() => { setDraft((value) => fromTemplate(value, replacing)); setReplacing(null); }}>Replace</button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="yd-block">
          <p className="yd-label">To</p>
          <div className="ah-chips !mb-0" role="group" aria-label="Send to">
            {audiences.map(([key, label]) => (
              <button key={key} type="button" className="ah-chip" aria-pressed={draft.audience === key}
                onClick={() => {
                  const thanks = templates?.find((template) => template.kind === 'thanks');
                  if (key === 'backers' && untouched(draft) && thanks) setDraft((value) => ({ ...fromTemplate(value, thanks), audience: key }));
                  else edit({ audience: key });
                }}>{label}</button>
            ))}
          </div>
          {draft.audience === 'people' && <PeoplePicker picked={draft.people} reach={reach} selfId={selfId} onChange={(people) => edit({ people })} />}
          </div>

          <div className="yd-block">
          <p className="yd-label">Look</p>
          <div className="ah-chips !mb-1" role="group" aria-label="How the email looks">
            {kinds.map((kind) => (
              <button key={kind} type="button" className="ah-chip" aria-pressed={draft.kind === kind} onClick={() => edit({ kind })}>{EMAIL_KINDS[kind].label}</button>
            ))}
          </div>
          <p className="ah-note">{EMAIL_KINDS[draft.kind].hint}</p>
          </div>

          <div className="yd-block">
          <label className="yd-label block" htmlFor="ah-mail-subject">Subject</label>
          <input id="ah-mail-subject" className="yd-field" value={draft.subject} maxLength={120} placeholder="YouDO 9.0 is here"
            onChange={(event) => edit({ subject: event.target.value })} />
          <label className="yd-label mt-4 block" htmlFor="ah-mail-body">Message</label>
          <textarea id="ah-mail-body" value={draft.body} rows={9} maxLength={6000} placeholder="Paste or write the message"
            onChange={(event) => edit({ body: event.target.value })}
            className="w-full resize-y rounded-[16px] border border-subtle bg-base p-3.5 text-[13.5px] leading-relaxed text-content-primary outline-none focus:border-primary" />
          <EmailHelp />
          {owner && (naming === null ? (
            <div className="ah-actions mt-3">
              {current && !untouched(draft) && (
                <button type="button" className="ah-btn is-ghost" disabled={busy} onClick={() => void saveAsTemplate(null)}>Update “{current.name}”</button>
              )}
              <button type="button" className="ah-mail-link" disabled={busy} onClick={() => setNaming('')}><BookmarkPlus size={13} /> Save as template</button>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <input className="yd-field flex-1" value={naming} maxLength={60} placeholder="Template name" aria-label="Template name" autoFocus
                onChange={(event) => setNaming(event.target.value)} />
              <button type="button" className="ah-btn is-primary" disabled={busy || !naming.trim()} onClick={() => void saveAsTemplate(naming.trim())}>Save</button>
              <button type="button" className="ah-btn is-ghost" onClick={() => setNaming(null)} aria-label="Cancel"><X size={14} /></button>
            </div>
          ))}
          </div>

          <div className="yd-block">
          <div className="ah-actions">
            <button type="button" className="ah-btn is-ghost is-wide" onClick={() => setPreview((open) => !open)}>
              {preview ? <><EyeOff size={14} /> Hide preview</> : <><Eye size={14} /> Preview</>}
            </button>
            <button type="button" className="ah-btn is-ghost is-wide" disabled={busy || Boolean(running)} onClick={() => void test()}>Send me a test</button>
          </div>
          {rendered && (
            <div className="ah-mail-preview">
              <p className="ah-note">{`Exactly as ${shown.label} gets it${draft.kind === 'thanks' && shown.amount ? ` (${formatRupees(shown.amount)})` : ''}.${draft.audience === 'people' && draft.people.length === 1 ? '' : ` Everyone gets their own name${draft.kind === 'thanks' ? ' and amount' : ''}.`}`}</p>
              <iframe title="Email preview" sandbox="" srcDoc={rendered.html} />
            </div>
          )}

          {!confirming ? (
            <button type="button" className="ah-btn is-primary is-wide mt-3 w-full" disabled={busy || Boolean(running) || Boolean(problem) || !overview}
              onClick={() => setConfirming(true)}>
              <Send size={15} /> {problem ?? `Send to ${count} ${count === 1 ? 'person' : 'people'}`}
            </button>
          ) : (
            <div role="alertdialog" aria-labelledby="ah-mail-confirm" className="ah-mail-confirm">
              <h4 id="ah-mail-confirm">Send “{draft.subject.trim()}” to {count} {count === 1 ? 'person' : 'people'}?</h4>
              <p>
                {count > left
                  ? `Today ${left} can go; the other ${count - left} wait until tomorrow (Send the rest).`
                  : `It takes about ${Math.max(1, Math.round(count / 50))} minute${count > 75 ? 's' : ''}. Each person gets their own copy; nobody sees the others.`}
                {' '}An email can’t be taken back.
              </p>
              <div className="ah-actions mt-3">
                <button type="button" className="ah-btn is-ghost is-wide" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
                <button type="button" className="ah-btn is-primary is-wide" disabled={busy} onClick={() => void send()}><Send size={14} /> Send</button>
              </div>
            </div>
          )}
          </div>
        </div>
      </section>
      {status && <p role="status" className="ah-status">{status}</p>}

      <section className="yd-section">
        <h3 className="yd-heading">Sent</h3>
        {!overview ? <p className="ah-empty">Loading…</p> : overview.sends.length === 0 ? <p className="ah-empty">Nothing sent yet.</p> : (() => {
          const waiting = overview.sends.filter((item) => item.waiting > 0);
          const done = overview.sends.filter((item) => item.waiting === 0);
          const shown = allSends ? done : done.slice(0, 3);
          const row = (item: EmailSendSummary) => (
            <button key={item.id} type="button" className="yd-row w-full !items-start" onClick={() => setOpenSend(item.id)}>
              <span className="yd-row-main">
                <span className="yd-row-title !text-[13.5px] truncate">{item.subject}</span>
                <span className="yd-row-text">{audienceLabel(item)} · {when(item.createdAt)}{item.sentBy !== selfId && item.sentByName ? ` · ${item.sentByName}` : ''}</span>
                <span className={`yd-row-text ${item.waiting ? '!text-warning' : ''}`}>{sendStatus(item, running?.id === item.id)}</span>
              </span>
              <ChevronRight size={17} className="mt-1 shrink-0 text-content-muted" aria-hidden />
            </button>
          );
          return <>
            {waiting.length > 0 && (
              <>
                <p className="ah-label !mt-0 !mb-2">Not finished</p>
                <div className="yd-card mb-3">{waiting.map(row)}</div>
              </>
            )}
            {shown.length > 0 && <div className="yd-card">{shown.map(row)}</div>}
            {done.length > 3 && (
              <button type="button" className="ah-btn is-ghost is-wide mt-2 w-full" onClick={() => setAllSends((value) => !value)}>
                {allSends ? 'Show fewer' : `See all ${done.length}`}
              </button>
            )}
          </>;
        })()}
        <p className="yd-note">From YouDO’s Gmail, never the one that sends sign-in mails. Every email ends with “Stop these emails”. Each send is in the activity log.</p>
      </section>
    </div>
  );
}

/** Search people by name or @username and pick up to 50. */
function PeoplePicker({ picked, reach, selfId, onChange }: {
  picked: { id: string; label: string }[];
  reach: number | null;
  selfId: string;
  onChange: (people: { id: string; label: string }[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{ id: string; label: string; detail: string }[]>([]);
  useEffect(() => {
    if (search.trim().length < 2) { setFound([]); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      fetchPeople(search, 'all', 0, 8).then((page) => {
        if (live) setFound(page.people.map((person) => ({ id: person.id, label: personLabel(person), detail: person.username ? `@${person.username}` : person.email ?? '' })));
      }).catch(() => { if (live) setFound([]); });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [search]);

  const has = new Set(picked.map((person) => person.id));
  return (
    <div className="mt-3">
      {picked.length > 0 && (
        <div className="ah-mail-picked">
          {picked.map((person) => (
            <span key={person.id} className="ah-mail-pick">{person.id === selfId ? 'You' : person.label}
              <button type="button" aria-label={`Remove ${person.label}`} onClick={() => onChange(picked.filter((item) => item.id !== person.id))}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {picked.length < 50 && (
        <label className="ah-search !mb-0">
          <Search size={16} aria-hidden />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Add by name or @username" aria-label="Find people" type="search" autoComplete="off" />
        </label>
      )}
      {found.length > 0 && (
        <div className="yd-card mt-2">
          {found.filter((person) => !has.has(person.id)).map((person) => (
            <button key={person.id} type="button" className="yd-row !min-h-[48px]" onClick={() => { onChange([...picked, { id: person.id, label: person.label }]); setSearch(''); }}>
              <span className="yd-row-main"><span className="yd-row-title !text-[13.5px] truncate">{person.label}</span><span className="yd-row-text truncate">{person.detail}</span></span>
            </button>
          ))}
        </div>
      )}
      {picked.length > 0 && reach !== null && (
        <p className="ah-note mt-2">{reach === picked.length ? `All ${reach} can get it.` : `${reach} of ${picked.length} can get it; the others haven’t confirmed their email or turned email off.`}</p>
      )}
    </div>
  );
}

/** Edit templates: the owner's saved texts (name, look, subject, message). */
function TemplateManager({ templates, onClose, onChanged }: { templates: EmailTemplate[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<(Omit<EmailTemplate, 'id'> & { id?: string }) | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { setStatus('Give it a name.'); return; }
    setBusy(true); setStatus('');
    try { await saveTemplate(editing); await onChanged(); hapticSuccess(); setEditing(null); setStatus('Saved.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save.'); }
    setBusy(false);
  };
  const remove = async () => {
    if (!editing?.id) return;
    setBusy(true); setStatus('');
    try { await deleteTemplate(editing.id); await onChanged(); setEditing(null); setDeleting(false); setStatus('Deleted.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not delete.'); }
    setBusy(false);
  };

  if (editing) {
    return (
      <div className="ah-page">
        <section className="yd-section">
          <h3 className="yd-heading">{editing.id ? 'Edit template' : 'New template'}</h3>
          <div className="yd-card">
            <div className="yd-block">
              <label className="yd-label block" htmlFor="ah-tpl-name">Name</label>
              <input id="ah-tpl-name" className="yd-field" value={editing.name} maxLength={60} placeholder="Personal note"
                onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
            </div>
            <div className="yd-block">
              <p className="yd-label">Look</p>
              <div className="ah-chips !mb-1" role="group" aria-label="How the email looks">
                {OFFERED_KINDS.map((kind) => (
                  <button key={kind} type="button" className="ah-chip" aria-pressed={editing.kind === kind} onClick={() => setEditing({ ...editing, kind })}>{EMAIL_KINDS[kind].label}</button>
                ))}
              </div>
              <p className="ah-note">{EMAIL_KINDS[editing.kind].hint}{editing.kind === 'thanks' ? ' Only you see thank-you templates.' : ''}</p>
            </div>
            <div className="yd-block">
              <label className="yd-label block" htmlFor="ah-tpl-subject">Subject</label>
              <input id="ah-tpl-subject" className="yd-field" value={editing.subject} maxLength={120} placeholder="Can be left empty"
                onChange={(event) => setEditing({ ...editing, subject: event.target.value })} />
              <label className="yd-label mt-4 block" htmlFor="ah-tpl-body">Message</label>
              <textarea id="ah-tpl-body" value={editing.body} rows={10} maxLength={6000}
                onChange={(event) => setEditing({ ...editing, body: event.target.value })}
                className="w-full resize-y rounded-[16px] border border-subtle bg-base p-3.5 text-[13.5px] leading-relaxed text-content-primary outline-none focus:border-primary" />
              <EmailHelp />
            </div>
            <div className="yd-block">
              <div className="ah-actions">
                <button type="button" className="ah-btn is-ghost is-wide" disabled={busy} onClick={() => { setEditing(null); setDeleting(false); }}>Cancel</button>
                <button type="button" className="ah-btn is-primary is-wide" disabled={busy} onClick={() => void save()}>Save</button>
              </div>
              {editing.id && !deleting && <button type="button" className="ah-btn is-danger mt-3" disabled={busy} onClick={() => setDeleting(true)}>Delete template</button>}
              {deleting && (
                <div role="alertdialog" aria-labelledby="ah-tpl-delete" className="ah-danger">
                  <h4 id="ah-tpl-delete">Delete “{editing.name}”?</h4>
                  <p>Emails already sent from it stay as they were.</p>
                  <div className="ah-actions mt-3">
                    <button type="button" className="ah-btn is-ghost is-wide" disabled={busy} onClick={() => setDeleting(false)}>Keep it</button>
                    <button type="button" className="ah-btn is-danger is-wide" disabled={busy} onClick={() => void remove()}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        {status && <p role="status" className="ah-status">{status}</p>}
      </div>
    );
  }

  return (
    <div className="ah-page">
      <button type="button" className="ah-btn is-ghost mb-3" onClick={onClose}>‹ Back to writing</button>
      <section className="yd-section">
        <h3 className="yd-heading">Templates</h3>
        {templates.length === 0 ? <p className="ah-empty">No templates yet.</p> : (
          <div className="yd-card">
            {templates.map((template) => (
              <button key={template.id} type="button" className="yd-row w-full !items-start" onClick={() => { setEditing({ ...template, kind: offered(template.kind) }); setStatus(''); }}>
                <span className="yd-row-main">
                  <span className="yd-row-title !text-[13.5px] truncate">{template.name}</span>
                  <span className="yd-row-text truncate">{EMAIL_KINDS[template.kind].label} · {template.subject || template.body.replace(/\s+/g, ' ').slice(0, 60) || 'Empty'}</span>
                </span>
                <Pencil size={15} className="mt-1 shrink-0 text-content-muted" aria-hidden />
              </button>
            ))}
          </div>
        )}
        <button type="button" className="ah-btn is-primary is-wide mt-3 w-full" onClick={() => setEditing({ name: '', kind: 'note', subject: '', body: 'Hi {name},\n\n' })}>
          <BookmarkPlus size={15} /> New template
        </button>
        <p className="yd-note">Admins can start from these too, except thank-yous. Changing a template never changes emails already sent.</p>
      </section>
      {status && <p role="status" className="ah-status">{status}</p>}
    </div>
  );
}

/** Codes and tips for writing, with a prompt to draft a template in any AI chat. */
function EmailHelp() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(aiTemplatePrompt()); setCopied('yes'); }
    catch { setCopied('no'); }
  };
  return (
    <div className="ah-mail-help">
      <button type="button" className="ah-mail-help-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span><code>{'{name}'}</code> first name · <code>{'{amount}'}</code> what a backer gave</span>
        <span className="ah-mail-link">Codes and tips <ChevronDown size={13} className={open ? 'rotate-180' : ''} /></span>
      </button>
      {open && (
        <div className="ah-mail-help-body">
          <p className="ah-mail-help-title">You can type</p>
          <dl>
            {EMAIL_CODES.map((item) => <div key={item.code}><dt>{/^[{*]/.test(item.code) ? <code>{item.code}</code> : <span className="font-semibold text-content-primary">{item.code}</span>}</dt><dd>{item.meaning}</dd></div>)}
          </dl>
          <p className="ah-mail-help-title">YouDO adds by itself</p>
          <ul>{EMAIL_FIXED.map((line) => <li key={line}>{line}</li>)}</ul>
          <p className="ah-mail-help-title">Draft one with AI</p>
          <p className="ah-note">Copy this prompt into any AI chat, describe the email where it says so, and paste back the subject and message it gives you.</p>
          <button type="button" className="ah-btn is-ghost mt-2" onClick={() => void copy()}><Copy size={13} /> {copied === 'yes' ? 'Copied' : 'Copy AI prompt'}</button>
          {copied === 'no' && <textarea readOnly rows={8} value={aiTemplatePrompt()} aria-label="AI prompt" onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full rounded-[12px] border border-subtle bg-base p-2.5 text-[11.5px] text-content-secondary" />}
        </div>
      )}
    </div>
  );
}

const RECIPIENT_FILTERS: [RecipientStatus | 'all', string][] = [['all', 'All'], ['sent', 'Sent'], ['waiting', 'Not sent yet'], ['failed', 'Didn’t arrive']];

/** One send: what went out, who got it, who is still waiting and why any didn't arrive. */
function SendDetail({ id, running, canSendRest, restNote, onSendRest, onClose }: {
  id: string;
  running: EmailProgress | null;
  canSendRest: boolean;
  restNote: string;
  onSendRest: (detail: EmailSendDetail) => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<EmailSendDetail | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<RecipientStatus | 'all'>('all');
  const [showEmail, setShowEmail] = useState(false);
  useEffect(() => {
    let live = true;
    fetchSendDetail(id).then((next) => { if (live) setDetail(next); }).catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : 'Could not open this email.'); });
    return () => { live = false; };
  }, [id, running?.sent]);

  const count = (status: RecipientStatus) => detail?.recipients.filter((person) => person.status === status).length ?? 0;
  const people = detail?.recipients.filter((person) => filter === 'all' || person.status === filter) ?? [];
  // Shown exactly as the first person got it: their own name and, for a thank-you, their own amount.
  const [backers, setBackers] = useState<Backer[] | null>(null);
  const needsAmount = Boolean(detail && showEmail && (detail.kind === 'thanks' || detail.audience === 'backers'));
  useEffect(() => {
    if (needsAmount && backers === null) fetchBackers().then(setBackers).catch(() => setBackers([]));
  }, [needsAmount, backers]);
  const shownAs = useMemo(() => (detail ? previewRecipient({ audience: detail.audience, recipients: detail.recipients, backers }) : null), [detail, backers]);
  const rendered = useMemo(() => (detail && showEmail && shownAs
    ? renderEmail({ kind: detail.kind, subject: detail.subject, body: detail.body, name: shownAs.name, amount: detail.kind === 'thanks' ? shownAs.amount : undefined, signer: detail.sentByName, unsubscribeUrl: PREVIEW_STOP_URL })
    : null), [detail, showEmail, shownAs]);

  return (
    <div className="ah-page">
      <button type="button" className="ah-btn is-ghost mb-3" onClick={onClose}>‹ Back to Email</button>
      {error && <p role="status" className="ah-status text-error">{error}</p>}
      {!detail && !error && <p className="ah-empty">Loading…</p>}
      {detail && (
        <>
          <section className="yd-card">
            <div className="yd-block">
              <p className="yd-row-title !text-[16px]">{detail.subject}</p>
              <p className="yd-row-text mt-1">{EMAIL_KINDS[detail.kind].label} · {audienceLabel({ audience: detail.audience, total: detail.recipients.length })} · {when(detail.createdAt)}{detail.sentByName ? ` · by ${detail.sentByName}` : ''}</p>
            </div>
            <div className="ah-person-stats">
              <div><b>{count('sent')}</b><span>Sent</span></div>
              <div><b className={count('waiting') ? 'text-warning' : ''}>{count('waiting')}</b><span>Not sent yet</span></div>
              <div><b className={count('failed') ? 'text-error' : ''}>{count('failed')}</b><span>Didn’t arrive</span></div>
            </div>
            <div className="yd-block">
              <div className="ah-actions">
                <button type="button" className="ah-btn is-ghost" onClick={() => setShowEmail((value) => !value)}>{showEmail ? <><EyeOff size={14} /> Hide the email</> : <><Eye size={14} /> See the email</>}</button>
                {count('waiting') > 0 && canSendRest && <button type="button" className="ah-btn is-primary" onClick={() => onSendRest(detail)}><Send size={14} /> Send the rest</button>}
              </div>
              {running && <p className="ah-note mt-2">Sending now · {sendStatus(running, true)}</p>}
              {!running && count('waiting') > 0 && !canSendRest && restNote && <p className="ah-note mt-2">{restNote}</p>}
              {rendered && shownAs && (
                <div className="ah-mail-preview">
                  <p className="ah-note">{`Exactly as ${shownAs.label} got it${detail.kind === 'thanks' && shownAs.amount ? ` (${formatRupees(shownAs.amount)})` : ''}.${detail.recipients.length > 1 ? ` Everyone got their own name${detail.kind === 'thanks' ? ' and amount' : ''}.` : ''}`}</p>
                  <iframe title="The email that was sent" sandbox="" srcDoc={rendered.html} />
                </div>
              )}
            </div>
          </section>

          <section className="yd-section">
            <h3 className="yd-heading">People</h3>
            <div className="ah-chips" role="group" aria-label="Show">
              {RECIPIENT_FILTERS.map(([key, label]) => (
                <button key={key} type="button" className="ah-chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {label} {key === 'all' ? detail.recipients.length : count(key)}
                </button>
              ))}
            </div>
            {people.length === 0 ? <p className="ah-empty">No one here.</p> : (
              <div className="yd-card">
                {people.slice(0, 300).map((person) => (
                  <div key={person.id} className="yd-row !min-h-[50px]">
                    <span className="yd-row-main">
                      <span className="yd-row-title !text-[13.5px] truncate">{person.name ?? (person.username ? `@${person.username}` : 'No name yet')}</span>
                      {person.status === 'failed' && <span className="yd-row-text !text-error">{person.error ?? 'Didn’t arrive'}</span>}
                    </span>
                    <span className={`ah-mail-state is-${person.status}`}>
                      {person.status === 'sent' ? (person.sentAt ? when(person.sentAt) : 'Sent') : person.status === 'waiting' ? 'Waiting' : 'Not sent'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {people.length > 300 && <p className="yd-note">Showing the first 300.</p>}
          </section>
        </>
      )}
    </div>
  );
}
